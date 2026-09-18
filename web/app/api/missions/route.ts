import { connexion } from "@interimatch/core/db";
import { validerMission, type ExigenceSaisie } from "@interimatch/core";
import { cle, redis, sansEchec } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { notifierMissionPubliee } from "@/lib/notifications";
import { sessionOuErreur } from "@/lib/garde";
import { resoudreAdresse, ServiceGeocodageIndisponible } from "@/lib/geocoder";

export const dynamic = "force-dynamic";

/** Missions de l'entreprise connectée. */
export async function GET() {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    const missions = await sql<
      {
        id: number; titre: string; ville: string; statut: string;
        date_debut: string; date_fin: string; metier_libelle: string; nb_exigences: number;
      }[]
    >`
      select m.id, m.titre, m.ville, m.statut, m.date_debut::text, m.date_fin::text,
             me.libelle as metier_libelle,
             (select count(*)::int from mission_certification_requise r where r.mission_id = m.id) as nb_exigences
      from mission m
      join metier me on me.code = m.metier_code
      where m.entreprise_id = ${garde.session.compteId}
      order by m.cree_le desc`;

    return succes({
      missions: missions.map((m) => ({
        id: m.id, titre: m.titre, ville: m.ville, statut: m.statut,
        dateDebut: m.date_debut, dateFin: m.date_fin,
        metier: m.metier_libelle, nbCertificationsRequises: m.nb_exigences,
      })),
    });
  } finally {
    await sql.end();
  }
}

interface Saisie {
  titre?: string;
  metierCode?: string;
  description?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  dateDebut?: string;
  dateFin?: string;
  tauxHoraireMin?: number | null;
  tauxHoraireMax?: number | null;
  /** Mention obligatoire du contrat de mission : texte libre, un chantier n'a pas de grille. */
  horaires?: string;
  certificationsRequises?: ExigenceSaisie[];
  competencesRequises?: string[];
  publier?: boolean;
}

export async function POST(requete: Request) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<Saisie>(requete);
  if (!saisie) return erreur("Requête illisible.", 400);

  const problemes = validerMission(saisie);
  if (problemes.length > 0) return erreur("Le formulaire comporte des erreurs.", 422, problemes);

  const sql = connexion();
  try {
    const [entreprise] = await sql<{ compte_id: number }[]>`
      select compte_id from entreprise where compte_id = ${garde.session.compteId}`;
    if (!entreprise) {
      return erreur("Complétez d'abord votre profil entreprise.", 409, [
        { champ: "profil", message: "Renseignez votre entreprise avant de publier une mission." },
      ]);
    }

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
      return erreur("Adresse de chantier introuvable.", 422, [
        { champ: "ville", message: "Vérifiez le code postal et la commune du chantier." },
      ]);
    }

    const missionId = await sql.begin(async (tx) => {
      const [creee] = await tx<{ id: number }[]>`
        insert into mission (
          entreprise_id, titre, metier_code, description, adresse, code_postal, ville,
          lat, lon, date_debut, date_fin, horaires, taux_horaire_min, taux_horaire_max, statut, publiee_le
        ) values (
          ${garde.session.compteId}, ${saisie.titre!.trim()}, ${saisie.metierCode!},
          ${saisie.description?.trim() || null}, ${saisie.adresse?.trim() || null},
          ${codePostal}, ${ville}, ${position.lat}, ${position.lon},
          ${saisie.dateDebut!}, ${saisie.dateFin!},
          ${saisie.horaires?.trim().slice(0, 300) || null},
          ${saisie.tauxHoraireMin ?? null}, ${saisie.tauxHoraireMax ?? null},
          ${saisie.publier ? "publiee" : "brouillon"},
          ${saisie.publier ? new Date() : null}
        ) returning id`;
      const id = creee!.id;

      for (const exigence of saisie.certificationsRequises ?? []) {
        await tx`
          insert into mission_certification_requise (mission_id, type_code, categorie_id)
          values (
            ${id}, ${exigence.typeCode},
            ${exigence.categorieCode
              ? tx`(select id from categorie_certification where type_code = ${exigence.typeCode} and code = ${exigence.categorieCode})`
              : null}
          )`;
      }

      // Une compétence inconnue du référentiel est ignorée plutôt que de faire
      // échouer la publication : le référentiel se remplit au fil des ingestions.
      for (const competence of saisie.competencesRequises ?? []) {
        await tx`
          insert into mission_competence (mission_id, competence_code)
          select ${id}, ${competence} where exists (select 1 from competence where code = ${competence})`;
      }
      return id;
    });

    // Invalidation du cache : agrément, pas condition. La mission est déjà créée —
    // échouer ici renverrait une erreur pour une opération qui a réussi.
    await sansEchec(() => redis().del(cle.cacheMatching(missionId)), "invalidation matching");

    // Même principe que l'invalidation : la fiche existe, prévenir les intérimaires
    // concernés est un agrément. Un échec ici ne doit pas défaire une publication.
    if (saisie.publier) {
      await sansEchec(() => notifierMissionPubliee(sql, missionId), "notification de publication");
    }

    return succes({ id: missionId, statut: saisie.publier ? "publiee" : "brouillon" }, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes("mission_metier_code_fkey")) {
      return erreur("Métier inconnu.", 422, [{ champ: "metierCode", message: "Ce métier n'existe pas." }]);
    }
    throw e;
  } finally {
    await sql.end();
  }
}
