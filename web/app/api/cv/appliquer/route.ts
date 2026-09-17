import { connexion } from "@interimatch/core/db";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * Applique au profil les éléments retenus par l'intérimaire.
 *
 * Seuls métiers et compétences passent par ici. Les certifications **ne sont jamais
 * appliquées automatiquement** : un CV donne le type du titre, presque jamais son
 * numéro, son organisme ni sa date d'échéance — or c'est cette date qui décide de
 * l'éligibilité. Les certifications détectées ouvrent le formulaire prérempli, et
 * l'intérimaire complète ce qui compte.
 *
 * Les valeurs sont ajoutées, jamais substituées : le CV complète un profil, il ne le
 * réécrit pas.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ metiers?: string[]; competences?: string[] }>(requete);
  if (!saisie) return erreur("Requête illisible.", 400);

  const metiers = Array.isArray(saisie.metiers) ? saisie.metiers : [];
  const competences = Array.isArray(saisie.competences) ? saisie.competences : [];
  if (metiers.length === 0 && competences.length === 0) {
    return erreur("Rien à appliquer.", 422, [
      { champ: "selection", message: "Cochez au moins un élément à ajouter à votre profil." },
    ]);
  }

  const compteId = garde.session.compteId;
  const sql = connexion();
  try {
    const [profil] = await sql<{ compte_id: number }[]>`
      select compte_id from interimaire where compte_id = ${compteId}`;
    if (!profil) {
      return erreur("Complétez d'abord votre profil.", 409, [
        { champ: "profil", message: "Renseignez votre profil avant d'appliquer ces éléments." },
      ]);
    }

    let metiersAjoutes = 0;
    let competencesAjoutees = 0;

    await sql.begin(async (tx) => {
      for (const code of metiers) {
        // `select ... where exists` plutôt qu'un insert direct : un code absent du
        // référentiel est ignoré au lieu de faire échouer tout l'envoi.
        const ajoute = await tx`
          insert into interimaire_metier (interimaire_id, metier_code)
          select ${compteId}, ${code}
          where exists (select 1 from metier where code = ${code} and actif)
          on conflict do nothing
          returning metier_code`;
        metiersAjoutes += ajoute.length;
      }
      for (const code of competences) {
        const ajoute = await tx`
          insert into interimaire_competence (interimaire_id, competence_code)
          select ${compteId}, ${code}
          where exists (select 1 from competence where code = ${code})
          on conflict do nothing
          returning competence_code`;
        competencesAjoutees += ajoute.length;
      }
    });

    return succes({ metiersAjoutes, competencesAjoutees });
  } finally {
    await sql.end();
  }
}
