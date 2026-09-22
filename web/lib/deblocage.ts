import type { Sql } from "postgres";
import { etatDroits, sourceDuProchain, type EtatDroits, type SourceDeblocage } from "@interimatch/core";

/**
 * Déblocage des coordonnées d'un profil, pour une mission donnée.
 *
 * **L'idempotence tient à un index unique**, pas à une vérification préalable. Deux
 * clics sur le même bouton, deux onglets, un rechargement pendant la requête : le
 * `on conflict do nothing` rend l'ancien déblocage sans rien débiter. Une garde
 * applicative laisserait une fenêtre entre la lecture et l'écriture, et la facture
 * doublerait précisément quand le réseau est mauvais — donc sur un chantier.
 *
 * **Le débit et l'enregistrement sont dans la même transaction.** Débiter un crédit
 * sans écrire le déblocage ferait payer pour rien ; l'inverse ferait travailler
 * gratuitement. Aucun des deux n'est acceptable, et seule une transaction l'évite.
 */

export interface Deblocage {
  interimaireId: number;
  missionId: number;
  source: SourceDeblocage;
  creeLe: string;
}

/** Premier jour du mois en cours, borne du quota. */
function debutDuMois(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function lireDroits(sql: Sql, entrepriseId: number): Promise<EtatDroits> {
  const [compte] = await sql<{ plan_code: string; credits: number }[]>`
    select plan_code, credits from compte where id = ${entrepriseId}`;
  const [compteur] = await sql<{ n: number }[]>`
    select count(*)::int as n from deblocage
     where entreprise_id = ${entrepriseId}
       and source = 'abonnement'
       and cree_le >= ${debutDuMois()}`;

  return etatDroits({
    planCode: compte?.plan_code ?? "decouverte",
    utilisesCeMois: compteur?.n ?? 0,
    credits: compte?.credits ?? 0,
  });
}

/** Ce profil est-il déjà débloqué pour cette mission ? */
export async function dejaDebloque(
  sql: Sql,
  entrepriseId: number,
  interimaireId: number,
  missionId: number
): Promise<boolean> {
  const [ligne] = await sql<{ id: number }[]>`
    select id from deblocage
     where entreprise_id = ${entrepriseId}
       and interimaire_id = ${interimaireId}
       and mission_id = ${missionId}`;
  return Boolean(ligne);
}

export type ResultatDeblocage =
  | { ok: true; deja: boolean; source: SourceDeblocage | null }
  | { ok: false; motif: "droits_epuises" | "mission_etrangere" | "profil_absent" };

export async function debloquer(
  sql: Sql,
  entrepriseId: number,
  interimaireId: number,
  missionId: number
): Promise<ResultatDeblocage> {
  // La mission doit appartenir à l'appelant : sans ce contrôle, on débloquerait un
  // profil en se réclamant de la fiche d'un concurrent.
  const [mission] = await sql<{ id: number }[]>`
    select id from mission where id = ${missionId} and entreprise_id = ${entrepriseId}`;
  if (!mission) return { ok: false, motif: "mission_etrangere" };

  const [profil] = await sql<{ compte_id: number }[]>`
    select compte_id from interimaire where compte_id = ${interimaireId}`;
  if (!profil) return { ok: false, motif: "profil_absent" };

  if (await dejaDebloque(sql, entrepriseId, interimaireId, missionId)) {
    return { ok: true, deja: true, source: null };
  }

  const droits = await lireDroits(sql, entrepriseId);
  const source = sourceDuProchain(droits);
  if (!source) return { ok: false, motif: "droits_epuises" };

  return sql.begin(async (tx) => {
    const insere = await tx<{ id: number }[]>`
      insert into deblocage (entreprise_id, interimaire_id, mission_id, source)
      values (${entrepriseId}, ${interimaireId}, ${missionId}, ${source})
      on conflict (entreprise_id, interimaire_id, mission_id) do nothing
      returning id`;

    // Rien inséré : quelqu'un d'autre — un second onglet — a gagné la course. Le
    // déblocage existe, et surtout il n'a été facturé qu'une fois.
    if (insere.length === 0) return { ok: true as const, deja: true, source: null };

    if (source === "credit") {
      // `credits > 0` dans la clause : deux déblocages simultanés sur le dernier
      // crédit ne peuvent pas le débiter deux fois.
      const debite = await tx<{ credits: number }[]>`
        update compte set credits = credits - 1
         where id = ${entrepriseId} and credits > 0
        returning credits`;
      if (debite.length === 0) throw new Error("credits_epuises_en_course");
    }

    return { ok: true as const, deja: false, source };
  }) as Promise<ResultatDeblocage>;
}

/** Les déblocages d'une entreprise sur une mission, pour masquer ou non les identités. */
export async function deblocagesDeLaMission(
  sql: Sql,
  entrepriseId: number,
  missionId: number
): Promise<Set<number>> {
  const lignes = await sql<{ interimaire_id: number }[]>`
    select interimaire_id from deblocage
     where entreprise_id = ${entrepriseId} and mission_id = ${missionId}`;
  return new Set(lignes.map((l) => l.interimaire_id));
}

/**
 * Combien d'entreprises ont consulté les coordonnées d'un intérimaire.
 *
 * Rendu à l'intéressé, pas à l'entreprise. C'est ce qui distingue une place de marché
 * d'un courtier en données : la personne dont on vend l'accès aux coordonnées doit
 * savoir que cela s'est produit, et combien de fois.
 */
export async function consultationsDuProfil(
  sql: Sql,
  interimaireId: number
): Promise<{ entreprises: number; total: number; derniere: string | null }> {
  const [ligne] = await sql<{ entreprises: number; total: number; derniere: string | null }[]>`
    select count(distinct entreprise_id)::int as entreprises,
           count(*)::int as total,
           max(cree_le)::text as derniere
      from deblocage where interimaire_id = ${interimaireId}`;
  return ligne ?? { entreprises: 0, total: 0, derniere: null };
}
