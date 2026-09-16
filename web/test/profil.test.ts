import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

const MARQUE = `profil-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";
const creees: string[] = [];

async function appel(chemin: string, methode: string, corps?: unknown, cookie?: string) {
  const reponse = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const texte = await reponse.text();
  return { statut: reponse.status, corps: texte ? JSON.parse(texte) : null };
}

/** Crée un compte et rend son cookie de session. */
async function compte(suffixe: string, role: "entreprise" | "interimaire") {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  creees.push(email);
  const reponse = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role }),
  });
  return { email, cookie: reponse.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

const PROFIL_INTERIMAIRE = {
  prenom: "Karim",
  nom: "Benali",
  telephone: "0612345678",
  adresse: "25 rue de Vesle",
  codePostal: "51100",
  ville: "Reims",
  rayonMobiliteKm: 50,
  metiers: ["F1703"],
};

const CACES = {
  typeCode: "CACES_R482",
  categorieCode: "B1",
  organismeEmetteur: "AFPA",
  numero: "R482-2024-004871",
  dateObtention: "2024-03-15",
  dateEcheance: "2034-03-15",
};

let interimaire: { email: string; cookie: string };
let entreprise: { email: string; cookie: string };

beforeAll(async () => {
  interimaire = await compte("interimaire", "interimaire");
  entreprise = await compte("entreprise", "entreprise");
});

afterAll(async () => {
  const sql = connexion();
  try {
    await sql`delete from compte where email like ${`${MARQUE}-%`}`;
  } finally {
    await sql.end();
  }
  const cache = redis();
  await Promise.all(creees.map((e) => cache.del(cle.tentativesEmail(e))));
});

describe("garde d'accès", () => {
  it("refuse un profil sans session", async () => {
    expect((await appel("/api/profil/interimaire", "POST", PROFIL_INTERIMAIRE)).statut).toBe(401);
    expect((await appel("/api/certifications", "GET")).statut).toBe(401);
  });

  it("refuse à une entreprise le profil intérimaire, et l'inverse", async () => {
    expect(
      (await appel("/api/profil/interimaire", "POST", PROFIL_INTERIMAIRE, entreprise.cookie)).statut
    ).toBe(403);
    expect(
      (await appel("/api/profil/entreprise", "POST", { raisonSociale: "X", codePostal: "51100", ville: "Reims" }, interimaire.cookie)).statut
    ).toBe(403);
  });

  it("refuse les certifications à une entreprise", async () => {
    expect((await appel("/api/certifications", "POST", CACES, entreprise.cookie)).statut).toBe(403);
  });
});

describe("profil intérimaire", () => {
  it("enregistre le profil et géocode l'adresse", async () => {
    const { statut, corps } = await appel("/api/profil/interimaire", "POST", PROFIL_INTERIMAIRE, interimaire.cookie);
    expect(statut).toBe(200);
    // Reims est autour de 49,25 N / 4,03 E.
    expect(corps.position.lat).toBeGreaterThan(49);
    expect(corps.position.lat).toBeLessThan(49.5);
    expect(corps.position.lon).toBeGreaterThan(3.8);
    expect(corps.position.lon).toBeLessThan(4.3);
  });

  it("est réexécutable : le second envoi met à jour au lieu de dupliquer", async () => {
    const { statut } = await appel(
      "/api/profil/interimaire",
      "POST",
      { ...PROFIL_INTERIMAIRE, rayonMobiliteKm: 80 },
      interimaire.cookie
    );
    expect(statut).toBe(200);

    const sql = connexion();
    try {
      const lignes = await sql<{ rayon_mobilite_km: number }[]>`
        select i.rayon_mobilite_km from interimaire i
        join compte c on c.id = i.compte_id where c.email = ${interimaire.email}`;
      expect(lignes).toHaveLength(1);
      expect(lignes[0]!.rayon_mobilite_km).toBe(80);
    } finally {
      await sql.end();
    }
  });

  it("refuse une saisie incomplète en désignant les champs", async () => {
    const { statut, corps } = await appel("/api/profil/interimaire", "POST", { prenom: "Karim" }, interimaire.cookie);
    expect(statut).toBe(422);
    expect(corps.problemes.length).toBeGreaterThan(1);
  });

  it("chiffre le téléphone au repos", async () => {
    const sql = connexion();
    try {
      const [ligne] = await sql<{ telephone_chiffre: string }[]>`
        select i.telephone_chiffre from interimaire i
        join compte c on c.id = i.compte_id where c.email = ${interimaire.email}`;
      // Le numéro ne doit apparaître nulle part en clair dans la colonne.
      expect(ligne!.telephone_chiffre).not.toContain("0612345678");
      expect(ligne!.telephone_chiffre.split(".")).toHaveLength(3);
    } finally {
      await sql.end();
    }
  });
});

describe("certifications", () => {
  it("enregistre un CACES avec sa catégorie", async () => {
    const { statut, corps } = await appel("/api/certifications", "POST", CACES, interimaire.cookie);
    expect(statut).toBe(201);
    expect(corps.id).toBeTypeOf("number");
  });

  it("chiffre le numéro du titre au repos mais le rend lisible à son porteur", async () => {
    const sql = connexion();
    try {
      const [ligne] = await sql<{ numero_chiffre: string }[]>`
        select cert.numero_chiffre from certification cert
        join compte c on c.id = cert.interimaire_id where c.email = ${interimaire.email}`;
      expect(ligne!.numero_chiffre).not.toContain("R482-2024");
    } finally {
      await sql.end();
    }

    const { corps } = await appel("/api/certifications", "GET", undefined, interimaire.cookie);
    expect(corps.certifications[0].numero).toBe(CACES.numero);
  });

  it("refuse un CACES sans catégorie", async () => {
    const { statut, corps } = await appel(
      "/api/certifications",
      "POST",
      { ...CACES, categorieCode: "" },
      interimaire.cookie
    );
    expect(statut).toBe(422);
    expect(corps.problemes[0].champ).toBe("categorieCode");
  });

  it("refuse une catégorie appartenant à un autre titre", async () => {
    // H0 est une habilitation électrique, pas une catégorie de R482.
    const { statut } = await appel("/api/certifications", "POST", { ...CACES, categorieCode: "H0" }, interimaire.cookie);
    expect(statut).toBe(422);
  });

  it("refuse un type inventé, la liste étant fermée", async () => {
    const { statut } = await appel("/api/certifications", "POST", { ...CACES, typeCode: "CACES_MAISON" }, interimaire.cookie);
    expect(statut).toBe(422);
  });

  it("refuse une échéance antérieure à l'obtention", async () => {
    const { statut } = await appel(
      "/api/certifications",
      "POST",
      { ...CACES, dateEcheance: "2023-01-01" },
      interimaire.cookie
    );
    expect(statut).toBe(422);
  });

  it("empêche un intérimaire de supprimer la certification d'un autre", async () => {
    const autre = await compte("voisin", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL_INTERIMAIRE, autre.cookie);

    const { corps } = await appel("/api/certifications", "GET", undefined, interimaire.cookie);
    const idDuPremier = corps.certifications[0].id;

    const { statut } = await appel(`/api/certifications/${idDuPremier}`, "DELETE", undefined, autre.cookie);
    expect(statut).toBe(404);

    // Et elle est toujours là pour son propriétaire.
    const apres = await appel("/api/certifications", "GET", undefined, interimaire.cookie);
    expect(apres.corps.certifications.some((c: { id: number }) => c.id === idDuPremier)).toBe(true);
  });

  it("laisse son porteur supprimer la sienne", async () => {
    const { corps } = await appel("/api/certifications", "GET", undefined, interimaire.cookie);
    const id = corps.certifications[0].id;
    expect((await appel(`/api/certifications/${id}`, "DELETE", undefined, interimaire.cookie)).statut).toBe(200);
    expect((await appel(`/api/certifications/${id}`, "DELETE", undefined, interimaire.cookie)).statut).toBe(404);
  });
});

describe("profil entreprise", () => {
  it("enregistre le profil et refuse un SIRET faux", async () => {
    const base = { raisonSociale: "Bâtiment Rémois SAS", codePostal: "51100", ville: "Reims", adresse: "25 rue de Vesle" };
    expect((await appel("/api/profil/entreprise", "POST", base, entreprise.cookie)).statut).toBe(200);
    expect(
      (await appel("/api/profil/entreprise", "POST", { ...base, siret: "12345678901234" }, entreprise.cookie)).statut
    ).toBe(422);
    expect(
      (await appel("/api/profil/entreprise", "POST", { ...base, siret: "44306184100005" }, entreprise.cookie)).statut
    ).toBe(200);
  });
});

describe("pages protégées", () => {
  it("renvoie un visiteur anonyme vers la connexion", async () => {
    for (const page of ["/espace", "/espace/interimaire/profil", "/espace/entreprise/profil"]) {
      const r = await fetch(`${BASE}${page}`, { redirect: "manual" });
      expect([307, 302], page).toContain(r.status);
      expect(r.headers.get("location"), page).toContain("/connexion");
    }
  });

  it("affiche la page à son titulaire", async () => {
    const r = await fetch(`${BASE}/espace/interimaire/profil`, { headers: { cookie: interimaire.cookie } });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Mon profil");
  });

  it("présente la carte BTP séparément des certifications techniques", async () => {
    // Le formulaire est rendu côté client après relecture du profil : on vérifie
    // donc le contenu servi au navigateur, pas le HTML initial.
    const r = await fetch(`${BASE}/espace/interimaire/certifications`, {
      headers: { cookie: interimaire.cookie },
    });
    expect(r.status).toBe(200);
    const html = await r.text();
    // La page des certifications ne doit PAS parler de carte BTP : elles sont séparées.
    expect(html).not.toContain("Carte BTP");
  });

  it("donne à l'intérimaire une page dédiée par sujet", async () => {
    for (const page of [
      "/espace/interimaire",
      "/espace/interimaire/profil",
      "/espace/interimaire/certifications",
      "/espace/interimaire/disponibilites",
    ]) {
      const r = await fetch(`${BASE}${page}`, { headers: { cookie: interimaire.cookie } });
      expect(r.status, page).toBe(200);
    }
  });

  it("renvoie une entreprise vers son propre espace si elle vise celui de l'intérimaire", async () => {
    const r = await fetch(`${BASE}/espace/interimaire/profil`, {
      headers: { cookie: entreprise.cookie },
      redirect: "manual",
    });
    expect([307, 302]).toContain(r.status);
    expect(r.headers.get("location")).toContain("/espace/entreprise");
  });

  it("aiguille chaque rôle vers son propre espace", async () => {
    for (const [cookie, attendu] of [
      [interimaire.cookie, "/espace/interimaire"],
      [entreprise.cookie, "/espace/entreprise"],
    ] as const) {
      const r = await fetch(`${BASE}/espace`, { headers: { cookie }, redirect: "manual" });
      expect(r.headers.get("location"), attendu).toContain(attendu);
    }
  });
});
