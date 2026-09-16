import { Redis } from "@upstash/redis";
import { requis } from "./env.js";

/**
 * Client Redis (Upstash).
 *
 * Client HTTP et non TCP : en serverless, une connexion TCP ouverte par invocation
 * ne se recycle pas et sature vite le nombre de connexions autorisées.
 *
 * Quatre usages, tous complémentaires de PostgreSQL et jamais redondants avec lui :
 * sessions, limitation des tentatives de connexion, cache de matching, traces de calcul.
 */
let client: Redis | null = null;

export function redis(): Redis {
  if (client) return client;
  client = new Redis({
    url: requis("UPSTASH_REDIS_REST_URL", "Upstash > votre base > bloc REST API."),
    token: requis("UPSTASH_REDIS_REST_TOKEN", "Upstash > votre base > bloc REST API."),
  });
  return client;
}

// ---------------------------------------------------------------------------
// Conventions de nommage des clés
// ---------------------------------------------------------------------------

export const cle = {
  session: (jeton: string) => `sess:${jeton}`,
  tentativesIp: (ip: string) => `rl:ip:${ip}`,
  tentativesEmail: (email: string) => `rl:email:${email.toLowerCase()}`,
  cacheMatching: (missionId: number) => `match:cache:${missionId}`,
  traceMatching: (missionId: number) => `match:trace:${missionId}`,
} as const;

/** Durées de vie, en secondes. Regroupées pour qu'aucune ne traîne en dur. */
export const TTL = {
  /** Session : 7 jours, prolongée à chaque requête authentifiée. */
  session: 7 * 24 * 3600,
  /** Fenêtre de comptage des tentatives de connexion. */
  tentatives: 15 * 60,
  /** Cache de matching : court, et invalidé explicitement à toute modification. */
  cacheMatching: 15 * 60,
  /** Trace de calcul : le but est d'expliquer un résultat, pas d'archiver. */
  traceMatching: 3600,
} as const;

/** Seuil au-delà duquel les tentatives de connexion sont bloquées sur la fenêtre. */
export const MAX_TENTATIVES = 10;

// ---------------------------------------------------------------------------
// Limitation des tentatives de connexion
// ---------------------------------------------------------------------------

/** Sous-ensemble de Redis utilisé par le compteur — permet d'injecter un faux en test. */
export interface CompteurRedis {
  incr(cle: string): Promise<number>;
  expire(cle: string, secondes: number): Promise<unknown>;
  ttl(cle: string): Promise<number>;
}

export interface EtatLimitation {
  bloque: boolean;
  tentatives: number;
  /** Secondes restantes avant remise à zéro du compteur. */
  resteSecondes: number;
}

/**
 * Incrémente un compteur à expiration et dit s'il faut bloquer.
 *
 * Le TTL n'est posé qu'à la première incrémentation : le reposer à chaque tentative
 * ferait glisser la fenêtre indéfiniment et un attaquant persistant ne serait
 * jamais débloqué, ce qui transforme la protection en déni de service sur le compte.
 */
export async function compterTentative(
  cleCompteur: string,
  client: CompteurRedis = redis()
): Promise<EtatLimitation> {
  const r = client;
  const tentatives = await r.incr(cleCompteur);
  if (tentatives === 1) {
    await r.expire(cleCompteur, TTL.tentatives);
  }
  const resteSecondes = await r.ttl(cleCompteur);
  return {
    bloque: tentatives > MAX_TENTATIVES,
    tentatives,
    resteSecondes: resteSecondes > 0 ? resteSecondes : TTL.tentatives,
  };
}

/** Remet le compteur à zéro — appelé après une connexion réussie. */
export async function oublierTentatives(
  cles: string[],
  client: { del(...cles: string[]): Promise<unknown> } = redis()
): Promise<void> {
  if (cles.length > 0) await client.del(...cles);
}
