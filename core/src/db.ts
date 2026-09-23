import { requis } from "./env";
import postgres from "postgres";

/**
 * Connexion PostgreSQL (Supabase).
 *
 * Utiliser impérativement l'URL du pooler Supavisor en mode transaction (port 6543),
 * pas le port 5432 : en serverless chaque invocation ouvre une connexion, et sans
 * pooler la base sature sous quelques dizaines de requêtes concurrentes.
 */
/**
 * Client partagé pour la durée du processus.
 *
 * **Chaque appel ouvrait auparavant son propre client, aussitôt refermé par la route
 * appelante.** Une poignée de main TCP puis TLS vers Supabase à chaque requête HTTP :
 * mesuré à **115 ms par requête, contre 14 ms sur une connexion réutilisée** — huit
 * fois plus lent, pour un travail identique. Le coût se payait deux fois : en latence
 * pour l'utilisateur, et en connexions ouvertes côté base.
 *
 * Le pool de cinq connexions est celui que le pooler Supavisor attend en mode
 * transaction ; le réutiliser est le motif recommandé, pas une optimisation hasardeuse.
 */
let partagee: postgres.Sql | null = null;

/**
 * Ferme réellement le client partagé.
 *
 * Réservée à ce qui doit rendre la main : un script en ligne de commande, une
 * migration, le démontage d'une suite de tests. Une route web n'a pas à l'appeler —
 * le processus qui la sert vit bien plus longtemps qu'elle.
 */
export async function fermerConnexion(): Promise<void> {
  const client = partagee;
  partagee = null;
  if (client) await (client as postgres.Sql & { fermerVraiment(): Promise<void> }).fermerVraiment();
}

export function connexion(): postgres.Sql {
  if (partagee) return partagee;

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
  const client = postgres(url, {
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

  // **`end()` devient sans effet, délibérément.** Une cinquantaine de routes
  // l'appellent dans leur `finally`, ce qui était juste quand chacune avait son
  // client. Fermer le client partagé à la première route servie couperait toutes les
  // suivantes. Plutôt que de retirer l'appel à cinquante endroits — et de compter
  // sur la vigilance pour qu'il ne revienne pas — on le rend inoffensif ici, à
  // l'endroit unique qui connaît la nature partagée du client.
  const fermerVraiment = client.end.bind(client);
  Object.assign(client, {
    fermerVraiment,
    end: async () => {},
  });

  partagee = client;
  return partagee;
}
