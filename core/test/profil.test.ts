import { describe, expect, it } from "vitest";
import {
  RAYON_DEFAUT_KM,
  DUREE_MAX_DISPONIBILITE_JOURS,
  siretValide,
  validerDisponibilite,
  validerCertification,
  validerProfilEntreprise,
  validerProfilInterimaire,
} from "../src/profil";

const champs = (p: { champ: string }[]) => p.map((x) => x.champ).sort();

const interimaireValide = {
  prenom: "Karim",
  nom: "Benali",
  codePostal: "51100",
  ville: "Reims",
  rayonMobiliteKm: RAYON_DEFAUT_KM,
  metiers: ["F1703"],
};

describe("profil intérimaire", () => {
  it("accepte une saisie complète", () => {
    expect(validerProfilInterimaire(interimaireValide)).toEqual([]);
  });

  it("exige identité, ville, code postal et au moins un métier", () => {
    expect(champs(validerProfilInterimaire({}))).toEqual([
      "codePostal",
      "metiers",
      "nom",
      "prenom",
      "rayonMobiliteKm",
      "ville",
    ]);
  });

  it("refuse un code postal qui n'a pas cinq chiffres", () => {
    for (const cp of ["5110", "511000", "51 100", "ABCDE"]) {
      expect(champs(validerProfilInterimaire({ ...interimaireValide, codePostal: cp })), cp).toContain(
        "codePostal"
      );
    }
  });

  it("borne la zone de déplacement", () => {
    expect(champs(validerProfilInterimaire({ ...interimaireValide, rayonMobiliteKm: 2 }))).toContain("rayonMobiliteKm");
    expect(champs(validerProfilInterimaire({ ...interimaireValide, rayonMobiliteKm: 500 }))).toContain("rayonMobiliteKm");
    expect(validerProfilInterimaire({ ...interimaireValide, rayonMobiliteKm: 5 })).toEqual([]);
    expect(validerProfilInterimaire({ ...interimaireValide, rayonMobiliteKm: 200 })).toEqual([]);
  });

  it("laisse la carte BTP facultative", () => {
    expect(validerProfilInterimaire({ ...interimaireValide, carteBtpNumero: "" })).toEqual([]);
  });

  it("exige une date d'échéance dès qu'un numéro de carte BTP est déclaré", () => {
    // Une carte sans échéance ne permettrait pas de signaler qu'elle est périmée.
    const p = validerProfilInterimaire({ ...interimaireValide, carteBtpNumero: "BTP123456" });
    expect(champs(p)).toContain("carteBtpEcheance");
    expect(
      validerProfilInterimaire({
        ...interimaireValide,
        carteBtpNumero: "BTP123456",
        carteBtpEcheance: "2028-06-30",
      })
    ).toEqual([]);
  });
});

describe("profil entreprise", () => {
  const valide = { raisonSociale: "Bâtiment Rémois SAS", codePostal: "51100", ville: "Reims" };

  it("accepte une saisie complète sans SIRET", () => {
    expect(validerProfilEntreprise(valide)).toEqual([]);
  });

  it("exige raison sociale, ville et code postal", () => {
    expect(champs(validerProfilEntreprise({}))).toEqual(["codePostal", "raisonSociale", "ville"]);
  });

  it("valide la clé de Luhn du SIRET", () => {
    // Numéro dont la clé de Luhn est correcte, et le même avec un chiffre modifié.
    expect(siretValide("44306184100005")).toBe(true);
    expect(siretValide("44306184100006")).toBe(false);
    // Les espaces de mise en forme ne doivent pas faire échouer la validation.
    expect(siretValide("443 061 841 00005")).toBe(true);
    expect(siretValide("123")).toBe(false);
    expect(siretValide("abcdefghijklmn")).toBe(false);
  });

  it("refuse un SIRET saisi mais faux, et tolère un SIRET absent", () => {
    expect(champs(validerProfilEntreprise({ ...valide, siret: "12345678901234" }))).toContain("siret");
    expect(validerProfilEntreprise({ ...valide, siret: "" })).toEqual([]);
    expect(validerProfilEntreprise({ ...valide, siret: "44306184100005" })).toEqual([]);
  });
});

