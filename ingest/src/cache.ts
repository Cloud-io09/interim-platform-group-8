import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Cache disque entre `fetch` et `clean`.
 *
 * L'API est limitée en débit et une collecte complète prend plusieurs minutes.
 * En séparant collecte et nettoyage, corriger un parseur ne coûte plus un nouvel
 * appel réseau : `clean` se rejoue hors ligne, en une seconde, sur les mêmes données.
 * C'est aussi ce qui rend le nettoyage démontrable — on montre l'avant et l'après
 * sur un jeu identique.
 */
const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache");

export const CHEMIN_BRUT = join(DOSSIER, "offres-brutes.json");
export const CHEMIN_NETTOYE = join(DOSSIER, "offres-nettoyees.json");

export function ecrire(chemin: string, donnees: unknown): void {
  mkdirSync(DOSSIER, { recursive: true });
  writeFileSync(chemin, JSON.stringify(donnees, null, 2), "utf-8");
}

export function lire<T>(chemin: string, commandeManquante: string): T {
  if (!existsSync(chemin)) {
    throw new Error(`Fichier absent : ${chemin}\nLancez d'abord : ${commandeManquante}`);
  }
  return JSON.parse(readFileSync(chemin, "utf-8")) as T;
}
