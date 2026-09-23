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

  it("figure dans les candidatures reçues de la fiche", async () => {
    const page = await appel(`/missions/${missionId}`, "GET", undefined, ent.cookie);
    expect(page.texte).toContain("Candidatures reçues");
    expect(page.texte).toContain("Hors");
  });
});
