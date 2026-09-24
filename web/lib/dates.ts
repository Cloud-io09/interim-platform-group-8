import type { DateISO } from "@interimatch/core";

/**
 * La date du jour en France, au format `AAAA-MM-JJ`.
 *
 * Le serveur tourne en UTC : entre minuit et deux heures, heure de Paris, « aujourd'hui »
 * y vaut encore hier. Une fiche saisie à 0 h 30 pour le jour même serait refusée comme
 * passée. Le produit est français, la date qui compte est celle de Paris.
 */
export function aujourdhuiParis(): DateISO {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) as DateISO;
}
