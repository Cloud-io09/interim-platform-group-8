import type { MetadataRoute } from "next";

const SITE = "https://interim-platform-group-8-web.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Les espaces connectés et l'API n'ont aucune valeur d'indexation, et les
      // exposer renseignerait gratuitement sur la structure de l'application.
      disallow: [
        "/api/",
        "/espace",
        "/missions",
        "/mes-missions",
        "/connexion",
        "/inscription/",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
