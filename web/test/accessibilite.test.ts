import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { BASE } from "./serveur";

/**
 * Audit RGAA mécanique.
 *
 * Ce qui se vérifie sur le HTML rendu est vérifié ici, et le reste devient un test
 * qui protège durablement. Ce qui ne se vérifie pas ainsi — la cohérence de l'ordre
 * de tabulation perçu, la restitution réelle par un lecteur d'écran, le contraste
 * d'un texte sur une image — reste à faire à la main, et la déclaration
 * d'accessibilité le dit.
 */

const MARQUE = `a11y-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";
let cookieInterimaire = "";
let cookieEntreprise = "";

async function inscrire(suffixe: string, role: "entreprise" | "interimaire") {
  const r = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${MARQUE}-${suffixe}@exemple.test`, motDePasse: MOT_DE_PASSE, role }),
  });
  return r.headers.get("set-cookie")?.split(";")[0] ?? "";
}

beforeAll(async () => {
  cookieInterimaire = await inscrire("int", "interimaire");
  cookieEntreprise = await inscrire("ent", "entreprise");
});

afterAll(async () => {
  const sql = connexion();
  try {
    await sql`delete from compte where email like ${`${MARQUE}-%`}`;
  } finally {
    await sql.end();
  }
});

interface Page {
  chemin: string;
  cookie?: () => string;
}

const PAGES: Page[] = [
  { chemin: "/" },
  { chemin: "/connexion" },
  { chemin: "/inscription/entreprise" },
  { chemin: "/inscription/interimaire" },
  { chemin: "/mentions-legales" },
  { chemin: "/confidentialite" },
  { chemin: "/accessibilite" },
  // Deux écrans atteints depuis une boîte aux lettres, souvent sur un téléphone :
  // ils méritent le même audit que les pages entrantes.
  { chemin: "/mot-de-passe-oublie" },
  { chemin: "/verification" },
  { chemin: "/espace/interimaire", cookie: () => cookieInterimaire },
  { chemin: "/espace/interimaire/profil", cookie: () => cookieInterimaire },
  { chemin: "/espace/interimaire/certifications", cookie: () => cookieInterimaire },
  { chemin: "/espace/interimaire/disponibilites", cookie: () => cookieInterimaire },
  { chemin: "/espace/interimaire/cv", cookie: () => cookieInterimaire },
  { chemin: "/mes-missions", cookie: () => cookieInterimaire },
  { chemin: "/espace/entreprise", cookie: () => cookieEntreprise },
  { chemin: "/espace/entreprise/profil", cookie: () => cookieEntreprise },
  { chemin: "/missions", cookie: () => cookieEntreprise },
  { chemin: "/missions/nouvelle", cookie: () => cookieEntreprise },
];

async function html(page: Page): Promise<string> {
  const r = await fetch(`${BASE}${page.chemin}`, {
    headers: page.cookie ? { cookie: page.cookie() } : {},
  });
  expect(r.status, page.chemin).toBe(200);
  return r.text();
}

const titres = (h: string, n: 1 | 2 | 3 | 4) =>
  [...h.matchAll(new RegExp(`<h${n}[^>]*>`, "g"))].length;

describe("structure du document — RGAA 8 et 9", () => {
  it("déclare la langue sur chaque page", async () => {
    for (const p of PAGES) {
      expect(/<html[^>]*lang="fr"/.test(await html(p)), p.chemin).toBe(true);
    }
  });

  it("n'a qu'un seul h1 par page", async () => {
    for (const p of PAGES) {
      expect(titres(await html(p), 1), p.chemin).toBe(1);
    }
  });

  it("ne saute jamais un niveau de titre", async () => {
    for (const p of PAGES) {
      const h = await html(p);
      // Un h3 sans h2, ou un h4 sans h3, casse la navigation par titres.
      if (titres(h, 3) > 0) expect(titres(h, 2), `${p.chemin} : h3 sans h2`).toBeGreaterThan(0);
      if (titres(h, 4) > 0) expect(titres(h, 3), `${p.chemin} : h4 sans h3`).toBeGreaterThan(0);
    }
  });

  it("expose les repères de navigation attendus", async () => {
    for (const p of PAGES) {
      const h = await html(p);
      expect(h, `${p.chemin} : <main>`).toContain("<main");
      expect(h, `${p.chemin} : <header>`).toContain("<header");
      expect(h, `${p.chemin} : <footer>`).toContain("<footer");
      expect(h, `${p.chemin} : nav nommée`).toContain('aria-label="Navigation principale"');
    }
  });

  it("propose un lien d'évitement vers le contenu principal", async () => {
    for (const p of PAGES) {
      const h = await html(p);
      expect(h, p.chemin).toContain("Aller au contenu principal");
      expect(h, `${p.chemin} : cible du lien`).toContain('id="contenu"');
    }
  });
});

