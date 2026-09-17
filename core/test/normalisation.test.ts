import { describe, expect, it } from "vitest";
import {
  empreinteOffre,
  nettoyerCommune,
  nettoyerIntitule,
  nettoyerLot,
  nettoyerOffre,
  type OffreBrute,
} from "../src/ingestion/normalisation";

/** Offre réelle, réduite aux champs consommés. */
function offre(surcharge: Partial<OffreBrute> = {}): OffreBrute {
  return {
    id: "190ABCD",
    intitule: "MANOEUVRE EN MAÇONNERIE (H/F)",
    description: "Vous êtes titulaire du CACES R482 catégorie B1 en cours de validité.",
    romeCode: "F1703",
    romeLibelle: "Maçon / Maçonne",
    appellationlibelle: "Maçon / Maçonne",
    typeContrat: "MIS",
    dateCreation: "2026-09-10T08:00:00.000Z",
    entreprise: { nom: "Agence Intérim Grand Est" },
    salaire: { libelle: "Horaire de 12.31 Euros - Titres restaurant" },
    lieuTravail: { libelle: "51 - Reims", latitude: 49.26, longitude: 4.03, codePostal: "51100", commune: "51454" },
    competences: [{ code: "300265", libelle: "Charger, décharger des produits", exigence: "S" }],
    ...surcharge,
  };
}

describe("nettoyerIntitule", () => {
  it("retire les mentions de genre, y compris répétées", () => {
    expect(nettoyerIntitule("Maçon/Maçonne Traditionnel H/F (H/F)")).toBe("Maçon/Maçonne Traditionnel");
    expect(nettoyerIntitule("Tireur de rateau F/H")).toBe("Tireur de rateau");
    expect(nettoyerIntitule("Manœuvre bâtiment (H/F)")).toBe("Manœuvre bâtiment");
  });

  it("laisse intact un intitulé déjà propre", () => {
    expect(nettoyerIntitule("Coffreur bancheur")).toBe("Coffreur bancheur");
  });

  it("supprime la ponctuation qui traîne en fin de chaîne", () => {
    expect(nettoyerIntitule("Charpentier - H/F -")).toBe("Charpentier");
  });
});

describe("nettoyerOffre", () => {
  it("substitue le libellé du référentiel à l'intitulé libre de l'annonce", () => {
    const r = nettoyerOffre(offre());
    expect("motif" in r).toBe(false);
    if ("motif" in r) return;
    expect(r.intituleNormalise).toBe("Maçon / Maçonne");
    expect(r.intituleBrut).toBe("MANOEUVRE EN MAÇONNERIE");
  });

  it("convertit la rémunération en taux horaire et déduit le département", () => {
    const r = nettoyerOffre(offre({ salaire: { libelle: "Mensuel de 1800.0 Euros à 2000.0 Euros" } }));
    if ("motif" in r) throw new Error("offre rejetée à tort");
    expect(r.tauxHoraireMin).toBeCloseTo(11.87, 1);
    expect(r.departement).toBe("51");
  });

  it("extrait les certifications citées dans la description", () => {
    const r = nettoyerOffre(offre());
    if ("motif" in r) throw new Error("offre rejetée à tort");
    expect(r.certifications).toContain("CACES_R482");
  });

  it("écarte les offres hors des quatre domaines de terrain", () => {
    // F1106 : conception et études. Hors périmètre produit, écarté à l'ingestion.
    expect(nettoyerOffre(offre({ romeCode: "F1106" }))).toMatchObject({ motif: "hors_domaine_terrain" });
    // F1201 : encadrement de chantier.
    expect(nettoyerOffre(offre({ romeCode: "F1201" }))).toMatchObject({ motif: "hors_domaine_terrain" });
    // N1105 : logistique, autre secteur.
    expect(nettoyerOffre(offre({ romeCode: "N1105" }))).toMatchObject({ motif: "hors_domaine_terrain" });
  });

  it("retient les quatre domaines de terrain", () => {
    for (const rome of ["F1301", "F1503", "F1601", "F1703"]) {
      expect(nettoyerOffre(offre({ romeCode: rome })), rome).not.toHaveProperty("motif");
    }
  });

  it("écarte une offre sans code ROME ni intitulé exploitable", () => {
    expect(nettoyerOffre(offre({ romeCode: undefined }))).toMatchObject({ motif: "rome_absent" });
    expect(
      nettoyerOffre(offre({ appellationlibelle: undefined, romeLibelle: undefined }))
    ).toMatchObject({ motif: "intitule_absent" });
  });

  it("retombe sur le libellé normalisé quand l'annonce n'a pas d'intitulé propre", () => {
    const r = nettoyerOffre(offre({ intitule: undefined }));
    if ("motif" in r) throw new Error("offre rejetée à tort");
    expect(r.intituleBrut).toBe("Maçon / Maçonne");
  });

  it("tolère l'absence de date de publication et d'employeur", () => {
    const r = nettoyerOffre(offre({ dateCreation: undefined, entreprise: undefined }));
    if ("motif" in r) throw new Error("offre rejetée à tort");
    expect(r.dateCreationFt).toBeNull();
    // L'empreinte reste calculable : elle tolère un employeur inconnu plutôt que
    // d'écarter l'offre, quitte à dédoublonner un peu moins finement.
    expect(r.empreinte).toHaveLength(32);
  });

  it("tolère une offre sans salaire, sans coordonnées et sans compétences", () => {
    const r = nettoyerOffre(offre({ salaire: undefined, lieuTravail: undefined, competences: undefined }));
    if ("motif" in r) throw new Error("offre rejetée à tort");
    expect(r.tauxHoraireMin).toBeNull();
    expect(r.lat).toBeNull();
    expect(r.departement).toBeNull();
    expect(r.competences).toEqual([]);
  });
});

