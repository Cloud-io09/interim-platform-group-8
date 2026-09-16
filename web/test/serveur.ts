import { spawn, type ChildProcess } from "node:child_process";
import { connexion } from "@interimatch/core/db";
import { redis } from "@interimatch/core";

/**
 * Démarre l'application construite avant la suite fonctionnelle, l'arrête après.
 *
 * On teste le vrai serveur par HTTP plutôt que d'appeler les gestionnaires de route
 * en direct : `cookies()` et `headers()` n'existent que dans un contexte de requête,
 * et ce sont précisément les cookies et la limitation par IP qu'on veut éprouver.
 */
let serveur: ChildProcess | null = null;

export const PORT = Number(process.env.PORT_TEST ?? 3199);
export const BASE = `http://127.0.0.1:${PORT}`;

async function attendre(url: string, essaisMax = 60): Promise<void> {
  for (let i = 0; i < essaisMax; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.status < 500) return;
    } catch {
      /* le serveur n'écoute pas encore */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Le serveur n'a pas répondu sur ${url} après ${essaisMax / 2}s`);
}

export async function setup(): Promise<void> {
  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "ignore",
    env: { ...process.env, NODE_ENV: "production" },
  });
  await attendre(`${BASE}/api/sante`);
}

/**
 * Supprime les sessions dont le compte n'existe plus.
 *
 * Chaque test qui s'authentifie ouvre un jeton valide sept jours. Sans ce ménage,
 * une suite exécutée plusieurs fois par jour laisse des centaines de sessions
 * derrière elle : elles consomment le quota Redis du projet et faussent tout
 * diagnostic ultérieur.
 */
async function purgerSessionsOrphelines(): Promise<void> {
  const cache = redis();
  const sql = connexion();
  try {
    const comptes = await sql<{ email: string }[]>`select email from compte`;
    const vivants = new Set(comptes.map((c) => c.email));

    const orphelines: string[] = [];
    let curseur = "0";
    do {
      const [suivant, lot] = await cache.scan(curseur, { match: "sess:*", count: 300 });
      curseur = String(suivant);
      for (const k of lot as string[]) {
        const brut = await cache.get(k);
        const session = typeof brut === "string" ? JSON.parse(brut) : (brut as { email?: string } | null);
        if (!session?.email || !vivants.has(session.email)) orphelines.push(k);
      }
    } while (curseur !== "0");

    for (let i = 0; i < orphelines.length; i += 100) {
      await cache.del(...orphelines.slice(i, i + 100));
    }
    if (orphelines.length > 0) {
      process.stderr.write(`\n${orphelines.length} session(s) de test purgée(s).\n`);
    }
  } catch {
    // Le ménage ne doit jamais faire échouer une suite qui vient de passer.
  } finally {
    await sql.end();
  }
}

export async function teardown(): Promise<void> {
  serveur?.kill("SIGTERM");
  serveur = null;
  await purgerSessionsOrphelines();
}
