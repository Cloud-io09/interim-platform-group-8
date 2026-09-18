import { connexion } from "@interimatch/core/db";
import { matcher, typeCertification } from "@interimatch/core";
import { succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { chargerMissions, chargerProfilsParMetiers } from "@/lib/depot";

export const dynamic = "force-dynamic";

/** Les dates affichées à l'utilisateur sont au format français, jamais en ISO. */
const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

/**
 * Missions correspondant au profil connecté.
 *
 * Le moteur est rejoué du point de vue de l'intérimaire, sur les missions publiées de
 * ses métiers. Afficher une mission pour laquelle il serait écarté reviendrait à lui
 * proposer un chantier où il ne peut pas aller — exactement ce que le produit veut
 * éviter. Les missions où il est écarté lui sont donc montrées **à part**, avec le
 * motif : c'est cette information qui rend un renouvellement de titre concret.
 */
export async function GET(requete: Request) {
  const garde = await sessionOuErreur("interimaire");
  if ("reponse" in garde) return garde.reponse;
  const moi = garde.session.compteId;

  // `portee=toutes` lève la restriction aux métiers déclarés. Un intérimaire doit
  // pouvoir consulter l'ensemble du marché ouvert, quitte à y voir des postes hors
  // de ses métiers : lui cacher l'offre reviendrait à décider à sa place.
  const toutes = new URL(requete.url).searchParams.get("portee") === "toutes";

  const sql = connexion();
  try {
    const candidates = toutes
      ? await sql<{ id: number }[]>`
          select m.id from mission m
          where m.statut = 'publiee' and m.date_fin >= current_date
          order by m.publiee_le desc nulls last, m.id desc
          limit 50`
      : await sql<{ id: number }[]>`
          select distinct m.id
          from mission m
          join interimaire_metier im on im.metier_code = m.metier_code
          where im.interimaire_id = ${moi}
            and m.statut = 'publiee'
            and m.date_fin >= current_date
          order by m.id desc
          limit 50`;

    const accessibles = [];
    const bloquees = [];
    const horsMetier = [];

    const missions = await chargerMissions(sql, candidates.map((c) => c.id));
    // Tous les profils concernés en une fois : l'union des métiers des missions.
    const profilsParMetier = await chargerProfilsParMetiers(sql, missions.map((m) => m.metierCode));
    for (const mission of missions) {
      const profils = profilsParMetier.get(mission.metierCode) ?? [];
      const resultat = matcher(mission, profils);

      const resume = {
        id: mission.missionId,
        metier: mission.metierCode,
        titre: mission.titre,
        ville: mission.ville,
        entreprise: mission.raisonSociale,
        dateDebut: mission.dateDebut,
        dateFin: mission.dateFin,
        tauxHoraireMin: mission.tauxHoraireMin,
        tauxHoraireMax: mission.tauxHoraireMax,
      };

      const retenu = resultat.retenus.find((r) => r.interimaireId === moi);
      if (retenu) {
        accessibles.push({
          ...resume,
          score: Math.round(retenu.total * 100),
          distanceKm: retenu.detail.distanceKm,
          joursCouverts: retenu.detail.joursChevauchement,
          joursMission: retenu.detail.joursMission,
        });
        continue;
      }

      const ecarte = resultat.ecartes.find((e) => e.interimaireId === moi);
      if (!retenu && !ecarte) {
        // Ni retenu ni écarté : le métier de la mission n'est pas déclaré au profil,
        // donc le moteur ne l'a pas évalué. On la montre quand même, sans score.
        horsMetier.push(resume);
        continue;
      }
      if (ecarte) {
        const libelle = typeCertification(ecarte.typeCode)?.libelle ?? ecarte.typeCode;
        bloquees.push({
          ...resume,
          motif: ecarte.motif,
          certificationManquante: `${libelle}${ecarte.categorieCode ? ` catégorie ${ecarte.categorieCode}` : ""}`,
          dateEcheance: ecarte.dateEcheance ?? null,
          explication:
            ecarte.motif === "certification_expiree"
              ? `Votre titre expire le ${enDateFr(ecarte.dateEcheance!)}, avant la fin de cette mission.`
              : `Cette mission exige un titre que vous n'avez pas déclaré.`,
        });
      }
    }

    // L'écran annonce un classement par compatibilité : le rendre dans l'ordre des
    // identifiants démentirait sa propre promesse. Les missions bloquées sont
    // classées par échéance, la plus proche d'abord — c'est celle qu'un
    // renouvellement rouvrirait le plus vite.
    accessibles.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
    bloquees.sort((a, b) => (a.dateEcheance ?? "9999").localeCompare(b.dateEcheance ?? "9999"));
    horsMetier.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));

    return succes({ portee: toutes ? "toutes" : "mes-metiers", accessibles, bloquees, horsMetier });
  } finally {
    await sql.end();
  }
}
