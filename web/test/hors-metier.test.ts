import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

/**
 * Candidater sur une mission dont on n'a pas déclaré le métier.
 *
 * **Le cas qui cassait trois écrans à la fois.** L'écran des opportunités montre
 * délibérément tout le marché — cacher une offre reviendrait à décider à la place de
 * quelqu'un — mais tout l'aval chargeait les profils **par métier**. Un candidat hors
 * métier n'existait alors nulle part : fiche profil en `404`, compteur à « 0 profil
 * conforme », et aucune notification. Constaté en production le 23 septembre 2026 sur
 * une mission réelle.
 */

const MARQUE = `hm-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-nantes-2026";
const emails: string[] = [];

async function appel(chemin: string, methode = "GET", corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  // React sépare deux expressions adjacentes par un commentaire vide en rendu
  // serveur : « 1 candidature<!-- --> à traiter ». Les retirer permet de chercher la
  // phrase telle qu'un humain la lit, sans relâcher l'assertion.
  const t = (await r.text()).replaceAll("<!-- -->", "");
  let json = null;
  try {
    json = t ? JSON.parse(t) : null;
  } catch {
    /* une page HTML : statut et texte suffisent */
  }
  return { statut: r.status, corps: json, texte: t };
}

async function inscrire(suffixe: string, role: "entreprise" | "interimaire") {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  emails.push(email);
  const r = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role }),
  });
  const corps = await r.json();
  return { email, id: corps.compte.id as number, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

const dansNJours = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

let ent: Awaited<ReturnType<typeof inscrire>>;
let horsMetier: Awaited<ReturnType<typeof inscrire>>;
let missionId: number;

beforeAll(async () => {
  ent = await inscrire("ent", "entreprise");
  horsMetier = await inscrire("hors", "interimaire");

  await appel("/api/profil/entreprise", "POST", {
    raisonSociale: `Hors métier ${MARQUE}`, siret: "44306184100005",
    adresse: "1 quai de la Fosse", codePostal: "44000", ville: "Nantes",
  }, ent.cookie);

  // Déclare F1702 (maçonnerie), postulera sur une mission F1502 (montage).
  await appel("/api/profil/interimaire", "POST", {
    prenom: "Hors", nom: "Metier", telephone: "0600000012",
    adresse: "2 rue Crébillon", codePostal: "44000", ville: "Nantes",
    rayonMobiliteKm: 50, metiers: ["F1702"], competences: [],
  }, horsMetier.cookie);
  await appel("/api/disponibilites", "POST",
    { dateDebut: dansNJours(1), dateFin: dansNJours(120) }, horsMetier.cookie);

  const m = await appel("/api/missions", "POST", {
    titre: `Monteur — ${MARQUE}`, metierCode: "F1502", description: "Hors métier.",
    adresse: "3 rue du Calvaire", codePostal: "44000", ville: "Nantes",
    dateDebut: dansNJours(5), dateFin: dansNJours(20),
    horaires: "35 h par semaine", tauxHoraireMin: 14,
    certificationsRequises: [], competencesRequises: [], publier: true,
  }, ent.cookie);
  missionId = m.corps.id;
});

afterAll(async () => {
  const sql = connexion();
  try {
    await sql`delete from compte where email like ${`${MARQUE}-%`}`;
  } finally {
    await sql.end();
  }
  const cache = redis();
  await Promise.all(emails.map((e) => cache.del(cle.tentativesEmail(e))));
});

describe("candidater hors de ses métiers déclarés", () => {
  it("reste permis, et le dit", async () => {
    // Permis : l'écran des opportunités montre tout le marché. Dit : le moteur ne
    // rapproche que sur les métiers déclarés, donc sans avertissement on candidate
    // en croyant être classé, et on ne l'est pas.
    const r = await appel("/api/candidatures", "POST",
      { missionId, vers: "candidatee" }, horsMetier.cookie);
    expect(r.statut).toBe(200);
    expect(r.corps.etat).toBe("candidatee");
    expect(r.corps.avertissement).toMatch(/métier n'est pas déclaré/i);
  });

  it("ne rend plus un 404 sur la fiche du candidat", async () => {
    // Le profil était chargé par métier : le candidat n'y figurait pas, et
    // l'entreprise tombait sur « This page could not be found » depuis sa propre
    // liste de candidatures.
    const page = await appel(
      `/missions/${missionId}/profils/${horsMetier.id}`, "GET", undefined, ent.cookie);
    expect(page.statut).toBe(200);
    expect(page.texte).toContain("Hors");
  });

  it("apparaît dans le matching, écarté et non invisible", async () => {
    const r = await appel(`/api/missions/${missionId}/matching`, "GET", undefined, ent.cookie);
    expect(r.statut).toBe(200);
    const tous = [...(r.corps.retenus ?? []), ...(r.corps.ecartes ?? [])];
    expect(tous.some((p: { interimaireId: number }) => p.interimaireId === horsMetier.id)).toBe(true);
  });

  it("est compté comme candidature à traiter sur le tableau de bord", async () => {
    // L'écran annonçait « aucune proposition en attente » pendant que la
    // notification disait « X a postulé » : il ne comptait que l'état « proposee »,
    // c'est-à-dire les rapprochements du moteur, jamais les candidatures.
    const page = await appel("/espace/entreprise", "GET", undefined, ent.cookie);
    expect(page.statut).toBe(200);
    expect(page.texte).toMatch(/candidature à traiter|candidatures à traiter/);
  });

  it("porte son verdict dès la liste, sans ouvrir sa fiche", async () => {
    // Il fallait ouvrir chaque fiche pour savoir si un candidat était affectable :
    // sur dix candidatures, dix allers-retours. Le produit connaît la réponse.
    const liste = await appel("/candidatures", "GET", undefined, ent.cookie);
    expect(liste.statut).toBe(200);
    expect(liste.texte).toMatch(/✓ Conforme|△ Non conforme/);
  });

  it("le dit aussi à celui qui a postulé", async () => {
    // Une candidature peut dormir des jours pendant qu'un titre expire : le savoir
    // depuis sa propre liste, c'est pouvoir le renouveler avant la réponse.
    const liste = await appel("/mes-candidatures", "GET", undefined, horsMetier.cookie);
    expect(liste.statut).toBe(200);
    expect(liste.texte).toMatch(/Vous êtes conforme|Titre manquant/);
  });

  it("figure dans les candidatures reçues de la fiche", async () => {
    const page = await appel(`/missions/${missionId}`, "GET", undefined, ent.cookie);
    expect(page.texte).toContain("Candidatures reçues");
    expect(page.texte).toContain("Hors");
  });
});

/**
 * Mise en page des deux écrans où les défauts ont été constatés.
 *
 * **Pourquoi ces contrôles vivent ici.** Le montage est déjà fait plus haut — une
 * entreprise, une mission publiée, une candidature — et ce sont précisément les
 * deux écrans photographiés : le tableau de bord et la liste des candidatures.
 *
 * Aucun de ces contrôles ne voit de pixels. Ils vérifient la *structure* qui
 * produisait le désordre : des candidatures posées à nu sur le fond de page, une
 * tuile chiffrée détournée en colonne de droite, des tailles de police décidées
 * écran par écran. Ce qu'ils ne diront jamais, c'est si le résultat est élégant.
 */
describe("mise en page des listes", () => {
  it("range chaque candidature dans la carte de son chantier", async () => {
    // Elles flottaient sur le fond de page, séparées du titre de leur mission par
    // deux marges cumulées : rien ne disait où un chantier finissait.
    const page = await appel("/candidatures", "GET", undefined, ent.cookie);
    expect(page.texte).toContain("groupe-candidatures");
    const premierGroupe = page.texte.indexOf("groupe-candidatures");
    const premiereLigne = page.texte.indexOf("ligne-candidat");
    expect(premiereLigne, "une candidature rendue hors de toute carte").toBeGreaterThan(premierGroupe);
  });

  it("n'imbrique plus une tuile chiffrée dans la carte d'une mission", async () => {
    // `encart-score` est la tuile du score de compatibilité. Réemployée en colonne
    // de droite générique, elle encadrait un simple bouton : un cadre dans un
    // cadre, dimensionné pour un pourcentage, qui cassait « Répondre aux
    // candidats » sur deux lignes et gonflait toute la carte.
    const page = await appel("/espace/entreprise", "GET", undefined, ent.cookie);
    expect(page.texte).toContain("carte-mission");
    expect(page.texte, "la tuile de score est revenue sur le tableau de bord").not.toContain(
      "encart-score"
    );
  });

  it("ne laisse aucune taille de police décidée écran par écran", async () => {
    // Dix-huit éléments fixaient la leur en style en ligne, pour quatre valeurs
    // dont trois tiennent dans deux pixels. Une taille appartient à la feuille de
    // style, sous un nom qui dit à quoi elle sert.
    for (const chemin of ["/candidatures", "/espace/entreprise", "/missions", "/tarifs"]) {
      const page = await appel(chemin, "GET", undefined, ent.cookie);
      expect(page.statut, chemin).toBe(200);
      expect(page.texte, `${chemin} : taille de police en ligne`).not.toMatch(/style="[^"]*font-size/);
    }
  });
});

describe("barrière de déblocage sur les résultats du moteur", () => {
  it("ne rend pas le nom complet d'un profil non débloqué", async () => {
    // Masqué sur la fiche et dans la liste des candidatures, le nom sortait en clair
    // de la route du moteur : l'entreprise le lisait dès la publication.
    const r = await appel(`/api/missions/${missionId}/matching`, "GET", undefined, ent.cookie);
    expect(r.statut).toBe(200);
    const tous = [...r.corps.retenus, ...r.corps.ecartes] as { interimaireId: number; nom: string; debloque: boolean }[];
    const lui = tous.find((p) => p.interimaireId === horsMetier.id)!;
    expect(lui.debloque).toBe(false);
    expect(lui.nom).toBe("M.");
    expect(JSON.stringify(r.corps)).not.toContain("Metier");
  });

  it("dit ce que l'entreprise peut encore débloquer", async () => {
    const r = await appel(`/api/missions/${missionId}/matching`, "GET", undefined, ent.cookie);
    expect(r.corps.droits).toMatchObject({ plan: expect.any(String), peutDebloquer: expect.any(Boolean) });
  });
});

describe("clore une fiche", () => {
  it("clôt aussi les candidatures en cours", async () => {
    // Fermée, la fiche laissait ses candidatures « en attente » d'une réponse sur un
    // poste qui n'existait plus.
    const r = await appel(`/api/missions/${missionId}`, "PATCH", { statut: "close" }, ent.cookie);
    expect(r.statut).toBe(200);
    const c = await appel(`/api/missions/${missionId}/candidatures`, "GET", undefined, ent.cookie);
    const siennes = (c.corps.candidatures as { interimaireId: number; statut: string }[]).filter(
      (x) => x.interimaireId === horsMetier.id
    );
    expect(siennes.length).toBeGreaterThan(0);
    expect(siennes.every((x) => x.statut === "expiree")).toBe(true);
  });
});
