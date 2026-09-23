import { connexion } from "@interimatch/core/db";
import { cle, redis, sansEchec, type Acteur, type EtatCandidature } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { agir } from "@/lib/candidatures";
import { notifierCandidature } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const ETATS_DEMANDABLES = ["candidatee", "sollicitee", "acceptee", "declinee"] as const;

interface Saisie {
  missionId?: number;
  /** Requis côté entreprise ; ignoré côté intérimaire, qui n'agit que pour lui. */
  interimaireId?: number;
  vers?: string;
  motif?: string;
}

/**
 * Fait avancer une candidature, quel que soit le rôle.
 *
 * L'acteur vient de la session, jamais du corps de la requête : sans quoi une
 * entreprise pourrait accepter à la place d'un intérimaire, et le caractère bilatéral
 * du rapprochement ne serait qu'un affichage.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const acteur = garde.session.role as Acteur;
  const saisie = await corpsJson<Saisie>(requete);

  const missionId = Number(saisie?.missionId);
  if (!Number.isInteger(missionId)) return erreur("Mission non identifiée.", 400);

  const vers = saisie?.vers as EtatCandidature | undefined;
  if (!vers || !ETATS_DEMANDABLES.includes(vers as (typeof ETATS_DEMANDABLES)[number])) {
    return erreur("Action inconnue.", 422, [
      { champ: "vers", message: "Actions possibles : postuler, solliciter, accepter, décliner." },
    ]);
  }

  const interimaireId =
    acteur === "interimaire" ? garde.session.compteId : Number(saisie?.interimaireId);
  if (!Number.isInteger(interimaireId)) return erreur("Intérimaire non identifié.", 400);

  const motif = typeof saisie?.motif === "string" ? saisie.motif.trim().slice(0, 500) : null;

  const sql = connexion();
  try {
    const resultat = await agir(sql, {
      missionId,
      interimaireId,
      acteur,
      compteId: garde.session.compteId,
      vers,
      motif: motif || null,
    });

    if (!resultat.ok) {
      return Response.json(
        { ok: false, message: resultat.message, conformite: resultat.conformite ?? null },
        { status: resultat.statut }
      );
    }

    // Agrément, pas condition : la candidature est enregistrée, échouer ici
    // renverrait une erreur pour une opération qui a réussi.
    await sansEchec(() => redis().del(cle.cacheMatching(missionId)), "invalidation candidature");
    await sansEchec(
      () => notifierCandidature(sql, missionId, interimaireId, acteur, resultat.etat),
      "notification de candidature"
    );

    return succes({
      missionId,
      etat: resultat.etat,
      missionPourvue: resultat.missionPourvue,
      // N'empêche rien : l'écran l'affiche à côté de la confirmation.
      avertissement: resultat.avertissement ?? null,
    });
  } finally {
    await sql.end();
  }
}
