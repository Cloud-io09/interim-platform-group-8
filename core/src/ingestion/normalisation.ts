import { createHash } from "node:crypto";
import { extraireCertifications } from "./certifications";
import { parserSalaire } from "./salaire";
import { DOMAINES_TERRAIN } from "../referentiel";
import type { CodeTypeCertification } from "../types";

/** Offre France Travail, réduite aux champs que le pipeline consomme. */
export interface OffreBrute {
  id: string;
  intitule?: string;
  description?: string;
  romeCode?: string;
  romeLibelle?: string;
  appellationlibelle?: string;
  typeContrat?: string;
  dateCreation?: string;
  entreprise?: { nom?: string };
  salaire?: { libelle?: string };
  lieuTravail?: {
    libelle?: string;
    latitude?: number;
    longitude?: number;
    codePostal?: string;
    commune?: string;
  };
  competences?: { code?: string; libelle?: string; exigence?: string }[];
}

export interface OffreNettoyee {
  idFt: string;
  intituleBrut: string;
  /** Libellé issu du référentiel ROME, jamais l'intitulé libre de l'annonce. */
  intituleNormalise: string;
  romeCode: string;
  /** F13 | F15 | F16 | F17 */
  domaine: string;
  codePostal: string | null;
  communeCode: string | null;
  departement: string | null;
  lat: number | null;
  lon: number | null;
  tauxHoraireMin: number | null;
  tauxHoraireMax: number | null;
  dateCreationFt: string | null;
  empreinte: string;
  certifications: CodeTypeCertification[];
  competences: { code: string; libelle: string }[];
}

export interface RejetOffre {
  idFt: string;
  motif:
    | "hors_domaine_terrain"
    | "rome_absent"
    | "intitule_absent"
    | "doublon_exact"
    | "doublon_proche";
}

/**
 * Normalise un intitulé.
 *
 * Les intitulés bruts sont écrits par les annonceurs : « MAÇON/MAÇONNE Traditionnel
 * H/F (H/F) », « Tireur de rateau F/H ». On leur substitue le libellé du référentiel
 * ROME, seule façon d'obtenir une liste fermée comparable d'une offre à l'autre.
 */
function intituleNormalise(offre: OffreBrute): string | null {
  const libelle = offre.appellationlibelle?.trim() || offre.romeLibelle?.trim();
  return libelle && libelle.length > 0 ? libelle : null;
}

/** Retire les mentions de genre et la ponctuation décorative des intitulés. */
export function nettoyerIntitule(brut: string): string {
  return brut
    .replace(/\((?:h\/f|f\/h|h\/f\/d)\)/gi, "")
    .replace(/\b(?:h\/f|f\/h|h\/f\/d)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—,;]+$/u, "")
    .trim();
}

/**
 * Empreinte de quasi-doublon.
 *
 * Une agence publie souvent la même mission sur plusieurs communes voisines, ou la
 * republie à quelques jours d'intervalle. L'identifiant diffère à chaque fois ;
 * métier + commune + employeur, eux, ne bougent pas.
 */
export function empreinteOffre(
  intituleNormalise: string,
  commune: string | null,
  employeur: string | null
): string {
  const graine = [intituleNormalise, commune ?? "", employeur ?? ""]
    .map((s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim())
    .join("|");
  return createHash("sha256").update(graine).digest("hex").slice(0, 32);
}

/** Nettoie une offre, ou dit pourquoi elle est écartée. */
export function nettoyerOffre(offre: OffreBrute): OffreNettoyee | RejetOffre {
  const rome = offre.romeCode?.trim();
  if (!rome) return { idFt: offre.id, motif: "rome_absent" };

  const domaine = rome.slice(0, 3);
  // Le filtre de périmètre s'applique ici, à l'ingestion : F11 (conception) et
  // F12 (encadrement) n'entrent pas en base, ce n'est pas un masquage d'affichage.
  if (!DOMAINES_TERRAIN.some((d) => d === domaine)) {
    return { idFt: offre.id, motif: "hors_domaine_terrain" };
  }

  const normalise = intituleNormalise(offre);
  if (!normalise) return { idFt: offre.id, motif: "intitule_absent" };

  const remuneration = parserSalaire(offre.salaire?.libelle);
  const codePostal = offre.lieuTravail?.codePostal?.trim() || null;
  const texte = `${offre.intitule ?? ""}\n${offre.description ?? ""}`;

  return {
    idFt: offre.id,
    intituleBrut: nettoyerIntitule(offre.intitule ?? normalise),
    intituleNormalise: normalise,
    romeCode: rome,
    domaine,
    codePostal,
    communeCode: offre.lieuTravail?.commune?.trim() || null,
    // Le département se déduit du code postal ; la Corse s'écrit 2A/2B mais ses
    // codes postaux commencent par 20, d'où un simple préfixe à deux chiffres.
    departement: codePostal ? codePostal.slice(0, 2) : null,
    lat: typeof offre.lieuTravail?.latitude === "number" ? offre.lieuTravail.latitude : null,
    lon: typeof offre.lieuTravail?.longitude === "number" ? offre.lieuTravail.longitude : null,
    tauxHoraireMin: remuneration?.tauxHoraireMin ?? null,
    tauxHoraireMax: remuneration?.tauxHoraireMax ?? null,
    dateCreationFt: offre.dateCreation ?? null,
    empreinte: empreinteOffre(normalise, offre.lieuTravail?.commune ?? null, offre.entreprise?.nom ?? null),
    certifications: [...new Set(extraireCertifications(texte).map((c) => c.typeCode))],
    competences: (offre.competences ?? [])
      .filter((c): c is { code: string; libelle: string } => Boolean(c.code && c.libelle))
      .map(({ code, libelle }) => ({ code, libelle })),
  };
}

export interface ResultatNettoyage {
  retenues: OffreNettoyee[];
  rejets: RejetOffre[];
  /** Compte par motif, pour rendre le nettoyage démontrable. */
  bilan: Record<string, number>;
}

/**
 * Nettoie et déduplique un lot d'offres.
 *
 * Deux niveaux : l'identifiant France Travail pour le doublon exact (réingestion),
 * l'empreinte pour le quasi-doublon (même mission republiée ou dupliquée par commune).
 */
export function nettoyerLot(offres: OffreBrute[]): ResultatNettoyage {
  const retenues: OffreNettoyee[] = [];
  const rejets: RejetOffre[] = [];
  const idsVus = new Set<string>();
  const empreintesVues = new Set<string>();

  for (const brute of offres) {
    if (idsVus.has(brute.id)) {
      rejets.push({ idFt: brute.id, motif: "doublon_exact" });
      continue;
    }
    idsVus.add(brute.id);

    const resultat = nettoyerOffre(brute);
    if ("motif" in resultat) {
      rejets.push(resultat);
      continue;
    }
    if (empreintesVues.has(resultat.empreinte)) {
      rejets.push({ idFt: brute.id, motif: "doublon_proche" });
      continue;
    }
    empreintesVues.add(resultat.empreinte);
    retenues.push(resultat);
  }

  const bilan: Record<string, number> = { retenues: retenues.length };
  for (const r of rejets) bilan[r.motif] = (bilan[r.motif] ?? 0) + 1;

  return { retenues, rejets, bilan };
}
