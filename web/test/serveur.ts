import { spawn, type ChildProcess } from "node:child_process";

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

export async function teardown(): Promise<void> {
  serveur?.kill("SIGTERM");
  serveur = null;
}
