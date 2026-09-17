import { connexion } from "@interimatch/core/db";
import type {
  CodeTypeCertification,
  MissionAMatcher,
  ProfilInterimaire,
} from "@interimatch/core";

export interface MissionComplete extends MissionAMatcher {
  titre: string;
  description: string | null;
  metierCode: string;
  ville: string;
  codePostal: string;
  statut: string;
  entrepriseId: number;
  raisonSociale: string;
  tauxHoraireMin: number | null;
  tauxHoraireMax: number | null;
}

/**
 * Charge une mission et les profils à évaluer.
 *
 * Trois requêtes plutôt qu'une jointure unique : une jointure profil × certification
 * × compétence × disponibilité multiplie les lignes et oblige à dédupliquer côté
 * application. À l'échelle du POC, trois lectures indexées coûtent moins cher qu'un
 * produit cartésien à recoller.
 */
export async function chargerMission(
  sql: ReturnType<typeof connexion>,
  missionId: number
): Promise<MissionComplete | null> {
  const [ligne] = await sql<
    {
      id: number; titre: string; description: string | null; metier_code: string; lat: number; lon: number;
      date_debut: string; date_fin: string; ville: string; code_postal: string;
      statut: string; entreprise_id: number; raison_sociale: string;
      taux_horaire_min: string | null; taux_horaire_max: string | null;
    }[]
  >`
    select m.id, m.titre, m.description, m.metier_code, m.lat, m.lon,
           m.date_debut::text, m.date_fin::text, m.ville, m.code_postal, m.statut,
           m.entreprise_id, e.raison_sociale, m.taux_horaire_min, m.taux_horaire_max
    from mission m join entreprise e on e.compte_id = m.entreprise_id
    where m.id = ${missionId}`;
  if (!ligne) return null;

  const exigences = await sql<{ type_code: string; categorie_code: string | null }[]>`
    select r.type_code, c.code as categorie_code
    from mission_certification_requise r
    left join categorie_certification c on c.id = r.categorie_id
    where r.mission_id = ${missionId}`;

  const competences = await sql<{ competence_code: string }[]>`
    select competence_code from mission_competence where mission_id = ${missionId}`;

  return {
    missionId: ligne.id,
    titre: ligne.titre,
    description: ligne.description,
    metierCode: ligne.metier_code,
    lat: ligne.lat,
    lon: ligne.lon,
    dateDebut: ligne.date_debut,
    dateFin: ligne.date_fin,
    ville: ligne.ville,
    codePostal: ligne.code_postal,
    statut: ligne.statut,
    entrepriseId: ligne.entreprise_id,
    raisonSociale: ligne.raison_sociale,
    tauxHoraireMin: ligne.taux_horaire_min === null ? null : Number(ligne.taux_horaire_min),
    tauxHoraireMax: ligne.taux_horaire_max === null ? null : Number(ligne.taux_horaire_max),
    certificationsRequises: exigences.map((e) => ({
      typeCode: e.type_code as CodeTypeCertification,
      categorieCode: e.categorie_code,
    })),
    competencesRequises: competences.map((c) => c.competence_code),
  };
}

export interface ProfilAvecIdentite extends ProfilInterimaire {
  prenom: string;
  nom: string;
  ville: string;
}

/**
 * Profils candidats à une mission.
 *
 * Restreints au métier de la mission : un électricien ne doit pas apparaître dans les
 * écartés d'un chantier de terrassement. Ce n'est pas le filtre éliminatoire — c'est
 * la définition du vivier sur lequel il s'applique.
 */
