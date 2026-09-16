import { connexion } from "@interimatch/core/db";
import { chiffrerOptionnel, validerProfilEntreprise } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { resoudreAdresse } from "@/lib/geocoder";

export const dynamic = "force-dynamic";

interface Saisie {
  raisonSociale?: string;
  siret?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  telephone?: string;
}

export async function POST(requete: Request) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<Saisie>(requete);
  if (!saisie) return erreur("Requête illisible.", 400);

  const problemes = validerProfilEntreprise(saisie);
  if (problemes.length > 0) return erreur("Le formulaire comporte des erreurs.", 422, problemes);

  const codePostal = saisie.codePostal!.trim();
  const ville = saisie.ville!.trim();
  const position = await resoudreAdresse(saisie.adresse ?? "", codePostal, ville);
  if (!position) {
    return erreur("Adresse introuvable.", 422, [
      { champ: "ville", message: "Nous n'avons pas trouvé cette commune. Vérifiez le code postal et la ville." },
    ]);
  }

  const sql = connexion();
  try {
    await sql`
      insert into entreprise (
        compte_id, raison_sociale, siret, adresse, code_postal, ville, lat, lon, telephone_chiffre
      ) values (
        ${garde.session.compteId}, ${saisie.raisonSociale!.trim()},
        ${saisie.siret?.replace(/\s/g, "") || null}, ${saisie.adresse?.trim() || null},
        ${codePostal}, ${ville}, ${position.lat}, ${position.lon},
        ${chiffrerOptionnel(saisie.telephone)}
      )
      on conflict (compte_id) do update set
        raison_sociale = excluded.raison_sociale, siret = excluded.siret,
        adresse = excluded.adresse, code_postal = excluded.code_postal,
        ville = excluded.ville, lat = excluded.lat, lon = excluded.lon,
        telephone_chiffre = excluded.telephone_chiffre`;

    return succes({ position: { lat: position.lat, lon: position.lon, libelle: position.libelle } });
  } finally {
    await sql.end();
  }
}
