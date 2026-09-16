/**
 * Charge le .env de la racine du dépôt, quel que soit le dossier depuis lequel la
 * commande est lancée. Sans ça, `dotenv/config` chercherait un .env dans le cwd et
 * chaque package aurait besoin de sa propre copie des secrets.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racineDepot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: join(racineDepot, ".env") });

/** Lit une variable d'environnement obligatoire, avec un message utile si elle manque. */
export function requis(nom: string, indice: string): string {
  const valeur = process.env[nom];
  if (!valeur) throw new Error(`${nom} manquante. ${indice}`);
  return valeur;
}