export async function chargerProfils(
  sql: ReturnType<typeof connexion>,
  metierCode: string
): Promise<ProfilAvecIdentite[]> {
  const interimaires = await sql<
    {
      compte_id: number; prenom: string; nom: string; ville: string;
      lat: number; lon: number; rayon_mobilite_km: number;
    }[]
  >`
    select i.compte_id, i.prenom, i.nom, i.ville, i.lat, i.lon, i.rayon_mobilite_km
    from interimaire i
    join interimaire_metier im on im.interimaire_id = i.compte_id
    where im.metier_code = ${metierCode}`;

  if (interimaires.length === 0) return [];
  const ids = interimaires.map((i) => i.compte_id);

  const certifications = await sql<
    { interimaire_id: number; type_code: string; categorie_code: string | null; date_echeance: string }[]
  >`
    select c.interimaire_id, c.type_code, cat.code as categorie_code, c.date_echeance::text
    from certification c
    left join categorie_certification cat on cat.id = c.categorie_id
    where c.interimaire_id = any(${ids})`;

  const competences = await sql<{ interimaire_id: number; competence_code: string }[]>`
    select interimaire_id, competence_code from interimaire_competence
    where interimaire_id = any(${ids})`;

  const disponibilites = await sql<
    { interimaire_id: number; date_debut: string; date_fin: string }[]
  >`
    select interimaire_id, date_debut::text, date_fin::text from disponibilite
    where interimaire_id = any(${ids})`;

  return interimaires.map((i) => ({
    interimaireId: i.compte_id,
    prenom: i.prenom,
    nom: i.nom,
    ville: i.ville,
    lat: i.lat,
    lon: i.lon,
    rayonMobiliteKm: i.rayon_mobilite_km,
    certifications: certifications
      .filter((c) => c.interimaire_id === i.compte_id)
      .map((c) => ({
        typeCode: c.type_code as CodeTypeCertification,
        categorieCode: c.categorie_code,
        dateEcheance: c.date_echeance,
      })),
    competences: competences.filter((c) => c.interimaire_id === i.compte_id).map((c) => c.competence_code),
    disponibilites: disponibilites
      .filter((d) => d.interimaire_id === i.compte_id)
      .map((d) => ({ dateDebut: d.date_debut, dateFin: d.date_fin })),
  }));
}

/**
 * Chargeur de profils mémorisé, à la durée d'une requête.
 *
 * Plusieurs missions partagent le même métier : les recharger pour chacune multiplie
 * les allers-retours sans rien apporter. Sur 73 missions couvrant 52 métiers, la
 * mémorisation divise le nombre de requêtes par le nombre de missions par métier —
 * et faisait passer l'endpoint n8n de plus de 20 secondes à quelques centaines de
 * millisecondes.
 *
 * La portée est volontairement limitée à une requête : au-delà, on servirait des
 * profils périmés, et un profil dont la certification vient d'expirer doit être
 * écarté immédiatement.
 */
export function chargeurProfilsMemorise(sql: ReturnType<typeof connexion>) {
  const parMetier = new Map<string, Promise<ProfilAvecIdentite[]>>();
  return (metierCode: string): Promise<ProfilAvecIdentite[]> => {
    const dejaEnCours = parMetier.get(metierCode);
    if (dejaEnCours) return dejaEnCours;
    const promesse = chargerProfils(sql, metierCode);
    parMetier.set(metierCode, promesse);
    return promesse;
  };
}

/**
 * Charge plusieurs missions en trois requêtes, quel que soit leur nombre.
 *
 * `chargerMission` en coûte trois par mission : sur cinquante missions, cent
 * cinquante allers-retours vers une base hébergée à Francfort, soit plus de dix
 * secondes. Les endpoints qui parcourent un ensemble de missions — notifications
 * n8n, tableau de bord intérimaire, suggestions depuis le CV — doivent passer par
 * ici.
 */
export async function chargerMissions(
  sql: ReturnType<typeof connexion>,
  identifiants: readonly number[]
): Promise<MissionComplete[]> {
  if (identifiants.length === 0) return [];
  const ids = [...identifiants];

  const lignes = await sql<
    {
      id: number; titre: string; description: string | null; metier_code: string;
      lat: number; lon: number; date_debut: string; date_fin: string; ville: string;
      code_postal: string; statut: string; entreprise_id: number; raison_sociale: string;
      taux_horaire_min: string | null; taux_horaire_max: string | null;
    }[]
  >`
    select m.id, m.titre, m.description, m.metier_code, m.lat, m.lon,
           m.date_debut::text, m.date_fin::text, m.ville, m.code_postal, m.statut,
           m.entreprise_id, e.raison_sociale, m.taux_horaire_min, m.taux_horaire_max
    from mission m join entreprise e on e.compte_id = m.entreprise_id
    where m.id = any(${ids})`;

  const exigences = await sql<
    { mission_id: number; type_code: string; categorie_code: string | null }[]
  >`
    select r.mission_id, r.type_code, c.code as categorie_code
    from mission_certification_requise r
    left join categorie_certification c on c.id = r.categorie_id
    where r.mission_id = any(${ids})`;

  const competences = await sql<{ mission_id: number; competence_code: string }[]>`
    select mission_id, competence_code from mission_competence where mission_id = any(${ids})`;

  // L'ordre demandé est préservé : les appelants classent déjà leurs identifiants.
  const parId = new Map(lignes.map((l) => [l.id, l]));
  return ids
    .map((id) => parId.get(id))
    .filter((l): l is NonNullable<typeof l> => l !== undefined)
    .map((ligne) => ({
      missionId: ligne.id,
      titre: ligne.titre,
      description: ligne.description,
      metierCode: ligne.metier_code,
      lat: ligne.lat,
      lon: ligne.lon,
      dateDebut: ligne.date_debut,
      dateFin: ligne.date_fin,
      ville: ligne.ville,
      codePostal: ligne.code_postal,
      statut: ligne.statut,
      entrepriseId: ligne.entreprise_id,
      raisonSociale: ligne.raison_sociale,
      tauxHoraireMin: ligne.taux_horaire_min === null ? null : Number(ligne.taux_horaire_min),
      tauxHoraireMax: ligne.taux_horaire_max === null ? null : Number(ligne.taux_horaire_max),
      certificationsRequises: exigences
        .filter((e) => e.mission_id === ligne.id)
        .map((e) => ({
          typeCode: e.type_code as CodeTypeCertification,
          categorieCode: e.categorie_code,
        })),
      competencesRequises: competences
        .filter((c) => c.mission_id === ligne.id)
        .map((c) => c.competence_code),
    }));
}

