import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  chiffrer,
  chiffrerOptionnel,
  dechiffrer,
  dechiffrerOptionnel,
  genererJetonSession,
  hacherMotDePasse,
  oublierCle,
  verifierMotDePasse,
} from "../src/chiffrement.js";

beforeAll(() => {
  process.env.CLE_CHIFFREMENT = randomBytes(32).toString("base64");
  oublierCle();
});

describe("chiffrement au repos", () => {
  it("rend le texte d'origine après un aller-retour", () => {
    const numero = "R482-2024-004871";
    expect(dechiffrer(chiffrer(numero))).toBe(numero);
  });

  it("gère les accents et les caractères non ASCII", () => {
    const adresse = "12 rue de l'Église, Sérent";
    expect(dechiffrer(chiffrer(adresse))).toBe(adresse);
  });

  it("produit deux chiffrés différents pour la même valeur (IV aléatoire)", () => {
    expect(chiffrer("0612345678")).not.toBe(chiffrer("0612345678"));
  });

  it("refuse une charge dont le texte chiffré a été modifié", () => {
    const [iv, tag, chiffre] = chiffrer("secret").split(".");
    const altere = Buffer.from(chiffre!, "base64url");
    altere[0] = altere[0]! ^ 0xff;
    expect(() => dechiffrer(`${iv}.${tag}.${altere.toString("base64url")}`)).toThrow();
  });

  it("refuse une charge dont le tag d'authentification a été modifié", () => {
    const [iv, tag, chiffre] = chiffrer("secret").split(".");
    const altere = Buffer.from(tag!, "base64url");
    altere[0] = altere[0]! ^ 0xff;
    expect(() => dechiffrer(`${iv}.${altere.toString("base64url")}.${chiffre}`)).toThrow();
  });

  it("refuse une charge mal formée", () => {
    expect(() => dechiffrer("pas-du-tout-chiffre")).toThrow(/mal formée/);
  });

  it("rejette une clé qui ne fait pas 32 octets", () => {
    const valide = process.env.CLE_CHIFFREMENT;
    process.env.CLE_CHIFFREMENT = Buffer.from("trop court").toString("base64");
    oublierCle();
    expect(() => chiffrer("x")).toThrow(/32 octets/);
    process.env.CLE_CHIFFREMENT = valide;
    oublierCle();
  });

  it("laisse passer les valeurs absentes sans se plaindre", () => {
    expect(chiffrerOptionnel(null)).toBeNull();
    expect(chiffrerOptionnel("")).toBeNull();
    expect(dechiffrerOptionnel(null)).toBeNull();
    expect(dechiffrerOptionnel(chiffrerOptionnel("0612345678"))).toBe("0612345678");
  });
});

describe("hachage de mot de passe", () => {
  it("valide le bon mot de passe", async () => {
    const { hash, sel } = await hacherMotDePasse("chantier-2026!");
    expect(await verifierMotDePasse("chantier-2026!", hash, sel)).toBe(true);
  });

  it("rejette un mot de passe faux", async () => {
    const { hash, sel } = await hacherMotDePasse("chantier-2026!");
    expect(await verifierMotDePasse("chantier-2026", hash, sel)).toBe(false);
  });

  it("ne stocke jamais le mot de passe en clair", async () => {
    const { hash, sel } = await hacherMotDePasse("chantier-2026!");
    expect(hash).not.toContain("chantier");
    expect(sel).not.toContain("chantier");
  });

  it("donne deux hashs différents pour le même mot de passe (sel par compte)", async () => {
    const a = await hacherMotDePasse("identique");
    const b = await hacherMotDePasse("identique");
    expect(a.hash).not.toBe(b.hash);
    expect(a.sel).not.toBe(b.sel);
  });

  it("rejette un hash de longueur incohérente sans planter", async () => {
    const { sel } = await hacherMotDePasse("chantier-2026!");
    expect(await verifierMotDePasse("chantier-2026!", "dHJvcCBjb3VydA==", sel)).toBe(false);
  });

  it("accepte un mot de passe long et à caractères variés", async () => {
    const complexe = "Éà!@#$%^&*()_+{}|:<>?~`-=[]\;',./ 1234567890 très long";
    const { hash, sel } = await hacherMotDePasse(complexe);
    expect(await verifierMotDePasse(complexe, hash, sel)).toBe(true);
  });
});

describe("jeton de session", () => {
  it("produit un jeton différent à chaque appel", () => {
    expect(genererJetonSession()).not.toBe(genererJetonSession());
  });

  it("produit 32 octets d'aléa, utilisables tels quels dans un cookie", () => {
    const jeton = genererJetonSession();
    expect(Buffer.from(jeton, "base64url")).toHaveLength(32);
    expect(jeton).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
