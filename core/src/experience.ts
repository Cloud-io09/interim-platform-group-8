import { nombreDeJours } from "./dates";
import type { DateISO } from "./types";

/**
 * Expérience **constatée**, par opposition à l'expérience déclarée.
 *
 * Le produit repose sur une distinction : une date d'échéance est un fait, un
 * mot-clé de CV est une affirmation. La même distinction vaut pour l'expérience.
 *
 * L'intérimaire déclare « huit ans en maçonnerie » — c'est utile, et invérifiable.
 * À côté, la plateforme **sait** quelles missions il a réellement effectuées : une
 * candidature acceptée sur un chantier terminé, avec ses dates et son entreprise.
 * Cette seconde expérience ne se saisit pas, elle s'accumule.
 *
 * Les deux sont montrées, et jamais confondues. Ni l'une ni l'autre ne décide de
 * l'éligibilité : ce sont les habilitations datées qui la décident.
 *
 * **Ce module ne lit pas l'horloge.** On lui passe les missions déjà terminées ;
 * décider de ce qui est terminé appartient à la requête, pas au calcul.
 */

export interface MissionRealisee {
  metierCode: string;
  metierLibelle: string;
  dateDebut: DateISO;
  dateFin: DateISO;
  entreprise: string;
}

export interface ExperienceMetier {
  metierCode: string;
  metierLibelle: string;
  missions: number;
  /** Jours travaillés, bornes incluses : une mission d'un seul jour en compte un. */
  jours: number;
  /** Fin de la mission la plus récente sur ce métier. */
  derniereFin: DateISO;
  /** Entreprises distinctes ayant employé l'intérimaire sur ce métier. */
  entreprises: string[];
}

export interface ExperienceConstatee {
  /** Par métier, du plus travaillé au moins travaillé. */
  parMetier: ExperienceMetier[];
  totalMissions: number;
  totalJours: number;
  /** Entreprises distinctes, tous métiers confondus. */
  totalEntreprises: number;
}

/**
 * Agrège des missions réalisées en expérience par métier.
 *
 * Les jours sont comptés bornes incluses : une mission du 1er au 1er compte un jour,
 * pas zéro. Deux missions simultanées comptent leurs jours deux fois — c'est
 * volontaire : ce qui est mesuré est le travail effectué, pas le temps écoulé.
 */
export function experienceConstatee(missions: readonly MissionRealisee[]): ExperienceConstatee {
  const parMetier = new Map<string, ExperienceMetier>();
  const entreprises = new Set<string>();

  for (const m of missions) {
    entreprises.add(m.entreprise);
    const acc = parMetier.get(m.metierCode) ?? {
      metierCode: m.metierCode,
      metierLibelle: m.metierLibelle,
      missions: 0,
      jours: 0,
      derniereFin: m.dateFin,
      entreprises: [] as string[],
    };

    acc.missions += 1;
    acc.jours += nombreDeJours({ dateDebut: m.dateDebut, dateFin: m.dateFin });
    if (m.dateFin > acc.derniereFin) acc.derniereFin = m.dateFin;
    if (!acc.entreprises.includes(m.entreprise)) acc.entreprises.push(m.entreprise);

    parMetier.set(m.metierCode, acc);
  }

  const liste = [...parMetier.values()].sort(
    (a, b) => b.jours - a.jours || a.metierLibelle.localeCompare(b.metierLibelle, "fr")
  );

  return {
    parMetier: liste,
    totalMissions: missions.length,
    totalJours: liste.reduce((t, m) => t + m.jours, 0),
    totalEntreprises: entreprises.size,
  };
}

/**
 * Phrase résumant l'expérience constatée sur un métier.
 *
 * Exprimée en missions et en jours, jamais convertie en années : une mission de
 * trois semaines n'est pas « 0,06 an », et arrondir donnerait une ancienneté fausse.
 */
export function resumeExperience(e: ExperienceMetier): string {
  const missions = `${e.missions} mission${e.missions > 1 ? "s" : ""}`;
  const jours = `${e.jours} jour${e.jours > 1 ? "s" : ""}`;
  const employeurs =
    e.entreprises.length > 1 ? `, pour ${e.entreprises.length} entreprises` : "";
  return `${missions} · ${jours} travaillés${employeurs}`;
}
