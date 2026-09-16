import { connexion } from "@interimatch/core/db";
import { validerDisponibilite } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";

export const dynamic = "force-dynamic";

export async function GET() {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    const lignes = await sql<{ id: number; date_debut: string; date_fin: string }[]>`
      select id, date_debut::text, date_fin::text from disponibilite
      where interimaire_id = ${garde.session.compteId} order by date_debut`;
    return succes({
      disponibilites: lignes.map((l) => ({ id: l.id, dateDebut: l.date_debut, dateFin: l.date_fin })),
    });
  } finally {
    await sql.end();
  }
}

export async function POST(requete: Request) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ dateDebut?: string; dateFin?: string }>(requete);
  if (!saisie) return erreur("Requête illisible.", 400);

  const problemes = validerDisponibilite(saisie);
  if (problemes.length > 0) return erreur("Période invalide.", 422, problemes);

  const sql = connexion();
  try {
    const [creee] = await sql<{ id: number }[]>`
      insert into disponibilite (interimaire_id, date_debut, date_fin)
      values (${garde.session.compteId}, ${saisie.dateDebut!}, ${saisie.dateFin!})
      returning id`;
    return succes({ id: creee!.id }, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes("disponibilite_interimaire_id_fkey")) {
      return erreur("Complétez d'abord votre profil.", 409, [
        { champ: "profil", message: "Renseignez votre profil avant de déclarer vos disponibilités." },
      ]);
    }
    throw e;
  } finally {
    await sql.end();
  }
}
