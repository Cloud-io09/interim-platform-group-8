import { hacherMotDePasse } from "@interimatch/core";
import type { Sql } from "postgres";

/**
 * Jeu de missions de démonstration, généré **à partir des offres France Travail
 * déjà ingérées** : intitulés normalisés réels, communes réellement géocodées,
 * médianes de rémunération observées, certifications effectivement citées pour
 * chaque métier.
 *
 * Deux garanties tenues par construction :
 *
 * 1. **Chaque métier actif reçoit au moins une mission sans habilitation exigée.**
 *    Tout profil déclarant ce métier a donc au moins un résultat conforme, quel que
 *    soit l'état de ses certifications.
 * 2. Les autres missions du métier portent les habilitations réellement observées,
 *    pour que le filtre éliminatoire ait de quoi s'exercer.
 */

export const DOMAINE_DEMO_ENTREPRISE = "@chantiers.interimatch.test";
export const MOT_DE_PASSE_DEMO = "demonstration-interimatch";

interface Employeur {
  cle: string;
  raisonSociale: string;
  siret: string;
  ville: string;
  codePostal: string;
  lat: number;
  lon: number;
}

/** Quatre villes éloignées : le critère de distance doit produire des écarts visibles. */
const EMPLOYEURS: Employeur[] = [
  { cle: "reims", raisonSociale: "Bâtiment Rémois SAS", siret: "44306184100005", ville: "Reims", codePostal: "51100", lat: 49.2628, lon: 4.0347 },
  { cle: "lyon", raisonSociale: "Rhône Travaux Publics", siret: "55210055400024", ville: "Lyon", codePostal: "69003", lat: 45.7578, lon: 4.832 },
  { cle: "nantes", raisonSociale: "Atlantique Gros Œuvre", siret: "54210765100029", ville: "Nantes", codePostal: "44000", lat: 47.2184, lon: -1.5536 },
  { cle: "toulouse", raisonSociale: "Garonne Construction", siret: "44306184100005", ville: "Toulouse", codePostal: "31000", lat: 43.6045, lon: 1.444 },
];

interface LieuReel {
  ville: string;
  codePostal: string;
  lat: number;
  lon: number;
}

interface MatiereMetier {
  code: string;
  libelle: string;
  intitules: string[];
  lieux: LieuReel[];
  tauxMedian: number | null;
  certifications: { typeCode: string; categorieCode: string | null }[];
  competences: string[];
}

const JOUR = 86_400_000;
const enISO = (d: Date) => d.toISOString().slice(0, 10);

/** Décale d'un nombre de jours à partir d'aujourd'hui. */
function dans(jours: number): string {
  return enISO(new Date(Date.now() + jours * JOUR));
}

/** Catégorie plausible pour un type qui en exige une, tirée du référentiel. */
function categorieParDefaut(typeCode: string): string | null {
  return (
    {
      CACES_R482: "B1",
      CACES_R483: "B",
      CACES_R486: "B",
      CACES_R487: "2",
      HAB_ELEC: "B0",
    } as Record<string, string>
  )[typeCode] ?? null;
}

async function rassemblerMatiere(sql: Sql): Promise<MatiereMetier[]> {
  const metiers = await sql<{ code: string; libelle: string }[]>`
    select code, libelle from metier where actif order by code`;

  const intitules = await sql<{ metier_code: string; intitule_normalise: string; n: number }[]>`
    select metier_code, intitule_normalise, count(*)::int n from offre_ft
    where metier_code is not null group by 1, 2 order by 1, 3 desc`;

  // Communes réelles, avec leur nom normalisé à l'ingestion et leurs coordonnées
  // d'origine : les distances calculées en démonstration sont donc exactes.
  const positions = await sql<
    { metier_code: string; code_postal: string; commune_libelle: string; lat: number; lon: number }[]
  >`
    select distinct on (metier_code, commune_libelle)
      metier_code, code_postal, commune_libelle, lat, lon
    from offre_ft
    where metier_code is not null and lat is not null
      and code_postal is not null and commune_libelle is not null
    order by metier_code, commune_libelle`;

  const taux = await sql<{ metier_code: string; median: string | null }[]>`
    select metier_code,
           percentile_cont(0.5) within group (
             order by (taux_horaire_min + taux_horaire_max) / 2
           )::numeric(6,2) median
    from offre_ft where metier_code is not null and taux_horaire_min is not null
    group by 1`;

  const certifs = await sql<{ metier_code: string; type_code: string; n: number }[]>`
    select o.metier_code, c.type_code, count(*)::int n
    from offre_ft_certification c join offre_ft o on o.id_ft = c.offre_id
    where o.metier_code is not null
    group by 1, 2 having count(*) >= 3 order by 1, 3 desc`;

  const comps = await sql<{ metier_code: string; competence_code: string; n: number }[]>`
    select o.metier_code, oc.competence_code, count(*)::int n
    from offre_ft_competence oc join offre_ft o on o.id_ft = oc.offre_id
    where o.metier_code is not null
    group by 1, 2 order by 1, 3 desc`;

  return metiers.map((m) => ({
    code: m.code,
    libelle: m.libelle,
    intitules: intitules.filter((i) => i.metier_code === m.code).slice(0, 2).map((i) => i.intitule_normalise),
    lieux: positions
      .filter((p) => p.metier_code === m.code)
      .slice(0, 3)
      .map((p) => ({ ville: p.commune_libelle, codePostal: p.code_postal, lat: p.lat, lon: p.lon })),
    tauxMedian: (() => {
      const t = taux.find((x) => x.metier_code === m.code)?.median;
      return t ? Number(t) : null;
    })(),
    certifications: certifs
      .filter((c) => c.metier_code === m.code)
      .slice(0, 2)
      .map((c) => ({ typeCode: c.type_code, categorieCode: categorieParDefaut(c.type_code) })),
    competences: comps.filter((c) => c.metier_code === m.code).slice(0, 3).map((c) => c.competence_code),
  }));
}

