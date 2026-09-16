/** Types du domaine partagés entre l'application web et le pipeline d'ingestion. */

/** Date civile au format ISO `AAAA-MM-JJ`. Jamais un `Date` : pas de fuseau, pas d'heure. */
export type DateISO = string;

export type RoleCompte = "entreprise" | "interimaire";

export type CodeTypeCertification =
  | "CACES_R482"
  | "CACES_R483"
  | "CACES_R486"
  | "CACES_R487"
  | "CACES_R490"
  | "AIPR"
  | "HAB_ELEC"
  | "AMIANTE_SS4"
  | "SST";

/** Une certification détenue par un intérimaire, telle que le moteur la consomme. */
export interface CertificationDetenue {
  typeCode: CodeTypeCertification;
  /** `null` pour les types qui n'exigent pas de catégorie (AIPR, amiante, SST). */
  categorieCode: string | null;
  dateEcheance: DateISO;
}

/** Une certification exigée par une mission. */
export interface ExigenceCertification {
  typeCode: CodeTypeCertification;
  categorieCode: string | null;
}

export interface Periode {
  dateDebut: DateISO;
  dateFin: DateISO;
}

export interface ProfilInterimaire {
  interimaireId: number;
  lat: number;
  lon: number;
  /** Paramétré par l'intérimaire, jamais codé en dur. */
  rayonMobiliteKm: number;
  certifications: CertificationDetenue[];
  competences: string[];
  disponibilites: Periode[];
}

export interface MissionAMatcher {
  missionId: number;
  lat: number;
  lon: number;
  dateDebut: DateISO;
  /** Référence du filtre éliminatoire — pas la date du jour. */
  dateFin: DateISO;
  certificationsRequises: ExigenceCertification[];
  competencesRequises: string[];
}

export type MotifExclusion = "certification_absente" | "certification_expiree";

export interface Exclusion {
  interimaireId: number;
  motif: MotifExclusion;
  typeCode: CodeTypeCertification;
  categorieCode: string | null;
  /** Renseignée seulement quand le motif est une expiration. */
  dateEcheance?: DateISO;
}

export interface ScoreProfil {
  interimaireId: number;
  /** Les trois critères, exposés séparément — on doit pouvoir expliquer un résultat. */
  competences: number;
  distance: number;
  disponibilite: number;
  total: number;
  detail: {
    competencesCommunes: string[];
    competencesRequises: string[];
    distanceKm: number;
    rayonKm: number;
    joursChevauchement: number;
    joursMission: number;
  };
}

export interface ResultatMatching {
  missionId: number;
  evalues: number;
  retenus: ScoreProfil[];
  ecartes: Exclusion[];
  calculeLe: string;
}
