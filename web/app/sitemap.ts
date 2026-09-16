import type { MetadataRoute } from "next";

const SITE = "https://interim-platform-group-8-web.vercel.app";

/**
 * Sitemap minimal.
 *
 * Seules les pages publiques y figurent. Les écrans de compte et les espaces
 * connectés sont marqués `noindex` et n'ont rien à faire ici : les référencer
 * exposerait la structure de l'application sans aucun bénéfice.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();
  return [
    { url: `${SITE}/`, lastModified: maintenant, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/mentions-legales`, lastModified: maintenant, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/confidentialite`, lastModified: maintenant, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/accessibilite`, lastModified: maintenant, changeFrequency: "yearly", priority: 0.3 },
  ];
}
