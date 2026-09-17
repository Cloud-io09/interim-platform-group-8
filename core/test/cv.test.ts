import { describe, expect, it } from "vitest";
import {
  analyserCv,
  detecterCompetences,
  detecterMetiers,
  LONGUEUR_MIN_CV,
  motsSignifiants,
  normaliser,
  rapprocherMissions,
  variantesLibelle,
} from "../src/cv";

/** Extraits de libellés réels du référentiel ROME semé en base. */
const METIERS = [
  { code: "F1703", libelle: "Maçon / Maçonne" },
  { code: "F1302", libelle: "Conducteur / Conductrice d'engins de chantier" },
  { code: "F1301", libelle: "Grutier / Grutière" },
  { code: "F1701", libelle: "Coffreur / Coffreuse" },
  { code: "F1503", libelle: "Charpentier / Charpentière" },
];

const COMPETENCES = [
  { code: "300265", libelle: "Charger, décharger, manutentionner des produits" },
  { code: "400288", libelle: "Déblayer, remblayer un terrain" },
  { code: "400290", libelle: "Positionner des éléments d'armature de béton" },
];

/** CV de chantier plausible, écrit comme un intérimaire l'écrirait. */
const CV = `
CURRICULUM VITAE — Karim Benali
Maçon coffreur, 8 ans d'expérience sur chantiers de gros œuvre.

EXPÉRIENCE
2019-2026 — Maçon / Maçonne chez Bâtiment Rémois, Reims.
  Réalisation de fondations, murs porteurs, dalles béton.
  Déblayer, remblayer un terrain avant coulage.
2016-2019 — Conducteur d'engins de chantier, TP Marne.
  Conduite de pelle hydraulique et de chargeuse sur voiries urbaines.

FORMATIONS ET HABILITATIONS
  CACES R482 catégorie B1 — obtenu en 2024
  AIPR opérateur
  Habilitation électrique B0

DIVERS
  Permis B. Véhiculé. Disponible immédiatement.
`;

describe("normalisation du texte", () => {
  it("retire accents, casse et ponctuation", () => {
    expect(normaliser("Maçon / Maçonne")).toBe("macon macon ne".replace(" ne", "ne"));
    expect(normaliser("Déblayer, remblayer un terrain")).toBe("deblayer remblayer un terrain");
  });

  it("écarte les mots trop courts et les mots vides d'un CV de chantier", () => {
    const mots = motsSignifiants("Expérience de 8 ans sur chantier avec une entreprise de maçonnerie");
    expect(mots.has("maconnerie")).toBe(true);
    // « expérience », « chantier », « entreprise » n'identifient rien dans ce contexte.
    expect(mots.has("experience")).toBe(false);
    expect(mots.has("chantier")).toBe(false);
    expect(mots.has("entreprise")).toBe(false);
  });
});

describe("variantes d'un libellé ROME", () => {
  it("déplie les deux genres en gardant le complément", () => {
    expect(variantesLibelle("Conducteur / Conductrice d'engins de chantier")).toEqual([
      "conducteur d engins de chantier",
      "conductrice d engins de chantier",
    ]);
  });

  it("gère un libellé sans variante de genre", () => {
    expect(variantesLibelle("Échafaudeur")).toEqual(["echafaudeur"]);
  });
});

describe("détection des métiers", () => {
  it("reconnaît un métier cité au féminin comme au masculin", () => {
    expect(detecterMetiers("J'ai travaillé comme maconne pendant 5 ans", METIERS).map((m) => m.code)).toEqual(["F1703"]);
  });

  it("reconnaît un métier écrit sans accent ni ponctuation", () => {
    expect(detecterMetiers("conducteur d engins de chantier", METIERS).map((m) => m.code)).toEqual(["F1302"]);
  });

  it("trouve plusieurs métiers dans un même CV", () => {
    const codes = detecterMetiers(CV, METIERS).map((m) => m.code);
    expect(codes).toContain("F1703");
    expect(codes).toContain("F1302");
  });

  it("n'invente pas un métier absent du CV", () => {
    expect(detecterMetiers(CV, METIERS).map((m) => m.code)).not.toContain("F1301");
  });

  it("reconnaît un métier tenant en un seul mot, s'il est distinctif", () => {
    // « Grutier » désigne un métier sans ambiguïté : l'écarter ferait manquer
    // les intitulés les plus courants du secteur.
    expect(detecterMetiers("ancien grutier sur grue a tour", METIERS).map((m) => m.code)).toEqual(["F1301"]);
  });

  it("n'attribue pas un métier sur un fragment de mot", () => {
    // « maconnerie » contient « macon » : la correspondance doit porter sur le mot
    // entier, pas sur une sous-chaîne.
    expect(detecterMetiers("travaux de maconnerie generale", METIERS).map((m) => m.code)).toEqual([]);
  });

  it("rend le fragment qui a déclenché la détection", () => {
    const [trouve] = detecterMetiers("ancien macon maconne sur gros oeuvre", METIERS);
    expect(trouve?.declencheur).toBeTypeOf("string");
  });
});

