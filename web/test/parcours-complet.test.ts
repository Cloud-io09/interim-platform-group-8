import { afterAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

/**
 * Parcours complet, de l'inscription au matching.
 *
 * Écrit pour chercher les impasses : à chaque étape, on vérifie aussi ce qui se
 * passe quand on arrive trop tôt, avec le mauvais rôle, ou avec des données limites.
 * Le chemin heureux seul ne prouve pas grand-chose.
 */

const MARQUE = `e2e-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";
const emails: string[] = [];

/** Mission calibrée pour que les cas limites d'échéance soient démontrables. */
const MISSION_DEBUT = "2027-03-01";
const MISSION_FIN = "2027-03-21";

async function appel(chemin: string, methode: string, corps?: unknown, cookie?: string) {
  const reponse = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const texte = await reponse.text();
  let corpsJson: any = null;
  try {
    corpsJson = texte ? JSON.parse(texte) : null;
  } catch {
    corpsJson = { brut: texte.slice(0, 200) };
  }
  return { statut: reponse.status, corps: corpsJson };
}

async function inscrire(suffixe: string, role: "entreprise" | "interimaire") {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  emails.push(email);
  const reponse = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role }),
  });
  const corps = await reponse.json();
  return { email, cookie: reponse.headers.get("set-cookie")?.split(";")[0] ?? "", corps };
}

const PROFIL_ENTREPRISE = {
  raisonSociale: "Terrassement Champagne SAS",
  siret: "44306184100005",
  adresse: "25 rue de Vesle",
  codePostal: "51100",
  ville: "Reims",
};

const profilInterimaire = (surcharge: Record<string, unknown> = {}) => ({
  prenom: "Test",
  nom: "Parcours",
  telephone: "0611223344",
  adresse: "25 rue de Vesle",
  codePostal: "51100",
  ville: "Reims",
  rayonMobiliteKm: 50,
  metiers: ["F1302"],
  ...surcharge,
});

const certification = (echeance: string, categorie = "B1") => ({
  typeCode: "CACES_R482",
  categorieCode: categorie,
  organismeEmetteur: "AFPA Grand Est",
  numero: `R482-${Math.random().toString(36).slice(2, 10)}`,
  dateObtention: "2024-01-15",
  dateEcheance: echeance,
});

const mission = (surcharge: Record<string, unknown> = {}) => ({
  titre: "Conducteur de pelle — parcours de test",
  metierCode: "F1302",
  codePostal: "51100",
  ville: "Reims",
  adresse: "25 rue de Vesle",
  dateDebut: MISSION_DEBUT,
  dateFin: MISSION_FIN,
  tauxHoraireMin: 14,
  tauxHoraireMax: 16,
  certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
  publier: true,
  ...surcharge,
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

describe("parcours entreprise, de l'inscription à la mission", () => {
  it("déroule inscription → profil → mission publiée", async () => {
    const { cookie, corps } = await inscrire("ent-nominal", "entreprise");
    expect(corps.etapeSuivante).toContain("/espace/entreprise/profil");

    // Impasse à vérifier : publier avant d'avoir un profil doit être refusé
    // explicitement, pas planter sur une violation de clé étrangère.
    const tropTot = await appel("/api/missions", "POST", mission(), cookie);
    expect(tropTot.statut).toBe(409);
    expect(tropTot.corps.problemes[0].champ).toBe("profil");

    expect((await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, cookie)).statut).toBe(200);

    const creation = await appel("/api/missions", "POST", mission(), cookie);
    expect(creation.statut).toBe(201);
    expect(creation.corps.statut).toBe("publiee");

    const liste = await appel("/api/missions", "GET", undefined, cookie);
    expect(liste.corps.missions).toHaveLength(1);
    expect(liste.corps.missions[0].nbCertificationsRequises).toBe(1);
  });

  it("enregistre un brouillon quand on ne publie pas", async () => {
    const { cookie } = await inscrire("ent-brouillon", "entreprise");
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, cookie);
    const r = await appel("/api/missions", "POST", mission({ publier: false }), cookie);
    expect(r.corps.statut).toBe("brouillon");
  });

  it("refuse une mission sans date de fin, sans métier, ou trop longue", async () => {
    const { cookie } = await inscrire("ent-invalide", "entreprise");
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, cookie);

    for (const [cas, charge] of [
      ["sans date de fin", mission({ dateFin: undefined })],
      ["sans métier", mission({ metierCode: undefined })],
      ["au-delà de 18 mois", mission({ dateFin: "2029-03-21" })],
      ["fin avant début", mission({ dateFin: "2027-02-01" })],
      ["métier inexistant", mission({ metierCode: "Z9999" })],
      ["catégorie manquante", mission({ certificationsRequises: [{ typeCode: "CACES_R482" }] })],
      ["exigence en double", mission({ certificationsRequises: [{ typeCode: "AIPR" }, { typeCode: "AIPR" }] })],
    ] as const) {
      const r = await appel("/api/missions", "POST", charge, cookie);
      expect(r.statut, cas).toBe(422);
    }
  });

  it("ne laisse pas une entreprise voir les missions d'une autre", async () => {
    const a = await inscrire("ent-a", "entreprise");
    const b = await inscrire("ent-b", "entreprise");
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, a.cookie);
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, b.cookie);
    const creee = await appel("/api/missions", "POST", mission(), a.cookie);

    expect((await appel("/api/missions", "GET", undefined, b.cookie)).corps.missions).toHaveLength(0);
    const matchingVole = await appel(`/api/missions/${creee.corps.id}/matching`, "GET", undefined, b.cookie);
    expect(matchingVole.statut).toBe(403);
  });
});

describe("parcours intérimaire", () => {
  it("refuse une certification avant que le profil existe", async () => {
    const { cookie } = await inscrire("int-tropTot", "interimaire");
    // Impasse : sans cette réponse claire, l'utilisateur reçoit une erreur de base.
    const r = await appel("/api/certifications", "POST", certification("2034-01-15"), cookie);
    expect(r.statut).toBe(409);
    expect(r.corps.problemes[0].champ).toBe("profil");
  });

  it("déroule inscription → profil → certification → relecture", async () => {
    const { cookie, corps } = await inscrire("int-nominal", "interimaire");
    expect(corps.etapeSuivante).toContain("/espace/interimaire/profil");

    expect((await appel("/api/profil/interimaire", "POST", profilInterimaire(), cookie)).statut).toBe(200);
    expect((await appel("/api/certifications", "POST", certification("2034-01-15"), cookie)).statut).toBe(201);

    const lues = await appel("/api/certifications", "GET", undefined, cookie);
    expect(lues.corps.certifications).toHaveLength(1);
    expect(lues.corps.certifications[0].categorieCode).toBe("B1");
  });
});

describe("le matching, de bout en bout", () => {
  it("retient un profil conforme et écarte les trois cas d'exclusion", async () => {
    const ent = await inscrire("match-ent", "entreprise");
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, ent.cookie);
    const creee = await appel("/api/missions", "POST", mission(), ent.cookie);
    const missionId = creee.corps.id;

    // Quatre profils, chacun pour une règle.
    const conforme = await inscrire("match-conforme", "interimaire");
    await appel("/api/profil/interimaire", "POST", profilInterimaire({ prenom: "Conforme" }), conforme.cookie);
    await appel("/api/certifications", "POST", certification("2034-01-15"), conforme.cookie);

    const expirant = await inscrire("match-expirant", "interimaire");
    await appel("/api/profil/interimaire", "POST", profilInterimaire({ prenom: "Expirant" }), expirant.cookie);
    // Valide au premier jour, périmée avant la fin : la règle centrale du produit.
    await appel("/api/certifications", "POST", certification("2027-03-10"), expirant.cookie);

    const pile = await inscrire("match-pile", "interimaire");
    await appel("/api/profil/interimaire", "POST", profilInterimaire({ prenom: "Pile" }), pile.cookie);
    await appel("/api/certifications", "POST", certification(MISSION_FIN), pile.cookie);

    const sans = await inscrire("match-sans", "interimaire");
    await appel("/api/profil/interimaire", "POST", profilInterimaire({ prenom: "Sans" }), sans.cookie);

    const r = await appel(`/api/missions/${missionId}/matching?recalculer=1`, "GET", undefined, ent.cookie);
    expect(r.statut).toBe(200);

    const prenoms = (liste: any[]) => liste.map((x) => x.prenom);
    expect(prenoms(r.corps.retenus)).toContain("Conforme");
    // Échéance au dernier jour exact : la borne est incluse.
    expect(prenoms(r.corps.retenus)).toContain("Pile");
    expect(prenoms(r.corps.ecartes)).toContain("Expirant");
    expect(prenoms(r.corps.ecartes)).toContain("Sans");

    const exclu = r.corps.ecartes.find((e: any) => e.prenom === "Expirant");
    expect(exclu.motif).toBe("certification_expiree");
    expect(exclu.explication).toContain("2027-03-10");

    const absent = r.corps.ecartes.find((e: any) => e.prenom === "Sans");
    expect(absent.motif).toBe("certification_absente");

    // Le score est exposé par critère, pas seulement en total.
    const gagnant = r.corps.retenus.find((x: any) => x.prenom === "Conforme");
    expect(gagnant).toHaveProperty("competences");
    expect(gagnant).toHaveProperty("distance");
    expect(gagnant).toHaveProperty("disponibilite");
    expect(gagnant.detail.distanceKm).toBeTypeOf("number");
  });

  it("sert le cache au second appel, et le recalcule sur demande", async () => {
    const ent = await inscrire("cache-ent", "entreprise");
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, ent.cookie);
    const creee = await appel("/api/missions", "POST", mission(), ent.cookie);
    const id = creee.corps.id;

    expect((await appel(`/api/missions/${id}/matching`, "GET", undefined, ent.cookie)).corps.depuisCache).toBe(false);
    expect((await appel(`/api/missions/${id}/matching`, "GET", undefined, ent.cookie)).corps.depuisCache).toBe(true);
    expect((await appel(`/api/missions/${id}/matching?recalculer=1`, "GET", undefined, ent.cookie)).corps.depuisCache).toBe(false);
  });

  it("laisse une trace exploitable, qui conserve la date de comparaison", async () => {
    const ent = await inscrire("trace-ent", "entreprise");
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, ent.cookie);
    const creee = await appel("/api/missions", "POST", mission(), ent.cookie);
    await appel(`/api/missions/${creee.corps.id}/matching?recalculer=1`, "GET", undefined, ent.cookie);

    const brut = await redis().get(cle.traceMatching(creee.corps.id));
    const trace = typeof brut === "string" ? JSON.parse(brut) : (brut as any);
    // C'est ce champ qui permet de répondre « contre quelle date a-t-on comparé ? ».
    expect(trace.dateFinComparee).toBe(MISSION_FIN);
    expect(trace).toHaveProperty("evalues");
  });

  it("répond 404 sur une mission inexistante et 400 sur un identifiant absurde", async () => {
    const { cookie } = await inscrire("bornes-ent", "entreprise");
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, cookie);
    expect((await appel("/api/missions/99999999/matching", "GET", undefined, cookie)).statut).toBe(404);
    expect((await appel("/api/missions/pas-un-nombre/matching", "GET", undefined, cookie)).statut).toBe(400);
  });
});

describe("robustesse des entrées", () => {
  it("ne plante pas sur un corps vide, absent ou malformé", async () => {
    const { cookie } = await inscrire("robuste", "entreprise");
    await appel("/api/profil/entreprise", "POST", PROFIL_ENTREPRISE, cookie);

    // Chaque cas attend un verdict précis : une assertion qui accepte deux issues
    // ne prouverait rien.
    expect((await appel("/api/missions", "POST", {}, cookie)).statut, "objet vide").toBe(422);
    expect(
      (await appel("/api/missions", "POST", { ...mission(), certificationsRequises: "CACES" }, cookie)).statut,
      "exigences non tableau"
    ).toBe(422);
    expect(
      (await appel("/api/missions", "POST", { ...mission(), certificationsRequises: null, competencesRequises: null }, cookie)).statut,
      "listes nulles"
    ).toBe(201);

    // Une compétence hors référentiel est ignorée, pas bloquante : le référentiel
    // se remplit au fil des ingestions, et une mission ne doit pas en dépendre.
    const avecInconnue = await appel(
      "/api/missions",
      "POST",
      { ...mission(), competencesRequises: ["999999-inexistante"] },
      cookie
    );
    expect(avecInconnue.statut, "compétence inconnue").toBe(201);

    const sql = connexion();
    try {
      const liens = await sql`select 1 from mission_competence where mission_id = ${avecInconnue.corps.id}`;
      expect(liens, "la compétence inconnue ne doit pas être enregistrée").toHaveLength(0);
    } finally {
      await sql.end();
    }

    const brut = await fetch(`${BASE}/api/missions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: "{ceci n'est pas du json",
    });
    expect(brut.status).toBe(400);
  });

  it("refuse toute route protégée sans session, sans exception", async () => {
    const routes: [string, string][] = [
      ["/api/missions", "GET"],
      ["/api/missions", "POST"],
      ["/api/missions/1/matching", "GET"],
      ["/api/certifications", "GET"],
      ["/api/certifications", "POST"],
      ["/api/profil/interimaire", "POST"],
      ["/api/profil/entreprise", "POST"],
      ["/api/moi", "GET"],
    ];
    for (const [chemin, methode] of routes) {
      const r = await appel(chemin, methode, methode === "POST" ? {} : undefined);
      expect(r.statut, `${methode} ${chemin}`).toBe(401);
    }
  });
});
