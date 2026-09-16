import { connexion } from "@interimatch/core/db";
import {
  chiffrer,
  dechiffrerOptionnel,
  echeanceTheorique,
  validerCertification,
} from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";

export const dynamic = "force-dynamic";

interface LigneCertification {
  id: number;
  type_code: string;
  type_libelle: string;
  categorie_code: string | null;
  organisme_emetteur: string;
  numero_chiffre: string;
  date_obtention: string;
  date_echeance: string;
}

/** Certifications de l'intérimaire connecté. */
export async function GET() {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    const lignes = await sql<LigneCertification[]>`
      select c.id, c.type_code, t.libelle as type_libelle, cat.code as categorie_code,
             c.organisme_emetteur, c.numero_chiffre,
             c.date_obtention::text, c.date_echeance::text
      from certification c
      join type_certification t on t.code = c.type_code
      left join categorie_certification cat on cat.id = c.categorie_id
      where c.interimaire_id = ${garde.session.compteId}
      order by c.date_echeance`;

    return succes({
      certifications: lignes.map((l) => ({
        id: l.id,
        typeCode: l.type_code,
        typeLibelle: l.type_libelle,
        categorieCode: l.categorie_code,
        organismeEmetteur: l.organisme_emetteur,
        // Déchiffré à la lecture : le numéro n'est en clair qu'ici, pour son porteur.
        numero: dechiffrerOptionnel(l.numero_chiffre),
        dateObtention: l.date_obtention,
        dateEcheance: l.date_echeance,
      })),
    });
  } finally {
    await sql.end();
  }
}

interface Saisie {
  typeCode?: string;
  categorieCode?: string;
  organismeEmetteur?: string;
  numero?: string;
  dateObtention?: string;
  dateEcheance?: string;
}

export async function POST(requete: Request) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<Saisie>(requete);
  if (!saisie) return erreur("Requête illisible.", 400);

  const problemes = validerCertification(saisie);
  if (problemes.length > 0) return erreur("Le formulaire comporte des erreurs.", 422, problemes);

  const sql = connexion();
  try {
    // L'identifiant de catégorie est résolu ici : le formulaire manipule des codes
    // lisibles (« B1 »), la base une clé étrangère.
    const categorieId = saisie.categorieCode
      ? (
          await sql<{ id: number }[]>`
            select id from categorie_certification
            where type_code = ${saisie.typeCode!} and code = ${saisie.categorieCode}`
        )[0]?.id ?? null
      : null;

    const [creee] = await sql<{ id: number }[]>`
      insert into certification (
        interimaire_id, type_code, categorie_id, organisme_emetteur,
        numero_chiffre, date_obtention, date_echeance
      ) values (
        ${garde.session.compteId}, ${saisie.typeCode!}, ${categorieId},
        ${saisie.organismeEmetteur!.trim()}, ${chiffrer(saisie.numero!.trim())},
        ${saisie.dateObtention!}, ${saisie.dateEcheance!}
      ) returning id`;

    return succes({ id: creee!.id }, 201);
  } catch (e) {
    // Le trigger de cohérence est l'autorité : s'il refuse, on remonte son motif.
    if (e instanceof Error && /catégorie|categorie/i.test(e.message)) {
      return erreur("Certification refusée.", 422, [
        { champ: "categorieCode", message: e.message.split("\n")[0] ?? "Catégorie incohérente." },
      ]);
    }
    if (e instanceof Error && e.message.includes("interimaire")) {
      return erreur("Complétez d'abord votre profil.", 409, [
        { champ: "profil", message: "Renseignez votre profil avant d'ajouter des certifications." },
      ]);
    }
    throw e;
  } finally {
    await sql.end();
  }
}