/**
 * Charge en quatre requêtes les profils de plusieurs métiers.
 *
 * La mémorisation par métier ne sert à rien quand chaque mission relève d'un métier
 * différent — le cas exact du tableau de bord et des notifications n8n, qui
 * parcourent des dizaines de missions toutes distinctes. On charge donc l'union des
 * métiers demandés d'un coup, puis on répartit.
 */
export async function chargerProfilsParMetiers(
  sql: ReturnType<typeof connexion>,
  metiers: readonly string[]
): Promise<Map<string, ProfilAvecIdentite[]>> {
  const codes = [...new Set(metiers)];
  const parMetier = new Map<string, ProfilAvecIdentite[]>(codes.map((c) => [c, []]));
  if (codes.length === 0) return parMetier;

  const appartenances = await sql<{ interimaire_id: number; metier_code: string }[]>`
    select interimaire_id, metier_code from interimaire_metier where metier_code = any(${codes})`;
  if (appartenances.length === 0) return parMetier;

  const ids = [...new Set(appartenances.map((a) => a.interimaire_id))];

  const [interimaires, certifications, competences, disponibilites] = await Promise.all([
    sql<
      { compte_id: number; prenom: string; nom: string; ville: string; lat: number; lon: number; rayon_mobilite_km: number }[]
    >`
      select compte_id, prenom, nom, ville, lat, lon, rayon_mobilite_km
      from interimaire where compte_id = any(${ids})`,
    sql<
      { interimaire_id: number; type_code: string; categorie_code: string | null; date_echeance: string }[]
    >`
      select c.interimaire_id, c.type_code, cat.code as categorie_code, c.date_echeance::text
      from certification c
      left join categorie_certification cat on cat.id = c.categorie_id
      where c.interimaire_id = any(${ids})`,
    sql<{ interimaire_id: number; competence_code: string }[]>`
      select interimaire_id, competence_code from interimaire_competence
      where interimaire_id = any(${ids})`,
    sql<{ interimaire_id: number; date_debut: string; date_fin: string }[]>`
      select interimaire_id, date_debut::text, date_fin::text from disponibilite
      where interimaire_id = any(${ids})`,
  ]);

  const profils = new Map<number, ProfilAvecIdentite>(
    interimaires.map((i) => [
      i.compte_id,
      {
        interimaireId: i.compte_id,
        prenom: i.prenom,
        nom: i.nom,
        ville: i.ville,
        lat: i.lat,
        lon: i.lon,
        rayonMobiliteKm: i.rayon_mobilite_km,
        certifications: certifications
          .filter((c) => c.interimaire_id === i.compte_id)
          .map((c) => ({
            typeCode: c.type_code as CodeTypeCertification,
            categorieCode: c.categorie_code,
            dateEcheance: c.date_echeance,
          })),
        competences: competences
          .filter((c) => c.interimaire_id === i.compte_id)
          .map((c) => c.competence_code),
        disponibilites: disponibilites
          .filter((d) => d.interimaire_id === i.compte_id)
          .map((d) => ({ dateDebut: d.date_debut, dateFin: d.date_fin })),
      },
    ])
  );

  for (const a of appartenances) {
    const profil = profils.get(a.interimaire_id);
    if (profil) parMetier.get(a.metier_code)?.push(profil);
  }
  return parMetier;
}
