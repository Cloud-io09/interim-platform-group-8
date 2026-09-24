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

describe("candidatures — le rapprochement est bilatéral", () => {
  /** Intérimaire conforme à la mission d'essai, avec son identifiant de compte. */
  async function interimaireConforme(marque: string, avecCaces = true) {
    const int = await inscrire(marque, "interimaire");
    await appel("/api/profil/interimaire", "POST", PROFIL, int.cookie);
    if (avecCaces) {
      await appel("/api/certifications", "POST", {
        typeCode: "CACES_R482", categorieCode: "B1", organismeEmetteur: "AFPA",
        numero: `C-${Date.now()}-${marque}`, dateObtention: "2024-01-15", dateEcheance: "2034-01-15",
      }, int.cookie);
    }
    const id = (await appel("/api/moi", "GET", undefined, int.cookie)).corps.compte.id;
    return { ...int, id };
  }

  it("laisse l'intérimaire postuler, et l'entreprise conclure", async () => {
    const ent = await entrepriseAvecMission("bi-ent");
    const int = await interimaireConforme("bi-int");

    const postule = await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, vers: "candidatee",
    }, int.cookie);
    expect(postule.statut).toBe(200);
    expect(postule.corps.etat).toBe("candidatee");

    const lues = await appel(`/api/missions/${ent.missionId}/candidatures`, "GET", undefined, ent.cookie);
    expect(lues.corps.candidatures[0]).toMatchObject({ interimaireId: int.id, statut: "candidatee" });

    const retenu = await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, interimaireId: int.id, vers: "acceptee",
    }, ent.cookie);
    expect(retenu.statut).toBe(200);
    expect(retenu.corps.missionPourvue).toBe(true);
  });

  it("exige d'avoir débloqué le profil avant de le solliciter", async () => {
    // Solliciter envoie une notification nominative à quelqu'un dont l'entreprise
    // n'a pas encore vu le nom : c'est l'acte qu'on facture. La barrière n'existait
    // que dans la page, et masquer un bouton ne protège rien.
    const ent = await entrepriseAvecMission("bi-paywall");
    const int = await interimaireConforme("bi-paywall-int");

    const r = await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, interimaireId: int.id, vers: "sollicitee",
    }, ent.cookie);
    expect(r.statut).toBe(402);
  });

  it("laisse l'entreprise solliciter, et l'intérimaire conclure", async () => {
    const ent = await entrepriseAvecMission("bi-sol");
    const int = await interimaireConforme("bi-sol-int");

    expect((await appel("/api/deblocages", "POST", {
      interimaireId: int.id, missionId: ent.missionId,
    }, ent.cookie)).statut).toBe(200);

    expect((await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, interimaireId: int.id, vers: "sollicitee",
    }, ent.cookie)).corps.etat).toBe("sollicitee");

    expect((await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, vers: "acceptee",
    }, int.cookie)).corps.etat).toBe("acceptee");
  });

  it("interdit à une partie de conclure seule", async () => {
    // C'est ce qui distingue une mise en relation d'une affectation unilatérale :
    // postuler n'affecte pas, solliciter non plus.
    const ent = await entrepriseAvecMission("bi-seul");
    const int = await interimaireConforme("bi-seul-int");

    expect((await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, vers: "acceptee",
    }, int.cookie)).statut).toBe(409);

    expect((await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, interimaireId: int.id, vers: "acceptee",
    }, ent.cookie)).statut).toBe(409);
  });

  it("refuse une affectation non conforme, et dit laquelle des habilitations bloque", async () => {
    // La conformité est rejouée au moment d'accepter, pas seulement au matching :
    // un titre peut avoir expiré entre le rapprochement et la décision.
    const ent = await entrepriseAvecMission("bi-nc");
    const int = await interimaireConforme("bi-nc-int", false);

    await appel("/api/candidatures", "POST", { missionId: ent.missionId, vers: "candidatee" }, int.cookie);
    const r = await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, interimaireId: int.id, vers: "acceptee",
    }, ent.cookie);

    expect(r.statut).toBe(409);
    expect(r.corps.message).toMatch(/CACES|non déclarée/i);
    // Le détail est rendu habilitation par habilitation, pas en verdict global.
    expect(r.corps.conformite[0]).toMatchObject({ typeCode: "CACES_R482", etat: "absente", bloquant: true });
  });

  it("autorise en revanche à écarter un profil non conforme", async () => {
    const ent = await entrepriseAvecMission("bi-ecart");
    const int = await interimaireConforme("bi-ecart-int", false);
    const r = await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, interimaireId: int.id, vers: "declinee", motif: "Profil retenu ailleurs",
    }, ent.cookie);
    expect(r.statut).toBe(200);
  });

  it("rend les autres candidatures caduques quand la mission est pourvue", async () => {
    const ent = await entrepriseAvecMission("bi-caduc");
    const retenu = await interimaireConforme("bi-caduc-a");
    const autre = await interimaireConforme("bi-caduc-b");

    await appel("/api/candidatures", "POST", { missionId: ent.missionId, vers: "candidatee" }, autre.cookie);
    await appel("/api/candidatures", "POST", { missionId: ent.missionId, vers: "candidatee" }, retenu.cookie);
    await appel("/api/candidatures", "POST", {
      missionId: ent.missionId, interimaireId: retenu.id, vers: "acceptee",
    }, ent.cookie);

    const lues = await appel(`/api/missions/${ent.missionId}/candidatures`, "GET", undefined, ent.cookie);
    const etats = Object.fromEntries(
      lues.corps.candidatures.map((c: { interimaireId: number; statut: string }) => [c.interimaireId, c.statut])
    );
    expect(etats[retenu.id]).toBe("acceptee");
    // Laisser l'autre « en attente » d'une réponse qui ne viendra jamais serait pire
    // que de le lui dire.
    expect(etats[autre.id]).toBe("expiree");
  });

  it("refuse une action inventée, et une mission qui n'est pas la sienne", async () => {
    const a = await entrepriseAvecMission("bi-a");
    const b = await inscrire("bi-b", "entreprise");
    expect((await appel("/api/candidatures", "POST", {
      missionId: a.missionId, interimaireId: 1, vers: "embauche",
    }, a.cookie)).statut).toBe(422);
    expect((await appel("/api/candidatures", "POST", {
      missionId: a.missionId, interimaireId: 1, vers: "sollicitee",
    }, b.cookie)).statut).toBe(403);
  });
});

