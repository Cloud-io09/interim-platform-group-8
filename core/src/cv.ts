import { extraireCertifications } from "./ingestion/certifications";
import type { CodeTypeCertification } from "./types";

/**
 * Analyse d'un CV déposé.
 *
 * Le texte du CV ne sert qu'à **proposer** : métiers, compétences et certifications
 * détectés sont soumis à l'intérimaire, qui valide. Seules les valeurs typées qu'il
 * confirme entrent en base, et le moteur de matching ne voit jamais ce texte.
 *
 * Un CV mentionne presque toujours « CACES R482 » et presque jamais sa date
 * d'échéance ni son numéro. L'extraction gagne donc du temps de saisie sur le type,
 * et laisse à l'utilisateur les champs qui décident réellement de son éligibilité.
 */

/** Retire accents, ponctuation et casse : « Maçon/Maçonne » et « macon » se rejoignent. */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Mots trop fréquents pour distinguer quoi que ce soit dans un CV de chantier. */
const MOTS_VIDES = new Set([
  "de", "du", "des", "le", "la", "les", "un", "une", "et", "en", "au", "aux", "pour",
  "sur", "dans", "avec", "par", "chez", "ans", "an", "annees", "annee", "experience",
  "experiences", "poste", "postes", "travail", "chantier", "chantiers", "entreprise",
  "societe", "cdd", "cdi", "interim", "mission", "missions", "h", "f", "nbsp",
]);

export function motsSignifiants(texte: string): Set<string> {
  return new Set(
    normaliser(texte)
      .split(" ")
      .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m))
  );
}

export interface MetierReference {
  code: string;
  libelle: string;
}

export interface CompetenceReference {
  code: string;
  libelle: string;
}

export interface SuggestionCompetence extends CompetenceReference {
  extrait: string;
}

/**
 * Longueur minimale d'un libellé de métier tenant en un seul mot.
 *
 * « Maçon » (5) est sans ambiguïté ; en dessous, un mot court risquerait de
 * correspondre à un fragment sans rapport.
 */
export const LONGUEUR_MIN_MOT_METIER = 5;

export interface SuggestionMetier {
  code: string;
  libelle: string;
  /** Fragment du libellé qui a déclenché la détection, pour que l'utilisateur juge. */
  declencheur: string;
  /** Passage du CV où la détection a eu lieu, avec son contexte. */
  extrait: string;
}

/** Contexte rendu autour d'une correspondance, en caractères de part et d'autre. */
const MARGE_EXTRAIT = 45;

/**
 * Rend le passage du CV qui a déclenché une détection.
 *
 * Sans lui, l'utilisateur ne peut que croire l'outil sur parole. Avec, il vérifie
 * d'un coup d'œil — et repère une erreur d'OCR aussi bien qu'un contresens.
 */
export function extraitAutour(texte: string, aiguille: string): string {
  const normalise = normaliser(texte);
  const position = normalise.indexOf(aiguille);
  if (position < 0) return "";

  // La normalisation change les longueurs : on repositionne en comptant les mots.
  const motsAvant = normalise.slice(0, position).split(" ").length - 1;
  const mots = texte.split(/\s+/);
  const debut = Math.max(0, motsAvant - 6);
  const fin = Math.min(mots.length, motsAvant + aiguille.split(" ").length + 6);
  return (
    (debut > 0 ? "…" : "") +
    mots.slice(debut, fin).join(" ").trim() +
    (fin < mots.length ? "…" : "")
  );
}

/**
 * Découpe un libellé ROME en variantes cherchables.
 *
 * « Conducteur / Conductrice d'engins de chantier » donne « conducteur d engins de
 * chantier » et « conductrice d engins de chantier ». Sans ce découpage, un CV qui
 * écrit seulement « conducteur d'engins » ne correspondrait à rien.
 */
export function variantesLibelle(libelle: string): string[] {
  const parties = libelle.split("/").map((p) => p.trim());
  if (parties.length < 2) return [normaliser(libelle)].filter((v) => v.length > 0);

  // La suite du libellé après le dernier terme genré s'applique à toutes les variantes.
  const dernier = parties[parties.length - 1]!;
  const mots = dernier.split(" ");
  const complement = mots.slice(1).join(" ");
  const variantes = parties.map((p, i) =>
    i === parties.length - 1 ? normaliser(p) : normaliser(`${p} ${complement}`)
  );
  return [...new Set(variantes.filter((v) => v.length > 0))];
}

