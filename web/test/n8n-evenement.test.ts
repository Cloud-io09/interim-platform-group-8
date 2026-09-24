import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE, PORT_RECEPTEUR_N8N } from "./serveur";

/**
 * Envoi immédiat vers n8n à la publication d'une fiche.
 *
 * Le flux quotidien prévenait les intérimaires le lendemain d'une publication. Ici,
 * l'application pousse l'événement au moment où il se produit. La suite ouvre un faux
 * n8n sur un port local et vérifie ce qu'il reçoit : le chemin, le secret, et la
 * liste des destinataires calculée par le vrai moteur.
 */

const MARQUE = `n8nev-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-rennes-2026";
const emails: string[] = [];

interface Recu {
  chemin: string;
  secret: string | undefined;
  corps: { evenement: string; missionId: number; notifications: { interimaireId: number; message: string }[] };
}
const recus: Recu[] = [];
let recepteur: Server;

async function lire(req: IncomingMessage): Promise<string> {
  let texte = "";
  for await (const morceau of req) texte += morceau;
  return texte;
}

async function appel(chemin: string, methode = "GET", corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  return { statut: r.status, corps: await r.json().catch(() => null) };
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
  return { id: corps.compte.id as number, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

const dansNJours = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Attend qu'un événement arrive : il part après la réponse, pas avec elle. */
async function attendreEvenement(missionId: number, delaiMs = 15000): Promise<Recu | undefined> {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const r = recus.find((x) => x.corps.missionId === missionId);
    if (r) return r;
    await new Promise((ok) => setTimeout(ok, 200));
  }
  return undefined;
}

let ent: Awaited<ReturnType<typeof inscrire>>;
let karim: Awaited<ReturnType<typeof inscrire>>;

beforeAll(async () => {
  recepteur = createServer(async (req, res) => {
    const texte = await lire(req);
    recus.push({
      chemin: req.url ?? "",
      secret: req.headers["x-secret-n8n"] as string | undefined,
      corps: JSON.parse(texte || "{}"),
    });
    res.writeHead(200).end();
  });
  await new Promise<void>((ok) => recepteur.listen(PORT_RECEPTEUR_N8N, "127.0.0.1", ok));

  ent = await inscrire("ent", "entreprise");
  karim = await inscrire("karim", "interimaire");
  await appel("/api/profil/entreprise", "POST", {
    raisonSociale: `Événement ${MARQUE}`, siret: "44306184100005",
    adresse: "1 place de la Mairie", codePostal: "35000", ville: "Rennes",
  }, ent.cookie);
  await appel("/api/profil/interimaire", "POST", {
    prenom: "Karim", nom: "Evenement", telephone: "0600000031",
    adresse: "2 rue de Brest", codePostal: "35000", ville: "Rennes",
    rayonMobiliteKm: 50, metiers: ["F1502"], competences: [],
  }, karim.cookie);
  await appel("/api/disponibilites", "POST", { dateDebut: dansNJours(1), dateFin: dansNJours(90) }, karim.cookie);
});

afterAll(async () => {
  await new Promise<void>((ok) => recepteur.close(() => ok()));
  const sql = connexion();
  try {
    await sql`delete from compte where email like ${`${MARQUE}-%`}`;
  } finally {
    await sql.end();
  }
  const cache = redis();
  await Promise.all(emails.map((e) => cache.del(cle.tentativesEmail(e))));
});

describe("n8n prévenu dès la publication", () => {
  it("pousse la fiche et ses destinataires vers le webhook, avec le secret", async () => {
    const m = await appel("/api/missions", "POST", {
      titre: `Monteur — ${MARQUE}`, metierCode: "F1502", description: "",
      adresse: "3 rue de Nantes", codePostal: "35000", ville: "Rennes",
      dateDebut: dansNJours(5), dateFin: dansNJours(20),
      certificationsRequises: [], competencesRequises: [], publier: true,
    }, ent.cookie);
    expect(m.statut).toBe(201);

    const recu = await attendreEvenement(m.corps.id);
    expect(recu, "aucun événement reçu par le faux n8n").toBeDefined();
    expect(recu!.chemin).toBe("/webhook/mission-publiee");
    expect(recu!.secret).toBe(process.env.SECRET_N8N);
    expect(recu!.corps.evenement).toBe("mission-publiee");
    const pourKarim = recu!.corps.notifications.find((n) => n.interimaireId === karim.id);
    expect(pourKarim?.message).toMatch(/Karim/);
  });

  it("ne pousse rien pour un brouillon", async () => {
    const m = await appel("/api/missions", "POST", {
      titre: `Brouillon — ${MARQUE}`, metierCode: "F1502", description: "",
      adresse: "3 rue de Nantes", codePostal: "35000", ville: "Rennes",
      dateDebut: dansNJours(5), dateFin: dansNJours(20),
      certificationsRequises: [], competencesRequises: [],
    }, ent.cookie);
    expect(m.statut).toBe(201);
    expect(await attendreEvenement(m.corps.id, 3000)).toBeUndefined();
  });
});
