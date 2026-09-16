import { describe, expect, it } from "vitest";
import {
  cle,
  compterTentative,
  MAX_TENTATIVES,
  oublierTentatives,
  TTL,
  type CompteurRedis,
} from "../src/redis.js";

/** Faux Redis minimal : compte les appels pour vérifier QUAND le TTL est posé. */
function fauxRedis(): CompteurRedis & { appelsExpire: number; valeurs: Map<string, number> } {
  const valeurs = new Map<string, number>();
  return {
    valeurs,
    appelsExpire: 0,
    async incr(k) {
      const v = (valeurs.get(k) ?? 0) + 1;
      valeurs.set(k, v);
      return v;
    },
    async expire(_k, _s) {
      this.appelsExpire++;
      return 1;
    },
    async ttl() {
      return 900;
    },
  };
}

describe("conventions de clés", () => {
  it("préfixe chaque usage pour qu'ils ne se marchent pas dessus", () => {
    expect(cle.session("abc")).toBe("sess:abc");
    expect(cle.tentativesIp("10.0.0.1")).toBe("rl:ip:10.0.0.1");
    expect(cle.cacheMatching(42)).toBe("match:cache:42");
    expect(cle.traceMatching(42)).toBe("match:trace:42");
  });

  it("normalise l'email en minuscules", () => {
    // Sinon « Alice@x.fr » et « alice@x.fr » auraient deux compteurs distincts,
    // et il suffirait de varier la casse pour multiplier les tentatives.
    expect(cle.tentativesEmail("Alice@Exemple.FR")).toBe("rl:email:alice@exemple.fr");
  });
});

describe("limitation des tentatives", () => {
  it("laisse passer sous le seuil et bloque au-delà", async () => {
    const r = fauxRedis();
    const k = cle.tentativesEmail("a@b.fr");
    for (let i = 1; i <= MAX_TENTATIVES; i++) {
      expect((await compterTentative(k, r)).bloque, `tentative ${i}`).toBe(false);
    }
    expect((await compterTentative(k, r)).bloque).toBe(true);
  });

  it("ne pose le TTL qu'à la première tentative", async () => {
    // Le reposer à chaque essai ferait glisser la fenêtre indéfiniment : un attaquant
    // qui frappe en boucle garderait le compte bloqué pour toujours.
    const r = fauxRedis();
    const k = cle.tentativesIp("10.0.0.1");
    for (let i = 0; i < 5; i++) await compterTentative(k, r);
    expect(r.appelsExpire).toBe(1);
  });

  it("remonte le compteur et le temps restant", async () => {
    const r = fauxRedis();
    const etat = await compterTentative(cle.tentativesIp("10.0.0.2"), r);
    expect(etat).toEqual({ bloque: false, tentatives: 1, resteSecondes: 900 });
  });

  it("retombe sur la durée de fenêtre si Redis ne rend pas de TTL", async () => {
    const r = { ...fauxRedis(), ttl: async () => -1 };
    expect((await compterTentative("rl:ip:x", r)).resteSecondes).toBe(TTL.tentatives);
  });

  it("compte séparément deux identités différentes", async () => {
    const r = fauxRedis();
    await compterTentative(cle.tentativesEmail("a@b.fr"), r);
    const autre = await compterTentative(cle.tentativesEmail("c@d.fr"), r);
    expect(autre.tentatives).toBe(1);
  });
});

describe("oublierTentatives", () => {
  it("supprime les compteurs fournis", async () => {
    const supprimees: string[] = [];
    await oublierTentatives(["rl:ip:1", "rl:email:a@b.fr"], {
      async del(...k) {
        supprimees.push(...k);
        return k.length;
      },
    });
    expect(supprimees).toEqual(["rl:ip:1", "rl:email:a@b.fr"]);
  });

  it("n'appelle pas Redis quand il n'y a rien à supprimer", async () => {
    let appele = false;
    await oublierTentatives([], {
      async del() {
        appele = true;
        return 0;
      },
    });
    expect(appele).toBe(false);
  });
});
