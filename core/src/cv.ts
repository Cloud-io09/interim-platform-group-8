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

/**
 * Suffixes coupés pour rapprocher les formes d'un même mot.
 *
 * Classés du plus long au plus court : « ferraillage » doit perdre « age » et donner
 * « ferraill », pas perdre « e ».
 */
const SUFFIXES_RACINE = [
  "issements", "issement", "ements", "ement", "issages", "issage", "ages", "age",
  "ations", "ation", "itions", "ition", "eries", "erie", "euses", "euse",
  "eurs", "eur", "ants", "ant", "ents", "ent", "ees", "ee", "er", "es", "e", "s", "x",
];

// « ier » et ses variantes sont volontairement absents : ils forment des noms de
// métier — ouvrier, chantier, charpentier — et non des formes d'un même mot. Les
// couper ferait de « ouvrier » et « ouvrages » la même racine.

/** En deçà, la racine ne distingue plus rien : on garde le mot entier. */
const LONGUEUR_MIN_RACINE = 3;

/**
 * Racine approximative d'un mot français.
 *
 * Un CV écrit « coffrages » et « ferraillage » ; le référentiel ROME écrit « Coffrer
 * des ouvrages en béton » et « Techniques de ferraillage ». Sans cette réduction, la
 * détection exigerait du candidat qu'il recopie mot pour mot un vocabulaire
 * administratif — ce que personne ne fait.
 *
 * Ce n'est pas une analyse morphologique : on coupe des suffixes fréquents, et
 * jamais au point de rendre le reste indistinct.
 */
export function raciniser(mot: string): string {
  for (const suffixe of SUFFIXES_RACINE) {
    if (mot.length - suffixe.length >= LONGUEUR_MIN_RACINE && mot.endsWith(suffixe)) {
      // Le français double la consonne devant certains suffixes : « maçonnerie » donne
      // « maconn » là où « maçon » donne « macon ». Sans cette réduction, les deux
      // formes du même mot resteraient étrangères l'une à l'autre.
      return mot.slice(0, -suffixe.length).replace(/([bcdfglmnprst])\1$/, "$1");
    }
  }
  return mot;
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

/** Nombre de mots rendus de part et d'autre d'une correspondance. */
const MOTS_CONTEXTE = 6;

/**
 * Mots normalisés du texte, chacun rattaché au mot brut dont il provient.
 *
 * La normalisation coupe « d'armature » en deux mots : sans ce rattachement, la
 * position trouvée dans le texte normalisé désignerait le mauvais mot du texte
 * d'origine, et l'extrait rendu serait décalé.
 */
function motsIndexes(texte: string): { mot: string; brut: number }[] {
  const indexes: { mot: string; brut: number }[] = [];
  texte.split(/\s+/).forEach((brut, i) => {
    for (const mot of normaliser(brut).split(" ")) if (mot) indexes.push({ mot, brut: i });
  });
  return indexes;
}

function extraitEntre(texte: string, premier: number, dernier: number): string {
  const mots = texte.split(/\s+/);
  const debut = Math.max(0, premier - MOTS_CONTEXTE);
  const fin = Math.min(mots.length, dernier + 1 + MOTS_CONTEXTE);
  return (
    (debut > 0 ? "…" : "") +
    mots.slice(debut, fin).join(" ").trim() +
    (fin < mots.length ? "…" : "")
  );
}

/**
 * Rend le passage du CV qui a déclenché une détection.
 *
 * Sans lui, l'utilisateur ne peut que croire l'outil sur parole. Avec, il vérifie
 * d'un coup d'œil — et repère une erreur d'OCR aussi bien qu'un contresens.
 */
export function extraitAutour(texte: string, aiguille: string): string {
  const cherches = aiguille.split(" ").filter(Boolean);
  if (cherches.length === 0) return "";

  const indexes = motsIndexes(texte);
  for (let i = 0; i + cherches.length <= indexes.length; i++) {
    if (cherches.every((c, j) => indexes[i + j]!.mot === c)) {
      return extraitEntre(texte, indexes[i]!.brut, indexes[i + cherches.length - 1]!.brut);
    }
  }
  return "";
}

/** Même chose, pour une détection obtenue par racine plutôt que mot pour mot. */
export function extraitAutourRacine(texte: string, racine: string): string {
  const trouve = motsIndexes(texte).find((m) => raciniser(m.mot) === racine);
  return trouve ? extraitEntre(texte, trouve.brut, trouve.brut) : "";
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

/**
 * Mots d'un libellé du référentiel qui le classent au lieu de le décrire.
 *
 * Le ROME préfixe : « Techniques de maçonnerie », « Normes de sécurité sur les
 * chantiers », « Caractéristiques des enduits ». Un CV écrit « maçonnerie » et
 * « enduits ». Ces mots-là ne prouvent donc rien, et les exiger ferait manquer
 * presque toutes les compétences réellement citées.
 */
const MOTS_CLASSANTS = new Set([
  "techniques", "technique", "caracteristiques", "caracteristique", "normes", "norme",
  "regles", "regle", "procedures", "procedure", "methodes", "methode", "modalites",
  "modalite", "principes", "principe", "notions", "notion", "types", "connaissances",
  "connaissance", "utilisation", "elements", "element", "divers", "autre", "autres",
  // Noms de structure, eux aussi : « Coffrer des ouvrages en béton » se reconnaît à
  // « coffrage » et « béton », jamais au mot « ouvrages », qu'aucun CV n'emploie.
  "ouvrage", "ouvrages", "travaux", "operation", "operations", "activite", "activites",
  "ensemble", "ensembles",
]);

/**
 * Termes par lesquels un libellé du référentiel se reconnaît dans un CV.
 *
 * Réduits à leur racine, pour que « Techniques de ferraillage » se reconnaisse dans
 * « installation de ferrailles ».
 */
export function termesDistinctifs(libelle: string): string[] {
  return [
    ...new Set(
      normaliser(libelle)
        .split(" ")
        .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m) && !MOTS_CLASSANTS.has(m))
        .map(raciniser)
    ),
  ];
}

