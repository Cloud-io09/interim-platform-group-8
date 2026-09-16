import { describe, expect, it } from "vitest";
import { DUREE_MAX_MOIS, validerExigences, validerMission } from "../src/mission";

const champs = (p: { champ: string }[]) => p.map((x) => x.champ);

const mission = {
  titre: "Maçon coffreur — chantier Reims centre",
  metierCode: "F1703",
  codePostal: "51100",
  ville: "Reims",
  dateDebut: "2026-10-01",
  dateFin: "2026-10-21",
  tauxHoraireMin: 13.5,
  tauxHoraireMax: 15,
  certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
};

describe("validation d'une fiche de poste", () => {
  it("accepte une fiche complète", () => {
    expect(validerMission(mission)).toEqual([]);
  });

  it("exige intitulé, métier, commune, code postal et les deux dates", () => {
    expect(champs(validerMission({})).sort()).toEqual([
      "codePostal",
      "dateDebut",
      "dateFin",
      "metierCode",
      "titre",
      "ville",
    ]);
  });

  it("exige la date de fin, qui conditionne le filtre sur les habilitations", () => {
    const p = validerMission({ ...mission, dateFin: undefined });
    expect(champs(p)).toContain("dateFin");
    expect(p.find((x) => x.champ === "dateFin")?.message).toMatch(/habilitations/);
  });

  it("refuse une fin antérieure au début", () => {
    expect(champs(validerMission({ ...mission, dateFin: "2026-09-01" }))).toContain("dateFin");
  });

  it("accepte une mission d'un seul jour", () => {
    expect(validerMission({ ...mission, dateFin: mission.dateDebut })).toEqual([]);
  });

  it(`refuse une mission de plus de ${DUREE_MAX_MOIS} mois`, () => {
    // Durée maximale légale d'une mission d'intérim, renouvellements compris.
    expect(champs(validerMission({ ...mission, dateFin: "2028-10-01" }))).toContain("dateFin");
    expect(validerMission({ ...mission, dateFin: "2028-04-01" })).toEqual([]);
  });

  it("laisse la rémunération facultative", () => {
    expect(validerMission({ ...mission, tauxHoraireMin: null, tauxHoraireMax: "" })).toEqual([]);
  });

  it("refuse un taux négatif ou une fourchette inversée", () => {
    expect(champs(validerMission({ ...mission, tauxHoraireMin: -5 }))).toContain("tauxHoraireMin");
    expect(champs(validerMission({ ...mission, tauxHoraireMin: 20, tauxHoraireMax: 15 }))).toContain("tauxHoraireMax");
  });
});

describe("certifications exigées", () => {
  it("accepte une liste vide ou absente", () => {
    expect(validerExigences(undefined)).toEqual([]);
    expect(validerExigences([])).toEqual([]);
  });

  it("exige une catégorie pour les titres qui en comportent", () => {
    expect(validerExigences([{ typeCode: "CACES_R482" }])).toHaveLength(1);
    expect(validerExigences([{ typeCode: "CACES_R482", categorieCode: "B1" }])).toEqual([]);
  });

  it("refuse une catégorie sur un titre qui n'en a pas", () => {
    expect(validerExigences([{ typeCode: "AIPR", categorieCode: "B1" }])).toHaveLength(1);
    expect(validerExigences([{ typeCode: "AIPR" }])).toEqual([]);
  });

  it("refuse un titre hors de la liste fermée", () => {
    expect(validerExigences([{ typeCode: "PERMIS_CACES_MAISON" }])).toHaveLength(1);
  });

  it("signale une exigence en double plutôt que de laisser la base la refuser", () => {
    const p = validerExigences([
      { typeCode: "AIPR" },
      { typeCode: "AIPR" },
    ]);
    expect(p.some((x) => /deux fois/.test(x.message))).toBe(true);
  });

  it("accepte plusieurs exigences distinctes", () => {
    expect(
      validerExigences([
        { typeCode: "CACES_R482", categorieCode: "B1" },
        { typeCode: "AIPR" },
        { typeCode: "HAB_ELEC", categorieCode: "B0" },
      ])
    ).toEqual([]);
  });
});
