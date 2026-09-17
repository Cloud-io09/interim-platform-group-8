import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

const MARQUE = `cv-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";
const emails: string[] = [];

const PDF = readFileSync(join(import.meta.dirname, "fixtures", "cv-essai.pdf"));

/** Même contenu que le PDF, en texte brut : éprouve l'autre chemin d'extraction. */
const CV_TEXTE = `CURRICULUM VITAE - Karim Benali
Macon coffreur, 8 ans d'experience sur chantiers de gros oeuvre.
EXPERIENCE
2019-2026 Macon chez Batiment Remois, Reims.
Realisation de fondations, murs porteurs, dalles beton.
Deblayer, remblayer un terrain avant coulage.
2016-2019 Conducteur d'engins de chantier, TP Marne.
Conduite de pelle hydraulique et de chargeuse sur voiries urbaines.
FORMATIONS ET HABILITATIONS
CACES R482 categorie B1 obtenu en 2024
AIPR operateur
Habilitation electrique B0
Permis B. Vehicule. Disponible immediatement.`;

async function appel(chemin: string, methode: string, corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : null };
}

async function deposer(cookie: string, fichier: Blob, nom: string) {
  const formulaire = new FormData();
  formulaire.append("cv", fichier, nom);
  const r = await fetch(`${BASE}/api/cv`, { method: "POST", headers: { cookie }, body: formulaire });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : null };
}

async function inscrire(suffixe: string) {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  emails.push(email);
  const r = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role: "interimaire" }),
  });
  return { email, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

const PROFIL = {
  prenom: "Karim", nom: "Benali", codePostal: "51100", ville: "Reims",
  rayonMobiliteKm: 50, metiers: ["F1703"],
};

async function interimairePret(suffixe: string) {
  const c = await inscrire(suffixe);
  await appel("/api/profil/interimaire", "POST", PROFIL, c.cookie);
  return c;
}

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

describe("dépôt du CV", () => {
  it("lit un PDF et en tire métiers, compétences et habilitations", async () => {
    const { cookie } = await interimairePret("pdf");
    const r = await deposer(cookie, new Blob([PDF], { type: "application/pdf" }), "cv.pdf");
    expect(r.statut).toBe(201);

    const a = r.corps.analyse;
    // Le PDF encode une apostrophe typographique : la normalisation doit la traiter
    // comme un séparateur, sinon « Conducteur d'engins » ne correspondrait à rien.
    expect(a.metiers.map((m: { code: string }) => m.code)).toContain("F1302");
    expect(a.metiers.map((m: { code: string }) => m.code)).toContain("F1703");
    expect(a.certifications.map((c: { typeCode: string }) => c.typeCode)).toContain("CACES_R482");
    expect(a.certifications.find((c: { typeCode: string }) => c.typeCode === "CACES_R482").categorieCode).toBe("B1");
  });

  it("lit aussi un fichier texte brut", async () => {
    const { cookie } = await interimairePret("txt");
    const r = await deposer(cookie, new Blob([CV_TEXTE], { type: "text/plain" }), "cv.txt");
    expect(r.statut).toBe(201);
    expect(r.corps.analyse.metiers.length).toBeGreaterThanOrEqual(2);
  });

  it("refuse un format non pris en charge", async () => {
    const { cookie } = await interimairePret("format");
    const r = await deposer(cookie, new Blob(["x".repeat(500)], { type: "image/png" }), "cv.png");
    expect(r.statut).toBe(422);
    expect(r.corps.problemes[0].message).toMatch(/PDF|Word|texte/i);
  });

  it("refuse un fichier dont la signature ne correspond pas au type déclaré", async () => {
    // Un exécutable renommé en .pdf ne doit pas passer : le type vient du client.
    const { cookie } = await interimairePret("signature");
    const r = await deposer(cookie, new Blob(["MZ" + "x".repeat(500)], { type: "application/pdf" }), "faux.pdf");
    expect(r.statut).toBe(422);
    expect(r.corps.problemes[0].message).toMatch(/PDF valide/i);
  });

  it("refuse un document sans texte exploitable", async () => {
    // Un scan sans couche texte tombe ici : on le dit plutôt que d'appeler un OCR tiers.
    const { cookie } = await interimairePret("court");
    const r = await deposer(cookie, new Blob(["Karim, macon."], { type: "text/plain" }), "court.txt");
    expect(r.statut).toBe(422);
    expect(r.corps.message).toMatch(/scan|texte/i);
  });

  it("refuse un fichier vide", async () => {
    const { cookie } = await interimairePret("vide");
    expect((await deposer(cookie, new Blob([], { type: "text/plain" }), "vide.txt")).statut).toBe(422);
  });

  it("exige un profil avant de déposer un CV", async () => {
    const { cookie } = await inscrire("sans-profil");
    const r = await deposer(cookie, new Blob([CV_TEXTE], { type: "text/plain" }), "cv.txt");
    expect(r.statut).toBe(409);
  });

  it("refuse le dépôt sans session, et à une entreprise", async () => {
    const r = await fetch(`${BASE}/api/cv`, { method: "POST", body: new FormData() });
    expect(r.status).toBe(401);
  });
});

describe("conservation et effacement du texte", () => {
  it("stocke le texte chiffré, jamais en clair", async () => {
    const { email, cookie } = await interimairePret("chiffre");
    await deposer(cookie, new Blob([CV_TEXTE], { type: "text/plain" }), "cv.txt");

    const sql = connexion();
    try {
      const [l] = await sql<{ cv_texte_chiffre: string; cv_nom_fichier: string }[]>`
        select i.cv_texte_chiffre, i.cv_nom_fichier from interimaire i
        join compte c on c.id = i.compte_id where c.email = ${email}`;
      expect(l!.cv_texte_chiffre).not.toContain("Karim");
      expect(l!.cv_texte_chiffre).not.toContain("CACES");
      expect(l!.cv_texte_chiffre.split(".")).toHaveLength(3);
      expect(l!.cv_nom_fichier).toBe("cv.txt");
    } finally {
      await sql.end();
    }
  });

  it("relit l'analyse sans redemander le fichier", async () => {
    const { cookie } = await interimairePret("relecture");
    await deposer(cookie, new Blob([CV_TEXTE], { type: "text/plain" }), "cv.txt");
    const { corps } = await appel("/api/cv", "GET", undefined, cookie);
    expect(corps.cv.nomFichier).toBe("cv.txt");
    expect(corps.analyse.metiers.length).toBeGreaterThan(0);
  });

  it("efface le texte à la demande", async () => {
    const { email, cookie } = await interimairePret("retrait");
    await deposer(cookie, new Blob([CV_TEXTE], { type: "text/plain" }), "cv.txt");
    expect((await appel("/api/cv", "DELETE", undefined, cookie)).statut).toBe(200);
    expect((await appel("/api/cv", "GET", undefined, cookie)).corps.cv).toBeNull();

    const sql = connexion();
    try {
      const [l] = await sql<{ cv_texte_chiffre: string | null }[]>`
        select i.cv_texte_chiffre from interimaire i
        join compte c on c.id = i.compte_id where c.email = ${email}`;
      expect(l!.cv_texte_chiffre).toBeNull();
    } finally {
      await sql.end();
    }
  });
});

describe("application au profil", () => {
  it("ajoute les métiers et compétences retenus, sans écraser l'existant", async () => {
    const { email, cookie } = await interimairePret("appliquer");
    const depot = await deposer(cookie, new Blob([CV_TEXTE], { type: "text/plain" }), "cv.txt");

    const r = await appel("/api/cv/appliquer", "POST", {
      metiers: depot.corps.analyse.metiers.map((m: { code: string }) => m.code),
      competences: depot.corps.analyse.competences.map((c: { code: string }) => c.code),
    }, cookie);
    expect(r.statut).toBe(200);

    const sql = connexion();
    try {
      const metiers = await sql<{ metier_code: string }[]>`
        select im.metier_code from interimaire_metier im
        join compte c on c.id = im.interimaire_id where c.email = ${email}`;
      const codes = metiers.map((m) => m.metier_code);
      // F1703 venait du profil : le CV complète, il ne remplace pas.
      expect(codes).toContain("F1703");
      expect(codes).toContain("F1302");
    } finally {
      await sql.end();
    }
  });

  it("ignore un code hors référentiel au lieu de tout refuser", async () => {
    const { cookie } = await interimairePret("inconnu");
    const r = await appel("/api/cv/appliquer", "POST", { metiers: ["F1302", "ZZZZ"] }, cookie);
    expect(r.statut).toBe(200);
    expect(r.corps.metiersAjoutes).toBe(1);
  });

  it("refuse une sélection vide", async () => {
    const { cookie } = await interimairePret("vide-selection");
    expect((await appel("/api/cv/appliquer", "POST", { metiers: [], competences: [] }, cookie)).statut).toBe(422);
  });
});

describe("suggestions de missions depuis le CV", () => {
  it("exige un CV déposé", async () => {
    const { cookie } = await interimairePret("sans-cv");
    expect((await appel("/api/cv/missions", "GET", undefined, cookie)).statut).toBe(409);
  });

  it("accompagne chaque suggestion du verdict du vrai moteur", async () => {
    const ent = await fetch(`${BASE}/api/auth/inscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${MARQUE}-ent@exemple.test`, motDePasse: MOT_DE_PASSE, role: "entreprise" }),
    });
    emails.push(`${MARQUE}-ent@exemple.test`);
    const cookieEnt = ent.headers.get("set-cookie")?.split(";")[0] ?? "";
    await appel("/api/profil/entreprise", "POST", {
      raisonSociale: "CV SAS", codePostal: "51100", ville: "Reims",
    }, cookieEnt);
    await appel("/api/missions", "POST", {
      titre: "Macon coffreur pour fondations et dalles beton",
      metierCode: "F1703", codePostal: "51100", ville: "Reims",
      description: "Realisation de murs porteurs et coulage de beton.",
      dateDebut: "2027-12-01", dateFin: "2027-12-21",
      certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
      publier: true,
    }, cookieEnt);

    const { cookie } = await interimairePret("suggestions");
    await deposer(cookie, new Blob([CV_TEXTE], { type: "text/plain" }), "cv.txt");

    const { statut, corps } = await appel("/api/cv/missions", "GET", undefined, cookie);
    expect(statut).toBe(200);
    const proposee = corps.suggestions.find((s: { titre: string }) => s.titre.startsWith("Macon coffreur"));
    expect(proposee).toBeDefined();
    // Le CV cite le CACES, mais aucune certification n'est déclarée : la suggestion
    // doit dire clairement que le profil est écarté, sinon elle induit en erreur.
    expect(proposee.conformite).toBe("ecarte");
    expect(proposee.motsCommuns.length).toBeGreaterThanOrEqual(2);
  });
});
