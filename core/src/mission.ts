import { enMsUTC } from "./dates";
import { exigeCategorie, typeCertification } from "./referentiel";
import type { DateISO, Probleme } from "./index";

const MOTIF_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MOTIF_CODE_POSTAL = /^\d{5}$/;

/** Durée maximale d'une mission d'intérim, renouvellements compris (Code du travail). */
export const DUREE_MAX_MOIS = 18;

export interface SaisieMission {
  titre?: unknown;
  metierCode?: unknown;
  description?: unknown;
  adresse?: unknown;
  codePostal?: unknown;
  ville?: unknown;
  dateDebut?: unknown;
  dateFin?: unknown;
  tauxHoraireMin?: unknown;
  tauxHoraireMax?: unknown;
  certificationsRequises?: unknown;
  competencesRequises?: unknown;
}

export interface ExigenceSaisie {
  typeCode: string;
  categorieCode?: string | null;
}

/**
 * Valide une fiche de poste.
 *
 * `dateFin` est obligatoire, et ce n'est pas un choix de confort : c'est la date
 * contre laquelle le filtre éliminatoire compare les échéances de certification.
 * Sans elle, la règle centrale du produit est inapplicable.
 */
export function validerMission(saisie: SaisieMission): Probleme[] {
  const problemes: Probleme[] = [];

  const titre = typeof saisie.titre === "string" ? saisie.titre.trim() : "";
  if (titre.length === 0) problemes.push({ champ: "titre", message: "L'intitulé du poste est obligatoire." });
  else if (titre.length > 160) problemes.push({ champ: "titre", message: "L'intitulé est trop long." });

  if (typeof saisie.metierCode !== "string" || saisie.metierCode.trim().length === 0) {
    problemes.push({ champ: "metierCode", message: "Choisissez un métier dans la liste." });
  }

  const ville = typeof saisie.ville === "string" ? saisie.ville.trim() : "";
  if (ville.length === 0) problemes.push({ champ: "ville", message: "La commune du chantier est obligatoire." });

  if (typeof saisie.codePostal !== "string" || !MOTIF_CODE_POSTAL.test(saisie.codePostal.trim())) {
    problemes.push({ champ: "codePostal", message: "Le code postal doit comporter 5 chiffres." });
  }

  const debutValide = typeof saisie.dateDebut === "string" && MOTIF_DATE.test(saisie.dateDebut);
  const finValide = typeof saisie.dateFin === "string" && MOTIF_DATE.test(saisie.dateFin);
  if (!debutValide) problemes.push({ champ: "dateDebut", message: "La date de début est obligatoire." });
  if (!finValide) {
    problemes.push({
      champ: "dateFin",
      message: "La date de fin est obligatoire : c'est elle qui détermine quelles habilitations doivent encore être valides.",
    });
  }

  if (debutValide && finValide) {
    const debut = enMsUTC(saisie.dateDebut as DateISO);
    const fin = enMsUTC(saisie.dateFin as DateISO);
    if (fin < debut) {
      problemes.push({ champ: "dateFin", message: "La date de fin ne peut pas précéder la date de début." });
    } else {
      const limite = new Date(debut);
      limite.setUTCMonth(limite.getUTCMonth() + DUREE_MAX_MOIS);
      if (fin > limite.getTime()) {
        problemes.push({
          champ: "dateFin",
          message: `Une mission d'intérim ne peut pas dépasser ${DUREE_MAX_MOIS} mois, renouvellements compris.`,
        });
      }
    }
  }

  const min = saisie.tauxHoraireMin === undefined || saisie.tauxHoraireMin === null || saisie.tauxHoraireMin === "" ? null : Number(saisie.tauxHoraireMin);
  const max = saisie.tauxHoraireMax === undefined || saisie.tauxHoraireMax === null || saisie.tauxHoraireMax === "" ? null : Number(saisie.tauxHoraireMax);
  for (const [valeur, champ] of [[min, "tauxHoraireMin"], [max, "tauxHoraireMax"]] as const) {
    if (valeur !== null && (!Number.isFinite(valeur) || valeur <= 0)) {
      problemes.push({ champ, message: "Le taux horaire doit être un montant positif." });
    }
  }
  if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max) && max < min) {
    problemes.push({ champ: "tauxHoraireMax", message: "Le taux maximal doit être supérieur au taux minimal." });
  }

  problemes.push(...validerExigences(saisie.certificationsRequises));
  return problemes;
}

/** Les certifications exigées suivent les mêmes règles de catégorie que les certifications détenues. */
export function validerExigences(brut: unknown): Probleme[] {
  if (brut === undefined || brut === null) return [];
  if (!Array.isArray(brut)) {
    return [{ champ: "certificationsRequises", message: "Liste de certifications illisible." }];
  }

  const problemes: Probleme[] = [];
  const vues = new Set<string>();

  for (const item of brut as ExigenceSaisie[]) {
    const type = typeof item?.typeCode === "string" ? typeCertification(item.typeCode) : undefined;
    if (!type) {
      problemes.push({ champ: "certificationsRequises", message: "Une certification exigée n'existe pas." });
      continue;
    }
    const categorie = item.categorieCode?.trim() ?? "";
    if (exigeCategorie(type.code)) {
      if (categorie.length === 0) {
        problemes.push({ champ: "certificationsRequises", message: `${type.libelle} exige une catégorie.` });
      } else if (!type.categories.includes(categorie)) {
        problemes.push({ champ: "certificationsRequises", message: `Catégorie inconnue pour ${type.libelle}.` });
      }
    } else if (categorie.length > 0) {
      problemes.push({ champ: "certificationsRequises", message: `${type.libelle} ne comporte pas de catégorie.` });
    }

    // Une même exigence deux fois n'est pas une erreur métier, mais la clé primaire
    // de la table la refuserait : on le dit ici plutôt que de laisser passer un 500.
    if (vues.has(type.code)) {
      problemes.push({ champ: "certificationsRequises", message: `${type.libelle} est exigé deux fois.` });
    }
    vues.add(type.code);
  }
  return problemes;
}
