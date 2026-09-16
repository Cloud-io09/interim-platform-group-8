import { connexion } from "@interimatch/core/db";
import { redis } from "@interimatch/core";

/**
 * Sonde de santé. Son rôle n'est pas décoratif : elle vérifie que la chaîne
 * complète — fonction serverless → pooler Supabase → Upstash — répond réellement
 * depuis l'hébergement, et pas seulement depuis un poste de développement.
 */
export const dynamic = "force-dynamic";

interface EtatService {
  ok: boolean;
  latenceMs: number;
  detail?: string;
}

async function mesurer(fn: () => Promise<string>): Promise<EtatService> {
  const debut = Date.now();
  try {
    const detail = await fn();
    return { ok: true, latenceMs: Date.now() - debut, detail };
  } catch (erreur) {
    return {
      ok: false,
      latenceMs: Date.now() - debut,
      detail: erreur instanceof Error ? erreur.message : "erreur inconnue",
    };
  }
}

export async function GET() {
  const postgres = await mesurer(async () => {
    const sql = connexion();
    try {
      const [r] = await sql<{ metiers: number; types: number }[]>`
        select
          (select count(*)::int from metier where actif) as metiers,
          (select count(*)::int from type_certification) as types`;
      return `${r?.metiers} métiers actifs, ${r?.types} types de certification`;
    } finally {
      await sql.end();
    }
  });

  const cache = await mesurer(async () => {
    const pong = await redis().ping();
    return String(pong);
  });

  const ok = postgres.ok && cache.ok;
  return Response.json(
    { ok, verifieLe: new Date().toISOString(), services: { postgres, cache } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
