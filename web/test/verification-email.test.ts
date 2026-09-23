import { afterAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE, journalServeur } from "./serveur";

/**
 * Vérification de l'adresse, et changement d'adresse.
 *
 * Ce qui est éprouvé ici n'est pas une commodité : depuis que le lien envoyé par
 * courriel est le chemin principal de récupération, une adresse mal saisie remet au
 * propriétaire réel de cette boîte le moyen de prendre le compte. La propriété
 * centrale — **aucun lien de réinitialisation vers une adresse non confirmée** — est
 * la seule chose qui referme cette faille, et elle est vérifiée en premier.
 */

const MARQUE = `verif-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-nanterre-2026";
const emails: string[] = [];
const comptes: number[] = [];

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
  const r = await appel("/api/auth/inscription", "POST", {
    email,
    motDePasse: MOT_DE_PASSE,
    role: "interimaire",
  });
  comptes.push(r.corps.compte.id);
  return {
    email,
    id: r.corps.compte.id as number,
    cookie: r.entetes.get("set-cookie")?.split(";")[0] ?? "",
    codes: r.corps.codesRecuperation as string[],
  };
}

/**
 * Relève un lien dans le journal du serveur.
 *
 * Aucun prestataire n'est configuré en test, et les adresses employées relèvent d'un
 * domaine réservé : le message part au journal, que le harnais capture. Aucune route
 * de production n'expose jamais un jeton.
 */
function lienEnvoyeA(email: string, chemin: string): string | null {
  const journal = journalServeur();
  const bloc = journal.lastIndexOf(`→ ${email}`);
  if (bloc < 0) return null;
  const trouve = journal.slice(bloc).match(new RegExp(`${chemin}\\?jeton=([A-Za-z0-9_-]+)`));
  return trouve ? decodeURIComponent(trouve[1]!) : null;
}

async function attendreLien(email: string, chemin: string): Promise<string | null> {
  // L'écriture du journal est asynchrone : on laisse au flux le temps d'arriver.
  for (let i = 0; i < 20; i++) {
    const jeton = lienEnvoyeA(email, chemin);
    if (jeton) return jeton;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

afterAll(async () => {
  const sql = connexion();
  try {
    await sql`delete from compte where email like ${`${MARQUE}-%`}`;
    await sql`delete from compte where email like ${`${MARQUE}%@nouvelle.test`}`;
  } finally {
    await sql.end();
  }
  const cache = redis();
  await Promise.all([
    ...emails.flatMap((e) => [
      cache.del(cle.tentativesEmail(e)),
      cache.del(cle.demandesReinitialisation(e)),
    ]),
    ...comptes.map((id) => cache.del(cle.demandesReinitialisation(`verif:${id}`))),
    ...comptes.map((id) => cache.del(cle.demandesReinitialisation(`chgt:${id}`))),
  ]);
});

describe("la faille que la vérification referme", () => {
  it("n'envoie aucun lien de réinitialisation à une adresse non confirmée", async () => {
    // Le cas réel : quelqu'un s'inscrit avec « karim@gmial.com ». Sans cette règle,
    // le propriétaire de cette boîte demande un lien et prend le compte.
    const { email } = await inscrire("non-confirmee");

    const demande = await appel("/api/auth/reinitialisation", "POST", { email });
    expect(demande.statut).toBe(200);

    // On laisse passer le temps qu'un envoi aurait mis, puis on constate qu'il
    // n'y en a pas eu.
    await new Promise((r) => setTimeout(r, 1200));
    expect(lienEnvoyeA(email, "reinitialisation")).toBeNull();
  });

  it("répond exactement comme pour une adresse confirmée", async () => {
    // La règle ne doit pas transformer l'écran en moyen de savoir quels comptes ont
    // confirmé leur adresse : le refus est silencieux, pas annoncé.
    const nonConfirmee = await inscrire("muette");
    const confirmee = await inscrire("muette-ok");
    await confirmerAdresse(confirmee.email);

    const a = await appel("/api/auth/reinitialisation", "POST", { email: nonConfirmee.email });
    const b = await appel("/api/auth/reinitialisation", "POST", { email: confirmee.email });

    expect(a.statut).toBe(b.statut);
    expect(a.corps.message).toBe(b.corps.message);
  });

  it("laisse les codes de récupération fonctionner, eux", async () => {
    // C'est ce qui rend la règle acceptable : personne n'est enfermé dehors.
    const { email, codes } = await inscrire("codes-quand-meme");
    const r = await appel("/api/auth/recuperation", "POST", {
      email,
      code: codes[0],
      nouveau: "reprise-par-code-2026",
    });
    expect(r.statut).toBe(200);
  });
});

/** Confirme l'adresse d'un compte en suivant le lien reçu, comme le ferait un humain. */
async function confirmerAdresse(email: string) {
  const jeton = await attendreLien(email, "verification");
  expect(jeton, `aucun lien de vérification envoyé à ${email}`).toBeTruthy();
  const r = await appel("/api/auth/verification", "POST", { jeton });
  expect(r.statut).toBe(200);
  return r;
}

describe("vérification de l'adresse à l'inscription", () => {
  it("envoie un lien dès l'inscription, sans bloquer le compte", async () => {
    const { email, cookie } = await inscrire("des-inscription");

    // Le compte est utilisable immédiatement : bloquer ferait abandonner un public
    // qui s'inscrit depuis un téléphone, entre deux chantiers.
    expect((await appel("/api/moi", "GET", undefined, cookie)).statut).toBe(200);

    expect(await attendreLien(email, "verification")).toBeTruthy();
  });

  it("compose un lien absolu", async () => {
    const { email } = await inscrire("lien-absolu");
    await attendreLien(email, "verification");

    const journal = journalServeur();
    const ligne = journal
      .slice(journal.lastIndexOf(`→ ${email}`))
      .split("\n")
      .find((l) => l.includes("verification?jeton="));
    expect(ligne, "le lien doit être absolu").toMatch(
      /https?:\/\/[^/]+\/verification\?jeton=/
    );
  });

  it("confirme l'adresse, et débloque alors le lien de réinitialisation", async () => {
    const { email } = await inscrire("debloque");
    await confirmerAdresse(email);

    expect((await appel("/api/compte/email", "GET", undefined, (await connecter(email)).cookie))
      .corps.verifie).toBe(true);

    await appel("/api/auth/reinitialisation", "POST", { email });
    expect(await attendreLien(email, "reinitialisation")).toBeTruthy();
  });

  it("refuse un lien de vérification déjà utilisé", async () => {
    const { email } = await inscrire("rejeu");
    const jeton = await attendreLien(email, "verification");

    expect((await appel("/api/auth/verification", "POST", { jeton })).statut).toBe(200);
    expect((await appel("/api/auth/verification", "POST", { jeton })).statut).toBe(400);
  });

  it("refuse un jeton inventé", async () => {
    const r = await appel("/api/auth/verification", "POST", {
      jeton: "un-jeton-totalement-invente-mais-assez-long-pour-passer-la-longueur",
    });
    expect(r.statut).toBe(400);
  });

  it("renvoie un lien sur demande, et le dit inutile une fois l'adresse confirmée", async () => {
    // Sans ce renvoi, un message perdu dans les indésirables condamnerait le compte
    // à n'avoir jamais que ses codes de récupération.
    const { email, cookie } = await inscrire("renvoi");
    const premier = await appel("/api/compte/verification", "POST", {}, cookie);
    expect(premier.statut).toBe(200);
    expect(premier.corps.envoye).toBe(true);

    await confirmerAdresse(email);
    const apres = await appel("/api/compte/verification", "POST", {}, cookie);
    expect(apres.corps.envoye).toBe(false);
  });

  it("n'expose le renvoi qu'aux personnes connectées", async () => {
    expect((await appel("/api/compte/verification", "POST", {})).statut).toBe(401);
  });
});

/** Ouvre une session, pour les cas où l'on a besoin d'un cookie frais. */
async function connecter(email: string, motDePasse = MOT_DE_PASSE) {
  const r = await appel("/api/auth/connexion", "POST", { email, motDePasse });
  return { statut: r.statut, cookie: r.entetes.get("set-cookie")?.split(";")[0] ?? "" };
}

describe("changement d'adresse", () => {
  it("exige le mot de passe : un cookie volé ne détourne pas l'adresse", async () => {
    // L'adresse est un facteur de reprise en main : qui la change prend le compte.
    const { cookie } = await inscrire("cookie-vole");
    const r = await appel(
      "/api/compte/email",
      "POST",
      { email: `${MARQUE}-pirate@nouvelle.test`, motDePasse: "pas le bon" },
      cookie
    );
    expect(r.statut).toBe(403);
  });

  it("n'écrit rien avant la confirmation", async () => {
    // La propriété qui évite qu'une faute de frappe coupe le titulaire de son compte.
    const { email, cookie } = await inscrire("pas-avant");
    const nouvelle = `${MARQUE}-pas-avant-2@nouvelle.test`;
    emails.push(nouvelle);

    expect(
      (await appel("/api/compte/email", "POST", { email: nouvelle, motDePasse: MOT_DE_PASSE }, cookie))
        .statut
    ).toBe(200);

    // L'ancienne adresse ouvre toujours la session ; la nouvelle, pas encore.
    expect((await connecter(email)).statut).toBe(200);
    expect((await connecter(nouvelle)).statut).toBe(401);
  });

  it("prévient l'ancienne adresse, et envoie le lien à la nouvelle", async () => {
    const { email, cookie } = await inscrire("prevenue");
    const nouvelle = `${MARQUE}-prevenue-2@nouvelle.test`;
    emails.push(nouvelle);

    await appel("/api/compte/email", "POST", { email: nouvelle, motDePasse: MOT_DE_PASSE }, cookie);
    expect(await attendreLien(nouvelle, "verification")).toBeTruthy();

    // L'ancienne boîte reçoit un avertissement — seul signal que recevra le
    // titulaire si quelqu'un a obtenu son mot de passe.
    const journal = journalServeur();
    const bloc = journal.slice(journal.lastIndexOf(`→ ${email}`));
    expect(bloc).toContain("changement d'adresse");
    // Et surtout, elle ne reçoit pas le lien : le connaître suffirait à conclure.
    expect(bloc.split("→ ")[0]).not.toMatch(/verification\?jeton=/);
  });

  it("change l'adresse à la confirmation, et ferme toutes les sessions", async () => {
    const { email, cookie } = await inscrire("conclu");
    const nouvelle = `${MARQUE}-conclu-2@nouvelle.test`;
    emails.push(nouvelle);

    await appel("/api/compte/email", "POST", { email: nouvelle, motDePasse: MOT_DE_PASSE }, cookie);
    const jeton = await attendreLien(nouvelle, "verification");

    const r = await appel("/api/auth/verification", "POST", { jeton });
    expect(r.statut).toBe(200);
    expect(r.corps.confirme).toBe("changement");

    // La nouvelle adresse est l'identifiant, l'ancienne ne l'est plus.
    expect((await connecter(nouvelle)).statut).toBe(200);
    expect((await connecter(email)).statut).toBe(401);

    // Toute session antérieure tombe — y compris celle d'un tiers qui aurait
    // obtenu le mot de passe.
    expect((await appel("/api/moi", "GET", undefined, cookie)).statut).toBe(401);
  });

  it("arrive confirmée : le changement vaut preuve de la boîte", async () => {
    const { cookie } = await inscrire("deja-confirmee");
    const nouvelle = `${MARQUE}-deja-confirmee-2@nouvelle.test`;
    emails.push(nouvelle);

    await appel("/api/compte/email", "POST", { email: nouvelle, motDePasse: MOT_DE_PASSE }, cookie);
    const jeton = await attendreLien(nouvelle, "verification");
    await appel("/api/auth/verification", "POST", { jeton });

    const session = await connecter(nouvelle);
    const etat = await appel("/api/compte/email", "GET", undefined, session.cookie);
    expect(etat.corps.verifie).toBe(true);
  });

  it("refuse une adresse déjà prise par un autre compte", async () => {
    const occupant = await inscrire("occupant");
    const { cookie } = await inscrire("convoite");

    const r = await appel(
      "/api/compte/email",
      "POST",
      { email: occupant.email, motDePasse: MOT_DE_PASSE },
      cookie
    );
    expect(r.statut).toBe(409);
  });

  it("refuse sa propre adresse, et une adresse malformée", async () => {
    const { email, cookie } = await inscrire("meme-adresse");
    expect(
      (await appel("/api/compte/email", "POST", { email, motDePasse: MOT_DE_PASSE }, cookie)).statut
    ).toBe(422);
    expect(
      (await appel("/api/compte/email", "POST", { email: "pas-une-adresse", motDePasse: MOT_DE_PASSE }, cookie))
        .statut
    ).toBe(422);
  });

  it("ne devient pas un relais d'inondation", async () => {
    // Chaque appel envoie deux courriels. Sans compteur, un compte authentifié
    // arrosait n'importe quelle boîte en répétant la demande. Le mot de passe exigé
    // n'y change rien : c'est le titulaire lui-même qui en abuserait.
    const { cookie } = await inscrire("inondation");
    const statuts = [];
    for (let i = 0; i < 7; i++) {
      const r = await appel(
        "/api/compte/email",
        "POST",
        { email: `${MARQUE}-cible-${i}@nouvelle.test`, motDePasse: MOT_DE_PASSE },
        cookie
      );
      statuts.push(r.statut);
    }
    expect(statuts).toContain(429);
    expect(statuts.filter((s) => s === 200).length).toBeLessThanOrEqual(5);
  });

  it("n'est pas ouvert sans session", async () => {
    expect(
      (await appel("/api/compte/email", "POST", {
        email: `${MARQUE}-anonyme@nouvelle.test`,
        motDePasse: MOT_DE_PASSE,
      })).statut
    ).toBe(401);
  });
});
