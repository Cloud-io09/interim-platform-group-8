import { describe, expect, it } from "vitest";
import {
  DUREE_MAX_MOIS,
  mentionsManquantes,
  moisEntre,
  verifierDuree,
} from "../src/droit-travail";

describe("durée maximale d'une mission — L1251-12", () => {
  it("accepte une mission courte", () => {
    const v = verifierDuree("2026-09-01", "2026-09-21");
    expect(v.conforme).toBe(true);
    expect(v.moisDemandes).toBe(0);
  });

  it("accepte une mission qui atteint exactement le plafond", () => {
    // 18 mois jour pour jour : la borne est incluse, une mission de 18 mois est légale.
    const v = verifierDuree("2026-09-01", "2028-03-01");
    expect(v.moisDemandes).toBe(DUREE_MAX_MOIS);
    expect(v.conforme).toBe(true);
  });

  it("refuse le lendemain du plafond", () => {
    const v = verifierDuree("2026-09-01", "2028-03-02");
    expect(v.conforme).toBe(false);
    expect(v.finMaximale).toBe("2028-03-01");
  });

  it("rend la date limite pour qu'on n'ait pas à la chercher", () => {
    // Dire « trop long » sans dire jusqu'où oblige à tâtonner.
    expect(verifierDuree("2026-01-15", "2030-01-01").finMaximale).toBe("2027-07-15");
  });

  it("ramène au dernier jour du mois quand le quantième n'existe pas", () => {
    // 31 août + 18 mois viserait un 31 février : on ne déborde pas sur mars.
    expect(verifierDuree("2026-08-31", "2028-02-29").finMaximale).toBe("2028-02-29");
  });

  it("ne lit pas l'horloge : seules les deux dates comptent", () => {
    // Une mission de dix-neuf mois est irrégulière qu'on la signe aujourd'hui ou
    // dans dix ans. Le verdict doit donc être identique pour un même écart.
    const a = verifierDuree("2020-01-01", "2021-09-01");
    const b = verifierDuree("2040-01-01", "2041-09-01");
    expect(a.conforme).toBe(b.conforme);
    expect(a.moisDemandes).toBe(b.moisDemandes);
  });
});

describe("mois entre deux dates", () => {
  it("ne compte pas un mois entamé comme un mois plein", () => {
    expect(moisEntre("2026-03-15", "2026-04-14")).toBe(0);
    expect(moisEntre("2026-03-15", "2026-04-15")).toBe(1);
  });

  it("traverse correctement un changement d'année", () => {
    expect(moisEntre("2026-11-01", "2027-02-01")).toBe(3);
  });
});

describe("mentions obligatoires du contrat de mission", () => {
  const complete = {
    titre: "Maçon coffreur",
    metierLibelle: "Maçon / Maçonne",
    dateFin: "2026-10-21",
    ville: "Reims",
    horaires: "7h30-12h / 13h-16h30, 35 h par semaine",
    tauxHoraireMin: 14,
  };

  it("ne réclame rien quand tout est renseigné", () => {
    expect(mentionsManquantes(complete)).toEqual([]);
  });

  it("nomme ce qui manque plutôt que de répondre « incomplet »", () => {
    expect(mentionsManquantes({ ...complete, horaires: null })).toEqual(["horaires"]);
    expect(mentionsManquantes({ ...complete, horaires: "   ", ville: "" })).toEqual([
      "lieu",
      "horaires",
    ]);
  });

  it("refuse une rémunération absente ou nulle", () => {
    expect(mentionsManquantes({ ...complete, tauxHoraireMin: null })).toEqual(["remuneration"]);
    expect(mentionsManquantes({ ...complete, tauxHoraireMin: 0 })).toEqual(["remuneration"]);
  });
});
