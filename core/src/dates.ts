import type { DateISO, Periode } from "./types.js";

const MS_PAR_JOUR = 86_400_000;

/**
 * Convertit une date civile ISO en millisecondes UTC.
 *
 * On passe par UTC explicitement : `new Date("2026-03-01")` puis une comparaison
 * locale décale d'un jour selon le fuseau, ce qui sur ce produit signifierait
 * accepter un profil dont la certification expire la veille de la fin de mission.
 */
export function enMsUTC(date: DateISO): number {
  const [a, m, j] = date.split("-").map(Number);
  if (a === undefined || m === undefined || j === undefined || Number.isNaN(a * m * j)) {
    throw new Error(`Date ISO invalide : "${date}" (attendu AAAA-MM-JJ)`);
  }
  return Date.UTC(a, m - 1, j);
}

/** Nombre de jours d'une période, bornes incluses. Une mission d'un jour vaut 1. */
export function nombreDeJours(periode: Periode): number {
  return (enMsUTC(periode.dateFin) - enMsUTC(periode.dateDebut)) / MS_PAR_JOUR + 1;
}

/**
 * Jours de chevauchement entre une période de référence et un ensemble de périodes.
 * Les périodes sont fusionnées avant comptage : deux disponibilités qui se recouvrent
 * ne doivent pas compter deux fois.
 */
export function joursDeChevauchement(reference: Periode, periodes: Periode[]): number {
  const bornes = periodes
    .map((p) => ({ debut: enMsUTC(p.dateDebut), fin: enMsUTC(p.dateFin) }))
    .filter((p) => p.fin >= p.debut)
    .sort((x, y) => x.debut - y.debut);

  const fusionnees: { debut: number; fin: number }[] = [];
  for (const p of bornes) {
    const derniere = fusionnees[fusionnees.length - 1];
    // Contiguës (fin la veille du début suivant) : on les colle, sinon un jour de
    // jointure serait perdu au comptage.
    if (derniere && p.debut <= derniere.fin + MS_PAR_JOUR) {
      derniere.fin = Math.max(derniere.fin, p.fin);
    } else {
      fusionnees.push({ ...p });
    }
  }

  const refDebut = enMsUTC(reference.dateDebut);
  const refFin = enMsUTC(reference.dateFin);
  let jours = 0;
  for (const p of fusionnees) {
    const debut = Math.max(p.debut, refDebut);
    const fin = Math.min(p.fin, refFin);
    if (fin >= debut) jours += (fin - debut) / MS_PAR_JOUR + 1;
  }
  return jours;
}
