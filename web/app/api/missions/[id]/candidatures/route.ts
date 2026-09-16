import { connexion } from "@interimatch/core/db";
import { cle, matcher, redis, sansEchec } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { chargerMission, chargerProfils } from "@/lib/depot";

export const dynamic = "force-dynamic";

const STATUTS = ["proposee", "acceptee", "refusee"] as const;
type Statut = (typeof STATUTS)[number];

/** Candidatures enregistrées sur une mission. */
export async function GET(_requete: Request, contexte: { params: Promise<{ id: string }> }) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const missionId = Number((await contexte.params).id);
  if (!Number.isInteger(missionId)) return erreur("Identifiant de mission invalide.", 400);

  const sql = connexion();
  try {
    const [mission] = await sql<{ entreprise_id: number }[]>`
      select entreprise_id from mission where id = ${missionId}`;
    if (!mission) return erreur("Mission introuvable.", 404);
    if (mission.entreprise_id !== garde.session.compteId) {
      return erreur("Cette mission ne vous appartient pas.", 403);
    }

    const lignes = await sql<
      { interimaire_id: number; statut: string; cree_le: string; prenom: string; nom: string }[]
    >`
      select c.interimaire_id, c.statut, c.cree_le::text, i.prenom, i.nom
      from candidature c join interimaire i on i.compte_id = c.interimaire_id
      where c.mission_id = ${missionId} order by c.cree_le desc`;

    return succes({
      candidatures: lignes.map((l) => ({
        interimaireId: l.interimaire_id,
        nomComplet: `${l.prenom} ${l.nom}`,
        statut: l.statut,
        creeLe: l.cree_le,
      })),
    });
  } finally {
    await sql.end();
  }
}

/**
 * Retient ou écarte un profil sur une mission.
 *
 * La conformité est revérifiée au moment de retenir, pas seulement au moment
 * d'afficher : entre la consultation de la liste et le clic, une certification a pu
 * expirer ou être supprimée. Retenir un profil non conforme est précisément ce que
 * le produit existe pour empêcher.
 */
export async function POST(requete: Request, contexte: { params: Promise<{ id: string }> }) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const missionId = Number((await contexte.params).id);
  if (!Number.isInteger(missionId)) return erreur("Identifiant de mission invalide.", 400);

  const saisie = await corpsJson<{ interimaireId?: number; statut?: string }>(requete);
  const interimaireId = Number(saisie?.interimaireId);
  const statut = saisie?.statut as Statut | undefined;

  if (!Number.isInteger(interimaireId)) return erreur("Intérimaire non identifié.", 400);
  if (!statut || !STATUTS.includes(statut)) {
    return erreur("Statut de candidature inconnu.", 422, [
      { champ: "statut", message: "Choisissez : proposée, acceptée ou refusée." },
    ]);
  }

  const sql = connexion();
  try {
    const mission = await chargerMission(sql, missionId);
    if (!mission) return erreur("Mission introuvable.", 404);
    if (mission.entrepriseId !== garde.session.compteId) {
      return erreur("Cette mission ne vous appartient pas.", 403);
    }

    if (statut !== "refusee") {
      const profils = await chargerProfils(sql, mission.metierCode);
      const resultat = matcher(mission, profils);
      const ecarte = resultat.ecartes.find((e) => e.interimaireId === interimaireId);
      if (ecarte) {
        return erreur("Ce profil n'est pas conforme pour cette mission.", 409, [
          {
            champ: "interimaireId",
            message:
              ecarte.motif === "certification_expiree"
                ? `Sa certification expire le ${ecarte.dateEcheance}, avant la fin de la mission.`
                : "Il ne détient pas une habilitation exigée.",
          },
        ]);
      }
      if (!resultat.retenus.some((r) => r.interimaireId === interimaireId)) {
        return erreur("Ce profil ne fait pas partie des candidats de cette mission.", 409);
      }
    }

    await sql`
      insert into candidature (mission_id, interimaire_id, statut)
      values (${missionId}, ${interimaireId}, ${statut})
      on conflict (mission_id, interimaire_id) do update set statut = excluded.statut`;

    // Retenir quelqu'un ne ferme pas la mission : une entreprise peut chercher
    // plusieurs profils pour un même chantier.
    await sansEchec(() => redis().del(cle.cacheMatching(missionId)), "invalidation candidature");
    return succes({ interimaireId, statut });
  } finally {
    await sql.end();
  }
}
