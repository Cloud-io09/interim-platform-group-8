/**
 * Normalisation des rémunérations France Travail.
 *
 * `salaire.libelle` est du texte libre en trois unités, souvent suivi d'un commentaire
 * après un tiret. Formats réellement observés sur 600 offres d'intérim BTP :
 *
 *   Horaire de 12.31 Euros
 *   Horaire de 12.5 Euros à 13.5 Euros
 *   Mensuel de 1800.0 Euros à 2000.0 Euros
 *   Annuel de 22405.0 Euros à 25000.0 Euros
 *   Horaire de 12.5 Euros à 13.5 Euros - Panier repas
 *   Horaire de 11.88 Euros à 12.5 Euros - 13 ème mois
 *
 * Tout est ramené au **taux horaire**, seule unité comparable entre offres.
 */

/** Durée légale mensualisée : 35 h × 52 semaines ÷ 12 mois. */
export const HEURES_PAR_MOIS = 151.67;
/** 35 h × 52 semaines. */
export const HEURES_PAR_AN = 1820;

export interface Remuneration {
  tauxHoraireMin: number;
  tauxHoraireMax: number;
  /** Unité d'origine, conservée pour pouvoir expliquer une conversion. */
  uniteOrigine: "horaire" | "mensuel" | "annuel";
}

const DIVISEUR = {
  horaire: 1,
  mensuel: HEURES_PAR_MOIS,
  annuel: HEURES_PAR_AN,
} as const;

// « Horaire de 12.5 Euros à 13.5 Euros » — le second montant est optionnel.
const MOTIF =
  /^(Horaire|Mensuel|Annuel)\s+de\s+([\d]+(?:[.,]\d+)?)\s*Euros?(?:\s+à\s+([\d]+(?:[.,]\d+)?)\s*Euros?)?/i;

/** Bornes de plausibilité : au-delà, c'est une donnée aberrante, pas un salaire. */
const TAUX_HORAIRE_MIN_PLAUSIBLE = 5;
const TAUX_HORAIRE_MAX_PLAUSIBLE = 200;

const enNombre = (brut: string): number => Number(brut.replace(",", "."));

/**
 * Extrait une fourchette de taux horaire d'un libellé France Travail.
 * Rend `null` quand le libellé est absent, non reconnu, ou produit un taux aberrant —
 * mieux vaut aucune donnée qu'une fourchette fausse affichée à une entreprise.
 */
export function parserSalaire(libelle: string | null | undefined): Remuneration | null {
  if (!libelle) return null;

  // Le commentaire libre après " - " ne contient jamais le montant de référence.
  const correspondance = MOTIF.exec(libelle.split(" - ")[0]!.trim());
  if (!correspondance) return null;

  const [, uniteBrute, minBrut, maxBrut] = correspondance;
  const unite = uniteBrute!.toLowerCase() as keyof typeof DIVISEUR;
  const diviseur = DIVISEUR[unite];

  const min = enNombre(minBrut!) / diviseur;
  const max = maxBrut ? enNombre(maxBrut) / diviseur : min;

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min < TAUX_HORAIRE_MIN_PLAUSIBLE || max > TAUX_HORAIRE_MAX_PLAUSIBLE) return null;
  if (max < min) return null;

  return {
    tauxHoraireMin: Math.round(min * 100) / 100,
    tauxHoraireMax: Math.round(max * 100) / 100,
    uniteOrigine: unite,
  };
}

export interface FourchetteLocale {
  mediane: number;
  q1: number;
  q3: number;
  /** Nombre d'offres qui fondent le chiffre. Un taux sans effectif n'est pas exploitable. */
  effectif: number;
}

/**
 * Agrège des rémunérations en fourchette locale, pour préremplir une fiche de poste.
 *
 * On expose médiane et quartiles plutôt qu'une moyenne : quelques offres à 25 €/h
 * tirent une moyenne sans représenter le marché. L'effectif est renvoyé avec le
 * chiffre, parce que « 13,50 €/h sur 8 offres » et « sur 340 offres » ne se lisent
 * pas de la même façon.
 */
export function fourchetteLocale(remunerations: Remuneration[]): FourchetteLocale | null {
  const taux = remunerations
    .map((r) => (r.tauxHoraireMin + r.tauxHoraireMax) / 2)
    .sort((a, b) => a - b);
  if (taux.length === 0) return null;

  const quantile = (p: number): number => {
    const position = (taux.length - 1) * p;
    const bas = Math.floor(position);
    const haut = Math.ceil(position);
    const interpole = taux[bas]! + (taux[haut]! - taux[bas]!) * (position - bas);
    return Math.round(interpole * 100) / 100;
  };

  return { mediane: quantile(0.5), q1: quantile(0.25), q3: quantile(0.75), effectif: taux.length };
}