/**
 * Compétences du référentiel que le CV atteste.
 *
 * Une compétence n'est retenue que si **tous** ses termes distinctifs figurent dans le
 * CV. C'est volontairement strict : mieux vaut ne rien proposer que faire cocher à un
 * maçon une compétence d'électricien parce que les deux libellés partagent un mot.
 */
export function detecterCompetences(
  texte: string,
  referentiel: readonly CompetenceReference[],
  maximum = 10
): SuggestionCompetence[] {
  const occurrences = new Map<string, number>();
  for (const mot of normaliser(texte).split(" ")) {
    if (mot.length < 4) continue;
    const racine = raciniser(mot);
    occurrences.set(racine, (occurrences.get(racine) ?? 0) + 1);
  }
  const racines = new Set(occurrences.keys());

  const candidats = referentiel
    .map((competence) => ({ competence, termes: termesDistinctifs(competence.libelle) }))
    .filter(({ termes }) => termes.length > 0 && termes.every((t) => racines.has(t)))
    // Le libellé le plus précis en tête : il apprend davantage à l'utilisateur que
    // « Règles de sécurité », que presque tout CV de chantier déclenche.
    .sort(
      (a, b) =>
        b.termes.length - a.termes.length ||
        a.competence.libelle.length - b.competence.libelle.length
    );

  const retenues: SuggestionCompetence[] = [];
  const dejaDit: Set<string>[] = [];

  for (const { competence, termes } of candidats) {
    // Le référentiel contient des quasi-doublons — « Règles et consignes de sécurité »,
    // « Règles de sécurité », « Normes de sécurité sur les chantiers ». Le plus précis
    // arrive en premier ; ceux qui n'apportent rien de plus sont écartés, sans quoi la
    // liste à cocher se remplit de la même idée répétée trois fois.
    if (dejaDit.some((retenu) => termes.every((t) => retenu.has(t)))) continue;
    dejaDit.push(new Set(termes));

    // L'extrait doit montrer ce qui a vraiment déclenché la détection. Le terme le
    // plus rare dans le CV est le plus parlant : « enduits » apprend quelque chose,
    // « réaliser », qui revient partout, n'apprend rien.
    const plusRare = termes.reduce((a, b) =>
      (occurrences.get(b) ?? 0) < (occurrences.get(a) ?? 0) ? b : a
    );
    retenues.push({ ...competence, extrait: extraitAutourRacine(texte, plusRare) });
    if (retenues.length >= maximum) break;
  }
  return retenues;
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
