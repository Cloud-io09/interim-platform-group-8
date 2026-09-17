import type { NextConfig } from "next";

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
      `script-src 'self' 'unsafe-inline'${sourcesVercel}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${sourcesVercel}`,
      "font-src 'self'",
      `connect-src 'self'${sourcesVercel}${enPrevisualisation ? " wss://ws-us3.pusher.com" : ""}`,
      "form-action 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      `frame-src 'self'${sourcesVercel}`,
      "object-src 'none'",
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
  serverExternalPackages: ["postgres", "tesseract.js", "unpdf"],

  // Le modèle de langue vit dans public/, que Next ne trace pas dans le bundle des
  // fonctions : sans cette inclusion explicite, l'OCR échouerait en production sur
  // un fichier introuvable — alors qu'il fonctionne en local.
  outputFileTracingIncludes: {
    "/api/cv": [
      "./public/ocr/**",
      // tesseract.js lance un `worker_threads` qui charge son cœur WASM depuis
      // node_modules. Déclarer le paquet « externe » suffit à ne pas le bundler,
      // mais pas à l'embarquer : sans ces deux lignes, le worker attend un fichier
      // absent et la fonction expire — un 504 sans le moindre message.
      "../node_modules/tesseract.js/**",
      "../node_modules/tesseract.js-core/**",
    ],
  },

  // Masque la version du framework : une information gratuite pour un attaquant.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:chemin*", headers: enTetesSecurite }];
  },
};

export default nextConfig;
