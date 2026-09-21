import { chiffrer, hacherMotDePasse } from "@interimatch/core";
import type { Sql } from "postgres";

/**
 * Jeu de données de démonstration.
 *
 * Construit autour des cas limites du moteur, pas de profils moyens : chaque
 * intérimaire existe pour prouver une règle précise, et la mission de référence est
 * calibrée pour que les exclusions soient démontrables en soutenance.
 *
 * Toutes les adresses sont réelles et géocodées en dur, pour que le jeu se rejoue
 * sans dépendre de la Base Adresse Nationale.
 */

export const MOT_DE_PASSE_DEMO = "demonstration-interimatch";
/** Suffixe qui identifie les comptes de démonstration, et permet de les purger. */
export const DOMAINE_DEMO = "@demo.interimatch.test";

/** Mission de référence : 1er au 21 octobre 2026, trois semaines. */
export const MISSION_DEBUT = "2026-10-01";
export const MISSION_FIN = "2026-10-21";

/**
 * Deux chantiers déjà terminés, affectés au profil conforme.
 *
 * Sans eux, l'expérience constatée serait vide partout et la fonctionnalité
 * paraîtrait inutile là où elle est justement ce qui distingue un fait d'une
 * déclaration. Dates passées et fixes : le jeu de démonstration ne doit pas changer
 * de sens selon le jour où on le sème.
 */
const CHANTIERS_PASSES = [
  {
    titre: "Maçon coffreur — réfection de murs porteurs",
    metier: "F1703",
    debut: "2026-03-02",
    fin: "2026-03-27",
    taux: 14.5,
  },
  {
    titre: "Conducteur de mini-pelle — réseaux secs",
    metier: "F1302",
    debut: "2026-06-08",
    fin: "2026-06-19",
    taux: 15.2,
  },
] as const;

interface Lieu {
  ville: string;
  codePostal: string;
  lat: number;
  lon: number;
}

const REIMS: Lieu = { ville: "Reims", codePostal: "51100", lat: 49.2628, lon: 4.0347 };
const EPERNAY: Lieu = { ville: "Épernay", codePostal: "51200", lat: 49.0442, lon: 3.9597 };
const CHALONS: Lieu = { ville: "Châlons-en-Champagne", codePostal: "51000", lat: 48.9566, lon: 4.3637 };
const LILLE: Lieu = { ville: "Lille", codePostal: "59000", lat: 50.6292, lon: 3.0573 };

interface ProfilDemo {
  cle: string;
  prenom: string;
  nom: string;
  lieu: Lieu;
  rayonKm: number;
  metiers: string[];
  competences: string[];
  disponibilites: { debut: string; fin: string }[];
  certifications: { type: string; categorie: string | null; echeance: string; obtention: string }[];
  /** Ce que ce profil est censé démontrer. Affiché par la commande. */
  demontre: string;
}

const CACES = (categorie: string, obtention: string, echeance: string) => ({
  type: "CACES_R482",
  categorie,
  obtention,
  echeance,
});