describe("missions actives et palier", () => {
  it("borne le palier Découverte à une fiche en ligne, brouillons exclus", async () => {
    const ent = await entrepriseAvecMission("palier-decouverte");

    const seconde = await appel("/api/missions", "POST", MISSION, ent.cookie);
    // 402 comme un contact refusé : c'est le palier qui bloque, pas la saisie.
    expect(seconde.statut).toBe(402);

    // Un brouillon ne sollicite personne : il reste permis, mais sa mise en ligne non.
    const brouillon = await appel("/api/missions", "POST", { ...MISSION, publier: false }, ent.cookie);
    expect(brouillon.statut).toBe(201);
    const miseEnLigne = await appel(`/api/missions/${brouillon.corps.id}`, "PATCH", { statut: "publiee" }, ent.cookie);
    expect(miseEnLigne.statut).toBe(402);

    // Une fiche pourvue libère sa place.
    await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "pourvue" }, ent.cookie);
    expect((await appel(`/api/missions/${brouillon.corps.id}`, "PATCH", { statut: "publiee" }, ent.cookie)).statut).toBe(200);
  });

  it("lève la borne au palier supérieur", async () => {
    const ent = await entrepriseAvecMission("palier-starter");
    await appel("/api/abonnement", "POST", { planCode: "starter" }, ent.cookie);
    expect((await appel("/api/missions", "POST", MISSION, ent.cookie)).statut).toBe(201);
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

  it("refuse de republier une mission attribuée", async () => {
    // Republiée, elle garderait son intérimaire affecté et sa candidature acceptée :
    // une fiche ouverte avec quelqu'un déjà dessus.
    const ent = await entrepriseAvecMission("statut-republie");
    await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "pourvue" }, ent.cookie);
    expect((await appel(`/api/missions/${ent.missionId}`, "PATCH", { statut: "publiee" }, ent.cookie)).statut).toBe(409);
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