describe("empreinte de quasi-doublon", () => {
  it("ignore la casse et les accents", () => {
    expect(empreinteOffre("Maçon / Maçonne", "51454", "Agence X")).toBe(
      empreinteOffre("MACON / MACONNE", "51454", "agence x")
    );
  });

  it("distingue deux communes différentes", () => {
    expect(empreinteOffre("Maçon", "51454", "Agence X")).not.toBe(empreinteOffre("Maçon", "51108", "Agence X"));
  });

  it("distingue deux employeurs différents", () => {
    expect(empreinteOffre("Maçon", "51454", "Agence X")).not.toBe(empreinteOffre("Maçon", "51454", "Agence Y"));
  });
});

describe("nettoyerLot", () => {
  it("écarte le même identifiant réingéré deux fois", () => {
    const { retenues, bilan } = nettoyerLot([offre(), offre()]);
    expect(retenues).toHaveLength(1);
    expect(bilan.doublon_exact).toBe(1);
  });

  it("écarte la même mission republiée sous un autre identifiant", () => {
    // Cas réel : une agence republie à quelques jours d'intervalle.
    const { retenues, bilan } = nettoyerLot([offre({ id: "A" }), offre({ id: "B" })]);
    expect(retenues).toHaveLength(1);
    expect(bilan.doublon_proche).toBe(1);
  });

  it("garde deux missions du même métier dans des communes différentes", () => {
    const ailleurs = offre({
      id: "B",
      lieuTravail: { latitude: 49.1, longitude: 4.1, codePostal: "51200", commune: "51230" },
    });
    expect(nettoyerLot([offre(), ailleurs]).retenues).toHaveLength(2);
  });

  it("rend un bilan chiffré par motif", () => {
    const { bilan } = nettoyerLot([
      offre({ id: "A" }),
      offre({ id: "B" }),
      offre({ id: "C", romeCode: "F1106" }),
      offre({ id: "D", romeCode: undefined }),
    ]);
    expect(bilan).toMatchObject({
      retenues: 1,
      doublon_proche: 1,
      hors_domaine_terrain: 1,
      rome_absent: 1,
    });
  });

  it("rend un lot vide sans planter", () => {
    expect(nettoyerLot([])).toMatchObject({ retenues: [], rejets: [], bilan: { retenues: 0 } });
  });
});

describe("nettoyerCommune", () => {
  it("retire le préfixe de département", () => {
    expect(nettoyerCommune("51 - Reims")).toBe("Reims");
    expect(nettoyerCommune("973 - Cayenne")).toBe("Cayenne");
  });

  it("gère la Corse, dont le code n'est pas numérique", () => {
    // Sans ça, le produit affichait « 2b - Bastia » comme nom de commune.
    expect(nettoyerCommune("2B - BASTIA")).toBe("Bastia");
    expect(nettoyerCommune("2A - AJACCIO")).toBe("Ajaccio");
  });

  it("remet une commune tout en majuscules dans une casse lisible", () => {
    // Cas réel : l'API alterne « 29 - QUIMPERLE » et « 29 - Quimperlé ».
    expect(nettoyerCommune("29 - QUIMPERLE")).toBe("Quimperle");
    expect(nettoyerCommune("29 - CLOHARS CARNOET")).toBe("Clohars Carnoet");
  });

  it("respecte les particules et les traits d'union", () => {
    expect(nettoyerCommune("973 - SAINT-LAURENT-DU-MARONI")).toBe("Saint-Laurent-du-Maroni");
    expect(nettoyerCommune("85 - TRANCHE-SUR-MER")).toBe("Tranche-sur-Mer");
    expect(nettoyerCommune("17 - LA ROCHELLE")).toBe("La Rochelle");
  });

  it("capitalise le premier mot même s'il ressemble à une particule", () => {
    expect(nettoyerCommune("76 - LE HAVRE")).toBe("Le Havre");
  });

  it("gère les apostrophes", () => {
    expect(nettoyerCommune("34 - L'ISLE-SUR-LA-SORGUE")).toBe("L'Isle-sur-la-Sorgue");
  });

  it("rend null quand le libellé est absent ou vide", () => {
    expect(nettoyerCommune(undefined)).toBeNull();
    expect(nettoyerCommune("")).toBeNull();
    expect(nettoyerCommune("51 - ")).toBeNull();
  });

  it("laisse intact un libellé déjà propre et sans préfixe", () => {
    expect(nettoyerCommune("Reims")).toBe("Reims");
  });
});
