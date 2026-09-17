import { describe, expect, it } from "vitest";
import {
  actionsPossibles,
  attendUneReponseDe,
  libelleAction,
  transitionPermise,
  type EtatCandidature,
} from "../src/candidature";

describe("cycle de vie d'une candidature", () => {
  it("laisse chacun saisir ou écarter un rapprochement du moteur", () => {
    expect(transitionPermise("proposee", "interimaire", "candidatee")).toBe(true);
    expect(transitionPermise("proposee", "entreprise", "sollicitee")).toBe(true);
    expect(transitionPermise("proposee", "interimaire", "declinee")).toBe(true);
    expect(transitionPermise("proposee", "entreprise", "declinee")).toBe(true);
  });

  it("interdit qu'une partie conclue seule", () => {
    // Le cœur du bilatéral : postuler n'affecte pas, solliciter non plus.
    expect(transitionPermise("proposee", "interimaire", "acceptee")).toBe(false);
    expect(transitionPermise("proposee", "entreprise", "acceptee")).toBe(false);
  });

  it("rend la main à l'autre partie après un engagement", () => {
    expect(transitionPermise("candidatee", "entreprise", "acceptee")).toBe(true);
    expect(transitionPermise("candidatee", "interimaire", "acceptee")).toBe(false);
    expect(transitionPermise("sollicitee", "interimaire", "acceptee")).toBe(true);
    expect(transitionPermise("sollicitee", "entreprise", "acceptee")).toBe(false);
  });

  it("laisse un intérimaire se retirer après avoir postulé", () => {
    // Un chantier trouvé ailleurs ne doit pas le laisser prisonnier de sa demande.
    expect(transitionPermise("candidatee", "interimaire", "declinee")).toBe(true);
  });

  it("ferme les états terminaux aux deux parties", () => {
    for (const etat of ["acceptee", "declinee", "expiree"] as EtatCandidature[]) {
      expect(actionsPossibles(etat, "interimaire")).toEqual([]);
      expect(actionsPossibles(etat, "entreprise")).toEqual([]);
    }
  });

  it("désigne sans ambiguïté qui doit répondre", () => {
    expect(attendUneReponseDe("candidatee", "entreprise")).toBe(true);
    expect(attendUneReponseDe("candidatee", "interimaire")).toBe(false);
    expect(attendUneReponseDe("sollicitee", "interimaire")).toBe(true);
    expect(attendUneReponseDe("proposee", "interimaire")).toBe(false);
  });

  it("nomme l'action selon qui la déclenche", () => {
    // Un intérimaire décline un chantier, une entreprise écarte un profil : le même
    // état, deux gestes différents. Les confondre effacerait qui a décidé.
    expect(libelleAction("declinee", "interimaire")).toBe("Décliner");
    expect(libelleAction("declinee", "entreprise")).toBe("Écarter");
    expect(libelleAction("acceptee", "interimaire")).toBe("Accepter la mission");
    expect(libelleAction("acceptee", "entreprise")).toBe("Retenir ce profil");
  });
});
