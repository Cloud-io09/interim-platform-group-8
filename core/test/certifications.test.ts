import { describe, expect, it } from "vitest";
import {
  extraireCertifications,
  frequenceCertifications,
} from "../src/ingestion/certifications.js";

const types = (texte: string) => extraireCertifications(texte).map((c) => c.typeCode);
const cats = (texte: string, type: string) =>
  extraireCertifications(texte)
    .filter((c) => c.typeCode === type)
    .map((c) => c.categorieCode);

describe("détection de type — extraits réels d'offres France Travail", () => {
  it("repère un CACES R482 écrit de plusieurs façons", () => {
    expect(types("Vous êtes titulaire d'un CACES R482 en cours de validité.")).toContain("CACES_R482");
    expect(types("Caces R 482 catégorie B1 exigé")).toContain("CACES_R482");
    expect(types("CACES R.482 obligatoire")).toContain("CACES_R482");
    expect(types("Titulaire des CACES engins de chantier en cours de validité")).toContain("CACES_R482");
  });

  it("repère l'AIPR sous sa forme courte et développée", () => {
    expect(types("Vous possédez impérativement l'AIPR.")).toContain("AIPR");
    expect(
      types("une autorisation d'intervention à proximité des réseaux est demandée")
    ).toContain("AIPR");
  });

  it("repère l'habilitation électrique", () => {
    expect(types("Permis B et habilitations électrique à jour obligatoire")).toContain("HAB_ELEC");
    expect(types("AIPR + HF BF; H0 B0 + PERMIS BE")).toContain("HAB_ELEC");
  });

  it("repère le SST et l'amiante", () => {
    expect(types("certifications spécifiques (CACES, SST) appréciées")).toContain("SST");
    expect(types("Formation sauveteur secouriste du travail exigée")).toContain("SST");
    expect(types("travaux de désamiantage, formation amiante requise")).toContain("AMIANTE_SS4");
  });

  it("ne détecte rien sur une offre qui ne mentionne aucune certification", () => {
    expect(extraireCertifications("Manœuvre bâtiment, débutant accepté, port de charges.")).toEqual([]);
    expect(extraireCertifications("")).toEqual([]);
  });
});

describe("faux positifs — le motif large qu'il fallait éviter", () => {
  it("ne prend pas un « BR » isolé pour une habilitation électrique", () => {
    // Un motif en \bBR\b remonterait cette offre à tort.
    expect(types("Chantier à BREST, réf. BR-2026, livraison BR/12")).not.toContain("HAB_ELEC");
  });

  it("ne prend pas un « B0 » isolé hors contexte d'habilitation", () => {
    expect(types("Lot B0 du marché, zone B0 du plan")).not.toContain("HAB_ELEC");
  });

  it("n'attribue pas au R482 la catégorie d'une autre recommandation CACES", () => {
    // Cas réel : R486 est la nacelle, sa catégorie B ne doit pas être prise pour du R482.
    const texte = "CACES R482 engin de chantier F et CACES R486 PEMP nacelle (catégorie B)";
    expect(cats(texte, "CACES_R482")).toEqual(["F"]);
  });
});

describe("détection de catégorie", () => {
  it("remonte la catégorie nommée juste après le R482", () => {
    expect(cats("Vous êtes titulaire du CACES R482 catégorie B1", "CACES_R482")).toEqual(["B1"]);
  });

  it("remonte toutes les catégories quand l'offre en cite plusieurs", () => {
    expect(cats("CACES R482 valide (A, B1, C1 selon engins)", "CACES_R482")).toEqual(["A", "B1", "C1"]);
  });

  it("rend une catégorie nulle quand le texte n'en nomme aucune", () => {
    expect(cats("Vous êtes titulaire d'un CACES R482 en cours de validité.", "CACES_R482")).toEqual([null]);
  });

  it("ignore une lettre qui n'est pas une catégorie valide du type", () => {
    // R482 ne va pas au-delà de G : un « H » ne doit pas être inventé.
    expect(cats("CACES R482 catégorie H", "CACES_R482")).toEqual([null]);
  });

  it("rattache chaque catégorie à l'extrait de sa propre mention", () => {
    const texte =
      "Habilitation électrique B1 : Exécutant électricien - Habilitation électrique H2 : chargé de travaux.";
    const trouvees = extraireCertifications(texte).filter((c) => c.typeCode === "HAB_ELEC");
    expect(trouvees.map((c) => c.categorieCode)).toEqual(["B1", "H2"]);
    // Sans cette règle, H2 serait justifiée par un extrait affichant B1.
    expect(trouvees.find((c) => c.categorieCode === "H2")?.extrait).toContain("H2");
    expect(trouvees.find((c) => c.categorieCode === "B1")?.extrait).toContain("B1");
  });

  it("ne dédouble pas une catégorie citée deux fois", () => {
    expect(cats("CACES R482 B1 puis plus loin CACES R482 B1 encore", "CACES_R482")).toEqual(["B1"]);
  });
});

describe("frequenceCertifications", () => {
  it("compte une offre une seule fois même si elle cite plusieurs catégories", () => {
    const f = frequenceCertifications([{ texte: "CACES R482 A, B1 et C1 exigés" }]);
    expect(f).toEqual([{ typeCode: "CACES_R482", occurrences: 1, part: 1 }]);
  });

  it("calcule la part sur l'ensemble des offres et trie par fréquence", () => {
    const f = frequenceCertifications([
      { texte: "CACES R482 exigé" },
      { texte: "CACES R482 et AIPR exigés" },
      { texte: "aucune exigence" },
      { texte: "manœuvre débutant" },
    ]);
    expect(f[0]).toEqual({ typeCode: "CACES_R482", occurrences: 2, part: 0.5 });
    expect(f[1]).toEqual({ typeCode: "AIPR", occurrences: 1, part: 0.25 });
  });

  it("rend une liste vide sans offre", () => {
    expect(frequenceCertifications([])).toEqual([]);
  });
});
