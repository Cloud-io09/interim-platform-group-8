import { connexion } from "@interimatch/core/db";
import { chiffrerOptionnel, validerProfilInterimaire } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { resoudreAdresse } from "@/lib/geocoder";

export const dynamic = "force-dynamic";

interface Saisie {
  prenom?: string;
  nom?: string;
  telephone?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  rayonMobiliteKm?: number;
  carteBtpNumero?: string;
  carteBtpEcheance?: string;
  metiers?: string[];
}

/**
 * Étape 2 du parcours intérimaire.
 *
 * Réexécutable : le même appel crée le profil ou le met à jour. Un intérimaire qui
 * déménage ou élargit sa zone repasse par là, sans parcours distinct.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<Saisie>(requete);
  if (!saisie) return erreur("Requête illisible.", 400);

  const problemes = validerProfilInterimaire(saisie);
  if (problemes.length > 0) return erreur("Le formulaire comporte des erreurs.", 422, problemes);

  const codePostal = saisie.codePostal!.trim();
  const ville = saisie.ville!.trim();
  const position = await resoudreAdresse(saisie.adresse ?? "", codePostal, ville);
  if (!position) {
    return erreur("Adresse introuvable.", 422, [
      { champ: "ville", message: "Nous n'avons pas trouvé cette commune. Vérifiez le code postal et la ville." },
    ]);
  }

  const compteId = garde.session.compteId;
  const sql = connexion();
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into interimaire (
          compte_id, prenom, nom, telephone_chiffre, adresse_chiffree,
          code_postal, ville, lat, lon, rayon_mobilite_km,
          carte_btp_numero_chiffre, carte_btp_echeance
        ) values (
          ${compteId}, ${saisie.prenom!.trim()}, ${saisie.nom!.trim()},
          ${chiffrerOptionnel(saisie.telephone)}, ${chiffrerOptionnel(saisie.adresse)},
          ${codePostal}, ${ville}, ${position.lat}, ${position.lon},
          ${Number(saisie.rayonMobiliteKm)},
          ${chiffrerOptionnel(saisie.carteBtpNumero)}, ${saisie.carteBtpEcheance || null}
        )
        on conflict (compte_id) do update set
          prenom = excluded.prenom, nom = excluded.nom,
          telephone_chiffre = excluded.telephone_chiffre,
          adresse_chiffree = excluded.adresse_chiffree,
          code_postal = excluded.code_postal, ville = excluded.ville,
          lat = excluded.lat, lon = excluded.lon,
          rayon_mobilite_km = excluded.rayon_mobilite_km,
          carte_btp_numero_chiffre = excluded.carte_btp_numero_chiffre,
          carte_btp_echeance = excluded.carte_btp_echeance`;

      // Les métiers sont remplacés en bloc : c'est une liste, pas un journal.
      await tx`delete from interimaire_metier where interimaire_id = ${compteId}`;
      const metiers = (saisie.metiers ?? []).map((code) => ({ interimaire_id: compteId, metier_code: code }));
      if (metiers.length > 0) {
        await tx`insert into interimaire_metier ${tx(metiers, "interimaire_id", "metier_code")}`;
      }
    });

    return succes({ position: { lat: position.lat, lon: position.lon, libelle: position.libelle } });
  } catch (e) {
    // Un métier hors référentiel viole la clé étrangère : on le dit clairement.
    if (e instanceof Error && e.message.includes("interimaire_metier")) {
      return erreur("Métier inconnu.", 422, [
        { champ: "metiers", message: "Un des métiers choisis n'existe pas." },
      ]);
    }
    throw e;
  } finally {
    await sql.end();
  }
}
