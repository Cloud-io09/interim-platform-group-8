import { afterAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

/** Chaque exécution utilise ses propres adresses, pour ne jamais dépendre d'un état antérieur. */
const MARQUE = `test-${Date.now()}`;
const adresse = (suffixe: string) => `${MARQUE}-${suffixe}@exemple.test`;
const MOT_DE_PASSE = "chantier-de-reims-2026";

const creees: string[] = [];
/** Jetons ouverts par la suite, fermés à la fin : sinon ils vivent 7 jours. */
const cookiesOuverts: string[] = [];

async function poster(chemin: string, corps: unknown, cookie?: string) {
  const reponse = await fetch(`${BASE}${chemin}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(corps),
  });
  return { reponse, corps: await reponse.json(), cookie: reponse.headers.get("set-cookie") };
}

function jetonDuCookie(entete: string | null): string {
  return entete?.split(";")[0] ?? "";
}

async function inscrire(suffixe: string, role: "entreprise" | "interimaire") {
  const email = adresse(suffixe);
  creees.push(email);
  return { email, ...(await poster("/api/auth/inscription", { email, motDePasse: MOT_DE_PASSE, role })) };
}

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

describe("parcours d'inscription", () => {
  it("crée un compte intérimaire et ouvre une session", async () => {
    const { reponse, corps, cookie } = await inscrire("interimaire", "interimaire");
    expect(reponse.status).toBe(201);
    expect(corps.compte.role).toBe("interimaire");
    // Le parcours ne s'arrête pas là : le profil est l'étape 2.
    expect(corps.etapeSuivante).toContain("/espace/interimaire/profil");
    expect(cookie).toContain("interimatch_session=");
  });

  it("dirige l'entreprise vers son propre formulaire de profil", async () => {
    const { corps } = await inscrire("entreprise", "entreprise");
    expect(corps.compte.role).toBe("entreprise");
    expect(corps.etapeSuivante).toContain("/espace/entreprise/profil");
  });

  it("pose un cookie de session inaccessible au JavaScript de la page", async () => {
    const { cookie } = await inscrire("cookie", "interimaire");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("refuse un mot de passe trop court en désignant le champ fautif", async () => {
    const { reponse, corps } = await poster("/api/auth/inscription", {
      email: adresse("court"),
      // Satisfait une règle classique majuscule + chiffre + spécial, et reste trop court.
      motDePasse: "Chantier1!",
      role: "interimaire",
    });
    expect(reponse.status).toBe(422);
    expect(corps.problemes.map((p: { champ: string }) => p.champ)).toContain("motDePasse");
  });

  it("refuse une adresse déjà utilisée", async () => {
    const email = adresse("doublon");
    creees.push(email);
    await poster("/api/auth/inscription", { email, motDePasse: MOT_DE_PASSE, role: "interimaire" });
    const { reponse } = await poster("/api/auth/inscription", {
      email,
      motDePasse: MOT_DE_PASSE,
      role: "entreprise",
    });
    expect(reponse.status).toBe(409);
  });

  it("refuse un rôle inventé", async () => {
    const { reponse, corps } = await poster("/api/auth/inscription", {
      email: adresse("role"),
      motDePasse: MOT_DE_PASSE,
      role: "administrateur",
    });
    expect(reponse.status).toBe(422);
    expect(corps.problemes.map((p: { champ: string }) => p.champ)).toContain("role");
  });

  it("remonte tous les problèmes d'un coup plutôt qu'un par un", async () => {
    const { corps } = await poster("/api/auth/inscription", {
      email: "pas-un-email",
      motDePasse: "court",
      role: "pirate",
    });
    expect(corps.problemes).toHaveLength(3);
  });
});

describe("parcours de connexion", () => {
  it("connecte avec les bons identifiants et donne accès à la session", async () => {
    const { email } = await inscrire("connexion", "interimaire");

    const { reponse, cookie } = await poster("/api/auth/connexion", { email, motDePasse: MOT_DE_PASSE });
    expect(reponse.status).toBe(200);

    const moi = await fetch(`${BASE}/api/moi`, { headers: { cookie: jetonDuCookie(cookie) } });
    expect(moi.status).toBe(200);
    expect((await moi.json()).compte.email).toBe(email);
  });

  it("refuse un mauvais mot de passe", async () => {
    const { email } = await inscrire("mauvais", "interimaire");
    const { reponse } = await poster("/api/auth/connexion", { email, motDePasse: "pas-le-bon-du-tout" });
    expect(reponse.status).toBe(401);
  });

  it("donne le même message pour une adresse inconnue que pour un mauvais mot de passe", async () => {
    // Un message différent confirmerait quelles adresses ont un compte.
    const { email } = await inscrire("identique", "interimaire");
    const connu = await poster("/api/auth/connexion", { email, motDePasse: "faux" });
    const inconnu = await poster("/api/auth/connexion", {
      email: adresse("jamais-cree"),
      motDePasse: "faux",
    });
    expect(connu.reponse.status).toBe(inconnu.reponse.status);
    expect(connu.corps.message).toBe(inconnu.corps.message);
  });

  it("ferme la session côté serveur à la déconnexion", async () => {
    const { email } = await inscrire("deconnexion", "interimaire");
    const { cookie } = await poster("/api/auth/connexion", { email, motDePasse: MOT_DE_PASSE });
    const entete = jetonDuCookie(cookie);

    expect((await fetch(`${BASE}/api/moi`, { headers: { cookie: entete } })).status).toBe(200);
    await poster("/api/auth/deconnexion", {}, entete);
    // Le jeton est détruit dans Redis : même recopié, il ne vaut plus rien.
    expect((await fetch(`${BASE}/api/moi`, { headers: { cookie: entete } })).status).toBe(401);
  });

  it("refuse un jeton de session inventé", async () => {
    const moi = await fetch(`${BASE}/api/moi`, {
      headers: { cookie: "interimatch_session=jeton-completement-invente" },
    });
    expect(moi.status).toBe(401);
  });

  it("bloque après trop de tentatives, avec un délai annoncé", async () => {
    const { email } = await inscrire("limite", "interimaire");
    let bloquee: Response | null = null;
    for (let i = 0; i < 15; i++) {
      const { reponse } = await poster("/api/auth/connexion", { email, motDePasse: "faux" });
      if (reponse.status === 429) {
        bloquee = reponse;
        break;
      }
    }
    expect(bloquee, "aucun blocage après 15 tentatives").not.toBeNull();
    expect(Number(bloquee!.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
