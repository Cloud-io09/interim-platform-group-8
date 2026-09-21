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

  // Acheminement du courriel : configuré ou non.
  //
  // Sans prestataire, la réinitialisation répond 200 sans rien envoyer — le repli
  // écrit au journal du serveur. Vu de l'extérieur, une production mal configurée
  // est donc indiscernable d'une production qui marche.
  //
  // La sonde nomme **chaque variable manquante** et **l'environnement Vercel**
  // courant. Une variable cochée pour « Production » seule laisse la préversion sans
  // rien : c'est l'erreur la plus fréquente, et sans cette ligne il faut deviner.
  const attendues = ["BREVO_API_KEY", "COURRIEL_EXPEDITEUR"] as const;
  const manquantes = attendues.filter((v) => !process.env[v]?.trim());
  const environnement = process.env.VERCEL_ENV ?? "local";

  const courriel = {
    ok: manquantes.length === 0,
    latenceMs: 0,
    detail:
      manquantes.length === 0
        ? `prestataire configuré (${environnement}), expéditeur ${process.env.COURRIEL_EXPEDITEUR}`
        : `environnement « ${environnement} » : ${manquantes.join(" et ")} ${
            manquantes.length > 1 ? "manquent" : "manque"
          }. Les courriels partent au journal, donc nulle part. ` +
          `Vérifier que la variable est cochée pour cet environnement, puis redéployer.`,
  };

  // Rien à sonder pour la lecture des CV : elle s'exécute dans le navigateur, à
  // partir de fichiers statiques. Une sonde côté serveur ne dirait rien de ce que
  // l'utilisateur obtient réellement — et le navigateur, lui, signale son échec.
  // Le courriel n'empêche pas le produit de fonctionner : son absence se lit dans le
  // détail, elle ne fait pas échouer la sonde.
  const ok = postgres.ok && cache.ok;
  return Response.json(
    { ok, verifieLe: new Date().toISOString(), services: { postgres, cache, courriel } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
