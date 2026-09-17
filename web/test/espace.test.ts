import { afterAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

const MARQUE = `espace-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";
const emails: string[] = [];
/** Jetons ouverts par la suite, fermés à la fin : sinon ils vivent 7 jours. */
const cookiesOuverts: string[] = [];

async function appel(chemin: string, methode: string, corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : null };
}

async function inscrire(suffixe: string, role: "entreprise" | "interimaire") {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  emails.push(email);
  const r = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role }),
  });
  return { email, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

async function connecter(email: string) {
  const r = await fetch(`${BASE}/api/auth/connexion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE }),
  });
  return r.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const PROFIL = {
  prenom: "Relu",
  nom: "Depuisbase",
  telephone: "0611223344",
  adresse: "25 rue de Vesle",
  codePostal: "51100",
  ville: "Reims",
  rayonMobiliteKm: 75,
  carteBtpNumero: "BTP-2026-991",
  carteBtpEcheance: "2029-06-30",
  metiers: ["F1302"],
};

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

describe("isolation entre comptes", () => {
  it("invalide la session précédente quand on se connecte avec un autre compte", async () => {
    // Sur un poste partagé — tablette de chantier, ordinateur d'agence — laisser la
    // session précédente vivante la rend utilisable par le suivant.
    const premier = await inscrire("premier", "interimaire");
    const second = await inscrire("second", "entreprise");

    const cookiePremier = await connecter(premier.email);
    expect((await appel("/api/moi", "GET", undefined, cookiePremier)).statut).toBe(200);

    // Le second se connecte depuis le même navigateur : le cookie est remplacé.
    const cookieSecond = await fetch(`${BASE}/api/auth/connexion`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookiePremier },
      body: JSON.stringify({ email: second.email, motDePasse: MOT_DE_PASSE }),
    }).then((r) => r.headers.get("set-cookie")?.split(";")[0] ?? "");

    // L'ancien jeton, s'il avait été recopié, ne doit plus rien valoir.
    expect((await appel("/api/moi", "GET", undefined, cookiePremier)).statut).toBe(401);
    const moi = await appel("/api/moi", "GET", undefined, cookieSecond);
    expect(moi.corps.compte.email).toBe(second.email);
    expect(moi.corps.compte.role).toBe("entreprise");
  });

  it("ne laisse jamais deux rôles actifs sur le même cookie", async () => {
    const ent = await inscrire("melange-ent", "entreprise");
    const int = await inscrire("melange-int", "interimaire");
    const c1 = await connecter(ent.email);
    const c2 = await connecter(int.email);

    expect((await appel("/api/missions", "GET", undefined, c2)).statut).toBe(403);
    expect((await appel("/api/certifications", "GET", undefined, c1)).statut).toBe(403);
  });
});

describe("relecture des profils", () => {
  it("rend le profil intérimaire enregistré, champs chiffrés déchiffrés", async () => {
    const { cookie } = await inscrire("relecture-int", "interimaire");
    expect((await appel("/api/profil/interimaire", "POST", PROFIL, cookie)).statut).toBe(200);

    const { corps } = await appel("/api/profil/interimaire", "GET", undefined, cookie);
    // Sans cette relecture, revenir sur son profil affichait des champs vides.
    expect(corps.profil).toMatchObject({
      prenom: "Relu",
      nom: "Depuisbase",
      ville: "Reims",
      codePostal: "51100",
      rayonMobiliteKm: 75,
      telephone: "0611223344",
      adresse: "25 rue de Vesle",
      carteBtpNumero: "BTP-2026-991",
      carteBtpEcheance: "2029-06-30",
    });
    expect(corps.profil.metiers).toEqual(["F1302"]);
  });

  it("rend le profil entreprise enregistré", async () => {
    const { cookie } = await inscrire("relecture-ent", "entreprise");
    const profil = {
      raisonSociale: "Relecture SAS",
      siret: "44306184100005",
      adresse: "25 rue de Vesle",
      codePostal: "51100",
      ville: "Reims",
      telephone: "0399887766",
    };
    await appel("/api/profil/entreprise", "POST", profil, cookie);

    const { corps } = await appel("/api/profil/entreprise", "GET", undefined, cookie);
    expect(corps.profil).toMatchObject({
      raisonSociale: "Relecture SAS",
      siret: "44306184100005",
      ville: "Reims",
      telephone: "0399887766",
    });
  });

  it("rend un profil nul tant que rien n'a été enregistré", async () => {
    const { cookie } = await inscrire("vide", "interimaire");
    const { corps } = await appel("/api/profil/interimaire", "GET", undefined, cookie);
    expect(corps.profil).toBeNull();
  });

  it("refuse la relecture à l'autre rôle", async () => {
    const { cookie } = await inscrire("croise", "entreprise");
    expect((await appel("/api/profil/interimaire", "GET", undefined, cookie)).statut).toBe(403);
  });
});

