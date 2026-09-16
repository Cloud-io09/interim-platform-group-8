import { describe, expect, it } from "vitest";
import { filtrer, matcher, noter, PONDERATIONS } from "../src/matching";
import type { MissionAMatcher, ProfilInterimaire } from "../src/types";

/** Chantier à Reims, du 1er au 21 mars 2026 (21 jours). */
function mission(surcharge: Partial<MissionAMatcher> = {}): MissionAMatcher {
  return {
    missionId: 1,
    lat: 49.2628,
    lon: 4.0347,
    dateDebut: "2026-03-01",
    dateFin: "2026-03-21",
    certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
    competencesRequises: [],
    ...surcharge,
  };
}

function profil(surcharge: Partial<ProfilInterimaire> = {}): ProfilInterimaire {
  return {
    interimaireId: 10,
    lat: 49.2628,
    lon: 4.0347,
    rayonMobiliteKm: 40,
    certifications: [
      { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2030-01-01" },
    ],
    competences: [],
    disponibilites: [{ dateDebut: "2026-01-01", dateFin: "2026-12-31" }],
    ...surcharge,
  };
}

describe("étape 1 — filtre éliminatoire", () => {
  it("retient un profil dont la certification requise couvre toute la mission", () => {
    const { retenus, ecartes } = filtrer(mission(), [profil()]);
    expect(retenus).toHaveLength(1);
    expect(ecartes).toHaveLength(0);
  });

  it("écarte un profil qui ne détient pas du tout la certification requise", () => {
    const sans = profil({ certifications: [] });
    const { retenus, ecartes } = filtrer(mission(), [sans]);
    expect(retenus).toHaveLength(0);
    expect(ecartes[0]).toMatchObject({
      interimaireId: 10,
      motif: "certification_absente",
      typeCode: "CACES_R482",
      categorieCode: "B1",
    });
  });

  it("écarte un profil qui détient le bon type mais la mauvaise catégorie", () => {
    const mauvaiseCategorie = profil({
      certifications: [
        { typeCode: "CACES_R482", categorieCode: "C1", dateEcheance: "2030-01-01" },
      ],
    });
    const { ecartes } = filtrer(mission(), [mauvaiseCategorie]);
    expect(ecartes[0]?.motif).toBe("certification_absente");
  });

  it("accepte n'importe quelle catégorie quand l'exigence n'en précise aucune", () => {
    const m = mission({
      certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: null }],
    });
    const p = profil({
      certifications: [
        { typeCode: "CACES_R482", categorieCode: "G", dateEcheance: "2030-01-01" },
      ],
    });
    expect(filtrer(m, [p]).retenus).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // La règle la plus importante du produit.
  // ---------------------------------------------------------------------------
  it("écarte un profil dont la certification est valide au début mais expire PENDANT la mission", () => {
    const expireAuMilieu = profil({
      certifications: [
        // Valide au 1er mars, expirée au 21 : l'affectation serait non conforme.
        { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2026-03-10" },
      ],
    });
    const { retenus, ecartes } = filtrer(mission(), [expireAuMilieu]);
    expect(retenus).toHaveLength(0);
    expect(ecartes[0]).toMatchObject({
      motif: "certification_expiree",
      dateEcheance: "2026-03-10",
    });
  });

  it("retient un profil dont la certification expire exactement le dernier jour de mission", () => {
    const pileALaFin = profil({
      certifications: [
        { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2026-03-21" },
      ],
    });
    expect(filtrer(mission(), [pileALaFin]).retenus).toHaveLength(1);
  });

  it("écarte un profil dont la certification expire la veille de la fin de mission", () => {
    const laVeille = profil({
      certifications: [
        { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2026-03-20" },
      ],
    });
    expect(filtrer(mission(), [laVeille]).ecartes[0]?.motif).toBe("certification_expiree");
  });

  it("compare à la date de fin de mission et non à la date du jour", () => {
    // Mission déjà passée, certification expirée depuis, mais valide à l'époque :
    // le profil doit être retenu. Si le filtre lisait l'horloge, il l'écarterait.
    const missionPassee = mission({ dateDebut: "2020-01-01", dateFin: "2020-01-31" });
    const expireeDepuis = profil({
      certifications: [
        { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2020-06-01" },
      ],
    });
    expect(filtrer(missionPassee, [expireeDepuis]).retenus).toHaveLength(1);
  });

  it("exige que TOUTES les certifications requises soient couvertes", () => {
    const m = mission({
      certificationsRequises: [
        { typeCode: "CACES_R482", categorieCode: "B1" },
        { typeCode: "AIPR", categorieCode: null },
      ],
    });
    const { ecartes } = filtrer(m, [profil()]);
    expect(ecartes[0]).toMatchObject({ motif: "certification_absente", typeCode: "AIPR" });
  });

  it("retient tout le monde quand la mission n'exige aucune certification", () => {
    const m = mission({ certificationsRequises: [] });
    const p = profil({ certifications: [] });
    expect(filtrer(m, [p]).retenus).toHaveLength(1);
  });

  it("remonte l'échéance la plus lointaine parmi plusieurs certifications du même type", () => {
    const plusieurs = profil({
      certifications: [
        { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2026-01-05" },
        { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2026-03-15" },
      ],
    });
    expect(filtrer(mission(), [plusieurs]).ecartes[0]?.dateEcheance).toBe("2026-03-15");
  });

  it("remonte la plus lointaine quelle que soit sa position dans la liste", () => {
    const ordreInverse = profil({
      certifications: [
        { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2026-03-15" },
        { typeCode: "CACES_R482", categorieCode: "B1", dateEcheance: "2026-01-05" },
      ],
    });
    expect(filtrer(mission(), [ordreInverse]).ecartes[0]?.dateEcheance).toBe("2026-03-15");
  });
});

describe("étape 2 — scoring", () => {
  it("note 1 en compétences quand la mission n'en exige aucune", () => {
    expect(noter(mission(), profil()).competences).toBe(1);
  });

  it("note la proportion de compétences communes", () => {
    const m = mission({ competencesRequises: ["300265", "400288", "400290"] });
    const p = profil({ competences: ["300265", "400288", "999999"] });
    const score = noter(m, p);
    expect(score.competences).toBeCloseTo(2 / 3);
    expect(score.detail.competencesCommunes).toEqual(["300265", "400288"]);
  });

  it("note 1 en distance quand le chantier est à l'adresse du profil", () => {
    expect(noter(mission(), profil()).distance).toBe(1);
  });

  it("décroît linéairement avec la distance rapportée au rayon", () => {
    // ~20 km au nord de Reims, rayon 40 km : on attend environ 0,5.
    const loin = profil({ lat: 49.4428, lon: 4.0347 });
    const score = noter(mission(), loin);
    expect(score.distance).toBeGreaterThan(0.4);
    expect(score.distance).toBeLessThan(0.6);
  });

  it("note 0 en distance au-delà du rayon de mobilité, sans exclure le profil", () => {
    const tresLoin = profil({ lat: 43.6045, lon: 1.444, rayonMobiliteKm: 40 }); // Toulouse
    const score = noter(mission(), tresLoin);
    expect(score.distance).toBe(0);
    expect(filtrer(mission(), [tresLoin]).retenus).toHaveLength(1);
  });

  it("note 0 en distance plutôt que de diviser par zéro si le rayon est nul", () => {
    expect(noter(mission(), profil({ rayonMobiliteKm: 0 })).distance).toBe(0);
  });

  it("note 0 en disponibilité sur une mission aux dates inversées", () => {
    // La base interdit ce cas (CHECK date_fin >= date_debut) ; le moteur ne doit
    // pas pour autant produire un score négatif si la donnée arrive corrompue.
    const incoherente = mission({ dateDebut: "2026-03-21", dateFin: "2026-03-01" });
    expect(noter(incoherente, profil()).disponibilite).toBe(0);
  });

  it("tient compte du rayon propre à chaque intérimaire", () => {
    const loin = { lat: 49.4428, lon: 4.0347 };
    const petitRayon = noter(mission(), profil({ ...loin, rayonMobiliteKm: 20 }));
    const grandRayon = noter(mission(), profil({ ...loin, rayonMobiliteKm: 100 }));
    expect(grandRayon.distance).toBeGreaterThan(petitRayon.distance);
  });

  it("note la disponibilité au prorata des jours couverts", () => {
    // Disponible du 1er au 11 mars sur une mission de 21 jours.
    const partiel = profil({
      disponibilites: [{ dateDebut: "2026-03-01", dateFin: "2026-03-11" }],
    });
    const score = noter(mission(), partiel);
    expect(score.detail.joursMission).toBe(21);
    expect(score.detail.joursChevauchement).toBe(11);
    expect(score.disponibilite).toBeCloseTo(11 / 21);
  });

  it("note 0 en disponibilité quand aucune période ne recouvre la mission", () => {
    const indisponible = profil({
      disponibilites: [{ dateDebut: "2026-06-01", dateFin: "2026-06-30" }],
    });
    expect(noter(mission(), indisponible).disponibilite).toBe(0);
  });

  it("compose le total à partir des trois critères pondérés", () => {
    const score = noter(mission(), profil());
    const attendu =
      PONDERATIONS.competences * score.competences +
      PONDERATIONS.distance * score.distance +
      PONDERATIONS.disponibilite * score.disponibilite;
    expect(score.total).toBeCloseTo(attendu);
  });

  it("somme les pondérations à 1", () => {
    const somme =
      PONDERATIONS.competences + PONDERATIONS.distance + PONDERATIONS.disponibilite;
    expect(somme).toBeCloseTo(1);
  });
});

describe("enchaînement des deux étapes", () => {
  it("ne score jamais un profil écarté, même parfait sur les autres critères", () => {
    const parfaitMaisNonConforme = profil({
      interimaireId: 99,
      certifications: [],
      competences: ["300265"],
    });
    const m = mission({ competencesRequises: ["300265"] });
    const resultat = matcher(m, [parfaitMaisNonConforme]);

    expect(resultat.retenus).toHaveLength(0);
    expect(resultat.ecartes).toHaveLength(1);
    expect(resultat.retenus.map((r) => r.interimaireId)).not.toContain(99);
  });

  it("trie les profils retenus par score décroissant", () => {
    const proche = profil({ interimaireId: 1 });
    const loin = profil({ interimaireId: 2, lat: 49.4428, lon: 4.0347 });
    const resultat = matcher(mission(), [loin, proche]);
    expect(resultat.retenus.map((r) => r.interimaireId)).toEqual([1, 2]);
  });

  it("compte tous les profils évalués, retenus comme écartés", () => {
    const resultat = matcher(mission(), [profil({ interimaireId: 1 }), profil({ interimaireId: 2, certifications: [] })]);
    expect(resultat.evalues).toBe(2);
    expect(resultat.retenus).toHaveLength(1);
    expect(resultat.ecartes).toHaveLength(1);
  });
});
