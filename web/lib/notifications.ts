import type { Sql } from "postgres";
import { matcher } from "@interimatch/core";
import { chargerMission, chargerProfils } from "./depot";

/**
 * Notifications dans l'application.
 *
 * Les deux automatisations n8n poussent vers Discord ; rien n'en revenait dans le
 * produit. Un intérimaire qui se connectait ne pouvait pas savoir qu'une mission lui
 * correspondant avait été publiée la veille : son tableau de bord affichait un
 * compteur, jamais un événement.
 *
 * Les notifications sont donc créées **par l'application, au moment de l'événement**,
 * et non par le scénario n8n. La fonctionnalité reste visible si l'automatisation ne
 * tourne pas — et n8n lit la même source pour ses envois.
 */

export type TypeNotification =
  | "mission_correspondante"
  | "certification_expire"
  | "candidature_proposee"
  | "candidature_repondue";

export interface Notification {
  id: number;
  type: TypeNotification;
  titre: string;
  corps: string | null;
  lien: string;
  creeLe: string;
  lue: boolean;
}

interface ANotifier {
  compteId: number;
  type: TypeNotification;
  titre: string;
  corps: string | null;
  lien: string;
  missionId?: number | null;
  certificationId?: number | null;
}

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

/**
 * Enregistre un lot de notifications.
 *
 * `do nothing` sur conflit : republier une fiche, rejouer un scénario ou rouvrir le
 * tableau de bord ne doit pas remplir la liste de doublons. L'index d'unicité porte
 * sur le couple (compte, type, objet concerné).
 */
export async function enregistrer(sql: Sql, lignes: readonly ANotifier[]): Promise<number> {
  if (lignes.length === 0) return 0;

  const inserees = await sql<{ id: number }[]>`
    insert into notification ${sql(
      lignes.map((l) => ({
        compte_id: l.compteId,
        type: l.type,
        titre: l.titre,
        corps: l.corps,
        lien: l.lien,
        mission_id: l.missionId ?? null,
        certification_id: l.certificationId ?? null,
      }))
    )}
    on conflict do nothing
    returning id`;

  return inserees.length;
}

/**
 * Prévient les intérimaires qu'une fiche publiée leur correspond.
 *
 * Le matching est rejoué plutôt que lu au cache : prévenir quelqu'un qui n'est plus
 * conforme serait pire que ne rien envoyer. Seuls les profils **retenus** par le
 * filtre éliminatoire sont notifiés — jamais les écartés.
 */
export async function notifierMissionPubliee(sql: Sql, missionId: number): Promise<number> {
  const mission = await chargerMission(sql, missionId);
  if (!mission || mission.statut !== "publiee") return 0;

  const profils = await chargerProfils(sql, mission.metierCode);
  const retenus = matcher(mission, profils).retenus;
  if (retenus.length === 0) return 0;

  return enregistrer(
    sql,
    retenus.map((score) => ({
      compteId: score.interimaireId,
      type: "mission_correspondante" as const,
      titre: `Nouvelle mission : ${mission.titre}`,
      corps:
        `${mission.ville} · du ${enDateFr(mission.dateDebut)} au ${enDateFr(mission.dateFin)} · ` +
        `à ${score.detail.distanceKm} km de chez vous · compatibilité ${Math.round(score.total * 100)} %.`,
      lien: `/mes-missions/${missionId}`,
      missionId,
    }))
  );
}

/** Prévient un intérimaire qu'une entreprise l'a retenu sur une mission. */
export async function notifierCandidatureProposee(
  sql: Sql,
  missionId: number,
  interimaireId: number
): Promise<number> {
  const [mission] = await sql<{ titre: string; ville: string; raison_sociale: string }[]>`
    select m.titre, m.ville, e.raison_sociale
    from mission m join entreprise e on e.compte_id = m.entreprise_id
    where m.id = ${missionId}`;
  if (!mission) return 0;

  return enregistrer(sql, [
    {
      compteId: interimaireId,
      type: "candidature_proposee",
      titre: `${mission.raison_sociale} vous propose une mission`,
      corps: `${mission.titre} — ${mission.ville}. Répondez depuis la fiche.`,
      lien: `/mes-missions/${missionId}`,
      missionId,
    },
  ]);
}

