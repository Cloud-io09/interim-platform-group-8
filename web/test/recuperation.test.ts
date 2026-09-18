import { afterAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE, journalServeur } from "./serveur";

/**
 * Parcours de récupération d'accès.
 *
 * Sans lui, un intérimaire qui oublie son mot de passe perd ses habilitations, ses
 * disponibilités et ses candidatures. Les propriétés vérifiées ici ne sont pas du
 * confort : un code rejouable vaudrait un second mot de passe permanent, et une
 * session survivant à une récupération laisserait l'intrus en place.
 */

const MARQUE = `recup-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";
const emails: string[] = [];

async function appel(chemin: string, methode: string, corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : null, entetes: r.headers };
}

async function inscrire(suffixe: string) {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  emails.push(email);
  const r = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role: "interimaire" }),
  });
  const corps = await r.json();
  return {
    email,
    cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
    codes: corps.codesRecuperation as string[],
  };
}

afterAll(async () => {
  const sql = connexion();
  try {
    await sql`delete from compte where email like ${`${MARQUE}-%`}`;
  } finally {
    await sql.end();
  }
  const cache = redis();
  await Promise.all(
    emails.flatMap((e) => [
      cache.del(cle.tentativesEmail(e)),
      cache.del(cle.demandesReinitialisation(e)),
    ])
  );
});

describe("codes de récupération remis à l'inscription", () => {
  it("remet huit codes, une seule fois", async () => {
    const { codes, cookie } = await inscrire("remise");
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);

    // Aucune route ne permet de les relire : seul leur nombre est consultable.
    const relecture = await appel("/api/compte/codes", "GET", undefined, cookie);
    expect(relecture.corps.restants).toBe(8);
    expect(JSON.stringify(relecture.corps)).not.toContain(codes[0]!.slice(0, 4));
  });

  it("ne les garde en base que sous forme d'empreinte", async () => {
    const { email, codes } = await inscrire("empreinte");
    const sql = connexion();
    try {
      const lignes = await sql<{ empreinte: string }[]>`
        select cr.empreinte from code_recuperation cr
        join compte c on c.id = cr.compte_id where c.email = ${email}`;
      for (const l of lignes) {
        expect(l.empreinte).toMatch(/^[0-9a-f]{64}$/);
        for (const code of codes) expect(l.empreinte).not.toContain(code.slice(0, 4));
      }
    } finally {
      await sql.end();
    }
  });
});

describe("reprise en main d'un compte", () => {
  it("change le mot de passe et consomme le code", async () => {
    const { email, codes } = await inscrire("reprise");
    const nouveau = "un-tout-autre-mot-de-passe-2026";

    const r = await appel("/api/auth/recuperation", "POST", { email, code: codes[0], nouveau });
    expect(r.statut).toBe(200);
    expect(r.corps.codesRestants).toBe(7);

    expect((await appel("/api/auth/connexion", "POST", { email, motDePasse: nouveau })).statut).toBe(200);
    expect((await appel("/api/auth/connexion", "POST", { email, motDePasse: MOT_DE_PASSE })).statut).toBe(401);
  });

  it("refuse un code déjà utilisé", async () => {
    // Un code rejouable vaudrait un second mot de passe permanent.
    const { email, codes } = await inscrire("rejeu");
    await appel("/api/auth/recuperation", "POST", { email, code: codes[0], nouveau: "premier-changement-2026" });
    const second = await appel("/api/auth/recuperation", "POST", {
      email, code: codes[0], nouveau: "second-changement-2026",
    });
    expect(second.statut).toBe(403);
  });

  it("ferme toutes les sessions ouvertes", async () => {
    // Quelqu'un qui récupère son compte n'est pas connecté ; quiconque l'était ne
    // doit plus l'être.
    const { email, cookie, codes } = await inscrire("sessions");
    expect((await appel("/api/moi", "GET", undefined, cookie)).statut).toBe(200);

    await appel("/api/auth/recuperation", "POST", { email, code: codes[0], nouveau: "apres-recuperation-2026" });
    expect((await appel("/api/moi", "GET", undefined, cookie)).statut).toBe(401);
  });

  it("accepte un code recopié sans tirets et en minuscules", async () => {
    const { email, codes } = await inscrire("recopie");
    const maladroit = codes[0]!.toLowerCase().replace(/-/g, " ");
    expect((await appel("/api/auth/recuperation", "POST", {
      email, code: maladroit, nouveau: "recopie-maladroite-2026",
    })).statut).toBe(200);
  });

  it("répond la même chose pour un compte inconnu et un code faux", async () => {
    // Sans cela, l'endpoint deviendrait un moyen d'énumérer les comptes inscrits.
    const { email } = await inscrire("enumeration");
    const inconnu = await appel("/api/auth/recuperation", "POST", {
      email: `${MARQUE}-jamais-inscrit@exemple.test`, code: "AAAA-BBBB-CCCC-DDDD", nouveau: "peu-importe-2026",
    });
    const mauvais = await appel("/api/auth/recuperation", "POST", {
      email, code: "AAAA-BBBB-CCCC-DDDD", nouveau: "peu-importe-2026",
    });
    expect(inconnu.statut).toBe(mauvais.statut);
    expect(inconnu.corps.message).toBe(mauvais.corps.message);
  });

  it("refuse un mot de passe trop faible même avec un code valable", async () => {
    const { email, codes } = await inscrire("faible");
    const r = await appel("/api/auth/recuperation", "POST", { email, code: codes[0], nouveau: "court" });
    expect(r.statut).toBe(422);
    // Le code ne doit pas avoir été consommé par une saisie refusée en amont.
    expect((await appel("/api/auth/recuperation", "POST", {
      email, code: codes[0], nouveau: "assez-long-cette-fois-2026",
    })).statut).toBe(200);
  });
});

describe("changement de mot de passe, connecté", () => {
  it("exige le mot de passe actuel", async () => {
    // Un cookie volé ne doit pas suffire à verrouiller le compte de son propriétaire.
    const { cookie } = await inscrire("actuel");
    const r = await appel("/api/auth/mot-de-passe", "POST", {
      ancien: "pas-le-bon-mot-de-passe", nouveau: "un-nouveau-mot-de-passe-2026",
    }, cookie);
    expect(r.statut).toBe(403);
  });

  it("change le mot de passe, ferme les autres sessions et garde la sienne", async () => {
    const { email, cookie } = await inscrire("autres");
    const autre = await appel("/api/auth/connexion", "POST", { email, motDePasse: MOT_DE_PASSE });
    const cookieAutre = autre.entetes.get("set-cookie")?.split(";")[0] ?? "";

    const r = await appel("/api/auth/mot-de-passe", "POST", {
      ancien: MOT_DE_PASSE, nouveau: "encore-un-autre-mot-de-passe-2026",
    }, cookieAutre);
    expect(r.statut).toBe(200);

    expect((await appel("/api/moi", "GET", undefined, cookieAutre)).statut).toBe(200);
    expect((await appel("/api/moi", "GET", undefined, cookie)).statut).toBe(401);
  });

  it("refuse de remplacer un mot de passe par lui-même", async () => {
    const { cookie } = await inscrire("identique");
    const r = await appel("/api/auth/mot-de-passe", "POST", {
      ancien: MOT_DE_PASSE, nouveau: MOT_DE_PASSE,
    }, cookie);
    expect(r.statut).toBe(422);
  });
});

describe("régénération des codes", () => {
  it("annule les précédents", async () => {
    // Un code recopié il y a six mois ne doit pas rester une clé.
    const { email, cookie, codes } = await inscrire("regeneration");
    const r = await appel("/api/compte/codes", "POST", { motDePasse: MOT_DE_PASSE }, cookie);
    expect(r.statut).toBe(200);
    expect(r.corps.codes).toHaveLength(8);
    expect(r.corps.codes).not.toContain(codes[0]);

    expect((await appel("/api/auth/recuperation", "POST", {
      email, code: codes[0], nouveau: "avec-un-ancien-code-2026",
    })).statut).toBe(403);
    expect((await appel("/api/auth/recuperation", "POST", {
      email, code: r.corps.codes[0], nouveau: "avec-un-nouveau-code-2026",
    })).statut).toBe(200);
  });

  it("exige le mot de passe : un cookie volé ne fabrique pas d'accès permanent", async () => {
    const { cookie } = await inscrire("sans-mdp");
    expect((await appel("/api/compte/codes", "POST", { motDePasse: "faux" }, cookie)).statut).toBe(403);
    expect((await appel("/api/compte/codes", "POST", {}, cookie)).statut).toBe(422);
  });
});

describe("réinitialisation par lien envoyé à l'adresse du compte", () => {
  /**
   * Récupère le lien depuis le journal du serveur.
   *
   * Aucun prestataire n'est configuré en test : le courriel part au journal, que le
   * harnais capture. Aucune route de production n'expose jamais le jeton — ce serait
   * un défaut de sécurité le jour où la configuration viendrait à manquer.
   */
  function jetonEnvoyeA(email: string): string | null {
    const journal = journalServeur();
    const bloc = journal.lastIndexOf(`→ ${email}`);
    if (bloc < 0) return null;
    const lien = journal.slice(bloc).match(/reinitialisation\?jeton=([A-Za-z0-9_-]+)/);
    return lien ? decodeURIComponent(lien[1]!) : null;
  }

  async function attendreJeton(email: string): Promise<string | null> {
    // L'écriture du journal est asynchrone : on laisse au flux le temps d'arriver.
    for (let i = 0; i < 20; i++) {
      const jeton = jetonEnvoyeA(email);
      if (jeton) return jeton;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  it("envoie un lien, qui change le mot de passe et ferme les sessions", async () => {
    const { email, cookie } = await inscrire("lien");
    expect((await appel("/api/auth/reinitialisation", "POST", { email })).statut).toBe(200);

    const jeton = await attendreJeton(email);
    expect(jeton, "aucun lien n'a été envoyé").toBeTruthy();

    const r = await appel("/api/auth/reinitialisation/confirmation", "POST", {
      jeton, nouveau: "mot-de-passe-par-lien-2026",
    });
    expect(r.statut).toBe(200);

    expect((await appel("/api/auth/connexion", "POST", {
      email, motDePasse: "mot-de-passe-par-lien-2026",
    })).statut).toBe(200);
    // Quiconque était connecté ne doit plus l'être.
    expect((await appel("/api/moi", "GET", undefined, cookie)).statut).toBe(401);
  });

  it("compose un lien absolu, pas un chemin relatif", async () => {
    // Défaut trouvé à la main le 2026-09-18 : `URL_PUBLIQUE` présente mais vide était
    // retenue telle quelle par `??`, et le courriel partait avec « /reinitialisation…
    // » — un lien mort dans une boîte de réception. Le cas est verrouillé ici.
    const { email } = await inscrire("lien-absolu");
    await appel("/api/auth/reinitialisation", "POST", { email });
    await attendreJeton(email);

    const journal = journalServeur();
    const ligne = journal
      .slice(journal.lastIndexOf(`→ ${email}`))
      .split("\n")
      .find((l) => l.includes("reinitialisation?jeton="));

    expect(ligne, "aucun lien dans le courriel").toBeTruthy();
    expect(ligne, "le lien doit être absolu").toMatch(/https?:\/\/[^/]+\/reinitialisation\?jeton=/);
  });

  it("refuse un lien déjà utilisé", async () => {
    const { email } = await inscrire("lien-rejeu");
    await appel("/api/auth/reinitialisation", "POST", { email });
    const jeton = await attendreJeton(email);

    await appel("/api/auth/reinitialisation/confirmation", "POST", { jeton, nouveau: "premier-usage-2026" });
    const second = await appel("/api/auth/reinitialisation/confirmation", "POST", {
      jeton, nouveau: "second-usage-2026",
    });
    expect(second.statut).toBe(403);
  });

  it("refuse un jeton inventé", async () => {
    const r = await appel("/api/auth/reinitialisation/confirmation", "POST", {
      jeton: "un-jeton-totalement-invente-mais-assez-long-pour-passer-la-longueur",
      nouveau: "peu-importe-2026",
    });
    expect(r.statut).toBe(403);
  });

  it("répond la même chose pour une adresse inconnue", async () => {
    // Sans cela, l'écran deviendrait un moyen de savoir qui est inscrit.
    const { email } = await inscrire("lien-enum");
    const connu = await appel("/api/auth/reinitialisation", "POST", { email });
    const inconnu = await appel("/api/auth/reinitialisation", "POST", {
      email: `${MARQUE}-jamais-vu@exemple.test`,
    });
    expect(connu.statut).toBe(inconnu.statut);
    expect(connu.corps.message).toBe(inconnu.corps.message);
  });

  it("n'envoie rien au-delà du seuil, sans le dire", async () => {
    // Annoncer « trop de demandes » confirmerait au passage que le compte existe.
    const { email } = await inscrire("lien-inondation");
    for (let i = 0; i < 6; i++) {
      const r = await appel("/api/auth/reinitialisation", "POST", { email });
      expect(r.statut).toBe(200);
    }
    const occurrences = journalServeur().split(`→ ${email}`).length - 1;
    expect(occurrences).toBeLessThanOrEqual(5);
  });
});
