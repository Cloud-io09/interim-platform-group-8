import { describe, expect, it } from "vitest";
import {
  consommerJeton,
  emettreJeton,
  empreinteJeton,
  jetonsIdentiques,
  type MagasinSession,
} from "../src/index";
import { cle, TTL } from "../src/redis";

/** Magasin en mémoire, réduit à ce dont les jetons se servent. */
function fauxMagasin() {
  const donnees = new Map<string, string>();
  const magasin = {
    donnees,
    async set(k: string, v: unknown) {
      donnees.set(k, String(v));
      return "OK";
    },
    async get(k: string) {
      return donnees.get(k) ?? null;
    },
    async del(...k: string[]) {
      k.forEach((x) => donnees.delete(x));
      return k.length;
    },
    async expire() {
      return 1;
    },
    async sadd() {
      return 1;
    },
    async srem() {
      return 1;
    },
    async smembers() {
      return [];
    },
    async scan() {
      return ["0", []];
    },
    async mget() {
      return [];
    },
  };
  return magasin as unknown as MagasinSession & { donnees: Map<string, string> };
}

describe("jetons à usage unique", () => {
  it("range le jeton sous son empreinte, jamais en clair", async () => {
    // Un dump de Redis qui fuite ne doit livrer aucun lien exploitable : il faudrait
    // inverser SHA-256 pour retrouver les jetons à partir de ce qui est stocké.
    const magasin = fauxMagasin();
    const { jeton } = await emettreJeton(magasin, { type: "reinitialisation", compteId: 7 });

    const clefs = [...magasin.donnees.keys()];
    expect(clefs).toEqual([cle.jetonUsageUnique(empreinteJeton(jeton))]);
    expect(clefs.join(" ")).not.toContain(jeton);
    expect([...magasin.donnees.values()].join(" ")).not.toContain(jeton);
  });

  it("ne sert qu'une fois", async () => {
    const magasin = fauxMagasin();
    const { jeton } = await emettreJeton(magasin, { type: "reinitialisation", compteId: 7 });

    expect(await consommerJeton(magasin, jeton, "reinitialisation")).toMatchObject({ compteId: 7 });
    expect(await consommerJeton(magasin, jeton, "reinitialisation")).toBeNull();
  });

  it("refuse un jeton d'un autre type", async () => {
    // La propriété qui compte : un lien de vérification d'adresse ne doit jamais
    // pouvoir servir à réinitialiser un mot de passe. Le type est vérifié, pas supposé.
    const magasin = fauxMagasin();
    const { jeton } = await emettreJeton(magasin, {
      type: "verification_email",
      compteId: 7,
      cible: "karim@exemple.fr",
    });

    expect(await consommerJeton(magasin, jeton, "reinitialisation")).toBeNull();
  });

  it("accepte une liste de types, et rien au-delà", async () => {
    // L'écran de confirmation d'adresse reçoit les deux parcours sans savoir lequel.
    const magasin = fauxMagasin();
    const { jeton } = await emettreJeton(magasin, {
      type: "changement_email",
      compteId: 7,
      cible: "nouvelle@exemple.fr",
    });

    const contenu = await consommerJeton(magasin, jeton, [
      "verification_email",
      "changement_email",
    ]);
    expect(contenu).toMatchObject({ type: "changement_email", cible: "nouvelle@exemple.fr" });

    const { jeton: autre } = await emettreJeton(magasin, {
      type: "reinitialisation",
      compteId: 7,
    });
    expect(
      await consommerJeton(magasin, autre, ["verification_email", "changement_email"])
    ).toBeNull();
  });

  it("donne à chaque type sa propre durée de vie", async () => {
    const magasin = fauxMagasin();
    const reinit = await emettreJeton(magasin, { type: "reinitialisation", compteId: 7 });
    const verif = await emettreJeton(magasin, { type: "verification_email", compteId: 7 });
    const change = await emettreJeton(magasin, { type: "changement_email", compteId: 7 });

    expect(reinit.dureeSecondes).toBe(TTL.jetonReinitialisation);
    expect(verif.dureeSecondes).toBe(TTL.jetonVerificationEmail);
    expect(change.dureeSecondes).toBe(TTL.jetonChangementEmail);

    // La vérification dure plus longtemps : rien d'urgent n'en dépend, et quelqu'un
    // qui s'inscrit un vendredi soir doit pouvoir cliquer le lundi.
    expect(verif.dureeSecondes).toBeGreaterThan(reinit.dureeSecondes);
  });

  it("refuse un jeton trop court sans interroger le magasin", async () => {
    const magasin = fauxMagasin();
    expect(await consommerJeton(magasin, "court", "reinitialisation")).toBeNull();
    expect(await consommerJeton(magasin, undefined, "reinitialisation")).toBeNull();
  });
});

describe("comparaison en temps constant", () => {
  it("reconnaît deux valeurs identiques", () => {
    expect(jetonsIdentiques("secret-de-chantier", "secret-de-chantier")).toBe(true);
  });

  it("refuse deux valeurs différentes, y compris de longueurs différentes", () => {
    // Le cas des longueurs est traité à part : `timingSafeEqual` lève si les tampons
    // ne font pas la même taille, ce qui ferait tomber l'appelant au lieu de refuser.
    expect(jetonsIdentiques("secret-de-chantier", "secret-de-chantiez")).toBe(false);
    expect(jetonsIdentiques("court", "beaucoup-plus-long")).toBe(false);
    expect(jetonsIdentiques("", "x")).toBe(false);
  });
});
