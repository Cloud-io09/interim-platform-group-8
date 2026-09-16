import { describe, expect, it } from "vitest";
import { enMsUTC, joursDeChevauchement, nombreDeJours } from "../src/dates.js";

describe("nombreDeJours", () => {
  it("compte les bornes incluses — une mission d'un jour vaut 1", () => {
    expect(nombreDeJours({ dateDebut: "2026-03-01", dateFin: "2026-03-01" })).toBe(1);
  });

  it("compte 21 jours du 1er au 21 mars", () => {
    expect(nombreDeJours({ dateDebut: "2026-03-01", dateFin: "2026-03-21" })).toBe(21);
  });

  it("traverse correctement un changement d'heure", () => {
    // Le passage à l'heure d'été 2026 a lieu le 29 mars : en heure locale, un de
    // ces jours ne dure que 23 h. Le comptage doit rester entier.
    expect(nombreDeJours({ dateDebut: "2026-03-28", dateFin: "2026-03-30" })).toBe(3);
  });

  it("traverse correctement une année bissextile", () => {
    expect(nombreDeJours({ dateDebut: "2028-02-28", dateFin: "2028-03-01" })).toBe(3);
  });
});

describe("joursDeChevauchement", () => {
  const mission = { dateDebut: "2026-03-01", dateFin: "2026-03-21" };

  it("rend 0 sans aucune disponibilité", () => {
    expect(joursDeChevauchement(mission, [])).toBe(0);
  });

  it("rend la durée totale quand la disponibilité englobe la mission", () => {
    expect(joursDeChevauchement(mission, [{ dateDebut: "2026-01-01", dateFin: "2026-12-31" }])).toBe(21);
  });

  it("borne le chevauchement aux dates de la mission", () => {
    expect(joursDeChevauchement(mission, [{ dateDebut: "2026-02-20", dateFin: "2026-03-05" }])).toBe(5);
  });

  it("rend 0 quand la disponibilité est entièrement hors mission", () => {
    expect(joursDeChevauchement(mission, [{ dateDebut: "2026-06-01", dateFin: "2026-06-30" }])).toBe(0);
  });

  it("ne compte pas deux fois deux périodes qui se recouvrent", () => {
    const jours = joursDeChevauchement(mission, [
      { dateDebut: "2026-03-01", dateFin: "2026-03-10" },
      { dateDebut: "2026-03-05", dateFin: "2026-03-15" },
    ]);
    expect(jours).toBe(15);
  });

  it("fusionne deux périodes contiguës sans perdre le jour de jointure", () => {
    const jours = joursDeChevauchement(mission, [
      { dateDebut: "2026-03-01", dateFin: "2026-03-10" },
      { dateDebut: "2026-03-11", dateFin: "2026-03-21" },
    ]);
    expect(jours).toBe(21);
  });

  it("additionne deux périodes disjointes", () => {
    const jours = joursDeChevauchement(mission, [
      { dateDebut: "2026-03-01", dateFin: "2026-03-05" },
      { dateDebut: "2026-03-15", dateFin: "2026-03-21" },
    ]);
    expect(jours).toBe(5 + 7);
  });

  it("ignore une période dont la fin précède le début", () => {
    expect(joursDeChevauchement(mission, [{ dateDebut: "2026-03-10", dateFin: "2026-03-01" }])).toBe(0);
  });
});

describe("enMsUTC", () => {
  it("rejette une date mal formée plutôt que de comparer silencieusement de travers", () => {
    expect(() => enMsUTC("01/03/2026")).toThrow(/Date ISO invalide/);
    expect(() => enMsUTC("")).toThrow(/Date ISO invalide/);
  });

  it("ne dépend pas du fuseau local", () => {
    expect(enMsUTC("2026-03-01")).toBe(Date.UTC(2026, 2, 1));
  });
});
