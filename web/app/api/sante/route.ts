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

/**
 * Disponibilité de la reconnaissance de caractères.
 *
 * Les fichiers de Tesseract vivent dans le `node_modules` de la racine du monorepo,
 * hors du dossier déployé : leur présence à l'exécution ne se déduit pas d'un build
 * réussi en local. On la constate, plutôt que de la supposer — c'est la différence
 * entre corriger un défaut et espérer l'avoir corrigé.
 */
async function verifierOcr(): Promise<EtatService> {
  const debut = Date.now();
  const details: string[] = [];
  try {
    const { existsSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");

    const modele = join(process.cwd(), "public", "ocr", "fra.traineddata.gz");
    details.push(`modèle ${existsSync(modele) ? "présent" : "ABSENT"}`);

    // Recherche sur le disque plutôt que `require.resolve` : les bundlers
    // réécrivent cet appel en identifiant de module, et on n'obtient pas un chemin.
    // Ici on constate ce qui existe vraiment dans la fonction déployée.
    const trouverPaquet = (nom: string): string | null => {
      let dossier = process.cwd();
      for (let i = 0; i < 6; i++) {
        const candidat = join(dossier, "node_modules", nom);
        if (existsSync(candidat)) return candidat;
        const parent = dirname(dossier);
        if (parent === dossier) break;
        dossier = parent;
      }
      return null;
    };

    const paquet = trouverPaquet("tesseract.js");
    details.push(`tesseract.js ${paquet ? "présent" : "ABSENT"}`);

    const coeur = trouverPaquet("tesseract.js-core");
    if (!coeur) {
      details.push("cœur WASM ABSENT");
    } else {
      const nom = ["tesseract-core", "simd", "lstm"].join("-") + ".wasm";
      details.push(`cœur WASM ${existsSync(join(coeur, nom)) ? "présent" : "ABSENT"}`);
    }

    return {
      ok: details.every((d) => !d.includes("ABSENT")),
      latenceMs: Date.now() - debut,
      detail: details.join(" · "),
    };
  } catch (erreur) {
    return {
      ok: false,
      latenceMs: Date.now() - debut,
      detail: `${details.join(" · ")} · ${erreur instanceof Error ? erreur.message : "erreur inconnue"}`,
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

  const ocr = await verifierOcr();

  // L'OCR n'est pas vital : son indisponibilité n'invalide pas le déploiement, elle
  // se voit dans le détail.
  const ok = postgres.ok && cache.ok;
  return Response.json(
    { ok, verifieLe: new Date().toISOString(), services: { postgres, cache, ocr } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
