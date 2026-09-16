import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOMAINES_TERRAIN,
  echeanceTheorique,
  exigeCategorie,
  TYPES_CERTIFICATION,
  typeCertification,
} from "../src/referentiel";

const seed = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "002_seed_referentiels.sql"),
  "utf-8"
);

/** Les catégories ne se lisent que dans les insertions de categorie_certification :
 *  sans ce découpage, le libellé du type passerait lui aussi pour une catégorie. */
const seedCategories = seed
  .split("insert into categorie_certification")
  .slice(1)
  .join("\n");

describe("le référentiel TypeScript ne dérive pas du seed SQL", () => {
  it("déclare les mêmes types de certification", () => {
    const dansSql = [...seed.matchAll(/\('([A-Z_0-9]+)',\s*'[^']*',\s*\d+,\s*(?:true|false)/g)].map(
      (m) => m[1]
    );
    expect(dansSql.sort()).toEqual(TYPES_CERTIFICATION.map((t) => t.code).sort());
  });

  it("déclare les mêmes durées de validité", () => {
    for (const type of TYPES_CERTIFICATION) {
      const motif = new RegExp(`\\('${type.code}',\\s*'[^']*',\\s*(\\d+),`);
      expect(Number(motif.exec(seed)?.[1]), type.code).toBe(type.validiteMois);
    }
  });

  it("déclare les mêmes catégories", () => {
    for (const type of TYPES_CERTIFICATION) {
      const dansSql = [
        ...seedCategories.matchAll(new RegExp(`\\('${type.code}',\\s*'([^']+)',`, "g")),
      ].map((m) => m[1]!);
      expect([...dansSql].sort(), type.code).toEqual([...type.categories].sort());
    }
  });

  it("marque comme exigeant une catégorie exactement les types qui en ont", () => {
    for (const type of TYPES_CERTIFICATION) {
      const motif = new RegExp(`\\('${type.code}',\\s*'[^']*',\\s*\\d+,\\s*(true|false)`);
      expect(motif.exec(seed)?.[1] === "true", type.code).toBe(exigeCategorie(type.code));
    }
  });
});

describe("règles du référentiel", () => {
  it("retrouve un type par son code", () => {
    expect(typeCertification("CACES_R482")?.validiteMois).toBe(120);
    expect(typeCertification("INEXISTANT")).toBeUndefined();
  });

  it("n'exige une catégorie que pour le CACES et l'habilitation électrique", () => {
    expect(exigeCategorie("CACES_R482")).toBe(true);
    expect(exigeCategorie("HAB_ELEC")).toBe(true);
    expect(exigeCategorie("AIPR")).toBe(false);
    expect(exigeCategorie("AMIANTE_SS4")).toBe(false);
    expect(exigeCategorie("SST")).toBe(false);
    expect(exigeCategorie("INEXISTANT")).toBe(false);
  });

  it("calcule l'échéance théorique selon la durée réelle de chaque titre", () => {
    expect(echeanceTheorique("CACES_R482", "2024-03-15")).toBe("2034-03-15"); // 10 ans
    expect(echeanceTheorique("AIPR", "2024-03-15")).toBe("2029-03-15"); // 5 ans
    expect(echeanceTheorique("HAB_ELEC", "2024-03-15")).toBe("2027-03-15"); // 3 ans
    expect(echeanceTheorique("SST", "2024-03-15")).toBe("2026-03-15"); // 2 ans
  });

  it("gère un 29 février sans produire de date invalide", () => {
    // 2024 est bissextile, 2026 ne l'est pas : le 29/02 + 2 ans doit rester une vraie date.
    expect(echeanceTheorique("SST", "2024-02-29")).toBe("2026-03-01");
  });

  it("rend null sur un type inconnu ou une date invalide", () => {
    expect(echeanceTheorique("INEXISTANT", "2024-03-15")).toBeNull();
    expect(echeanceTheorique("SST", "pas-une-date")).toBeNull();
  });

  it("ne retient que les quatre domaines de terrain", () => {
    expect(DOMAINES_TERRAIN).toEqual(["F13", "F15", "F16", "F17"]);
    expect(DOMAINES_TERRAIN).not.toContain("F11"); // conception
    expect(DOMAINES_TERRAIN).not.toContain("F12"); // encadrement
  });
});