describe("disponibilités", () => {
  it("enregistre, relit et supprime une période", async () => {
    const { cookie } = await inscrire("dispo", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, cookie);

    const creee = await appel("/api/disponibilites", "POST", { dateDebut: "2027-05-01", dateFin: "2027-06-30" }, cookie);
    expect(creee.statut).toBe(201);

    const lues = await appel("/api/disponibilites", "GET", undefined, cookie);
    expect(lues.corps.disponibilites).toHaveLength(1);
    expect(lues.corps.disponibilites[0]).toMatchObject({ dateDebut: "2027-05-01", dateFin: "2027-06-30" });

    expect((await appel(`/api/disponibilites/${creee.corps.id}`, "DELETE", undefined, cookie)).statut).toBe(200);
    expect((await appel("/api/disponibilites", "GET", undefined, cookie)).corps.disponibilites).toHaveLength(0);
  });

  it("refuse une période incohérente ou démesurée", async () => {
    const { cookie } = await inscrire("dispo-invalide", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, cookie);

    expect((await appel("/api/disponibilites", "POST", { dateDebut: "2027-06-30", dateFin: "2027-05-01" }, cookie)).statut).toBe(422);
    expect((await appel("/api/disponibilites", "POST", { dateDebut: "2027-01-01", dateFin: "2031-01-01" }, cookie)).statut).toBe(422);
    expect((await appel("/api/disponibilites", "POST", { dateDebut: "pas-une-date", dateFin: "2027-05-01" }, cookie)).statut).toBe(422);
  });

  it("empêche de supprimer la période d'un autre", async () => {
    const a = await inscrire("dispo-a", "interimaire");
    const b = await inscrire("dispo-b", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, a.cookie);
    await appel("/api/profil/interimaire", "POST", PROFIL, b.cookie);
    const creee = await appel("/api/disponibilites", "POST", { dateDebut: "2027-05-01", dateFin: "2027-05-30" }, a.cookie);
    expect((await appel(`/api/disponibilites/${creee.corps.id}`, "DELETE", undefined, b.cookie)).statut).toBe(404);
  });
});

describe("portée des missions vues par l'intérimaire", () => {
  it("distingue les missions de ses métiers et toutes les missions ouvertes", async () => {
    const ent = await inscrire("portee-ent", "entreprise");
    await appel("/api/profil/entreprise", "POST", {
      raisonSociale: "Portée SAS", codePostal: "51100", ville: "Reims",
    }, ent.cookie);
    // F1601 : un métier du second œuvre, que notre intérimaire ne déclare pas.
    await appel("/api/missions", "POST", {
      titre: "Chantier hors métier", metierCode: "F1601",
      codePostal: "51100", ville: "Reims",
      dateDebut: "2027-08-01", dateFin: "2027-08-21", publier: true,
    }, ent.cookie);

    const int = await inscrire("portee-int", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);

    const restreint = await appel("/api/interimaire/missions", "GET", undefined, int.cookie);
    expect(restreint.corps.portee).toBe("mes-metiers");
    expect(restreint.corps.horsMetier).toHaveLength(0);

    const large = await appel("/api/interimaire/missions?portee=toutes", "GET", undefined, int.cookie);
    expect(large.corps.portee).toBe("toutes");
    // Une mission hors de ses métiers reste consultable : lui cacher l'offre
    // reviendrait à décider à sa place.
    expect(large.corps.horsMetier.some((m: { titre: string }) => m.titre === "Chantier hors métier")).toBe(true);
  });
});

describe("consultation d'une mission par l'intérimaire", () => {
  it("rend la mission consultable et dit ce qui manque, habilitation par habilitation", async () => {
    const ent = await inscrire("detail-ent", "entreprise");
    await appel("/api/profil/entreprise", "POST", {
      raisonSociale: "Détail SAS", codePostal: "51100", ville: "Reims",
    }, ent.cookie);
    const creee = await appel("/api/missions", "POST", {
      titre: "Mission consultable", metierCode: "F1302",
      codePostal: "51100", ville: "Reims",
      dateDebut: "2027-09-01", dateFin: "2027-09-21",
      certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
      publier: true,
    }, ent.cookie);

    const int = await inscrire("detail-int", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);

    const r = await fetch(`${BASE}/mes-missions/${creee.corps.id}`, { headers: { cookie: int.cookie } });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Mission consultable");
    // Sans certification, l'écran doit le dire explicitement plutôt que d'afficher
    // un simple refus.
    expect(html).toContain("Manquante");
  });

  it("ne rend pas consultable une mission en brouillon", async () => {
    const ent = await inscrire("brouillon-ent", "entreprise");
    await appel("/api/profil/entreprise", "POST", {
      raisonSociale: "Brouillon SAS", codePostal: "51100", ville: "Reims",
    }, ent.cookie);
    const creee = await appel("/api/missions", "POST", {
      titre: "Pas encore publiée", metierCode: "F1302",
      codePostal: "51100", ville: "Reims",
      dateDebut: "2027-09-01", dateFin: "2027-09-21", publier: false,
    }, ent.cookie);

    const int = await inscrire("brouillon-int", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);
    const r = await fetch(`${BASE}/mes-missions/${creee.corps.id}`, { headers: { cookie: int.cookie } });
    expect(r.status).toBe(404);
  });

  it("met en avant le blocage le plus grave, et lui seul", async () => {
    // Le tableau de bord n'expose qu'une chose à traiter : empiler les
    // avertissements revient à n'en signaler aucun. L'ordre compte donc.
    const { cookie } = await inscrire("urgence", "interimaire");

    // Sans profil, c'est le profil qu'il faut signaler — pas les certifications.
    const sansProfil = await (await fetch(`${BASE}/espace/interimaire`, { headers: { cookie } })).text();
    expect(sansProfil).toContain("Renseignez votre profil");
    expect(sansProfil).not.toContain("aucune certification");

    // Profil renseigné : le blocage suivant est l'absence d'habilitation, parce
    // qu'aucune mission qui en exige une ne peut être ouverte sans elle.
    await appel("/api/profil/interimaire", "POST", PROFIL, cookie);
    const avecProfil = await (await fetch(`${BASE}/espace/interimaire`, { headers: { cookie } })).text();
    expect(avecProfil).toContain("aucune certification");
    expect(avecProfil).not.toContain("Renseignez votre profil");
  });
});