export interface BilanMissions {
  entreprises: number;
  missions: number;
  sansExigence: number;
  avecExigence: number;
  metiersCouverts: number;
}

export async function purgerMissionsDemo(sql: Sql): Promise<number> {
  const s = await sql`delete from compte where email like ${`%${DOMAINE_DEMO_ENTREPRISE}`} returning id`;
  return s.length;
}

export async function semerMissions(sql: Sql): Promise<BilanMissions> {
  await purgerMissionsDemo(sql);
  const { hash, sel } = await hacherMotDePasse(MOT_DE_PASSE_DEMO);
  const matiere = await rassemblerMatiere(sql);

  const identifiants = new Map<string, number>();
  for (const e of EMPLOYEURS) {
    const [compte] = await sql<{ id: number }[]>`
      insert into compte (email, mot_de_passe_hash, mot_de_passe_sel, role, plan_code)
      values (${`${e.cle}${DOMAINE_DEMO_ENTREPRISE}`}, ${hash}, ${sel}, 'entreprise', 'pro') returning id`;
    // Palier Pro : chaque employeur de démonstration porte des dizaines de fiches
    // publiées, au-delà de ce qu'un palier borné lui laisserait remettre en ligne.
    await sql`
      insert into entreprise (compte_id, raison_sociale, siret, adresse, code_postal, ville, lat, lon)
      values (${compte!.id}, ${e.raisonSociale}, ${e.siret}, ${"1 rue des Chantiers"},
              ${e.codePostal}, ${e.ville}, ${e.lat}, ${e.lon})`;
    identifiants.set(e.cle, compte!.id);
  }

  let missions = 0;
  let sansExigence = 0;
  let avecExigence = 0;
  let index = 0;

  for (const m of matiere) {
    const employeur = EMPLOYEURS[index % EMPLOYEURS.length]!;
    const lieuxDisponibles = m.lieux.length > 0 ? m.lieux : [
      { ville: employeur.ville, codePostal: employeur.codePostal, lat: employeur.lat, lon: employeur.lon },
    ];
    const intitule = m.intitules[0] ?? m.libelle;
    const taux = m.tauxMedian ?? 13.5;

    // Variantes : la première sans exigence (garantit un résultat à tout profil),
    // les suivantes avec les habilitations réellement observées sur ce métier.
    const variantes: { exigences: typeof m.certifications; decalage: number; duree: number }[] = [
      { exigences: [], decalage: 7 + (index % 20), duree: 14 },
      ...(m.certifications.length > 0
        ? [{ exigences: m.certifications.slice(0, 1), decalage: 21 + (index % 30), duree: 28 }]
        : []),
      ...(m.certifications.length > 1
        ? [{ exigences: m.certifications, decalage: 45 + (index % 40), duree: 42 }]
        : []),
    ];

    for (const [rang, v] of variantes.entries()) {
      const lieu = lieuxDisponibles[rang % lieuxDisponibles.length]!;
      const [creee] = await sql<{ id: number }[]>`
        insert into mission (
          entreprise_id, titre, metier_code, description, adresse, code_postal, ville,
          lat, lon, date_debut, date_fin, taux_horaire_min, taux_horaire_max, statut, publiee_le
        ) values (
          ${identifiants.get(employeur.cle)!},
          ${`${intitule} — ${lieu.ville}`},
          ${m.code},
          ${`Chantier ${m.libelle.toLowerCase()}. Intitulé et rémunération issus des offres publiques France Travail pour ce métier.`},
          ${"Zone de chantier"}, ${lieu.codePostal}, ${lieu.ville}, ${lieu.lat}, ${lieu.lon},
          ${dans(v.decalage)}, ${dans(v.decalage + v.duree)},
          ${taux}, ${Math.round((taux + 2) * 100) / 100},
          'publiee', now()
        ) returning id`;

      for (const e of v.exigences) {
        await sql`
          insert into mission_certification_requise (mission_id, type_code, categorie_id)
          values (
            ${creee!.id}, ${e.typeCode},
            ${e.categorieCode
              ? sql`(select id from categorie_certification where type_code = ${e.typeCode} and code = ${e.categorieCode})`
              : null}
          )
          on conflict do nothing`;
      }
      for (const c of m.competences) {
        await sql`
          insert into mission_competence (mission_id, competence_code)
          select ${creee!.id}, ${c} where exists (select 1 from competence where code = ${c})
          on conflict do nothing`;
      }

      missions++;
      if (v.exigences.length === 0) sansExigence++;
      else avecExigence++;
    }
    index++;
  }

  return {
    entreprises: EMPLOYEURS.length,
    missions,
    sansExigence,
    avecExigence,
    metiersCouverts: matiere.length,
  };
}
