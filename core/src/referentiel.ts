import type { CodeTypeCertification } from "./types";

export interface TypeCertification {
  code: CodeTypeCertification;
  libelle: string;
  validiteMois: number;
  /** Catégories autorisées. Vide quand le type n'en prend pas. */
  categories: readonly string[];
}

/**
 * Liste fermée des certifications gérées. Doit rester synchronisée avec
 * `core/migrations/002_seed_referentiels.sql` — un test le vérifie.
 */
export const TYPES_CERTIFICATION: readonly TypeCertification[] = [
  {
    code: "CACES_R482",
    libelle: "CACES R482 — engins de chantier",
    validiteMois: 120,
    categories: ["A", "B1", "B2", "C1", "C2", "C3", "D", "E", "F", "G"],
  },
  {
    code: "AIPR",
    libelle: "AIPR — intervention à proximité des réseaux",
    validiteMois: 60,
    categories: [],
  },
  {
    code: "HAB_ELEC",
    libelle: "Habilitation électrique",
    validiteMois: 36,
    categories: [
      "B0", "H0", "H0V", "B1", "B1V", "B2", "B2V", "BR", "BC",
      "H1", "H1V", "H2", "H2V", "HC",
    ],
  },
  {
    code: "CACES_R483",
    libelle: "CACES R483 — grues mobiles",
    validiteMois: 60,
    categories: ["A", "B"],
  },
  {
    code: "CACES_R486",
    libelle: "CACES R486 — plates-formes élévatrices",
    validiteMois: 60,
    categories: ["A", "B", "C"],
  },
  {
    code: "CACES_R487",
    libelle: "CACES R487 — grues à tour",
    validiteMois: 60,
    categories: ["1", "2", "3"],
  },
  { code: "CACES_R490", libelle: "CACES R490 — grues de chargement", validiteMois: 60, categories: [] },
  { code: "AMIANTE_SS4", libelle: "Amiante sous-section 4", validiteMois: 36, categories: [] },
  { code: "SST", libelle: "SST — sauveteur secouriste du travail", validiteMois: 24, categories: [] },
] as const;

const PAR_CODE = new Map(TYPES_CERTIFICATION.map((t) => [t.code, t]));

export function typeCertification(code: string): TypeCertification | undefined {
  return PAR_CODE.get(code as CodeTypeCertification);
}

export function exigeCategorie(code: string): boolean {
  return (typeCertification(code)?.categories.length ?? 0) > 0;
}

/**
 * Échéance théorique d'une certification, à partir de sa date d'obtention.
 * Sert à préremplir le formulaire : l'utilisateur corrige si son titre dit autre chose,
 * les organismes émettant parfois avec un décalage.
 */
export function echeanceTheorique(code: string, dateObtention: string): string | null {
  const type = typeCertification(code);
  if (!type) return null;
  const [a, m, j] = dateObtention.split("-").map(Number);
  if (a === undefined || m === undefined || j === undefined) return null;
  // Number("pas") vaut NaN, pas undefined : tester l'absence ne suffit pas.
  if (!Number.isFinite(a) || !Number.isFinite(m) || !Number.isFinite(j)) return null;
  const d = new Date(Date.UTC(a, m - 1 + type.validiteMois, j));
  return d.toISOString().slice(0, 10);
}

/** Domaines ROME retenus : métiers de terrain uniquement. */
export const DOMAINES_TERRAIN = ["F13", "F15", "F16", "F17"] as const;

export const LIBELLE_DOMAINE: Record<string, string> = {
  F13: "Engins de chantier",
  F15: "Montage de structures",
  F16: "Second œuvre",
  F17: "Travaux et gros œuvre",
};
