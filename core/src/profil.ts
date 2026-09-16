import { enMsUTC } from "./dates";
import { exigeCategorie, typeCertification } from "./referentiel";
import type { DateISO, Probleme } from "./index";

/** Validation des profils et des certifications déclarées. */

const MOTIF_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MOTIF_CODE_POSTAL = /^\d{5}$/;

function texteObligatoire(valeur: unknown, champ: string, libelle: string, max = 120): Probleme | null {
  const v = typeof valeur === "string" ? valeur.trim() : "";
  if (v.length === 0) return { champ, message: `${libelle} est obligatoire.` };
  if (v.length > max) return { champ, message: `${libelle} est trop long.` };
  return null;
}

function dateValide(valeur: unknown, champ: string, libelle: string): Probleme | null {
  if (typeof valeur !== "string" || !MOTIF_DATE.test(valeur)) {
    return { champ, message: `${libelle} doit être une date au format JJ/MM/AAAA.` };
  }
  try {
    enMsUTC(valeur);
  } catch {
    return { champ, message: `${libelle} n'est pas une date réelle.` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Profil intérimaire
// ---------------------------------------------------------------------------

export const RAYON_MIN_KM = 5;
export const RAYON_MAX_KM = 200;
/** Périmètre de mobilité du CDI intérimaire. Jamais codé en dur ailleurs. */
export const RAYON_DEFAUT_KM = 50;

export interface SaisieProfilInterimaire {
  prenom?: unknown;
  nom?: unknown;
  telephone?: unknown;
  adresse?: unknown;
  codePostal?: unknown;
  ville?: unknown;
  rayonMobiliteKm?: unknown;
  carteBtpNumero?: unknown;
  carteBtpEcheance?: unknown;
  metiers?: unknown;
}

export function validerProfilInterimaire(saisie: SaisieProfilInterimaire): Probleme[] {
  const problemes: (Probleme | null)[] = [
    texteObligatoire(saisie.prenom, "prenom", "Le prénom", 80),
    texteObligatoire(saisie.nom, "nom", "Le nom", 80),
    texteObligatoire(saisie.ville, "ville", "La ville", 80),
  ];

  if (typeof saisie.codePostal !== "string" || !MOTIF_CODE_POSTAL.test(saisie.codePostal.trim())) {
    problemes.push({ champ: "codePostal", message: "Le code postal doit comporter 5 chiffres." });
  }

  const rayon = Number(saisie.rayonMobiliteKm);
  if (!Number.isFinite(rayon) || rayon < RAYON_MIN_KM || rayon > RAYON_MAX_KM) {
    problemes.push({
      champ: "rayonMobiliteKm",
      message: `La zone de déplacement doit être comprise entre ${RAYON_MIN_KM} et ${RAYON_MAX_KM} km.`,
    });
  }

  if (!Array.isArray(saisie.metiers) || saisie.metiers.length === 0) {
    problemes.push({ champ: "metiers", message: "Choisissez au moins un métier." });
  }

  // La carte BTP est facultative, mais si un numéro est déclaré, sa date l'est aussi :
  // une carte sans échéance ne permet pas de signaler qu'elle est périmée.
  const numeroCarte = typeof saisie.carteBtpNumero === "string" ? saisie.carteBtpNumero.trim() : "";
  if (numeroCarte.length > 0) {
    problemes.push(dateValide(saisie.carteBtpEcheance, "carteBtpEcheance", "La date de fin de validité de la carte BTP"));
  }

  return problemes.filter((p): p is Probleme => p !== null);
}

// ---------------------------------------------------------------------------
// Profil entreprise
// ---------------------------------------------------------------------------

/** SIRET : 14 chiffres, validés par la clé de Luhn. */
export function siretValide(siret: string): boolean {
  const chiffres = siret.replace(/\s/g, "");
  if (!/^\d{14}$/.test(chiffres)) return false;
  let somme = 0;
  for (let i = 0; i < 14; i++) {
    let n = Number(chiffres[13 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme % 10 === 0;
}

export interface SaisieProfilEntreprise {
  raisonSociale?: unknown;
  siret?: unknown;
  adresse?: unknown;
  codePostal?: unknown;
  ville?: unknown;
  telephone?: unknown;
}

export function validerProfilEntreprise(saisie: SaisieProfilEntreprise): Probleme[] {
  const problemes: (Probleme | null)[] = [
    texteObligatoire(saisie.raisonSociale, "raisonSociale", "La raison sociale", 160),
    texteObligatoire(saisie.ville, "ville", "La ville", 80),
  ];

  if (typeof saisie.codePostal !== "string" || !MOTIF_CODE_POSTAL.test(saisie.codePostal.trim())) {
    problemes.push({ champ: "codePostal", message: "Le code postal doit comporter 5 chiffres." });
  }

  // Le SIRET est facultatif au POC, mais un SIRET saisi doit être un vrai SIRET :
  // accepter une valeur fausse serait pire que ne rien demander.
  const siret = typeof saisie.siret === "string" ? saisie.siret.trim() : "";
  if (siret.length > 0 && !siretValide(siret)) {
    problemes.push({ champ: "siret", message: "Ce numéro SIRET n'est pas valide." });
  }

  return problemes.filter((p): p is Probleme => p !== null);
}

// ---------------------------------------------------------------------------
// Certification déclarée
// ---------------------------------------------------------------------------

export interface SaisieCertification {
  typeCode?: unknown;
  categorieCode?: unknown;
  organismeEmetteur?: unknown;
  numero?: unknown;
  dateObtention?: unknown;
  dateEcheance?: unknown;
}

/**
 * Valide une certification déclarée.
 *
 * Les mêmes règles qu'en base, appliquées ici pour rendre un message utile plutôt
 * qu'une violation de contrainte. La base reste l'autorité : ces contrôles guident
 * la saisie, ils ne la garantissent pas.
 */
export function validerCertification(saisie: SaisieCertification): Probleme[] {
  const problemes: (Probleme | null)[] = [];

  const type = typeof saisie.typeCode === "string" ? typeCertification(saisie.typeCode) : undefined;
  if (!type) {
    return [{ champ: "typeCode", message: "Choisissez un type de certification dans la liste." }];
  }

  const categorie = typeof saisie.categorieCode === "string" ? saisie.categorieCode.trim() : "";
  if (exigeCategorie(type.code)) {
    if (categorie.length === 0) {
      problemes.push({ champ: "categorieCode", message: `${type.libelle} exige une catégorie.` });
    } else if (!type.categories.includes(categorie)) {
      problemes.push({ champ: "categorieCode", message: "Cette catégorie n'existe pas pour ce titre." });
    }
  } else if (categorie.length > 0) {
    problemes.push({ champ: "categorieCode", message: `${type.libelle} ne comporte pas de catégorie.` });
  }

  problemes.push(texteObligatoire(saisie.organismeEmetteur, "organismeEmetteur", "L'organisme émetteur", 160));
  problemes.push(texteObligatoire(saisie.numero, "numero", "Le numéro du titre", 80));

  const pbObtention = dateValide(saisie.dateObtention, "dateObtention", "La date d'obtention");
  const pbEcheance = dateValide(saisie.dateEcheance, "dateEcheance", "La date d'échéance");
  problemes.push(pbObtention, pbEcheance);

  if (!pbObtention && !pbEcheance) {
    const obtention = enMsUTC(saisie.dateObtention as DateISO);
    const echeance = enMsUTC(saisie.dateEcheance as DateISO);
    if (echeance <= obtention) {
      problemes.push({
        champ: "dateEcheance",
        message: "La date d'échéance doit être postérieure à la date d'obtention.",
      });
    } else {
      // Contrôle de vraisemblance : une échéance très au-delà de la durée légale
      // du titre signale une erreur de saisie, pas une certification exceptionnelle.
      const maxMois = type.validiteMois + 12;
      const limite = Date.UTC(
        new Date(obtention).getUTCFullYear(),
        new Date(obtention).getUTCMonth() + maxMois,
        new Date(obtention).getUTCDate()
      );
      if (echeance > limite) {
        problemes.push({
          champ: "dateEcheance",
          message: `${type.libelle} est valable ${type.validiteMois / 12} ans : vérifiez la date lue sur le titre.`,
        });
      }
    }
  }

  return problemes.filter((p): p is Probleme => p !== null);
}