/** Prévient l'entreprise que l'intérimaire a répondu à sa proposition. */
export async function notifierReponseCandidature(
  sql: Sql,
  missionId: number,
  interimaireId: number,
  accepte: boolean
): Promise<number> {
  const [ligne] = await sql<{ entreprise_id: number; titre: string; prenom: string; nom: string }[]>`
    select m.entreprise_id, m.titre, i.prenom, i.nom
    from mission m, interimaire i
    where m.id = ${missionId} and i.compte_id = ${interimaireId}`;
  if (!ligne) return 0;

  // La réponse remplace la précédente : un intérimaire qui change d'avis ne doit pas
  // laisser deux notifications contradictoires côté entreprise.
  await sql`
    delete from notification
    where compte_id = ${ligne.entreprise_id}
      and type = 'candidature_repondue' and mission_id = ${missionId}`;

  return enregistrer(sql, [
    {
      compteId: ligne.entreprise_id,
      type: "candidature_repondue",
      titre: `${ligne.prenom} ${ligne.nom} a ${accepte ? "accepté" : "refusé"} votre proposition`,
      corps: ligne.titre,
      lien: `/missions/${missionId}`,
      missionId,
    },
  ]);
}

/** Au-delà de ce délai, une échéance n'est plus une alerte mais une information. */
export const JOURS_ALERTE_ECHEANCE = 90;

/**
 * Crée les alertes d'échéance manquantes pour un intérimaire.
 *
 * Une échéance est un événement du calendrier, pas une action d'utilisateur : elle
 * n'a aucun moment naturel où se déclencher côté application. Le scénario n8n s'en
 * charge quotidiennement ; ce rattrapage à l'ouverture du tableau de bord garantit
 * que l'alerte existe même si l'automatisation n'a pas tourné. L'index d'unicité
 * rend l'opération sans effet quand elle a déjà eu lieu.
 */
export async function rattraperEcheances(sql: Sql, compteId: number): Promise<number> {
  const proches = await sql<{ id: number; type_code: string; date_echeance: string }[]>`
    select id, type_code, date_echeance::text
    from certification
    where interimaire_id = ${compteId}
      and date_echeance between current_date and current_date + ${JOURS_ALERTE_ECHEANCE}::int`;

  return enregistrer(
    sql,
    proches.map((c) => ({
      compteId,
      type: "certification_expire" as const,
      titre: `${c.type_code.replace(/_/g, " ")} expire le ${enDateFr(c.date_echeance)}`,
      corps: "Sans renouvellement, vous serez écarté de toute mission qui l'exige.",
      lien: "/espace/interimaire/certifications",
      certificationId: c.id,
    }))
  );
}

/** Notifications les plus récentes d'un compte. */
export async function lister(sql: Sql, compteId: number, limite = 8): Promise<Notification[]> {
  const lignes = await sql<
    {
      id: number; type: TypeNotification; titre: string; corps: string | null;
      lien: string; cree_le: string; lue_le: string | null;
    }[]
  >`
    select id, type, titre, corps, lien, cree_le::text, lue_le::text
    from notification where compte_id = ${compteId}
    order by lue_le nulls first, cree_le desc
    limit ${limite}`;

  return lignes.map((l) => ({
    id: l.id,
    type: l.type,
    titre: l.titre,
    corps: l.corps,
    lien: l.lien,
    creeLe: l.cree_le,
    lue: l.lue_le !== null,
  }));
}

export async function compterNonLues(sql: Sql, compteId: number): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from notification
    where compte_id = ${compteId} and lue_le is null`;
  return r?.n ?? 0;
}

/** Marque comme lues les notifications d'un compte — toutes, ou celles citées. */
export async function marquerLues(sql: Sql, compteId: number, ids?: readonly number[]): Promise<number> {
  const misesAJour =
    ids && ids.length > 0
      ? await sql<{ id: number }[]>`
          update notification set lue_le = now()
          where compte_id = ${compteId} and lue_le is null and id = any(${ids as number[]})
          returning id`
      : await sql<{ id: number }[]>`
          update notification set lue_le = now()
          where compte_id = ${compteId} and lue_le is null
          returning id`;
  return misesAJour.length;
}
