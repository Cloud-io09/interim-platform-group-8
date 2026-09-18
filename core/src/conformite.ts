import { enMsUTC } from "./dates";
import type { CertificationDetenue, ExigenceCertification } from "./types";

/**
 * Conformité, exigence par exigence.
 *
 * Le moteur de matching répond « retenu » ou « écarté ». C'est ce qu'il faut pour
 * classer, pas pour expliquer. Un intérimaire qui consulte une mission doit voir
 * **quelle** habilitation bloque, et un profil écarté doit dire pourquoi.
 *
 * Trois états, plus l'absence. Celui qui compte est `expire_pendant` : un titre
 * valide aujourd'hui mais périmé avant la fin du chantier. C'est la situation que le
 * produit existe pour rendre visible — la traiter comme une nuance de « valide »
 * reviendrait à nier son intérêt.
 */

export type EtatConformite =
  /** Couvre toute la durée de la mission. */
  | "valide"
  /** Valide aujourd'hui, périmée avant la fin du chantier. */
  | "expire_pendant"
  /** Déjà hors validité. */
  | "expiree"
  /** Aucun titre déclaré ne répond à l'exigence. */
  | "absente";

export interface ConformiteExigence {
  typeCode: string;
  categorieCode: string | null;
  etat: EtatConformite;
  /** Échéance du meilleur titre détenu, `null` si aucun ne répond à l'exigence. */
  dateEcheance: string | null;
  /** Vrai quand cet état interdit l'affectation. Seul `valide` ne bloque pas. */
  bloquant: boolean;
}

/** Une certification détenue répond-elle à l'exigence, catégorie comprise ? */
export function repondALExigence(
  detenue: CertificationDetenue,
  exigence: ExigenceCertification
): boolean {
  if (detenue.typeCode !== exigence.typeCode) return false;
  // Exigence sans catégorie : n'importe quelle catégorie du bon type convient.
  if (exigence.categorieCode === null) return true;
  return detenue.categorieCode === exigence.categorieCode;
}

/**
 * État de chaque habilitation exigée par une mission, pour un profil donné.
 *
 * `aujourdhui` est un paramètre et non une lecture d'horloge : la distinction entre
 * « déjà périmée » et « expire pendant » est la seule chose qui demande la date du
 * jour, et la passer explicitement garde la fonction reproductible — on peut donc
 * la tester aux bornes sans figer l'horloge du système.
 */
export function conformitePourMission(
  mission: { dateFin: string; certificationsRequises: readonly ExigenceCertification[] },
  certifications: readonly CertificationDetenue[],
  aujourdhui: string
): ConformiteExigence[] {
  const finDeMission = enMsUTC(mission.dateFin);
  const maintenant = enMsUTC(aujourdhui);

  return mission.certificationsRequises.map((exigence) => {
    const candidates = certifications.filter((c) => repondALExigence(c, exigence));

    if (candidates.length === 0) {
      return {
        typeCode: exigence.typeCode,
        categorieCode: exigence.categorieCode,
        etat: "absente" as const,
        dateEcheance: null,
        bloquant: true,
      };
    }

    // L'échéance la plus lointaine décide : c'est le titre le plus favorable, et
    // c'est celui qu'il faut citer pour expliquer un refus.
    const meilleure = candidates.reduce((a, b) =>
      enMsUTC(a.dateEcheance) >= enMsUTC(b.dateEcheance) ? a : b
    );
    const echeance = enMsUTC(meilleure.dateEcheance);

    const etat: EtatConformite =
      echeance >= finDeMission ? "valide" : echeance >= maintenant ? "expire_pendant" : "expiree";

    return {
      typeCode: exigence.typeCode,
      categorieCode: exigence.categorieCode,
      etat,
      dateEcheance: meilleure.dateEcheance,
      bloquant: etat !== "valide",
    };
  });
}

/** Vrai quand aucune exigence ne bloque : le profil peut être affecté. */
export function estConforme(exigences: readonly ConformiteExigence[]): boolean {
  return exigences.every((e) => !e.bloquant);
}

/**
 * Formulation par état, pour une habilitation nommée.
 *
 * Centralisée ici parce que la même phrase doit apparaître côté intérimaire et côté
 * entreprise : deux formulations divergentes du même fait seraient une source de
 * litige, pas une nuance de ton.
 */
/**
 * Ce qu'il y a à dire de la date, sans renommer l'habilitation.
 *
 * Deux contextes, deux besoins : dans une liste le titre est déjà en gras au-dessus,
 * et le répéter dans la phrase en dessous fait bégayer l'écran ; dans un message
 * d'erreur il n'y a rien d'autre, il faut donc la phrase entière.
 */
export function precisionConformite(
  conformite: ConformiteExigence,
  enDateFr: (iso: string) => string
): string {
  switch (conformite.etat) {
    case "valide":
      return `Valable jusqu'au ${enDateFr(conformite.dateEcheance!)} : couvre toute la mission.`;
    case "expire_pendant":
      return `Le vôtre expire le ${enDateFr(conformite.dateEcheance!)}, avant la fin du chantier.`;
    case "expiree":
      return `Le vôtre est périmé depuis le ${enDateFr(conformite.dateEcheance!)}.`;
    case "absente":
      return "Vous n'avez déclaré aucun titre répondant à cette exigence.";
  }
}

export function libelleConformite(
  conformite: ConformiteExigence,
  libelleType: string,
  enDateFr: (iso: string) => string
): string {
  const titre = conformite.categorieCode
    ? `${libelleType} — catégorie ${conformite.categorieCode}`
    : libelleType;

  switch (conformite.etat) {
    case "valide":
      return `${titre} : valide jusqu'au ${enDateFr(conformite.dateEcheance!)}, couvre toute la mission.`;
    case "expire_pendant":
      return `${titre} : expire le ${enDateFr(conformite.dateEcheance!)}, avant la fin du chantier.`;
    case "expiree":
      return `${titre} : périmée depuis le ${enDateFr(conformite.dateEcheance!)}.`;
    case "absente":
      return `${titre} : non déclarée.`;
  }
}
