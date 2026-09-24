import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Où le jeu de données publié est versionné : livrable du sujet. */
export const DOSSIER_PUBLIE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "donnees");

/**
 * Champs retirés des offres brutes avant publication.
 *
 * Une offre France Travail porte souvent le nom, le courriel ou le téléphone d'un
 * recruteur, et le courriel de l'agence qui la gère. Ces données sont utiles à qui
 * postule, inutiles à qui étudie le nettoyage, et n'ont pas à être republiées dans un
 * dépôt. Rien de ce qui sert au pipeline n'est retiré : les contacts n'y entrent pas.
 */
const CHAMPS_RETIRES = ["contact", "agence"] as const;

const COURRIEL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const TELEPHONE = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const MASQUE = "[coordonnée retirée]";

/** Masque les coordonnées glissées dans les textes libres, à toute profondeur. */
function masquer(valeur: unknown): unknown {
  if (typeof valeur === "string") return valeur.replace(COURRIEL, MASQUE).replace(TELEPHONE, MASQUE);
  if (Array.isArray(valeur)) return valeur.map(masquer);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, masquer(v)]));
  }
  return valeur;
}

export function anonymiser(offre: Record<string, unknown>): Record<string, unknown> {
  const copie = { ...offre };
  for (const champ of CHAMPS_RETIRES) delete copie[champ];
  return masquer(copie) as Record<string, unknown>;
}

export function publier(nom: string, contenu: unknown): string {
  mkdirSync(DOSSIER_PUBLIE, { recursive: true });
  const chemin = join(DOSSIER_PUBLIE, nom);
  writeFileSync(chemin, JSON.stringify(contenu, null, 2) + "\n", "utf-8");
  return chemin;
}

export const DESCRIPTION_RETRAITS =
  `Champs retirés de chaque offre : ${CHAMPS_RETIRES.join(", ")}. ` +
  `Courriels et numéros de téléphone présents dans les textes libres remplacés par « ${MASQUE} ».`;
