import { requis } from "./env.js";
import postgres from "postgres";

/**
 * Connexion PostgreSQL (Supabase).
 *
 * Utiliser impérativement l'URL du pooler Supavisor en mode transaction (port 6543),
 * pas le port 5432 : en serverless chaque invocation ouvre une connexion, et sans
 * pooler la base sature sous quelques dizaines de requêtes concurrentes.
 */
export function connexion(): postgres.Sql {
  const url = requis(
    "DATABASE_URL",
    "Copier .env.example vers .env et y mettre l'URL du pooler Supabase (port 6543, mode transaction)."
  );
  if (url.includes(":5432")) {
    process.stderr.write(
      "Attention : DATABASE_URL pointe sur le port 5432 (connexion directe). " +
      "En déploiement serverless, utiliser le pooler sur 6543.\n"
    );
  }
  return postgres(url, { max: 5, idle_timeout: 20, prepare: false });
}
