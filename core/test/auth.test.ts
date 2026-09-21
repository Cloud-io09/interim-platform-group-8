import { describe, expect, it } from "vitest";
import {
  fermerSession,
  lireSession,
  LONGUEUR_MIN_MOT_DE_PASSE,
  normaliserEmail,
  ouvrirSession,
  fermerToutesLesSessions,
  validerEmail,
  validerInscription,
  validerMotDePasse,
  type MagasinSession,
} from "../src/auth";
import { TTL } from "../src/redis";

/** Magasin en mémoire, qui note les prolongations pour vérifier le glissement. */
function fauxMagasin() {
  const donnees = new Map<string, string>();
  const ensembles = new Map<string, Set<string>>();
  const prolongations: { cle: string; secondes: number }[] = [];
  const magasin: MagasinSession & {
    donnees: typeof donnees;
    ensembles: typeof ensembles;
    prolongations: typeof prolongations;
  } = {
    donnees,
    ensembles,
    prolongations,
    async sadd(k, ...membres) {
      const lot = ensembles.get(k) ?? new Set<string>();
      membres.forEach((m) => lot.add(m));
      ensembles.set(k, lot);
      return membres.length;
    },
    async srem(k, ...membres) {
      const lot = ensembles.get(k);
      membres.forEach((m) => lot?.delete(m));
      return membres.length;
    },
    async smembers(k) {
      return [...(ensembles.get(k) ?? [])];
    },
    async mget(...k) {
      return k.map((x) => donnees.get(x) ?? null);
    },
    async scan(_curseur, { match }) {
      const motif = new RegExp(`^${match.replace(/\*/g, ".*")}$`);
      return ["0", [...donnees.keys()].filter((k) => motif.test(k))];
    },
    async set(k, v) {
      donnees.set(k, v);
      return "OK";
    },
    async get(k) {
      return donnees.get(k) ?? null;
    },
    async expire(k, s) {
      prolongations.push({ cle: k, secondes: s });
      return 1;
    },
    async del(...k) {
      k.forEach((x) => donnees.delete(x));
      return k.length;
    },
  };
  return magasin;
}

const compte = { id: 7, role: "interimaire" as const, email: "karim@exemple.fr" };

describe("cycle de vie d'une session", () => {
  it("ouvre une session et la relit", async () => {
    const m = fauxMagasin();
    const { jeton, dureeSecondes } = await ouvrirSession(m, compte);
    expect(dureeSecondes).toBe(TTL.session);
    expect(await lireSession(m, jeton)).toMatchObject({
      compteId: 7,
      role: "interimaire",
      email: "karim@exemple.fr",
    });
  });

  it("stocke la session sous une clé préfixée, jamais en clair sous le jeton", async () => {
    const m = fauxMagasin();
    const { jeton } = await ouvrirSession(m, compte);
    expect([...m.donnees.keys()]).toEqual([`sess:${jeton}`]);
  });

  it("émet un jeton différent à chaque ouverture", async () => {
    const m = fauxMagasin();
    const a = await ouvrirSession(m, compte);
    const b = await ouvrirSession(m, compte);
    expect(a.jeton).not.toBe(b.jeton);
  });

  it("prolonge la session à chaque lecture", async () => {
    // Glissement voulu ici : la session s'éteint sur l'inactivité, pas sur l'ancienneté.
    // C'est l'inverse du compteur de tentatives, dont la fenêtre ne doit pas glisser.
    const m = fauxMagasin();
    const { jeton } = await ouvrirSession(m, compte);
    await lireSession(m, jeton);
    await lireSession(m, jeton);

    // On ne compte que les prolongations de la session elle-même : l'index des
    // sessions du compte est prolongé lui aussi, ce qui est voulu mais hors sujet ici.
    const duJeton = m.prolongations.filter((p) => p.cle === `sess:${jeton}`);
    expect(duJeton).toHaveLength(2);
    expect(duJeton[0]).toEqual({ cle: `sess:${jeton}`, secondes: TTL.session });
  });

  it("révoque toutes les sessions d'un compte, en épargnant celle qui le demande", async () => {
    // C'est ce qui distingue un changement de mot de passe d'un remplacement de
    // chaîne : quiconque était connecté ailleurs doit être éjecté au moment même.
    const m = fauxMagasin();
    const a = await ouvrirSession(m, compte);
    const b = await ouvrirSession(m, compte);
    const c = await ouvrirSession(m, compte);

    const fermees = await fermerToutesLesSessions(m, compte.id, c.jeton);
    expect(fermees).toBe(2);
    expect(await lireSession(m, a.jeton)).toBeNull();
    expect(await lireSession(m, b.jeton)).toBeNull();
    expect(await lireSession(m, c.jeton)).not.toBeNull();
  });

  it("révoque aussi une session absente de l'index", async () => {
    // Constaté le 2026-09-21 : l'index par compte était le seul point de vérité, donc
    // une session ouverte avant son introduction — ou perdue par une éviction Redis —
    // survivait à un changement de mot de passe. Une session irrévocable est
    // exactement ce qu'un changement de mot de passe doit empêcher.
    const m = fauxMagasin();
    const oubliee = await ouvrirSession(m, compte);
    m.ensembles.get(`sess:compte:${compte.id}`)?.delete(oubliee.jeton);

    expect(await lireSession(m, oubliee.jeton), "préalable : la session existe").not.toBeNull();
    await fermerToutesLesSessions(m, compte.id);
    expect(await lireSession(m, oubliee.jeton)).toBeNull();
  });

  it("n'emporte pas les sessions d'un autre compte", async () => {
    const m = fauxMagasin();
    const mien = await ouvrirSession(m, compte);
    const autre = await ouvrirSession(m, { ...compte, id: compte.id + 1 });

    await fermerToutesLesSessions(m, compte.id);
    expect(await lireSession(m, mien.jeton)).toBeNull();
    expect(await lireSession(m, autre.jeton), "session d'un tiers emportée").not.toBeNull();
  });

  it("retire le jeton de l'index quand la session se ferme", async () => {
    // Un index qui accumule des jetons morts finirait par révoquer dans le vide.
    const m = fauxMagasin();
    const { jeton } = await ouvrirSession(m, compte);
    await fermerSession(m, jeton);
    expect(m.ensembles.get(`sess:compte:${compte.id}`)?.size ?? 0).toBe(0);
  });

  it("rend null sans jeton, ou sur un jeton inconnu", async () => {
    const m = fauxMagasin();
    expect(await lireSession(m, undefined)).toBeNull();
    expect(await lireSession(m, "")).toBeNull();
    expect(await lireSession(m, "jeton-invente")).toBeNull();
  });

  it("accepte un magasin qui désérialise lui-même le JSON", async () => {
    // Upstash rend un objet là où un client Redis classique rend une chaîne.
    const m = { ...fauxMagasin(), get: async () => ({ compteId: 7, role: "entreprise" }) };
    expect(await lireSession(m, "peu-importe")).toMatchObject({ compteId: 7 });
  });

  it("refuse une charge de session mal formée", async () => {
    const m = { ...fauxMagasin(), get: async () => ({ pasUneSession: true }) };
    expect(await lireSession(m, "peu-importe")).toBeNull();
  });

  it("ferme une session, qui devient immédiatement inutilisable", async () => {
    const m = fauxMagasin();
    const { jeton } = await ouvrirSession(m, compte);
    await fermerSession(m, jeton);
    expect(await lireSession(m, jeton)).toBeNull();
  });

  it("ne plante pas si on ferme sans jeton", async () => {
    await expect(fermerSession(fauxMagasin(), undefined)).resolves.toBeUndefined();
  });
});

