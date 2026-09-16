import { describe, expect, it } from "vitest";
import { BASE } from "./serveur";

/** Récupère une page et rend son HTML. */
async function page(chemin: string) {
  const r = await fetch(`${BASE}${chemin}`);
  return { statut: r.status, html: await r.text(), entetes: r.headers };
}

const titres = (html: string, niveau: 1 | 2 | 3) =>
  [...html.matchAll(new RegExp(`<h${niveau}[^>]*>(.*?)</h${niveau}>`, "gs"))].map((m) =>
    m[1]!.replace(/<[^>]+>/g, "").trim()
  );

const PUBLIQUES = ["/", "/mentions-legales", "/confidentialite", "/accessibilite"];

describe("SEO on-page", () => {
  it("sert chaque page publique", async () => {
    for (const chemin of PUBLIQUES) {
      expect((await page(chemin)).statut, chemin).toBe(200);
    }
  });

  it("n'a qu'un seul h1 par page", async () => {
    for (const chemin of PUBLIQUES) {
      const { html } = await page(chemin);
      expect(titres(html, 1), chemin).toHaveLength(1);
    }
  });

  it("déclare une meta description et un titre propres à chaque page", async () => {
    const vus = new Set<string>();
    for (const chemin of PUBLIQUES) {
      const { html } = await page(chemin);
      const titre = /<title>(.*?)<\/title>/s.exec(html)?.[1] ?? "";
      const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";
      expect(titre.length, `titre de ${chemin}`).toBeGreaterThan(10);
      expect(description.length, `description de ${chemin}`).toBeGreaterThan(30);
      // Deux pages ne doivent pas partager le même titre : c'est un doublon aux
      // yeux d'un moteur, et une navigation illisible par onglets.
      expect(vus.has(titre), `titre dupliqué sur ${chemin}`).toBe(false);
      vus.add(titre);
    }
  });

  it("déclare la langue du document", async () => {
    const { html } = await page("/");
    expect(/<html[^>]*lang="fr"/.test(html)).toBe(true);
  });

  it("n'indexe pas les pages de compte", async () => {
    for (const chemin of ["/connexion", "/inscription/entreprise", "/inscription/interimaire"]) {
      const { html } = await page(chemin);
      expect(/<meta name="robots" content="noindex/.test(html), chemin).toBe(true);
    }
  });

  it("publie un sitemap qui ne référence que les pages publiques", async () => {
    const { statut, html } = await page("/sitemap.xml");
    expect(statut).toBe(200);
    for (const chemin of PUBLIQUES) {
      expect(html, chemin).toContain(chemin === "/" ? "</loc>" : chemin);
    }
    for (const prive of ["/profil/", "/missions", "/connexion"]) {
      expect(html, prive).not.toContain(prive);
    }
  });

  it("interdit aux robots l'API et les espaces connectés", async () => {
    const { html } = await page("/robots.txt");
    for (const interdit of ["/api/", "/espace", "/mes-missions", "/connexion"]) {
      expect(html, interdit).toContain(`Disallow: ${interdit}`);
    }
    expect(html).toContain("Sitemap:");
  });
});

describe("structure accessible", () => {
  it("expose un lien d'évitement et une hiérarchie de titres continue", async () => {
    for (const chemin of PUBLIQUES) {
      const { html } = await page(chemin);
      expect(html, chemin).toContain("Aller au contenu principal");
      // Pas de h3 sans h2 au-dessus : la hiérarchie ne doit pas sauter de niveau.
      if (titres(html, 3).length > 0) {
        expect(titres(html, 2).length, `${chemin} a des h3 sans h2`).toBeGreaterThan(0);
      }
    }
  });

  it("nomme les repères de navigation", async () => {
    const { html } = await page("/");
    expect(html).toContain('aria-label="Navigation principale"');
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
  });

  it("ne laisse aucune image sans alternative textuelle", async () => {
    for (const chemin of PUBLIQUES) {
      const { html } = await page(chemin);
      const sansAlt = [...html.matchAll(/<img(?![^>]*\balt=)[^>]*>/g)];
      expect(sansAlt, chemin).toHaveLength(0);
    }
  });

  it("associe chaque champ de formulaire à une étiquette", async () => {
    const { html } = await page("/connexion");
    const champs = [...html.matchAll(/<input[^>]*id="([^"]+)"[^>]*>/g)].map((m) => m[1]!);
    expect(champs.length).toBeGreaterThan(0);
    for (const id of champs) {
      expect(html.includes(`for="${id}"`), `champ ${id} sans étiquette`).toBe(true);
    }
  });
});

describe("en-têtes de sécurité", () => {
  it("pose les en-têtes qui ne sont pas fournis par défaut", async () => {
    const { entetes } = await page("/");
    expect(entetes.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(entetes.get("x-frame-options")).toBe("DENY");
    expect(entetes.get("x-content-type-options")).toBe("nosniff");
    expect(entetes.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    // La version du framework est une information gratuite pour un attaquant.
    expect(entetes.get("x-powered-by")).toBeNull();
  });
});

describe("aiguillage de la page d'accueil", () => {
  it("sert la page de présentation à un visiteur anonyme", async () => {
    const r = await fetch(`${BASE}/`, { redirect: "manual" });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("L&#x27;intérim du BTP");
  });

  it("renvoie un utilisateur connecté vers son espace", async () => {
    // Un connecté n'a rien à faire sur la page de présentation. La redirection est
    // faite en middleware pour que « / » reste prérendue, donc indexable.
    const inscription = await fetch(`${BASE}/api/auth/inscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `accueil-${Date.now()}@exemple.test`,
        motDePasse: "chantier-de-reims-2026",
        role: "entreprise",
      }),
    });
    const cookie = inscription.headers.get("set-cookie")?.split(";")[0] ?? "";

    const r = await fetch(`${BASE}/`, { headers: { cookie }, redirect: "manual" });
    expect([307, 302]).toContain(r.status);
    expect(r.headers.get("location")).toContain("/espace");
  });

  it("exclut le nouvel espace privé des robots", async () => {
    const texte = await (await fetch(`${BASE}/robots.txt`)).text();
    expect(texte).toContain("Disallow: /espace");
    // L'ancienne route n'existe plus : la laisser serait une consigne morte.
    expect(texte).not.toContain("/profil/");
  });
});
