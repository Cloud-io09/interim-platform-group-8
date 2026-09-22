import { connexion } from "@interimatch/core/db";
import { erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";

export const dynamic = "force-dynamic";

/**
 * Candidatures enregistrées sur une mission.
 *
 * Lecture seule : les mouvements passent par `/api/candidatures`, commune aux deux
 * rôles, pour qu'une seule table de transitions fasse foi.
 */
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
      {
        interimaire_id: number; statut: string; cree_le: string;
        prenom: string; nom: string; debloque: boolean;
      }[]
    >`
      select c.interimaire_id, c.statut, c.cree_le::text, i.prenom, i.nom,
             exists (
               select 1 from deblocage d
               where d.entreprise_id = ${garde.session.compteId}
                 and d.interimaire_id = c.interimaire_id
                 and d.mission_id = c.mission_id
             ) as debloque
      from candidature c join interimaire i on i.compte_id = c.interimaire_id
      where c.mission_id = ${missionId} order by c.cree_le desc`;

    return succes({
      candidatures: lignes.map((l) => ({
        interimaireId: l.interimaire_id,
        // Même règle que partout : le nom de famille suit le déblocage.
        nomComplet: l.debloque ? `${l.prenom} ${l.nom}` : `${l.prenom} ${l.nom.charAt(0)}.`,
        debloque: l.debloque,
        statut: l.statut,
        creeLe: l.cree_le,
      })),
    });
  } finally {
    await sql.end();
  }
}
