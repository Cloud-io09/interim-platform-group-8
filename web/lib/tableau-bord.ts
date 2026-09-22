import type { Sql } from "postgres";
import { attendUneReponseDe, matcher, typeCertification, type EtatCandidature } from "@interimatch/core";
import { consultationsDuProfil } from "./deblocage";
import { chargerMissions, chargerProfilsParMetiers } from "./depot";
import { lireProfilEntreprise, lireProfilInterimaire, type ProfilEntrepriseLu, type ProfilInterimaireLu } from "./profils";
import { compterNonLues, lister, rattraperEcheances, type Notification } from "./notifications";

/**
 * Données des tableaux de bord.
 *
 * L'ancien écran n'était qu'un menu : cinq cartes de navigation et trois compteurs.
 * Un tableau de bord montre un **état** — ce qui attend une réponse, ce qui arrive,
 * ce qui expire — pas des liens vers les pages où l'état se trouve.
 *
 * Tout est chargé ici, en requêtes groupées : une page qui déclenche une requête par
 * mission affichée redevient lente dès la dizaine de fiches.
 */

/** Deux initiales pour la pastille d'identité. */
function initiales(...parties: string[]): string {
  return parties
    .map((p) => p.trim()[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Jours calendaires entre aujourd'hui et une date ISO, négatif si elle est passée. */
function joursAvant(iso: string): number {
  const jour = 24 * 60 * 60 * 1000;
  const cible = Date.parse(`${iso}T00:00:00Z`);
  const aujourdhui = new Date();
  const debut = Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate());
  return Math.round((cible - debut) / jour);
}

// ---------------------------------------------------------------------------
// Intérimaire
// ---------------------------------------------------------------------------

export interface MissionProposee {
  id: number;
  titre: string;
  entreprise: string;
  ville: string;
  dateDebut: string;
  dateFin: string;
  statut: EtatCandidature;
  joursAvantDebut: number;
}

export interface MissionSuggeree {
  id: number;
  titre: string;
  entreprise: string;
  ville: string;
  dateDebut: string;
  dateFin: string;
  tauxHoraireMin: number | null;
  score: number;
  distanceKm: number;
  /** Libellés des compétences exigées, et celles que le profil possède. */
  competencesRequises: string[];
  competencesCommunes: string[];
  joursCouverts: number;
  joursMission: number;
  /** Vrai quand la mission dépasse le rayon que l'intérimaire s'est fixé. */
  horsRayon: boolean;
}

export interface EcheanceCertification {
  id: number;
  libelle: string;
  categorieCode: string | null;
  dateEcheance: string;
  joursRestants: number;
}

export interface TableauBordInterimaire {
  profil: ProfilInterimaireLu | null;
  initiales: string;
  notifications: Notification[];
  nonLues: number;
  /** Sollicitations d'entreprise en attente de ma réponse : la seule chose qui presse. */
  propositions: MissionProposee[];
  /** Ce que j'ai envoyé et qui attend une réponse de l'entreprise. */
  candidaturesEnvoyees: MissionProposee[];
  /** Mission acceptée dont la date de début est la plus proche. */
  prochaine: MissionProposee | null;
  suggestions: MissionSuggeree[];
  /** Missions du métier pour lesquelles une habilitation manque ou a expiré. */
  bloquees: number;
  certifications: EcheanceCertification[];
  certificationsPerimees: number;
  disponibilites: { debut: string; fin: string }[];
  cvDepose: boolean;
  /** Entreprises ayant accédé aux coordonnées, rendu à l'intéressé seul. */
  consultations: { entreprises: number; total: number; derniere: string | null };
}

export async function tableauBordInterimaire(sql: Sql, compteId: number): Promise<TableauBordInterimaire> {
  const profil = await lireProfilInterimaire(sql, compteId);

  // Les alertes d'échéance n'ont aucun déclencheur naturel côté application : on les
  // rattrape ici, l'index d'unicité rendant l'opération sans effet si elle a eu lieu.
  await rattraperEcheances(sql, compteId);

  const [notifications, nonLues, candidatures, certifs, dispos, cv] = await Promise.all([
    lister(sql, compteId, 6),
    compterNonLues(sql, compteId),
    sql<
      {
        id: number; titre: string; ville: string; date_debut: string; date_fin: string;
        statut: EtatCandidature; raison_sociale: string;
      }[]
    >`
      select m.id, m.titre, m.ville, m.date_debut::text, m.date_fin::text,
             c.statut, e.raison_sociale
      from candidature c
      join mission m on m.id = c.mission_id
      join entreprise e on e.compte_id = m.entreprise_id
      where c.interimaire_id = ${compteId} and m.date_fin >= current_date
      order by m.date_debut`,
    sql<{ id: number; type_code: string; categorie: string | null; date_echeance: string }[]>`
      select c.id, c.type_code, cat.code as categorie, c.date_echeance::text
      from certification c
      left join categorie_certification cat on cat.id = c.categorie_id
      where c.interimaire_id = ${compteId}
      order by c.date_echeance`,
    sql<{ date_debut: string; date_fin: string }[]>`
      select date_debut::text, date_fin::text from disponibilite
      where interimaire_id = ${compteId} and date_fin >= current_date
      order by date_debut limit 4`,
    sql<{ depose: boolean }[]>`
      select cv_texte_chiffre is not null as depose from interimaire where compte_id = ${compteId}`,
  ]);

  const enCandidature = candidatures.map((c) => ({
    id: c.id,
    titre: c.titre,
    entreprise: c.raison_sociale,
    ville: c.ville,
    dateDebut: c.date_debut,
    dateFin: c.date_fin,
    statut: c.statut,
    joursAvantDebut: joursAvant(c.date_debut),
  }));

  const { suggestions, bloquees } = await suggestionsPourInterimaire(
    sql,
    compteId,
    new Set(enCandidature.filter((c) => c.statut !== "declinee").map((c) => c.id))
  );

  return {
    profil,
    initiales: profil ? initiales(profil.prenom, profil.nom) : "?",
    notifications,
    nonLues,
    propositions: enCandidature.filter((c) => attendUneReponseDe(c.statut, "interimaire")),
    candidaturesEnvoyees: enCandidature.filter((c) => c.statut === "candidatee"),
    prochaine: enCandidature.find((c) => c.statut === "acceptee") ?? null,
    suggestions,
    bloquees,
    certifications: certifs.map((c) => ({
      id: c.id,
      libelle: typeCertification(c.type_code)?.libelle ?? c.type_code.replace(/_/g, " "),
      categorieCode: c.categorie,
      dateEcheance: c.date_echeance,
      joursRestants: joursAvant(c.date_echeance),
    })),
    certificationsPerimees: certifs.filter((c) => joursAvant(c.date_echeance) < 0).length,
    disponibilites: dispos.map((d) => ({ debut: d.date_debut, fin: d.date_fin })),
    cvDepose: cv[0]?.depose ?? false,
    // Qui a consulté ses coordonnées, et combien de fois. Rendu à l'intéressé, pas à
    // l'entreprise : c'est ce qui distingue une place de marché d'un courtier en
    // données. Vendre l'accès à quelqu'un sans le lui dire serait l'autre métier.
    consultations: await consultationsDuProfil(sql, compteId),
  };
}

/** Libellés des compétences citées, en une requête : le moteur ne manipule que des codes. */
async function libellesCompetences(sql: Sql, codes: readonly string[]): Promise<Map<string, string>> {
  const uniques = [...new Set(codes)];
  if (uniques.length === 0) return new Map();
  const lignes = await sql<{ code: string; libelle: string }[]>`
    select code, libelle from competence where code = any(${uniques as string[]})`;
  return new Map(lignes.map((l) => [l.code, l.libelle]));
}

/** Combien de suggestions le tableau de bord montre avant de renvoyer vers la liste. */
const SUGGESTIONS_AFFICHEES = 3;

/**
 * Meilleures missions ouvertes pour ce profil, écartant celles déjà en candidature.
 *
 * Le moteur est rejoué : afficher une mission dont l'intérimaire est écarté
 * reviendrait à lui proposer un chantier où il ne peut pas aller.
 */
async function suggestionsPourInterimaire(
  sql: Sql,
  compteId: number,
  dejaEnCandidature: ReadonlySet<number>
): Promise<{ suggestions: MissionSuggeree[]; bloquees: number }> {
  const candidates = await sql<{ id: number }[]>`
    select distinct m.id
    from mission m
    join interimaire_metier im on im.metier_code = m.metier_code
    where im.interimaire_id = ${compteId}
      and m.statut = 'publiee' and m.date_fin >= current_date
    order by m.id desc
    limit 30`;

  const missions = await chargerMissions(sql, candidates.map((c) => c.id));
  const profilsParMetier = await chargerProfilsParMetiers(sql, missions.map((m) => m.metierCode));

  const suggestions: MissionSuggeree[] = [];
  let bloquees = 0;
  const libelles = await libellesCompetences(sql, missions.flatMap((m) => m.competencesRequises));

  for (const mission of missions) {
    if (dejaEnCandidature.has(mission.missionId)) continue;
    const resultat = matcher(mission, profilsParMetier.get(mission.metierCode) ?? []);

    const retenu = resultat.retenus.find((r) => r.interimaireId === compteId);
    if (!retenu) {
      if (resultat.ecartes.some((e) => e.interimaireId === compteId)) bloquees++;
      continue;
    }


    suggestions.push({
      id: mission.missionId,
      titre: mission.titre,
      entreprise: mission.raisonSociale,
      ville: mission.ville,
      dateDebut: mission.dateDebut,
      dateFin: mission.dateFin,
      tauxHoraireMin: mission.tauxHoraireMin,
      score: Math.round(retenu.total * 100),
      distanceKm: retenu.detail.distanceKm,
      competencesRequises: retenu.detail.competencesRequises.map((c) => libelles.get(c) ?? c),
      competencesCommunes: retenu.detail.competencesCommunes.map((c) => libelles.get(c) ?? c),
      joursCouverts: retenu.detail.joursChevauchement,
      joursMission: retenu.detail.joursMission,
      horsRayon: retenu.detail.distanceKm > retenu.detail.rayonKm,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);

  // Dans le rayon d'abord : c'est la contrainte que l'intérimaire s'est lui-même
  // fixée. S'il n'y a pas de quoi remplir, on complète avec les plus proches au-delà
  // plutôt que de rendre une page vide — mais en le disant, sans quoi la suggestion
  // serait trompeuse.
  const dansLeRayon = suggestions.filter((s) => !s.horsRayon);
  const auDela = suggestions.filter((s) => s.horsRayon).sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    suggestions: [...dansLeRayon, ...auDela].slice(0, SUGGESTIONS_AFFICHEES),
    bloquees,
  };
}

// ---------------------------------------------------------------------------
// Entreprise
// ---------------------------------------------------------------------------

export interface FicheSuivie {
  id: number;
  titre: string;
  ville: string;
  dateDebut: string;
  dateFin: string;
  statut: string;
  joursAvantDebut: number;
  /** Profils conformes au filtre éliminatoire, tous n'étant pas encore contactés. */
  candidatsConformes: number;
  propositionsEnAttente: number;
  acceptees: number;
}

export interface TableauBordEntreprise {
  profil: ProfilEntrepriseLu | null;
  initiales: string;
  notifications: Notification[];
  nonLues: number;
  fiches: FicheSuivie[];
  brouillons: number;
  /** Fiche publiée dont le chantier démarre le plus tôt. */
  prochainChantier: FicheSuivie | null;
}

export async function tableauBordEntreprise(sql: Sql, compteId: number): Promise<TableauBordEntreprise> {
  const profil = await lireProfilEntreprise(sql, compteId);

  const [notifications, nonLues, lignes] = await Promise.all([
    lister(sql, compteId, 6),
    compterNonLues(sql, compteId),
    sql<
      {
        id: number; titre: string; ville: string; date_debut: string; date_fin: string;
        statut: string; en_attente: number; acceptees: number;
      }[]
    >`
      select m.id, m.titre, m.ville, m.date_debut::text, m.date_fin::text, m.statut,
             count(*) filter (where c.statut = 'proposee')::int as en_attente,
             count(*) filter (where c.statut = 'acceptee')::int as acceptees
      from mission m
      left join candidature c on c.mission_id = m.id
      where m.entreprise_id = ${compteId} and m.date_fin >= current_date
      group by m.id
      order by m.date_debut
      limit 20`,
  ]);

  const publiees = lignes.filter((l) => l.statut === "publiee");
  const missions = await chargerMissions(sql, publiees.map((l) => l.id));
  const profilsParMetier = await chargerProfilsParMetiers(sql, missions.map((m) => m.metierCode));
  const conformesParMission = new Map(
    missions.map((m) => [
      m.missionId,
      matcher(m, profilsParMetier.get(m.metierCode) ?? []).retenus.length,
    ])
  );

  const fiches = lignes.map((l) => ({
    id: l.id,
    titre: l.titre,
    ville: l.ville,
    dateDebut: l.date_debut,
    dateFin: l.date_fin,
    statut: l.statut,
    joursAvantDebut: joursAvant(l.date_debut),
    candidatsConformes: conformesParMission.get(l.id) ?? 0,
    propositionsEnAttente: l.en_attente,
    acceptees: l.acceptees,
  }));

  return {
    profil,
    initiales: profil ? initiales(...profil.raisonSociale.split(" ")) : "?",
    notifications,
    nonLues,
    fiches,
    brouillons: fiches.filter((f) => f.statut === "brouillon").length,
    prochainChantier: fiches.find((f) => f.statut === "publiee" && f.joursAvantDebut >= 0) ?? null,
  };
}