describe("navigation au clavier — RGAA 12", () => {
  it("n'utilise aucun tabindex positif", async () => {
    // Un tabindex positif réordonne la tabulation de façon imprévisible et casse
    // l'ordre naturel du document.
    for (const p of PAGES) {
      const positifs = [...(await html(p)).matchAll(/tabindex="([0-9]+)"/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0);
      expect(positifs, p.chemin).toHaveLength(0);
    }
  });

  it("ne rend aucun élément interactif inatteignable au clavier", async () => {
    for (const p of PAGES) {
      const h = await html(p);
      // Un tabindex="-1" sur un lien ou un bouton le retire de la tabulation.
      const retires = [...h.matchAll(/<(a|button)\b[^>]*tabindex="-1"[^>]*>/g)];
      expect(retires, p.chemin).toHaveLength(0);
    }
  });

  it("ne confie aucune action à un élément non interactif", async () => {
    // Un onclick sur un <div> n'est ni focalisable ni activable au clavier.
    for (const p of PAGES) {
      const h = await html(p);
      expect([...h.matchAll(/<(div|span|li|p)\b[^>]*\bonclick=/g)], p.chemin).toHaveLength(0);
    }
  });
});

describe("formulaires — RGAA 11", () => {
  it("associe chaque champ à une étiquette", async () => {
    for (const p of PAGES) {
      const h = await html(p);
      // Trois associations valides : `for`, un attribut ARIA, ou l'enveloppement
      // du champ par son <label> — cette dernière forme est parfaitement conforme.
      const enveloppes = new Set(
        [...h.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
          .flatMap((m) => [...m[1]!.matchAll(/<(input|select|textarea)\b[^>]*>/g)])
          .map((m) => m[0])
      );
      const champs = [...h.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
      for (const champ of champs) {
        if (/type="(hidden|submit|button)"/.test(champ)) continue;
        const id = /id="([^"]+)"/.exec(champ)?.[1];
        const parAria = /aria-label=|aria-labelledby=/.test(champ);
        expect(
          Boolean((id && h.includes(`for="${id}"`)) || parAria || enveloppes.has(champ)),
          `${p.chemin} : champ sans étiquette -> ${champ.slice(0, 90)}`
        ).toBe(true);
      }
    }
  });

  it("groupe les champs liés dans un fieldset nommé par une legend", async () => {
    for (const p of ["/espace/interimaire/profil", "/espace/entreprise/profil", "/missions/nouvelle"]) {
      const page = PAGES.find((x) => x.chemin === p)!;
      const h = await html(page);
      const fieldsets = titres(h, 2) >= 0 ? [...h.matchAll(/<fieldset/g)].length : 0;
      if (fieldsets > 0) {
        expect([...h.matchAll(/<legend/g)].length, `${p} : fieldset sans legend`).toBeGreaterThanOrEqual(fieldsets);
      }
    }
  });
});

describe("images et couleur — RGAA 1 et 3", () => {
  it("ne laisse aucune image sans alternative textuelle", async () => {
    for (const p of PAGES) {
      const sansAlt = [...(await html(p)).matchAll(/<img(?![^>]*\balt=)[^>]*>/g)];
      expect(sansAlt, p.chemin).toHaveLength(0);
    }
  });

  it("masque aux technologies d'assistance les images purement décoratives", async () => {
    // Le logo est accompagné du nom écrit en toutes lettres : le répéter le ferait
    // annoncer deux fois.
    const h = await html(PAGES[0]!);
    const svg = /<svg[^>]*viewBox="0 0 132 132"[^>]*>/.exec(h)?.[0] ?? "";
    expect(svg).toContain('aria-hidden="true"');
  });

  it("accompagne chaque état de certification d'un libellé écrit", async () => {
    // RGAA 3.1 : l'information ne doit pas reposer sur la seule couleur.
    const h = await html(PAGES.find((p) => p.chemin === "/espace/interimaire")!);
    for (const etiquette of [...h.matchAll(/class="etiquette[^"]*">([^<]*)</g)]) {
      expect(etiquette[1]!.trim().length, "étiquette sans texte").toBeGreaterThan(0);
    }
  });
});
