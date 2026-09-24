import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

/**
 * Déblocage des coordonnées d'un profil.
 *
 * Ce qui est éprouvé ici est ce qui coûte de l'argent à quelqu'un quand ça casse :
 * qu'un même profil ne soit jamais facturé deux fois, qu'un crédit ne se débite pas
 * sans contrepartie, et que la barrière ne cache **que** l'identité — jamais le
 * verdict de conformité, que le produit existe pour donner.
 */

const MARQUE = `debloc-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-dijon-2026";
const emails: string[] = [];

async function appel(chemin: string, methode = "GET", corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  let json = null;
  try {
    json = t ? JSON.parse(t) : null;
  } catch {
    /* une page HTML : le statut suffit */
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
  return {
    email,
    id: corps.compte.id as number,
    cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}

const dansNJours = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

let ent: Awaited<ReturnType<typeof inscrire>>;
let inte: Awaited<ReturnType<typeof inscrire>>;
let missionId: number;

beforeAll(async () => {
  ent = await inscrire("entreprise", "entreprise");
  inte = await inscrire("interimaire", "interimaire");

  await appel("/api/profil/entreprise", "POST", {
    raisonSociale: `Déblocage ${MARQUE}`, siret: "44306184100005",
    adresse: "1 rue de la Liberté", codePostal: "21000", ville: "Dijon",
  }, ent.cookie);

  await appel("/api/profil/interimaire", "POST", {
    prenom: "Essai", nom: "Deblocage", telephone: "0600000000",
    adresse: "2 rue Berbisey", codePostal: "21000", ville: "Dijon",
    rayonMobiliteKm: 50, metiers: ["F1702"], competences: [],
  }, inte.cookie);

  await appel("/api/disponibilites", "POST",
    { dateDebut: dansNJours(1), dateFin: dansNJours(120) }, inte.cookie);

  const m = await appel("/api/missions", "POST", {
    titre: `Maçon — ${MARQUE}`, metierCode: "F1702",
    description: "Essai de déblocage.",
    adresse: "3 rue Musette", codePostal: "21000", ville: "Dijon",
    dateDebut: dansNJours(5), dateFin: dansNJours(20),
    horaires: "35 h par semaine", tauxHoraireMin: 14, tauxHoraireMax: 16,
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

describe("droits d'une entreprise neuve", () => {
  it("part avec les déblocages offerts du palier découverte", async () => {
    const r = await appel("/api/deblocages", "GET", undefined, ent.cookie);
    expect(r.statut).toBe(200);
    expect(r.corps.plan.code).toBe("decouverte");
    expect(r.corps.credits).toBe(3);
    expect(r.corps.peutDebloquer).toBe(true);
  });

  it("n'est pas lisible par un intérimaire, ni sans session", async () => {
    // Le palier d'une entreprise ne regarde personne d'autre.
    expect((await appel("/api/deblocages", "GET", undefined, inte.cookie)).statut).toBe(403);
    expect((await appel("/api/deblocages")).statut).toBe(401);
  });
});

describe("ce que la barrière cache, et ce qu'elle laisse voir", () => {
  it("masque le nom de famille tant que le profil n'est pas débloqué", async () => {
    const page = await appel(
      `/missions/${missionId}/profils/${inte.id}`, "GET", undefined, ent.cookie);
    expect(page.statut).toBe(200);
    expect(page.texte).toContain("Coordonnées masquées");
    expect(page.texte).not.toContain("Deblocage"); // le nom de famille
  });

  it("laisse voir le verdict de conformité, qui ne se paie jamais", async () => {
    // La règle de sûreté du produit : faire payer ce verdict reviendrait à vendre le
    // risque qu'il existe pour supprimer.
    const page = await appel(
      `/missions/${missionId}/profils/${inte.id}`, "GET", undefined, ent.cookie);
    expect(page.texte).toMatch(/Conforme pour ce chantier|habilitation/i);
  });
});

describe("l'agence, avant et après le déblocage", () => {
  it("annonce le nombre d'agences sans rien faire payer", async () => {
    // Savoir qu'un profil est déjà inscrit quelque part change la décision : la mise
    // en place sera rapide, ou il faudra l'inscrire dans sa propre agence. Le produit
    // ne fait jamais payer ce qui sert à décider.
    const autre = await inscrire("agence-visible", "interimaire");
    await appel("/api/profil/interimaire", "POST", {
      prenom: "Avec", nom: "Agence", telephone: "0600000009",
      adresse: "8 rue Berlier", codePostal: "21000", ville: "Dijon",
      rayonMobiliteKm: 50, metiers: ["F1702"], competences: [],
      agences: [{ nom: "Adecco", ville: "Dijon" }],
    }, autre.cookie);

    const page = await appel(
      `/missions/${missionId}/profils/${autre.id}`, "GET", undefined, ent.cookie);
    expect(page.statut).toBe(200);
    expect(page.texte).toContain("inscrit dans 1 agence");
    // Mais pas laquelle : ça, c'est de l'information d'action.
    expect(page.texte).not.toContain("Adecco");
  });

  it("révèle l'agence une fois le profil débloqué", async () => {
    const autre = await inscrire("agence-payante", "interimaire");
    await appel("/api/profil/interimaire", "POST", {
      prenom: "Agence", nom: "Revelee", telephone: "0600000010",
      adresse: "9 rue Berlier", codePostal: "21000", ville: "Dijon",
      rayonMobiliteKm: 50, metiers: ["F1702"], competences: [],
      agences: [{ nom: "Randstad", ville: "Dijon" }],
    }, autre.cookie);

    await appel("/api/deblocages", "POST", { interimaireId: autre.id, missionId }, ent.cookie);
    const page = await appel(
      `/missions/${missionId}/profils/${autre.id}`, "GET", undefined, ent.cookie);
    expect(page.texte).toContain("Randstad");
    expect(page.texte).toContain("Son agence");
  });

  it("dit franchement quand aucune agence n'est déclarée", async () => {
    // Ne pas le dire laisserait croire à une mise en place aussi rapide, alors
    // qu'il faudra inscrire la personne dans sa propre agence.
    const sans = await inscrire("sans-agence", "interimaire");
    await appel("/api/profil/interimaire", "POST", {
      prenom: "Sans", nom: "Agence", telephone: "0600000011",
      adresse: "10 rue Berlier", codePostal: "21000", ville: "Dijon",
      rayonMobiliteKm: 50, metiers: ["F1702"], competences: [],
    }, sans.cookie);

    const page = await appel(
      `/missions/${missionId}/profils/${sans.id}`, "GET", undefined, ent.cookie);
    expect(page.texte).toContain("aucune agence déclarée");
  });
});

describe("déblocage", () => {
  it("débloque, débite un crédit, et révèle l'identité", async () => {
    const avant = await appel("/api/deblocages", "GET", undefined, ent.cookie);

    const r = await appel("/api/deblocages", "POST",
      { interimaireId: inte.id, missionId }, ent.cookie);
    expect(r.statut).toBe(200);
    expect(r.corps.deja).toBe(false);
    expect(r.corps.source).toBe("credit");
    expect(r.corps.credits).toBe(avant.corps.credits - 1);

    const page = await appel(
      `/missions/${missionId}/profils/${inte.id}`, "GET", undefined, ent.cookie);
    expect(page.texte).toContain("Deblocage");
    expect(page.texte).not.toContain("Coordonnées masquées");
  });

  it("ne facture pas deux fois le même profil sur la même mission", async () => {
    // Deux clics, deux onglets, un rechargement pendant la requête : l'index unique
    // rend l'ancien déblocage sans rien débiter.
    const avant = await appel("/api/deblocages", "GET", undefined, ent.cookie);
    const r = await appel("/api/deblocages", "POST",
      { interimaireId: inte.id, missionId }, ent.cookie);

    expect(r.statut).toBe(200);
    expect(r.corps.deja).toBe(true);
    expect(r.corps.credits).toBe(avant.corps.credits);
  });

  it("résiste à deux demandes simultanées", async () => {
    // Le cas qui coûte de l'argent précisément quand le réseau est mauvais, donc
    // sur un chantier. On repart d'un profil non débloqué.
    const autre = await inscrire("concurrent", "interimaire");
    await appel("/api/profil/interimaire", "POST", {
      prenom: "Course", nom: "Simultanee", telephone: "0600000001",
      adresse: "4 rue Amiral Roussin", codePostal: "21000", ville: "Dijon",
      rayonMobiliteKm: 50, metiers: ["F1702"], competences: [],
    }, autre.cookie);

    const avant = await appel("/api/deblocages", "GET", undefined, ent.cookie);
    const [a, b] = await Promise.all([
      appel("/api/deblocages", "POST", { interimaireId: autre.id, missionId }, ent.cookie),
      appel("/api/deblocages", "POST", { interimaireId: autre.id, missionId }, ent.cookie),
    ]);

    expect([a.statut, b.statut]).toEqual([200, 200]);
    const apres = await appel("/api/deblocages", "GET", undefined, ent.cookie);
    expect(apres.corps.credits).toBe(avant.corps.credits - 1);
  });

  it("refuse une mission qui n'est pas la sienne", async () => {
    // Sans ce contrôle, on débloquerait un profil en se réclamant de la fiche d'un
    // concurrent, et à ses frais.
    const rival = await inscrire("rival", "entreprise");
    await appel("/api/profil/entreprise", "POST", {
      raisonSociale: `Rival ${MARQUE}`, siret: "44306184100005",
      adresse: "9 rue Jeannin", codePostal: "21000", ville: "Dijon",
    }, rival.cookie);

    const r = await appel("/api/deblocages", "POST",
      { interimaireId: inte.id, missionId }, rival.cookie);
    expect(r.statut).toBe(404);
  });

  it("refuse une saisie incomplète", async () => {
    expect((await appel("/api/deblocages", "POST", {}, ent.cookie)).statut).toBe(422);
  });

  it("répond 402 quand il ne reste plus rien", async () => {
    const sec = await inscrire("sans-credit", "entreprise");
    await appel("/api/profil/entreprise", "POST", {
      raisonSociale: `Sec ${MARQUE}`, siret: "44306184100005",
      adresse: "11 rue Devosge", codePostal: "21000", ville: "Dijon",
    }, sec.cookie);

    const sql = connexion();
    try {
      await sql`update compte set credits = 0 where id = ${sec.id}`;
    } finally {
      await sql.end();
    }

    const m = await appel("/api/missions", "POST", {
      titre: `Sec — ${MARQUE}`, metierCode: "F1702", description: "x",
      adresse: "12 rue Devosge", codePostal: "21000", ville: "Dijon",
      dateDebut: dansNJours(5), dateFin: dansNJours(20),
      horaires: "35 h", tauxHoraireMin: 14, certificationsRequises: [],
      competencesRequises: [], publier: true,
    }, sec.cookie);

    const r = await appel("/api/deblocages", "POST",
      { interimaireId: inte.id, missionId: m.corps.id }, sec.cookie);
    // 402 « Payment Required » : le statut dit exactement ce dont il s'agit.
    expect(r.statut).toBe(402);
  });
});

describe("paliers et crédits", () => {
  it("change de palier et ouvre le quota mensuel", async () => {
    const r = await appel("/api/abonnement", "POST", { planCode: "starter" }, ent.cookie);
    expect(r.statut).toBe(200);
    expect(r.corps.quotaRestant).toBeGreaterThan(0);

    // Le quota se consomme avant les crédits : ceux-ci ne périment pas.
    const droits = await appel("/api/deblocages", "GET", undefined, ent.cookie);
    expect(droits.corps.plan.code).toBe("starter");
  });

  it("ajoute des crédits qui s'additionnent", async () => {
    const avant = await appel("/api/deblocages", "GET", undefined, ent.cookie);
    await appel("/api/abonnement", "POST", { packCode: "cinq" }, ent.cookie);
    const apres = await appel("/api/deblocages", "GET", undefined, ent.cookie);
    expect(apres.corps.credits).toBe(avant.corps.credits + 5);
  });

  it("refuse un palier ou un pack inventé", async () => {
    expect((await appel("/api/abonnement", "POST", { planCode: "gratuit-illimite" }, ent.cookie)).statut).toBe(422);
    expect((await appel("/api/abonnement", "POST", { packCode: "cadeau" }, ent.cookie)).statut).toBe(422);
  });

  it("n'est pas ouvert à un intérimaire", async () => {
    expect((await appel("/api/abonnement", "POST", { planCode: "pro" }, inte.cookie)).statut).toBe(403);
  });
});

describe("ce que l'intérimaire en sait", () => {
  it("voit combien d'entreprises ont accédé à ses coordonnées", async () => {
    // Ce qui distingue une place de marché d'un courtier en données : la personne
    // dont on vend l'accès aux coordonnées doit savoir que cela s'est produit.
    const page = await appel("/espace/interimaire", "GET", undefined, inte.cookie);
    expect(page.statut).toBe(200);
    expect(page.texte).toContain("Qui vous a contacté");
  });
});
