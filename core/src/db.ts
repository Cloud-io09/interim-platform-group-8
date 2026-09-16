import { requis } from "./env";
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
  // On n'alerte que sur la connexion DIRECTE (db.<ref>.supabase.co) : le pooler en
  // mode session écoute lui aussi sur 5432 et reste un choix valable pour les migrations.
  if (/@db\.[a-z0-9]+\.supabase\.co/.test(url)) {
    process.stderr.write(
      "Attention : DATABASE_URL utilise la connexion directe Supabase (IPv6 uniquement, " +
      "sans pooling). En serverless, utiliser le pooler : aws-0-<region>.pooler.supabase.com:6543\n"
    );
  }
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    // Le pooler en mode transaction ne supporte pas les requêtes préparées.
    prepare: false,
    // Les NOTICE (« already exists, skipping ») ne sont pas des erreurs : on ne
    // remonte que ce qui mérite l'attention.
    onnotice: (avis) => {
      if (avis.severity !== "NOTICE") process.stderr.write(`${avis.severity}: ${avis.message}\n`);
    },
  });
}
