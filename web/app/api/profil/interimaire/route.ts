import { connexion } from "@interimatch/core/db";
import { chiffrerOptionnel, validerProfilInterimaire } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { resoudreAdresse, ServiceGeocodageIndisponible } from "@/lib/geocoder";
import { lireProfilInterimaire } from "@/lib/profils";

export const dynamic = "force-dynamic";

/** Relit le profil enregistré, pour préremplir le formulaire. */
export async function GET() {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    const profil = await lireProfilInterimaire(sql, garde.session.compteId);
    return succes({ profil });
  } finally {
    await sql.end();
  }
}

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
  /** Un code seul, ou un objet avec l'expérience déclarée sur ce métier. */
  metiers?: (string | { code: string; anneesExperience?: number | null })[];
  competences?: string[];
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
  let position;
  try {
    position = await resoudreAdresse(saisie.adresse ?? "", codePostal, ville);
  } catch (e) {
    if (e instanceof ServiceGeocodageIndisponible) {
      // 503 et non 500 : le service tiers est en cause, réessayer a du sens.
      return erreur(
        "Le service d'adresses est momentanément indisponible. Réessayez dans quelques instants.",
        503
      );
    }
    throw e;
  }
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
      //
      // La saisie accepte un code seul ou un objet portant l'expérience : les deux
      // formes cohabitent, un client plus ancien n'est donc pas cassé par l'ajout.
      await tx`delete from interimaire_metier where interimaire_id = ${compteId}`;
      const metiers = (saisie.metiers ?? []).map((m) =>
        typeof m === "string"
          ? { interimaire_id: compteId, metier_code: m, annees_experience: null }
          : {
              interimaire_id: compteId,
              metier_code: m.code,
              annees_experience:
                m.anneesExperience === null || m.anneesExperience === undefined
                  ? null
                  : Number(m.anneesExperience),
            }
      );
      if (metiers.length > 0) {
        await tx`insert into interimaire_metier ${tx(
          metiers,
          "interimaire_id",
          "metier_code",
          "annees_experience"
        )}`;
      }

      // Même principe pour les compétences. Un code hors référentiel est ignoré
      // plutôt que de faire échouer tout l'enregistrement : le référentiel se remplit
      // au fil des ingestions, et perdre un profil entier pour un libellé disparu
      // serait une punition disproportionnée.
      await tx`delete from interimaire_competence where interimaire_id = ${compteId}`;
      for (const code of saisie.competences ?? []) {
        await tx`
          insert into interimaire_competence (interimaire_id, competence_code)
          select ${compteId}, ${code} where exists (select 1 from competence where code = ${code})`;
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
