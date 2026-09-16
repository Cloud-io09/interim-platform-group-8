import { connexion } from "@interimatch/core/db";
import { erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";

export const dynamic = "force-dynamic";

export async function DELETE(_requete: Request, contexte: { params: Promise<{ id: string }> }) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const { id } = await contexte.params;
  const identifiant = Number(id);
  if (!Number.isInteger(identifiant)) return erreur("Identifiant invalide.", 400);

  const sql = connexion();
  try {
    // La condition sur l'identifiant du propriétaire empêche de supprimer la période
    // d'un autre intérimaire en devinant un identifiant.
    const supprimees = await sql`
      delete from disponibilite
      where id = ${identifiant} and interimaire_id = ${garde.session.compteId}
      returning id`;
    if (supprimees.length === 0) return erreur("Période introuvable.", 404);
    return succes({ supprime: identifiant });
  } finally {
    await sql.end();
  }
}
