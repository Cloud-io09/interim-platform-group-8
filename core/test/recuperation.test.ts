import { describe, expect, it } from "vitest";
import {
  empreinteCode,
  genererCode,
  genererCodes,
  NOMBRE_CODES,
  normaliserCode,
  trouverEmpreinte,
} from "../src/recuperation";

describe("codes de récupération", () => {
  it("remet le nombre de codes annoncé, tous différents", () => {
    const codes = genererCodes();
    expect(codes).toHaveLength(NOMBRE_CODES);
    expect(new Set(codes).size).toBe(NOMBRE_CODES);
  });

  it("n'emploie aucun caractère qui se confonde à la lecture", () => {
    // Le public recopie ces codes depuis un bout de papier, parfois avec des gants.
    // O et 0, I, l et 1 produiraient des saisies fausses à répétition.
    const tous = genererCodes(200).join("");
    for (const interdit of ["O", "0", "I", "l", "1"]) {
      expect(tous, `caractère ambigu « ${interdit} »`).not.toContain(interdit);
    }
  });

  it("accepte un code recopié approximativement", () => {
    const code = genererCode();
    const maladroit = ` ${code.toLowerCase().replace(/-/g, " ")}  `;
    expect(normaliserCode(maladroit)).toBe(normaliserCode(code));
    expect(empreinteCode(maladroit)).toBe(empreinteCode(code));
  });

  it("retrouve le bon code parmi ceux d'un compte", () => {
    const codes = genererCodes();
    const empreintes = codes.map(empreinteCode);
    const vise = codes[3]!;
    expect(trouverEmpreinte(vise, empreintes)).toBe(empreinteCode(vise));
  });

  it("ne reconnaît pas un code qui n'appartient pas au compte", () => {
    const empreintes = genererCodes().map(empreinteCode);
    expect(trouverEmpreinte(genererCode(), empreintes)).toBeNull();
  });

  it("écarte une saisie de mauvaise longueur sans même chercher", () => {
    const empreintes = genererCodes().map(empreinteCode);
    expect(trouverEmpreinte("ABC", empreintes)).toBeNull();
    expect(trouverEmpreinte("", empreintes)).toBeNull();
  });

  it("ne stocke jamais le code lui-même", () => {
    // L'empreinte ne doit rien laisser transparaître : une base qui fuite ne donne
    // pas plus accès aux codes qu'aux mots de passe.
    const code = genererCode();
    const empreinte = empreinteCode(code);
    expect(empreinte).not.toContain(normaliserCode(code).slice(0, 4));
    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
  });
});
