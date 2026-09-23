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

  // Relais Discord : même raisonnement que pour le courriel.
  //
  // Quatre variables, et chacune manque pour une raison différente : sans les deux
  // premières le bouton de rattachement n'a nulle part où envoyer, sans les deux
  // autres le salon ne peut pas être créé. Les nommer séparément évite de chercher
  // laquelle des quatre a été oubliée.
  const attenduesDiscord = [
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_BOT_TOKEN",
    "DISCORD_SERVEUR_ID",
  ] as const;
  const manquantesDiscord = attenduesDiscord.filter((v) => !process.env[v]?.trim());

  // Présente ne veut pas dire juste.
  //
  // La sonde se contentait d'afficher l'identifiant du serveur. Une valeur erronée —
  // l'identifiant d'un salon au lieu de celui du serveur, ce que produit un clic
  // droit au mauvais endroit — passait donc pour une configuration correcte, et
  // n'échouait qu'au moment du rattachement, chez l'utilisateur, avec un « Unknown
  // Guild » qui n'apparaît que dans les journaux. On demande donc à Discord.
  const discord = await (async () => {
    if (manquantesDiscord.length > 0) {
      return {
        ok: false,
        latenceMs: 0,
        detail:
          `environnement « ${environnement} » : ${manquantesDiscord.join(", ")} ${
            manquantesDiscord.length > 1 ? "manquent" : "manque"
          }. Le rattachement est masqué dans l'interface ; les notifications restent ` +
          `visibles dans l'application.`,
      };
    }

    const serveurId = process.env.DISCORD_SERVEUR_ID!.trim();
    const debut = Date.now();
    try {
      const reponse = await fetch(`https://discord.com/api/v10/guilds/${serveurId}`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN!.trim()}` },
        signal: AbortSignal.timeout(5000),
      });
      const latenceMs = Date.now() - debut;

      if (reponse.status === 404) {
        return {
          ok: false,
          latenceMs,
          detail:
            `DISCORD_SERVEUR_ID = ${serveurId} — Discord ne connaît pas ce serveur, ` +
            `ou le bot n'y est pas. Un identifiant de salon est souvent copié à sa ` +
            `place : reprenez-le par clic droit sur l'icône du serveur.`,
        };
      }
      if (reponse.status === 401) {
        return { ok: false, latenceMs, detail: "DISCORD_BOT_TOKEN refusé par Discord." };
      }
      if (!reponse.ok) {
        return { ok: false, latenceMs, detail: `Discord a répondu ${reponse.status}.` };
      }

      const serveur = (await reponse.json()) as { name?: string };
      return {
        ok: true,
        latenceMs,
        detail: `relais configuré (${environnement}), serveur « ${serveur.name} »`,
      };
    } catch (erreur) {
      // Discord injoignable n'est pas une erreur de configuration : on le dit tel quel.
      return {
        ok: false,
        latenceMs: Date.now() - debut,
        detail: `Discord injoignable : ${erreur instanceof Error ? erreur.message : "erreur inconnue"}`,
      };
    }
  })();

  // Rien à sonder pour la lecture des CV : elle s'exécute dans le navigateur, à
  // partir de fichiers statiques. Une sonde côté serveur ne dirait rien de ce que
  // l'utilisateur obtient réellement — et le navigateur, lui, signale son échec.
  // Ni le courriel ni Discord n'empêchent le produit de fonctionner : leur absence se
  // lit dans le détail, elle ne fait pas échouer la sonde.
  const ok = postgres.ok && cache.ok;
  return Response.json(
    { ok, verifieLe: new Date().toISOString(), services: { postgres, cache, courriel, discord } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