describe("validation d'inscription", () => {
  it("accepte une saisie correcte", () => {
    expect(
      validerInscription({
        email: "karim@exemple.fr",
        motDePasse: "chantier-de-reims-2026",
        role: "interimaire",
      })
    ).toEqual([]);
  });

  it("refuse les adresses manifestement fausses", () => {
    for (const mauvais of ["", "karim", "karim@", "@exemple.fr", "karim@exemple", "a b@c.fr"]) {
      expect(validerEmail(mauvais), mauvais).not.toBeNull();
    }
  });

  it("accepte les adresses valides usuelles", () => {
    for (const bon of ["a@b.fr", "karim.benali@sous.domaine.example.com", "k+btp@exemple.fr"]) {
      expect(validerEmail(bon), bon).toBeNull();
    }
  });

  it("exige la longueur plutôt qu'une règle de composition", () => {
    // « Chantier1! » satisfait une règle classique majuscule+chiffre+spécial
    // et reste trop court : c'est exactement ce qu'on refuse.
    expect(validerMotDePasse("Chantier1!")).not.toBeNull();
    expect(validerMotDePasse("a".repeat(LONGUEUR_MIN_MOT_DE_PASSE))).toBeNull();
    expect(validerMotDePasse("mon mot de passe en clair")).toBeNull();
  });

  it("refuse un mot de passe démesuré", () => {
    // Sans borne haute, un très long mot de passe fait travailler scrypt pour rien.
    expect(validerMotDePasse("a".repeat(201))).not.toBeNull();
  });

  it("n'accepte que les deux rôles prévus", () => {
    expect(validerInscription({ email: "a@b.fr", motDePasse: "a".repeat(12), role: "admin" })).toHaveLength(1);
    expect(validerInscription({ email: "a@b.fr", motDePasse: "a".repeat(12), role: undefined })).toHaveLength(1);
  });

  it("remonte tous les problèmes d'un coup", () => {
    const p = validerInscription({ email: "pas-un-email", motDePasse: "court", role: "pirate" });
    expect(p.map((x) => x.champ).sort()).toEqual(["email", "motDePasse", "role"]);
  });

  it("normalise l'email avant stockage et comparaison", () => {
    expect(normaliserEmail("  Karim@Exemple.FR ")).toBe("karim@exemple.fr");
  });
});
