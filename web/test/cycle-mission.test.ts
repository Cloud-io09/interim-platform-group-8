import { afterAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

const MARQUE = `cycle-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";
const emails: string[] = [];

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

const MISSION = {
  titre: "Cycle de vie",
  metierCode: "F1302",
  codePostal: "51100",
  ville: "Reims",
  dateDebut: "2027-11-01",
  dateFin: "2027-11-21",
  certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
  publier: true,
};

const PROFIL = {
  prenom: "Cycle", nom: "Candidat", codePostal: "51100", ville: "Reims",
  rayonMobiliteKm: 50, metiers: ["F1302"],
};

async function entrepriseAvecMission(suffixe: string, mission = MISSION) {
  const ent = await inscrire(suffixe, "entreprise");
  await appel("/api/profil/entreprise", "POST", {
    raisonSociale: "Cycle SAS", codePostal: "51100", ville: "Reims",
  }, ent.cookie);
  const creee = await appel("/api/missions", "POST", mission, ent.cookie);
  return { ...ent, missionId: creee.corps.id as number };
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

describe("candidatures", () => {
  it("permet de retenir un profil conforme, puis de le relire", async () => {
    const ent = await entrepriseAvecMission("cand-ent");
    const int = await inscrire("cand-conforme", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);
    await appel("/api/certifications", "POST", {
      typeCode: "CACES_R482", categorieCode: "B1", organismeEmetteur: "AFPA",
      numero: `C-${Date.now()}`, dateObtention: "2024-01-15", dateEcheance: "2034-01-15",
    }, int.cookie);

    const moi = await appel("/api/moi", "GET", undefined, int.cookie);
    const id = moi.corps.compte.id;

    const retenu = await appel(`/api/missions/${ent.missionId}/candidatures`, "POST", {
      interimaireId: id, statut: "acceptee",
    }, ent.cookie);
    expect(retenu.statut).toBe(200);

    const lues = await appel(`/api/missions/${ent.missionId}/candidatures`, "GET", undefined, ent.cookie);
    expect(lues.corps.candidatures).toHaveLength(1);
    expect(lues.corps.candidatures[0]).toMatchObject({ interimaireId: id, statut: "acceptee" });
  });

  it("refuse de retenir un profil non conforme", async () => {
    const ent = await entrepriseAvecMission("cand-refus");
    const int = await inscrire("cand-sans", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);
    const id = (await appel("/api/moi", "GET", undefined, int.cookie)).corps.compte.id;

    // La conformité est revérifiée au moment de retenir, pas seulement à l'affichage :
    // une certification a pu expirer entre les deux.
    const r = await appel(`/api/missions/${ent.missionId}/candidatures`, "POST", {
      interimaireId: id, statut: "acceptee",
    }, ent.cookie);
    expect(r.statut).toBe(409);
    expect(r.corps.problemes[0].message).toMatch(/habilitation/);
  });

  it("autorise en revanche à écarter explicitement un profil non conforme", async () => {
    const ent = await entrepriseAvecMission("cand-ecart");
    const int = await inscrire("cand-ecarte", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);
    const id = (await appel("/api/moi", "GET", undefined, int.cookie)).corps.compte.id;
    expect((await appel(`/api/missions/${ent.missionId}/candidatures`, "POST", { interimaireId: id, statut: "refusee" }, ent.cookie)).statut).toBe(200);
  });

  it("refuse un statut inventé et une mission d'une autre entreprise", async () => {
    const a = await entrepriseAvecMission("cand-a");
    const b = await inscrire("cand-b", "entreprise");
    expect((await appel(`/api/missions/${a.missionId}/candidatures`, "POST", { interimaireId: 1, statut: "embauche" }, a.cookie)).statut).toBe(422);
    expect((await appel(`/api/missions/${a.missionId}/candidatures`, "GET", undefined, b.cookie)).statut).toBe(403);
  });
});

describe("cycle de vie d'une mission", () => {
  it("passe de publiée à pourvue, puis close", async () => {
    const ent = await entrepriseAvecMission("statut");
    expect((await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "pourvue" }, ent.cookie)).corps.statut).toBe("pourvue");
    expect((await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "close" }, ent.cookie)).corps.statut).toBe("close");
  });

  it("refuse de ressusciter une mission close", async () => {
    const ent = await entrepriseAvecMission("statut-close");
    await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "close" }, ent.cookie);
    // L'historique d'une affectation ne se réécrit pas.
    const r = await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "publiee" }, ent.cookie);
    expect(r.statut).toBe(409);
  });

  it("laisse republier une mission pourvue, une affectation pouvant tomber", async () => {
    const ent = await entrepriseAvecMission("statut-republie");
    await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "pourvue" }, ent.cookie);
    expect((await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "publiee" }, ent.cookie)).corps.statut).toBe("publiee");
  });

  it("retire une mission close des missions proposées à l'intérimaire", async () => {
    const ent = await entrepriseAvecMission("statut-invisible");
    const int = await inscrire("statut-int", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);

    const avant = await appel("/api/interimaire/missions", "GET", undefined, int.cookie);
    const presente = (r: { corps: { accessibles: { id: number }[]; bloquees: { id: number }[] } }) =>
      [...r.corps.accessibles, ...r.corps.bloquees].some((m) => m.id === ent.missionId);
    expect(presente(avant)).toBe(true);

    await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "close" }, ent.cookie);
    expect(presente(await appel("/api/interimaire/missions", "GET", undefined, int.cookie))).toBe(false);
  });

  it("refuse un statut inconnu et une mission qui n'est pas la sienne", async () => {
    const a = await entrepriseAvecMission("statut-a");
    const b = await inscrire("statut-b", "entreprise");
    expect((await appel(`/api/missions/${a.missionId}`, "PATCH", { statut: "archivee" }, a.cookie)).statut).toBe(422);
    expect((await appel(`/api/missions/${a.missionId}`, "PATCH", { statut: "close" }, b.cookie)).statut).toBe(403);
  });
});

describe("suppression de compte — droit à l'effacement", () => {
  it("exige le mot de passe, et le bon", async () => {
    const { cookie } = await inscrire("suppr-mdp", "interimaire");
    expect((await appel("/api/compte", "DELETE", {}, cookie)).statut).toBe(422);
    // Un cookie volé ne doit pas suffire à effacer un profil.
    expect((await appel("/api/compte", "DELETE", { motDePasse: "pas-le-bon" }, cookie)).statut).toBe(401);
  });

  it("efface le compte et tout ce qui en dépend", async () => {
    const int = await inscrire("suppr-complet", "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);
    await appel("/api/certifications", "POST", {
      typeCode: "AIPR", organismeEmetteur: "OPPBTP",
      numero: `S-${Date.now()}`, dateObtention: "2024-01-15", dateEcheance: "2029-01-15",
    }, int.cookie);
    await appel("/api/disponibilites", "POST", { dateDebut: "2027-05-01", dateFin: "2027-05-30" }, int.cookie);

    const id = (await appel("/api/moi", "GET", undefined, int.cookie)).corps.compte.id;
    expect((await appel("/api/compte", "DELETE", { motDePasse: MOT_DE_PASSE }, int.cookie)).statut).toBe(200);

    const sql = connexion();
    try {
      for (const table of ["interimaire", "certification", "disponibilite"] as const) {
        const colonne = table === "interimaire" ? "compte_id" : "interimaire_id";
        const reste = await sql.unsafe(`select 1 from ${table} where ${colonne} = $1`, [id]);
        expect(reste, `${table} devrait être vide`).toHaveLength(0);
      }
      expect(await sql`select 1 from compte where id = ${id}`).toHaveLength(0);
    } finally {
      await sql.end();
    }

    // La session est fermée dans la foulée : le cookie ne vaut plus rien.
    expect((await appel("/api/moi", "GET", undefined, int.cookie)).statut).toBe(401);
  });

  it("emporte les missions d'une entreprise supprimée", async () => {
    const ent = await entrepriseAvecMission("suppr-ent");
    expect((await appel("/api/compte", "DELETE", { motDePasse: MOT_DE_PASSE }, ent.cookie)).statut).toBe(200);

    const sql = connexion();
    try {
      expect(await sql`select 1 from mission where id = ${ent.missionId}`).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });
});
