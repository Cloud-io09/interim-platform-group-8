import { describe, expect, it } from "vitest";
import { experienceConstatee, resumeExperience } from "../src/experience";
import type { MissionRealisee } from "../src/experience";

const mission = (
  metierCode: string,
  dateDebut: string,
  dateFin: string,
  entreprise = "Bâtiment Rémois"
): MissionRealisee => ({
  metierCode,
  metierLibelle: metierCode === "F1703" ? "Maçon / Maçonne" : "Conducteur d'engins",
  dateDebut,
  dateFin,
  entreprise,
});

describe("expérience constatée", () => {
  it("ne rend rien quand aucune mission n'a été réalisée", () => {
    const e = experienceConstatee([]);
    expect(e.parMetier).toEqual([]);
    expect(e.totalMissions).toBe(0);
    expect(e.totalJours).toBe(0);
  });

  it("compte les jours bornes incluses", () => {
    // Une mission d'un seul jour compte un jour, pas zéro.
    const [m] = experienceConstatee([mission("F1703", "2026-03-02", "2026-03-02")]).parMetier;
    expect(m!.jours).toBe(1);
  });

  it("agrège plusieurs missions d'un même métier", () => {
    const e = experienceConstatee([
      mission("F1703", "2026-01-01", "2026-01-10"),
      mission("F1703", "2026-02-01", "2026-02-05"),
    ]);
    expect(e.parMetier).toHaveLength(1);
    expect(e.parMetier[0]!.missions).toBe(2);
    expect(e.parMetier[0]!.jours).toBe(10 + 5);
  });

  it("sépare les métiers et classe le plus travaillé en tête", () => {
    const e = experienceConstatee([
      mission("F1302", "2026-01-01", "2026-01-05"),
      mission("F1703", "2026-01-01", "2026-01-31"),
    ]);
    expect(e.parMetier.map((m) => m.metierCode)).toEqual(["F1703", "F1302"]);
  });

  it("retient la fin la plus récente, quel que soit l'ordre reçu", () => {
    const e = experienceConstatee([
      mission("F1703", "2026-05-01", "2026-05-10"),
      mission("F1703", "2026-01-01", "2026-01-10"),
    ]);
    expect(e.parMetier[0]!.derniereFin).toBe("2026-05-10");
  });

  it("dédoublonne les entreprises, par métier et au total", () => {
    const e = experienceConstatee([
      mission("F1703", "2026-01-01", "2026-01-10", "Bâtiment Rémois"),
      mission("F1703", "2026-02-01", "2026-02-10", "Bâtiment Rémois"),
      mission("F1302", "2026-03-01", "2026-03-10", "TP Marne"),
    ]);
    expect(e.parMetier.find((m) => m.metierCode === "F1703")!.entreprises).toEqual(["Bâtiment Rémois"]);
    expect(e.totalEntreprises).toBe(2);
  });

  it("compte deux fois les jours de missions simultanées", () => {
    // Volontaire : on mesure le travail effectué, pas le temps écoulé. Un
    // chevauchement signale d'ailleurs une anomalie que l'entreprise doit voir.
    const e = experienceConstatee([
      mission("F1703", "2026-01-01", "2026-01-10"),
      mission("F1302", "2026-01-05", "2026-01-14"),
    ]);
    expect(e.totalJours).toBe(20);
  });

  it("ne lit pas l'horloge : les mêmes missions donnent le même résultat", () => {
    const missions = [mission("F1703", "2010-01-01", "2010-01-10")];
    expect(experienceConstatee(missions)).toEqual(experienceConstatee(missions));
  });
});

describe("résumé lisible", () => {
  it("s'exprime en missions et en jours, jamais en années", () => {
    // Une mission de trois semaines n'est pas « 0,06 an » : arrondir donnerait une
    // ancienneté fausse, et c'est précisément ce que le produit refuse.
    const [m] = experienceConstatee([mission("F1703", "2026-01-01", "2026-01-21")]).parMetier;
    const phrase = resumeExperience(m!);
    expect(phrase).toBe("1 mission · 21 jours travaillés");
    expect(phrase).not.toMatch(/an(s|née)/);
  });

  it("mentionne le nombre d'employeurs à partir de deux", () => {
    const [m] = experienceConstatee([
      mission("F1703", "2026-01-01", "2026-01-10", "Bâtiment Rémois"),
      mission("F1703", "2026-02-01", "2026-02-10", "TP Marne"),
    ]).parMetier;
    expect(resumeExperience(m!)).toContain("pour 2 entreprises");
  });
});
