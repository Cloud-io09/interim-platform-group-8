import type { CodeTypeCertification } from "../types.js";
import { typeCertification } from "../referentiel.js";

/**
 * Repérage de certifications dans le texte d'une offre France Travail.
 *
 * L'API n'expose aucun champ certification : `formations` et `permis` sont absents
 * des offres d'intérim BTP. La seule source est l'intitulé et la description.
 *
 * Ce repérage ne sert QU'À PRÉREMPLIR un formulaire, jamais à matcher. L'entreprise
 * confirme ou retire chaque suggestion, et seules des valeurs typées entrent en base.
 * Le moteur de matching ne voit jamais ce texte.
 *
 * Mesuré sur 600 offres d'intérim BTP : CACES 29 %, habilitation électrique 8 %,
 * AIPR 5 %, SST et amiante quasi absents. Les suggestions ne seront donc utiles
 * que pour les trois premiers.
 */

export interface CertificationDetectee {
  typeCode: CodeTypeCertification;
  /** `null` si aucune catégorie n'est explicitement nommée dans le texte. */
  categorieCode: string | null;
  /** Fragment de texte ayant déclenché la détection — sert à vérifier et à expliquer. */
  extrait: string;
}

interface RegleCategories {
  /** Mention après laquelle chercher des catégories (« R482 », « habilitation électrique »). */
  ancre: RegExp;
  /** Nombre de caractères balayés après l'ancre. */
  fenetre: number;
  /** Jetons de catégorie reconnus dans cette fenêtre. */
  jeton: RegExp;
  /** Coupe la fenêtre avant : évite d'attribuer à R482 la catégorie d'un R486. */
  arret?: RegExp;
}

interface Regle {
  typeCode: CodeTypeCertification;
  motif: RegExp;
  categories?: RegleCategories;
}

/**
 * Les motifs sont volontairement stricts. Un motif large comme `\bBR\b` pour
 * l'habilitation électrique remonterait tous les « BR » du texte ; on exige donc
 * le mot « habilitation » ou une forme non ambiguë comme « H0B0 ».
 */
const REGLES: Regle[] = [
  {
    typeCode: "CACES_R482",
    motif: /\bR\.?\s?482\b|\bcaces\b[^.!?]{0,60}?\bengins?\s+de\s+chantier\b/i,
    categories: {
      ancre: /\bR\.?\s?482\b/gi,
      fenetre: 40,
      jeton: /\b([ABCDEFG][123]?)\b/g,
      // Une autre recommandation CACES ferme la fenêtre : « R482 ... F et R486 ... (B) »
      // ne doit pas attribuer B au R482.
      arret: /\bR\.?\s?4\d{2}\b/i,
    },
  },
  {
    typeCode: "AIPR",
    motif: /\bAIPR\b|autorisation\s+d['’]intervention\s+[àa]\s+proximit[ée]\s+des\s+r[ée]seaux/i,
  },
  {
    typeCode: "HAB_ELEC",
    motif: /habilitations?\s+[ée]lectriques?|\bH0\s?B0\b|\bB0\s?H0\b/i,
    categories: {
      ancre: /habilitations?\s+[ée]lectriques?/gi,
      fenetre: 60,
      jeton: /\b(B0|H0V|H0|B1V|B1|B2V|B2|BR|BC|H1V|H1|H2V|H2|HC)\b/g,
    },
  },
  { typeCode: "AMIANTE_SS4", motif: /\bamiante\b/i },
  { typeCode: "SST", motif: /\bSST\b|sauveteurs?[\s-]+secouristes?\s+du\s+travail/i },
];

/** Contexte rendu autour d'une correspondance, en caractères de part et d'autre. */
const MARGE_EXTRAIT = 45;

function extraitAutour(texte: string, index: number, longueur: number): string {
  const debut = Math.max(0, index - MARGE_EXTRAIT);
  const fin = Math.min(texte.length, index + longueur + MARGE_EXTRAIT);
  return (debut > 0 ? "…" : "") +
    texte.slice(debut, fin).replace(/\s+/g, " ").trim() +
    (fin < texte.length ? "…" : "");
}

/**
 * Détecte les certifications mentionnées. Une certification n'apparaît qu'une fois,
 * avec sa catégorie si le texte en nomme une valide pour ce type.
 */
export function extraireCertifications(texte: string): CertificationDetectee[] {
  if (!texte) return [];
  const trouvees: CertificationDetectee[] = [];

  for (const regle of REGLES) {
    const correspondance = regle.motif.exec(texte);
    if (!correspondance) continue;

    const categoriesValides = typeCertification(regle.typeCode)?.categories ?? [];
    // Chaque catégorie garde l'extrait de SA mention, pas celle du type : sinon une
    // offre citant « Habilitation électrique B1 ... Habilitation électrique H2 »
    // justifierait H2 par un extrait affichant B1.
    const categories = new Map<string, string>();

    if (regle.categories) {
      const { ancre, fenetre, jeton, arret } = regle.categories;
      // On repart d'une copie du motif : partager `lastIndex` entre deux textes
      // ferait sauter des correspondances d'un appel à l'autre.
      for (const debut of texte.matchAll(new RegExp(ancre.source, "gi"))) {
        const apres = debut.index + debut[0].length;
        let zone = texte.slice(apres, apres + fenetre);

        // Couper la fenêtre à la mention concurrente, le cas échéant.
        const coupure = arret ? new RegExp(arret.source, "i").exec(zone) : null;
        if (coupure) zone = zone.slice(0, coupure.index);

        for (const m of zone.matchAll(new RegExp(jeton.source, "g"))) {
          const brute = m[1]?.toUpperCase();
          if (!brute || !categoriesValides.includes(brute)) continue;
          if (!categories.has(brute)) {
            categories.set(brute, extraitAutour(texte, apres + m.index, m[0].length));
          }
        }
      }
    }

    if (categories.size === 0) {
      trouvees.push({
        typeCode: regle.typeCode,
        categorieCode: null,
        extrait: extraitAutour(texte, correspondance.index, correspondance[0].length),
      });
    } else {
      // Une offre peut exiger plusieurs catégories d'engin : on les remonte toutes.
      for (const categorieCode of [...categories.keys()].sort()) {
        trouvees.push({
          typeCode: regle.typeCode,
          categorieCode,
          extrait: categories.get(categorieCode)!,
        });
      }
    }
  }

  return trouvees;
}

/**
 * Fréquence d'apparition de chaque certification sur un ensemble d'offres.
 *
 * C'est ce qui alimente la suggestion « CACES R482 — présent dans 41 % des offres de
 * ce métier ». Le taux est rendu avec son effectif : une suggestion sans son assise
 * n'est pas vérifiable par l'entreprise qui la lit.
 */
export function frequenceCertifications(
  offres: { texte: string }[]
): { typeCode: CodeTypeCertification; occurrences: number; part: number }[] {
  const compte = new Map<CodeTypeCertification, number>();
  for (const offre of offres) {
    const types = new Set(extraireCertifications(offre.texte).map((c) => c.typeCode));
    for (const t of types) compte.set(t, (compte.get(t) ?? 0) + 1);
  }
  return [...compte.entries()]
    .map(([typeCode, occurrences]) => ({
      typeCode,
      occurrences,
      part: offres.length === 0 ? 0 : occurrences / offres.length,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}
