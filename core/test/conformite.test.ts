import { describe, expect, it } from "vitest";
import {
  conformitePourMission,
  estConforme,
  libelleConformite,
  precisionConformite,
} from "../src/conformite";
import type { CertificationDetenue } from "../src/types";

const MISSION = {
  dateFin: "2026-10-21",
  certificationsRequises: [{ typeCode: "CACES_R482" as const, categorieCode: "B1" }],
};
const AUJOURDHUI = "2026-09-17";

const caces = (echeance: string, categorie = "B1"): CertificationDetenue => ({
  typeCode: "CACES_R482",
  categorieCode: categorie,
  dateEcheance: echeance,
});

describe("conformité d'une habilitation vis-à-vis d'une mission", () => {
  it("est valide quand le titre couvre la fin de la mission", () => {
    const [c] = conformitePourMission(MISSION, [caces("2034-03-15")], AUJOURDHUI);
    expect(c!.etat).toBe("valide");
    expect(c!.bloquant).toBe(false);
  });

  it("distingue « expire pendant la mission » de « valide »", () => {
    // Cœur du produit : le titre est bon aujourd'hui, périmé avant la fin du chantier.
    // Le confondre avec « valide » est exactement l'erreur que le produit évite.
    const [c] = conformitePourMission(MISSION, [caces("2026-10-10")], AUJOURDHUI);
    expect(c!.etat).toBe("expire_pendant");
    expect(c!.bloquant).toBe(true);
    expect(c!.dateEcheance).toBe("2026-10-10");
  });

  it("distingue « expirée » de « expire pendant »", () => {
    const [c] = conformitePourMission(MISSION, [caces("2026-08-01")], AUJOURDHUI);
    expect(c!.etat).toBe("expiree");
    expect(c!.bloquant).toBe(true);
  });

  it("signale l'absence quand aucun titre ne répond à l'exigence", () => {
    const [c] = conformitePourMission(MISSION, [], AUJOURDHUI);
    expect(c!.etat).toBe("absente");
    expect(c!.dateEcheance).toBeNull();
    expect(c!.bloquant).toBe(true);
  });

  it("n'accepte pas une catégorie différente de celle exigée", () => {
    const [c] = conformitePourMission(MISSION, [caces("2034-03-15", "C1")], AUJOURDHUI);
    expect(c!.etat).toBe("absente");
  });

  it("accepte n'importe quelle catégorie quand l'exigence n'en fixe aucune", () => {
    const sansCategorie = {
      dateFin: "2026-10-21",
      certificationsRequises: [{ typeCode: "CACES_R482" as const, categorieCode: null }],
    };
    const [c] = conformitePourMission(sansCategorie, [caces("2034-03-15", "C1")], AUJOURDHUI);
    expect(c!.etat).toBe("valide");
  });

  it("retient l'échéance la plus lointaine quand plusieurs titres conviennent", () => {
    const [c] = conformitePourMission(
      MISSION,
      [caces("2026-09-30"), caces("2031-01-01")],
      AUJOURDHUI
    );
    expect(c!.etat).toBe("valide");
    expect(c!.dateEcheance).toBe("2031-01-01");
  });

  describe("bornes", () => {
    it("un titre qui expire le jour même de la fin de mission est valide", () => {
      const [c] = conformitePourMission(MISSION, [caces("2026-10-21")], AUJOURDHUI);
      expect(c!.etat).toBe("valide");
    });

    it("un titre qui expire la veille de la fin ne l'est pas", () => {
      const [c] = conformitePourMission(MISSION, [caces("2026-10-20")], AUJOURDHUI);
      expect(c!.etat).toBe("expire_pendant");
    });

    it("un titre qui expire aujourd'hui n'est pas encore « expiré »", () => {
      const [c] = conformitePourMission(MISSION, [caces(AUJOURDHUI)], AUJOURDHUI);
      expect(c!.etat).toBe("expire_pendant");
    });
  });

  it("ne lit pas l'horloge : la date du jour est un paramètre", () => {
    // Le même titre change d'état selon la date passée, et selon elle seule.
    const titre = [caces("2026-10-10")];
    expect(conformitePourMission(MISSION, titre, "2026-09-17")[0]!.etat).toBe("expire_pendant");
    expect(conformitePourMission(MISSION, titre, "2026-10-15")[0]!.etat).toBe("expiree");
  });

  it("une mission sans exigence ne bloque personne", () => {
    const libre = { dateFin: "2026-10-21", certificationsRequises: [] };
    const conformites = conformitePourMission(libre, [], AUJOURDHUI);
    expect(conformites).toEqual([]);
    expect(estConforme(conformites)).toBe(true);
  });

  it("un seul état bloquant suffit à rendre le profil non conforme", () => {
    const deux = {
      dateFin: "2026-10-21",
      certificationsRequises: [
        { typeCode: "CACES_R482" as const, categorieCode: "B1" },
        { typeCode: "AIPR" as const, categorieCode: null },
      ],
    };
    const conformites = conformitePourMission(deux, [caces("2034-03-15")], AUJOURDHUI);
    expect(conformites.map((c) => c.etat)).toEqual(["valide", "absente"]);
    expect(estConforme(conformites)).toBe(false);
  });
});

describe("formulation", () => {
  const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

  it("dit ce qui bloque, et pas seulement que ça bloque", () => {
    const [c] = conformitePourMission(MISSION, [caces("2026-10-10")], AUJOURDHUI);
    const phrase = libelleConformite(c!, "CACES R482 — engins de chantier", enDateFr);
    expect(phrase).toContain("catégorie B1");
    expect(phrase).toContain("10/10/2026");
    expect(phrase).toContain("avant la fin du chantier");
  });

  it("nomme l'habilitation absente sans inventer de date", () => {
    const [c] = conformitePourMission(MISSION, [], AUJOURDHUI);
    expect(libelleConformite(c!, "CACES R482", enDateFr)).toBe(
      "CACES R482 — catégorie B1 : non déclarée."
    );
  });
});

describe("précision sans renommer l'habilitation", () => {
  const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

  it("ne répète pas le titre, déjà affiché au-dessus dans une liste", () => {
    const [c] = conformitePourMission(MISSION, [caces("2026-10-10")], AUJOURDHUI);
    const precision = precisionConformite(c!, enDateFr);
    expect(precision).not.toContain("CACES");
    expect(precision).toContain("10/10/2026");
    expect(precision).toContain("avant la fin du chantier");
  });

  it("reste explicite pour une habilitation non déclarée", () => {
    const [c] = conformitePourMission(MISSION, [], AUJOURDHUI);
    expect(precisionConformite(c!, enDateFr)).toMatch(/aucun titre/i);
  });
});