describe("certification déclarée", () => {
  const caces = {
    typeCode: "CACES_R482",
    categorieCode: "B1",
    organismeEmetteur: "AFPA",
    numero: "R482-2024-004871",
    dateObtention: "2024-03-15",
    dateEcheance: "2034-03-15",
  };

  it("accepte une certification correcte", () => {
    expect(validerCertification(caces)).toEqual([]);
  });

  it("refuse un type hors de la liste fermée", () => {
    expect(champs(validerCertification({ ...caces, typeCode: "CACES_R999" }))).toEqual(["typeCode"]);
    expect(champs(validerCertification({ ...caces, typeCode: "titre maison" }))).toEqual(["typeCode"]);
  });

  it("exige une catégorie quand le titre en comporte", () => {
    expect(champs(validerCertification({ ...caces, categorieCode: "" }))).toContain("categorieCode");
  });

  it("refuse une catégorie qui n'existe pas pour ce titre", () => {
    // H0 appartient à l'habilitation électrique, pas au R482.
    expect(champs(validerCertification({ ...caces, categorieCode: "H0" }))).toContain("categorieCode");
  });

  it("refuse une catégorie sur un titre qui n'en a pas", () => {
    const aipr = { ...caces, typeCode: "AIPR", categorieCode: "B1", dateEcheance: "2029-03-15" };
    expect(champs(validerCertification(aipr))).toContain("categorieCode");
  });

  it("accepte l'AIPR sans catégorie", () => {
    expect(
      validerCertification({ ...caces, typeCode: "AIPR", categorieCode: "", dateEcheance: "2029-03-15" })
    ).toEqual([]);
  });

  it("exige organisme, numéro et les deux dates", () => {
    expect(champs(validerCertification({ typeCode: "AIPR" }))).toEqual([
      "dateEcheance",
      "dateObtention",
      "numero",
      "organismeEmetteur",
    ]);
  });

  it("refuse une échéance antérieure ou égale à l'obtention", () => {
    expect(champs(validerCertification({ ...caces, dateEcheance: "2024-03-15" }))).toContain("dateEcheance");
    expect(champs(validerCertification({ ...caces, dateEcheance: "2020-01-01" }))).toContain("dateEcheance");
  });

  it("signale une échéance très au-delà de la durée légale du titre", () => {
    // Le SST vaut 2 ans : une échéance à 10 ans est une erreur de saisie.
    const sst = {
      typeCode: "SST",
      categorieCode: "",
      organismeEmetteur: "INRS",
      numero: "SST-2024-77",
      dateObtention: "2024-03-15",
      dateEcheance: "2034-03-15",
    };
    expect(champs(validerCertification(sst))).toContain("dateEcheance");
  });

  it("tolère un décalage d'un an, les organismes n'émettant pas toujours à la date exacte", () => {
    expect(
      validerCertification({
        typeCode: "SST",
        categorieCode: "",
        organismeEmetteur: "INRS",
        numero: "SST-2024-77",
        dateObtention: "2024-03-15",
        dateEcheance: "2026-09-15",
      })
    ).toEqual([]);
  });

  it("refuse une date mal formée plutôt que de l'interpréter", () => {
    expect(champs(validerCertification({ ...caces, dateObtention: "15/03/2024" }))).toContain("dateObtention");
  });
});

describe("disponibilités", () => {
  it("accepte une période cohérente", () => {
    expect(validerDisponibilite({ dateDebut: "2027-05-01", dateFin: "2027-06-30" })).toEqual([]);
  });

  it("accepte une période d'un seul jour", () => {
    expect(validerDisponibilite({ dateDebut: "2027-05-01", dateFin: "2027-05-01" })).toEqual([]);
  });

  it("exige les deux dates", () => {
    expect(champs(validerDisponibilite({}))).toEqual(["dateDebut", "dateFin"]);
    expect(champs(validerDisponibilite({ dateDebut: "2027-05-01" }))).toEqual(["dateFin"]);
  });

  it("refuse une fin antérieure au début", () => {
    expect(champs(validerDisponibilite({ dateDebut: "2027-06-30", dateFin: "2027-05-01" }))).toEqual(["dateFin"]);
  });

  it("refuse une date mal formée plutôt que de l'interpréter", () => {
    expect(champs(validerDisponibilite({ dateDebut: "01/05/2027", dateFin: "2027-06-30" }))).toContain("dateDebut");
  });

  it(`refuse une période de plus de ${DUREE_MAX_DISPONIBILITE_JOURS} jours`, () => {
    // Une disponibilité déclarée pour dix ans n'est pas une information : elle
    // cesserait de refléter la réalité au bout de quelques semaines.
    expect(champs(validerDisponibilite({ dateDebut: "2027-01-01", dateFin: "2037-01-01" }))).toEqual(["dateFin"]);
    expect(validerDisponibilite({ dateDebut: "2027-01-01", dateFin: "2028-12-30" })).toEqual([]);
  });
});