/** Métiers du référentiel cités dans le CV. */
export function detecterMetiers(
  texte: string,
  referentiel: readonly MetierReference[]
): SuggestionMetier[] {
  const normalise = ` ${normaliser(texte)} `;
  const trouves: SuggestionMetier[] = [];

  for (const metier of referentiel) {
    for (const variante of variantesLibelle(metier.libelle)) {
      // Un mot isolé n'est retenu que s'il est assez distinctif. Exiger deux mots
      // éliminerait « Maçon », « Grutier », « Coffreur » — les métiers les plus
      // courants du secteur, et ceux qu'un CV cite le plus souvent seuls.
      if (variante.split(" ").length < 2 && variante.length < LONGUEUR_MIN_MOT_METIER) continue;
      if (normalise.includes(` ${variante} `)) {
        trouves.push({
          code: metier.code,
          libelle: metier.libelle,
          declencheur: variante,
          extrait: extraitAutour(texte, variante),
        });
        break;
      }
    }
  }
  return trouves;
}

/** Compétences du référentiel citées dans le CV. */
export function detecterCompetences(
  texte: string,
  referentiel: readonly CompetenceReference[],
  maximum = 10
): SuggestionCompetence[] {
  const normalise = ` ${normaliser(texte)} `;
  return referentiel
    .filter((c) => {
      const cible = normaliser(c.libelle);
      return cible.split(" ").length >= 2 && normalise.includes(` ${cible} `);
    })
    .slice(0, maximum)
    .map((c) => ({ ...c, extrait: extraitAutour(texte, normaliser(c.libelle)) }));
}

export interface AnalyseCv {
  metiers: SuggestionMetier[];
  competences: SuggestionCompetence[];
  certifications: { typeCode: CodeTypeCertification; categorieCode: string | null; extrait: string }[];
  /** Vrai quand le texte est trop court pour qu'une extraction ait du sens. */
  tropCourt: boolean;
}

/** Sous ce seuil, le fichier n'est pas un CV lisible — ou c'est un scan sans texte. */
export const LONGUEUR_MIN_CV = 200;

export function analyserCv(
  texte: string,
  metiers: readonly MetierReference[],
  competences: readonly CompetenceReference[]
): AnalyseCv {
  if (texte.trim().length < LONGUEUR_MIN_CV) {
    return { metiers: [], competences: [], certifications: [], tropCourt: true };
  }
  return {
    metiers: detecterMetiers(texte, metiers),
    competences: detecterCompetences(texte, competences),
    certifications: extraireCertifications(texte),
    tropCourt: false,
  };
}

// ---------------------------------------------------------------------------
// Rapprochement CV ↔ missions
// ---------------------------------------------------------------------------

export interface MissionRapprochable {
  missionId: number;
  titre: string;
  description: string | null;
  metierLibelle: string;
}

export interface SuggestionMission {
  missionId: number;
  /** Proportion des mots de la fiche retrouvés dans le CV, entre 0 et 1. */
  proximite: number;
  motsCommuns: string[];
}

/**
 * Rapproche un CV de fiches de poste, par recouvrement lexical.
 *
 * **Ce n'est pas du matching.** Le moteur à deux étapes décide seul de qui peut aller
 * sur un chantier, sur des certifications datées. Ce rapprochement ne fait que
 * suggérer des fiches à regarder : il ignore les habilitations, les dates et la
 * distance. L'interface doit présenter les deux listes séparément, sans quoi un
 * intérimaire croira être éligible à une mission dont il est écarté.
 */
export function rapprocherMissions(
  texteCv: string,
  missions: readonly MissionRapprochable[],
  minimumMotsCommuns = 2
): SuggestionMission[] {
  const motsCv = motsSignifiants(texteCv);
  if (motsCv.size === 0) return [];

  return missions
    .map((m) => {
      const motsMission = motsSignifiants(
        `${m.titre} ${m.metierLibelle} ${m.description ?? ""}`
      );
      const communs = [...motsMission].filter((mot) => motsCv.has(mot));
      return {
        missionId: m.missionId,
        proximite: motsMission.size === 0 ? 0 : communs.length / motsMission.size,
        motsCommuns: communs.sort(),
      };
    })
    .filter((s) => s.motsCommuns.length >= minimumMotsCommuns)
    .sort((a, b) => b.proximite - a.proximite);
}
