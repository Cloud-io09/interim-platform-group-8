import { connexion } from "@interimatch/core/db";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { notifierReponseCandidature } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Réponse de l'intérimaire à une proposition.
 *
 * La boucle était ouverte : une entreprise pouvait retenir un profil, l'intérimaire
 * n'avait aucun moyen de répondre. Une notification sur laquelle on ne peut pas agir
 * ne sert à rien — c'est donc ici que la proposition devient un engagement, ou pas.
 *
 * La conformité n'est **pas** revérifiée : elle l'a été au moment où l'entreprise a
 * retenu le profil, et c'est à elle que la responsabilité incombe. Rejouer le filtre
 * ici ferait disparaître une proposition sous les yeux de son destinataire.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ missionId?: number; reponse?: string }>(requete);
  const missionId = Number(saisie?.missionId);
  const reponse = saisie?.reponse;

  if (!Number.isInteger(missionId)) return erreur("Mission non identifiée.", 400);
  if (reponse !== "acceptee" && reponse !== "refusee") {
    return erreur("Réponse inconnue.", 422, [
      { champ: "reponse", message: "Répondez : acceptée ou refusée." },
    ]);
  }

  const sql = connexion();
  try {
    const misesAJour = await sql<{ id: number }[]>`
      update candidature set statut = ${reponse}
      where mission_id = ${missionId} and interimaire_id = ${garde.session.compteId}
      returning id`;

    if (misesAJour.length === 0) {
      return erreur("Aucune proposition à traiter sur cette mission.", 404);
    }

    await notifierReponseCandidature(sql, missionId, garde.session.compteId, reponse === "acceptee");
    return succes({ missionId, statut: reponse });
  } finally {
    await sql.end();
  }
}