export const PROFILS: ProfilDemo[] = [
  {
    cle: "conforme",
    prenom: "Karim", nom: "Benali", lieu: REIMS, rayonKm: 50,
    metiers: ["F1302", "F1703"], competences: ["300265", "400288"],
    disponibilites: [{ debut: "2026-09-01", fin: "2026-12-31" }],
    certifications: [CACES("B1", "2024-03-15", "2034-03-15"), { type: "AIPR", categorie: null, obtention: "2023-06-01", echeance: "2028-06-01" }],
    demontre: "profil pleinement conforme — doit sortir en tête",
  },
  {
    cle: "expire-pendant",
    prenom: "Sofiane", nom: "Roux", lieu: REIMS, rayonKm: 50,
    metiers: ["F1302"], competences: ["300265", "400288"],
    disponibilites: [{ debut: "2026-09-01", fin: "2026-12-31" }],
    // Valide au premier jour du chantier, périmée le 10 : c'est LA règle du produit.
    certifications: [CACES("B1", "2016-10-10", "2026-10-10")],
    demontre: "certification valide au début mais expirant PENDANT la mission — doit être écarté",
  },
  {
    cle: "echeance-pile",
    prenom: "Lucie", nom: "Marchand", lieu: REIMS, rayonKm: 50,
    metiers: ["F1302"], competences: ["300265"],
    disponibilites: [{ debut: "2026-09-01", fin: "2026-12-31" }],
    certifications: [CACES("B1", "2016-10-21", "2026-10-21")],
    demontre: "échéance au dernier jour exact de la mission — doit être retenu (borne incluse)",
  },
  {
    cle: "sans-certification",
    prenom: "Mehdi", nom: "Lopes", lieu: REIMS, rayonKm: 50,
    metiers: ["F1302"], competences: ["300265", "400288"],
    disponibilites: [{ debut: "2026-09-01", fin: "2026-12-31" }],
    certifications: [],
    demontre: "aucune certification — doit être écarté même s'il est parfait ailleurs",
  },
  {
    cle: "mauvaise-categorie",
    prenom: "Thomas", nom: "Girard", lieu: REIMS, rayonKm: 50,
    metiers: ["F1302"], competences: ["300265"],
    disponibilites: [{ debut: "2026-09-01", fin: "2026-12-31" }],
    // C1 est une chargeuse, B1 une pelle : le titre existe mais ne couvre pas l'engin.
    certifications: [CACES("C1", "2024-01-10", "2034-01-10")],
    demontre: "bon type de CACES mais mauvaise catégorie — doit être écarté",
  },
  {
    cle: "eloigne",
    prenom: "Nadia", nom: "Perrot", lieu: LILLE, rayonKm: 50,
    metiers: ["F1302"], competences: ["300265", "400288"],
    disponibilites: [{ debut: "2026-09-01", fin: "2026-12-31" }],
    certifications: [CACES("B1", "2024-02-01", "2034-02-01")],
    demontre: "conforme mais à 200 km, hors rayon — retenu avec un score de distance nul",
  },
  {
    cle: "peu-disponible",
    prenom: "Yannick", nom: "Fabre", lieu: EPERNAY, rayonKm: 50,
    metiers: ["F1302"], competences: ["300265", "400288"],
    // Ne couvre que la première semaine des trois.
    disponibilites: [{ debut: "2026-10-01", fin: "2026-10-07" }],
    certifications: [CACES("B1", "2024-05-20", "2034-05-20")],
    demontre: "conforme et proche, mais disponible une semaine sur trois",
  },
  {
    cle: "bientot-perime",
    prenom: "Ahmed", nom: "Chevalier", lieu: CHALONS, rayonKm: 60,
    metiers: ["F1302", "F1301"], competences: ["300265"],
    disponibilites: [{ debut: "2026-09-01", fin: "2026-12-31" }],
    // Valide pour CETTE mission, mais expire dans moins de 60 jours après :
    // c'est le profil que l'automatisation n8n doit alerter.
    certifications: [CACES("B1", "2016-11-30", "2026-11-30")],
    demontre: "conforme pour cette mission, mais certification expirant sous 60 jours — cible de l'alerte n8n",
  },
];

export interface ResultatSeed {
  entrepriseId: number;
  missionId: number;
  profils: { cle: string; compteId: number; demontre: string }[];
}

/** Supprime les comptes de démonstration. Les cascades emportent profils et missions. */
export async function purgerDemo(sql: Sql): Promise<number> {
  const supprimes = await sql`delete from compte where email like ${`%${DOMAINE_DEMO}`} returning id`;
  return supprimes.length;
}