describe("détection des compétences", () => {
  it("reconnaît une compétence citée mot pour mot", () => {
    expect(detecterCompetences(CV, COMPETENCES).map((c) => c.code)).toContain("400288");
  });

  it("n'invente pas une compétence absente", () => {
    expect(detecterCompetences(CV, COMPETENCES).map((c) => c.code)).not.toContain("400290");
  });
});

describe("analyse complète", () => {
  it("remonte métiers, compétences et certifications d'un CV réaliste", () => {
    const a = analyserCv(CV, METIERS, COMPETENCES);
    expect(a.tropCourt).toBe(false);
    expect(a.metiers.length).toBeGreaterThanOrEqual(2);
    expect(a.competences.map((c) => c.code)).toContain("400288");
    const types = a.certifications.map((c) => c.typeCode);
    expect(types).toContain("CACES_R482");
    expect(types).toContain("AIPR");
    expect(types).toContain("HAB_ELEC");
  });

  it("retrouve la catégorie du CACES quand le CV la précise", () => {
    const caces = analyserCv(CV, METIERS, COMPETENCES).certifications.find((c) => c.typeCode === "CACES_R482");
    expect(caces?.categorieCode).toBe("B1");
  });

  it("refuse d'analyser un texte trop court — un scan sans couche texte, par exemple", () => {
    const a = analyserCv("Karim Benali, maçon.", METIERS, COMPETENCES);
    expect(a.tropCourt).toBe(true);
    expect(a.metiers).toEqual([]);
  });

  it("accepte un texte juste au-dessus du seuil", () => {
    expect(analyserCv("a".repeat(LONGUEUR_MIN_CV + 1), METIERS, COMPETENCES).tropCourt).toBe(false);
  });
});

describe("rapprochement CV ↔ missions", () => {
  const MISSIONS = [
    { missionId: 1, titre: "Maçon coffreur — fondations et murs porteurs", description: "Réalisation de dalles béton.", metierLibelle: "Maçon / Maçonne" },
    { missionId: 2, titre: "Pelle hydraulique — voiries urbaines", description: "Conduite de chargeuse.", metierLibelle: "Conducteur / Conductrice d'engins de chantier" },
    { missionId: 3, titre: "Cuisinier de collectivité", description: "Préparation de repas en liaison froide.", metierLibelle: "Cuisinier" },
  ];

  it("classe en tête les fiches qui partagent le plus de vocabulaire avec le CV", () => {
    const s = rapprocherMissions(CV, MISSIONS);
    expect(s[0]?.missionId).toBeOneOf([1, 2]);
    // Une mission sans rapport ne doit pas remonter.
    expect(s.map((x) => x.missionId)).not.toContain(3);
  });

  it("expose les mots communs, pour que la suggestion soit justifiable", () => {
    const s = rapprocherMissions(CV, MISSIONS);
    expect(s[0]?.motsCommuns.length).toBeGreaterThanOrEqual(2);
  });

  it("exige un minimum de mots communs plutôt que de tout proposer", () => {
    expect(rapprocherMissions("Boulanger pâtissier en fournil", MISSIONS)).toEqual([]);
  });

  it("rend une liste vide sur un CV sans mot signifiant", () => {
    expect(rapprocherMissions("de la et le", MISSIONS)).toEqual([]);
  });

  it("ne dit rien de l'éligibilité : une mission proche peut exclure le profil", () => {
    // Garde-fou explicite : le rapprochement ignore certifications, dates et distance.
    const s = rapprocherMissions(CV, MISSIONS);
    expect(Object.keys(s[0] ?? {})).toEqual(["missionId", "proximite", "motsCommuns"]);
  });
});
