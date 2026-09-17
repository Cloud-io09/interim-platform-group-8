import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * Racine du monorepo.
 *
 * npm workspaces hisse les dépendances au-dessus de `web/`. Sans cette indication,
 * Next trace les fichiers relativement à `web/`, ne trouve pas ce qui vit plus haut,
 * et signale plusieurs verrous de dépendances concurrents.
 */
const racineMonorepo = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * En-têtes de sécurité.
 *
 * Vercel ne pose que HSTS ; tout le reste est à déclarer. Chaque ligne répond à une
 * attaque précise, pas à une case à cocher.
 */
/**
 * Vercel injecte sa barre de retour d'expérience sur les déploiements de
 * prévisualisation. On l'autorise là, et nulle part ailleurs : en production, la
 * politique reste stricte.
 */
const enPrevisualisation = process.env.VERCEL_ENV === "preview";
const sourcesVercel = enPrevisualisation ? " https://vercel.live" : "";

const enTetesSecurite = [
  // Empêche l'inclusion du site dans une iframe tierce — parade au clickjacking,
  // qui ferait cliquer un utilisateur connecté sur un bouton qu'il ne voit pas.
  { key: "X-Frame-Options", value: "DENY" },

  // Interdit au navigateur de deviner un type MIME : un fichier téléversé plus tard
  // ne pourra pas être réinterprété comme du script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Ne transmet pas l'URL complète aux sites tiers — les URL de mission peuvent
  // porter des identifiants.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Le produit n'a besoin d'aucune de ces API : autant les refuser explicitement.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },

  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next injecte les données d'hydratation en ligne : 'unsafe-inline' est
      // nécessaire tant qu'on n'a pas de nonce par requête via middleware.
      // `wasm-unsafe-eval` : la reconnaissance de caractères s'exécute en WebAssembly
      // dans le navigateur. C'est le prix de ne pas envoyer le document à un serveur.
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${sourcesVercel}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${sourcesVercel}`,
      "font-src 'self'",
      `connect-src 'self'${sourcesVercel}${enPrevisualisation ? " wss://ws-us3.pusher.com" : ""}`,
      "form-action 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      `frame-src 'self'${sourcesVercel}`,
      "object-src 'none'",
      // Les workers de pdf.js et de Tesseract sont servis depuis nos fichiers ;
      // Tesseract en instancie certains via une URL blob.
      "worker-src 'self' blob:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // @interimatch/core est publié en TypeScript source, sans étape de build :
  // Next doit le transpiler comme le reste de l'application.
  transpilePackages: ["@interimatch/core"],

  // RGESN — réduction du poids transféré.
  compress: true,
  images: { formats: ["image/avif", "image/webp"] },

  // Le pilote PostgreSQL ne doit pas être embarqué dans le bundle client.
  serverExternalPackages: ["postgres"],

  outputFileTracingRoot: racineMonorepo,

  // Masque la version du framework : une information gratuite pour un attaquant.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:chemin*", headers: enTetesSecurite }];
  },
};

export default nextConfig;