export async function semerDemo(sql: Sql): Promise<ResultatSeed> {
  await purgerDemo(sql);
  const { hash, sel } = await hacherMotDePasse(MOT_DE_PASSE_DEMO);

  const [compteEntreprise] = await sql<{ id: number }[]>`
    insert into compte (email, mot_de_passe_hash, mot_de_passe_sel, role)
    values (${`entreprise${DOMAINE_DEMO}`}, ${hash}, ${sel}, 'entreprise') returning id`;
  const entrepriseId = compteEntreprise!.id;

  await sql`
    insert into entreprise (compte_id, raison_sociale, siret, adresse, code_postal, ville, lat, lon)
    values (${entrepriseId}, 'Bâtiment Rémois SAS', '44306184100005', '25 rue de Vesle',
            ${REIMS.codePostal}, ${REIMS.ville}, ${REIMS.lat}, ${REIMS.lon})`;

  const [mission] = await sql<{ id: number }[]>`
    insert into mission (
      entreprise_id, titre, metier_code, description, adresse, code_postal, ville, lat, lon,
      date_debut, date_fin, taux_horaire_min, taux_horaire_max, statut, publiee_le
    ) values (
      ${entrepriseId}, 'Conducteur de pelle — terrassement Reims centre', 'F1302',
      'Terrassement et réseaux enterrés sur un chantier de trois semaines en centre-ville.',
      '25 rue de Vesle', ${REIMS.codePostal}, ${REIMS.ville}, ${REIMS.lat}, ${REIMS.lon},
      ${MISSION_DEBUT}, ${MISSION_FIN}, 14.00, 16.50, 'publiee', now()
    ) returning id`;
  const missionId = mission!.id;

  await sql`
    insert into mission_certification_requise (mission_id, type_code, categorie_id)
    select ${missionId}, 'CACES_R482', id from categorie_certification
    where type_code = 'CACES_R482' and code = 'B1'`;

  // Compétences exigées : elles doivent exister au référentiel, alimenté par l'ingestion.
  await sql`
    insert into mission_competence (mission_id, competence_code)
    select ${missionId}, code from competence where code in ('300265', '400288')`;

  const profils: ResultatSeed["profils"] = [];
  for (const p of PROFILS) {
    const [compte] = await sql<{ id: number }[]>`
      insert into compte (email, mot_de_passe_hash, mot_de_passe_sel, role)
      values (${`${p.cle}${DOMAINE_DEMO}`}, ${hash}, ${sel}, 'interimaire') returning id`;
    const id = compte!.id;

    await sql`
      insert into interimaire (
        compte_id, prenom, nom, telephone_chiffre, code_postal, ville, lat, lon, rayon_mobilite_km
      ) values (
        ${id}, ${p.prenom}, ${p.nom}, ${chiffrer("0600000000")},
        ${p.lieu.codePostal}, ${p.lieu.ville}, ${p.lieu.lat}, ${p.lieu.lon}, ${p.rayonKm}
      )`;

    for (const metier of p.metiers) {
      await sql`insert into interimaire_metier (interimaire_id, metier_code)
                select ${id}, ${metier} where exists (select 1 from metier where code = ${metier})`;
    }
    for (const competence of p.competences) {
      await sql`insert into interimaire_competence (interimaire_id, competence_code)
                select ${id}, ${competence} where exists (select 1 from competence where code = ${competence})`;
    }
    for (const d of p.disponibilites) {
      await sql`insert into disponibilite (interimaire_id, date_debut, date_fin)
                values (${id}, ${d.debut}, ${d.fin})`;
    }
    for (const c of p.certifications) {
      await sql`
        insert into certification (
          interimaire_id, type_code, categorie_id, organisme_emetteur,
          numero_chiffre, date_obtention, date_echeance
        ) values (
          ${id}, ${c.type},
          ${c.categorie
            ? sql`(select id from categorie_certification where type_code = ${c.type} and code = ${c.categorie})`
            : null},
          'AFPA Grand Est', ${chiffrer(`${c.type}-${p.cle}`)}, ${c.obtention}, ${c.echeance}
        )`;
    }
    profils.push({ cle: p.cle, compteId: id, demontre: p.demontre });
  }

  // Historique : l'expérience constatée se lit sur des missions terminées dont la
  // candidature a été acceptée. Affectées au profil conforme, qui sert de référence.
  const conforme = profils.find((p) => p.cle === "conforme");
  if (conforme) {
    for (const c of CHANTIERS_PASSES) {
      const [passee] = await sql<{ id: number }[]>`
        insert into mission (
          entreprise_id, titre, metier_code, description, adresse, code_postal, ville,
          lat, lon, date_debut, date_fin, horaires, taux_horaire_min, statut,
          publiee_le, interimaire_affecte_id
        ) values (
          ${entrepriseId}, ${c.titre}, ${c.metier},
          'Chantier terminé, conservé pour l''historique.',
          '25 rue de Vesle', ${REIMS.codePostal}, ${REIMS.ville}, ${REIMS.lat}, ${REIMS.lon},
          ${c.debut}, ${c.fin}, '7h30-12h / 13h-16h30, 35 h par semaine', ${c.taux},
          'close', ${c.debut}, ${conforme.compteId}
        ) returning id`;

      await sql`
        insert into candidature (mission_id, interimaire_id, statut, decide_par, decide_le)
        values (${passee!.id}, ${conforme.compteId}, 'acceptee', 'entreprise', ${c.fin})`;
    }
  }

  return { entrepriseId, missionId, profils };
}
