import { connexion } from "@interimatch/core/db";
import { cle, redis, sansEchec } from "@interimatch/core";
import { validerMission, type ExigenceSaisie } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { resoudreAdresse, ServiceGeocodageIndisponible } from "@/lib/geocoder";
import { notifierMissionPubliee } from "@/lib/notifications";
import { sessionOuErreur } from "@/lib/garde";

export const dynamic = "force-dynamic";

interface SaisieModification {
  statut?: string;
  titre?: string;
  metierCode?: string;
  description?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  dateDebut?: string;
  dateFin?: string;
  horaires?: string;
  tauxHoraireMin?: number | null;
  tauxHoraireMax?: number | null;
  certificationsRequises?: ExigenceSaisie[];
  competencesRequises?: string[];
}

const STATUTS = ["brouillon", "publiee", "pourvue", "close"] as const;
type Statut = (typeof STATUTS)[number];

/**
 * Transitions autorisées.
 *
 * Une mission close ne redevient pas un brouillon, et une mission pourvue ne
 * retourne pas à l'état brouillon : l'historique d'une affectation ne se réécrit
 * pas. En revanche, dépublier une mission pourvue vers « publiée » reste possible —
 * une affectation peut tomber.
 */
const TRANSITIONS: Record<Statut, Statut[]> = {
  brouillon: ["publiee", "close"],
  publiee: ["pourvue", "close", "brouillon"],
  pourvue: ["publiee", "close"],
  close: [],
};

export async function PATCH(requete: Request, contexte: { params: Promise<{ id: string }> }) {
  const garde = await sessionOuErreur("entreprise");
  if ("reponse" in garde) return garde.reponse;

  const missionId = Number((await contexte.params).id);
  if (!Number.isInteger(missionId)) return erreur("Identifiant de mission invalide.", 400);

  const saisie = await corpsJson<SaisieModification>(requete);
  if (!saisie) return erreur("Requête illisible.", 400);

  // **Deux usages pour un même verbe.** Un corps qui ne porte qu'un statut fait
  // avancer la fiche dans son cycle ; un corps qui porte des champs la modifie. Les
  // séparer en deux routes aurait dupliqué la garde de propriété et la table des
  // transitions pour rien.
  const modification = saisie.titre !== undefined || saisie.dateDebut !== undefined;
  const vise = saisie.statut as Statut | undefined;
  if (!modification && (!vise || !STATUTS.includes(vise))) {
    return erreur("Statut inconnu.", 422, [
      { champ: "statut", message: "Statuts possibles : brouillon, publiée, pourvue, close." },
    ]);
  }

  const sql = connexion();
  try {
    const [mission] = await sql<{ entreprise_id: number; statut: Statut }[]>`
      select entreprise_id, statut from mission where id = ${missionId}`;
    if (!mission) return erreur("Mission introuvable.", 404);
    if (mission.entreprise_id !== garde.session.compteId) {
      return erreur("Cette mission ne vous appartient pas.", 403);
    }

    if (modification) {
      // Une fiche pourvue ou close ne se retouche plus : son contenu a servi de
      // base à un engagement, et le réécrire après coup ferait mentir le document
      // de mission déjà remis à l'intérimaire.
      if (mission.statut === "pourvue" || mission.statut === "close") {
        return erreur(
          `Une fiche ${libelle(mission.statut)} ne se modifie plus : son contenu a servi de base à un engagement.`,
          409
        );
      }

      const problemes = validerMission(saisie);
      if (problemes.length > 0) return erreur("Le formulaire comporte des erreurs.", 422, problemes);

      const codePostal = saisie.codePostal!.trim();
      const ville = saisie.ville!.trim();
      let position;
      try {
        position = await resoudreAdresse(saisie.adresse ?? "", codePostal, ville);
      } catch (e) {
        if (e instanceof ServiceGeocodageIndisponible) {
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

      await sql.begin(async (tx) => {
        await tx`
          update mission set
            titre = ${saisie.titre!.trim()},
            metier_code = ${saisie.metierCode!},
            description = ${saisie.description?.trim() || null},
            adresse = ${saisie.adresse?.trim() || null},
            code_postal = ${codePostal}, ville = ${ville},
            lat = ${position.lat}, lon = ${position.lon},
            date_debut = ${saisie.dateDebut!}, date_fin = ${saisie.dateFin!},
            horaires = ${saisie.horaires?.trim().slice(0, 300) || null},
            taux_horaire_min = ${saisie.tauxHoraireMin ?? null},
            taux_horaire_max = ${saisie.tauxHoraireMax ?? null}
          where id = ${missionId}`;

        // Exigences et compétences sont remplacées, pas fusionnées : l'écran rend
        // l'état complet, donc une exigence retirée doit disparaître.
        await tx`delete from mission_certification_requise where mission_id = ${missionId}`;
        for (const exigence of saisie.certificationsRequises ?? []) {
          await tx`
            insert into mission_certification_requise (mission_id, type_code, categorie_id)
            values (
              ${missionId}, ${exigence.typeCode},
              ${exigence.categorieCode
                ? tx`(select id from categorie_certification where type_code = ${exigence.typeCode} and code = ${exigence.categorieCode})`
                : null}
            )`;
        }

        await tx`delete from mission_competence where mission_id = ${missionId}`;
        for (const competence of saisie.competencesRequises ?? []) {
          await tx`
            insert into mission_competence (mission_id, competence_code)
            select ${missionId}, ${competence} where exists (select 1 from competence where code = ${competence})`;
        }
      });

      // Les exigences ont pu changer : un profil retenu hier ne l'est peut-être
      // plus. Servir l'ancien calcul serait pire que de le refaire.
      await sansEchec(() => redis().del(cle.cacheMatching(missionId)), "invalidation après modification");
      return succes({ id: missionId, modifiee: true });
    }

    if (mission.statut === vise) return succes({ id: missionId, statut: vise });

    if (!TRANSITIONS[mission.statut].includes(vise!)) {
      return erreur(`Une mission ${libelle(mission.statut)} ne peut pas passer à « ${libelle(vise!)} ».`, 409, [
        { champ: "statut", message: "Cette transition n'est pas permise." },
      ]);
    }

    await sql`
      update mission
      set statut = ${vise!},
          publiee_le = ${vise === "publiee" ? sql`coalesce(publiee_le, now())` : sql`publiee_le`}
      where id = ${missionId}`;

    // **Fermer la fiche ferme aussi les dossiers en cours.** Déclarée pourvue hors de
    // la plateforme, ou close, elle laissait ses candidatures « en attente » : les
    // intérimaires attendaient une réponse sur un poste qui n'existait plus. Même
    // traitement que lorsqu'un autre candidat est retenu.
    if (vise === "pourvue" || vise === "close") {
      await sql`
        update candidature set statut = 'expiree', decide_le = now()
        where mission_id = ${missionId}
          and statut in ('proposee', 'candidatee', 'sollicitee')`;
    }

    await sansEchec(() => redis().del(cle.cacheMatching(missionId)), "invalidation changement de statut");
    if (vise === "publiee") {
      await sansEchec(() => notifierMissionPubliee(sql, missionId), "notification de publication");
    }
    return succes({ id: missionId, statut: vise });
  } finally {
    await sql.end();
  }
}

function libelle(statut: Statut): string {
  return { brouillon: "en brouillon", publiee: "publiée", pourvue: "pourvue", close: "close" }[statut];
}
