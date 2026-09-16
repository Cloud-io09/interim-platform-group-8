import { describe, expect, it } from "vitest";
import {
  fourchetteLocale,
  HEURES_PAR_AN,
  HEURES_PAR_MOIS,
  parserSalaire,
} from "../src/ingestion/salaire.js";

describe("parserSalaire — formats réellement renvoyés par France Travail", () => {
  it("lit un taux horaire simple", () => {
    expect(parserSalaire("Horaire de 12.31 Euros")).toEqual({
      tauxHoraireMin: 12.31,
      tauxHoraireMax: 12.31,
      uniteOrigine: "horaire",
    });
  });

  it("lit une fourchette horaire", () => {
    expect(parserSalaire("Horaire de 12.5 Euros à 13.5 Euros")).toMatchObject({
      tauxHoraireMin: 12.5,
      tauxHoraireMax: 13.5,
    });
  });

  it("convertit un mensuel en taux horaire", () => {
    const r = parserSalaire("Mensuel de 1800.0 Euros à 2000.0 Euros");
    expect(r?.uniteOrigine).toBe("mensuel");
    expect(r?.tauxHoraireMin).toBeCloseTo(1800 / HEURES_PAR_MOIS, 2);
    expect(r?.tauxHoraireMax).toBeCloseTo(2000 / HEURES_PAR_MOIS, 2);
  });

  it("convertit un annuel en taux horaire", () => {
    const r = parserSalaire("Annuel de 22405.0 Euros à 25000.0 Euros");
    expect(r?.uniteOrigine).toBe("annuel");
    expect(r?.tauxHoraireMin).toBeCloseTo(22405 / HEURES_PAR_AN, 2);
  });

  it("ignore le commentaire libre après le tiret", () => {
    const cas = [
      "Horaire de 12.5 Euros à 13.5 Euros - Panier repas",
      "Horaire de 12.5 Euros à 13.5 Euros - 13 ème mois",
      "Horaire de 12.5 Euros à 13.5 Euros - Selon grille du BTP",
      "Horaire de 12.5 Euros à 13.5 Euros - 10% de IFM et congés payés",
    ];
    for (const libelle of cas) {
      expect(parserSalaire(libelle)).toMatchObject({ tauxHoraireMin: 12.5, tauxHoraireMax: 13.5 });
    }
  });

  it("accepte la virgule décimale", () => {
    expect(parserSalaire("Horaire de 12,31 Euros")).toMatchObject({ tauxHoraireMin: 12.31 });
  });

  it("accepte « Euro » au singulier et une casse différente", () => {
    expect(parserSalaire("horaire de 12.31 Euro")).toMatchObject({ tauxHoraireMin: 12.31 });
  });

  it("rend null sur un libellé absent ou vide", () => {
    expect(parserSalaire(null)).toBeNull();
    expect(parserSalaire(undefined)).toBeNull();
    expect(parserSalaire("")).toBeNull();
  });

  it("rend null sur un libellé non reconnu plutôt que de deviner", () => {
    expect(parserSalaire("Selon profil")).toBeNull();
    expect(parserSalaire("A négocier")).toBeNull();
    expect(parserSalaire("Mensuel de X Euros")).toBeNull();
  });

  it("rejette un taux horaire implausible", () => {
    // Un « horaire » à 1800 € est une donnée saisie dans la mauvaise unité.
    expect(parserSalaire("Horaire de 1800.0 Euros")).toBeNull();
    // 2 €/h est sous tout minimum légal : donnée cassée.
    expect(parserSalaire("Horaire de 2.0 Euros")).toBeNull();
  });

  it("rejette une fourchette inversée", () => {
    expect(parserSalaire("Horaire de 15.0 Euros à 12.0 Euros")).toBeNull();
  });
});

describe("fourchetteLocale", () => {
  const horaire = (min: number, max = min) =>
    ({ tauxHoraireMin: min, tauxHoraireMax: max, uniteOrigine: "horaire" }) as const;

  it("rend null sans aucune donnée", () => {
    expect(fourchetteLocale([])).toBeNull();
  });

  it("rend la valeur elle-même sur une seule offre, avec son effectif", () => {
    expect(fourchetteLocale([horaire(13)])).toEqual({ mediane: 13, q1: 13, q3: 13, effectif: 1 });
  });

  it("calcule médiane et quartiles", () => {
    const f = fourchetteLocale([11, 12, 13, 14, 15].map((t) => horaire(t)));
    expect(f).toMatchObject({ mediane: 13, q1: 12, q3: 14, effectif: 5 });
  });

  it("résiste à une valeur extrême là où une moyenne dériverait", () => {
    const taux = [12, 12.5, 13, 13.5, 60];
    const f = fourchetteLocale(taux.map((t) => horaire(t)))!;
    const moyenne = taux.reduce((a, b) => a + b) / taux.length;
    expect(f.mediane).toBe(13);
    expect(moyenne).toBeGreaterThan(20);
  });

  it("prend le milieu de chaque fourchette", () => {
    expect(fourchetteLocale([horaire(12, 14)])).toMatchObject({ mediane: 13 });
  });

  it("remonte toujours l'effectif : un taux sans effectif n'est pas exploitable", () => {
    expect(fourchetteLocale([horaire(13), horaire(14)])?.effectif).toBe(2);
  });
});
