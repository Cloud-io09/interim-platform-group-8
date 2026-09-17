import type { NextConfig } from "next";

/**
 * En-têtes de sécurité.
 *
 * Vercel ne pose que HSTS ; tout le reste est à déclarer. Chaque ligne répond à une
 * attaque précise, pas à une case à cocher.
 */
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
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
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
    "/api/cv": ["./public/ocr/**"],
  },

  // Masque la version du framework : une information gratuite pour un attaquant.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:chemin*", headers: enTetesSecurite }];
  },
};

export default nextConfig;
