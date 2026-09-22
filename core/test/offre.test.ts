import { describe, expect, it } from "vitest";
import {
  enEuros,
  etatDroits,
  packParCode,
  PACKS,
  planParCode,
  PLANS,
  sourceDuProchain,
} from "../src/offre";

describe("paliers", () => {
  it("part d'un palier gratuit et utilisable", () => {
    // Un produit qu'on ne peut pas essayer ne se vend pas à des artisans : le palier
    // d'entrée doit permettre d'aller au bout d'un recrutement, une fois.
    const decouverte = planParCode("decouverte")!;
    expect(decouverte.prixMensuelCents).toBe(0);
    expect(decouverte.creditsOfferts).toBeGreaterThan(0);
  });

  it("retombe sur le palier gratuit devant un code inconnu", () => {
    // Une valeur aberrante en base ne doit pas ouvrir l'accès illimité.
    expect(etatDroits({ planCode: "regie-premium-gold", utilisesCeMois: 0, credits: 0 }).plan.code)
      .toBe("decouverte");
  });

  it("classe les paliers par prix croissant, quota croissant", () => {
    const prix = PLANS.map((p) => p.prixMensuelCents);
    expect([...prix].sort((a, b) => a - b)).toEqual(prix);
    // Payer plus cher pour moins de déblocages n'aurait aucun sens.
    const quotas = PLANS.map((p) => p.quotaMensuel ?? Number.POSITIVE_INFINITY);
    expect([...quotas].sort((a, b) => a - b)).toEqual(quotas);
  });
});

describe("droits de déblocage", () => {
  it("compte ce qui reste sur le quota du mois", () => {
    const d = etatDroits({ planCode: "chantier", utilisesCeMois: 4, credits: 0 });
    expect(d.quotaRestant).toBe(6);
    expect(d.peutDebloquer).toBe(true);
  });

  it("ne descend jamais sous zéro", () => {
    // Un changement de palier en cours de mois peut laisser plus de déblocages
    // consommés que le nouveau quota n'en autorise. Ce n'est pas une dette.
    const d = etatDroits({ planCode: "chantier", utilisesCeMois: 25, credits: 0 });
    expect(d.quotaRestant).toBe(0);
    expect(d.peutDebloquer).toBe(false);
  });

  it("laisse les crédits prendre le relais quand le quota est épuisé", () => {
    const d = etatDroits({ planCode: "chantier", utilisesCeMois: 10, credits: 2 });
    expect(d.quotaRestant).toBe(0);
    expect(d.peutDebloquer).toBe(true);
    expect(sourceDuProchain(d)).toBe("credit");
  });

  it("consomme le quota **avant** les crédits", () => {
    // Le quota se remet à zéro au mois suivant, un crédit acheté ne périme pas :
    // l'ordre inverse ferait perdre de l'argent sans que l'entreprise s'en aperçoive.
    const d = etatDroits({ planCode: "chantier", utilisesCeMois: 0, credits: 20 });
    expect(sourceDuProchain(d)).toBe("abonnement");
  });

  it("rend le palier découverte tributaire de ses seuls crédits", () => {
    const neuf = etatDroits({ planCode: "decouverte", utilisesCeMois: 0, credits: 3 });
    expect(neuf.quotaRestant).toBe(0);
    expect(sourceDuProchain(neuf)).toBe("credit");

    const epuise = etatDroits({ planCode: "decouverte", utilisesCeMois: 3, credits: 0 });
    expect(epuise.peutDebloquer).toBe(false);
    expect(sourceDuProchain(epuise)).toBeNull();
  });

  it("ne borne rien sur le palier illimité", () => {
    const d = etatDroits({ planCode: "regie", utilisesCeMois: 5000, credits: 0 });
    expect(d.illimite).toBe(true);
    expect(d.peutDebloquer).toBe(true);
    expect(sourceDuProchain(d)).toBe("abonnement");
  });
});

describe("packs à l'acte", () => {
  it("fait décroître le prix unitaire avec la quantité", () => {
    const unitaires = PACKS.map((p) => p.prixCents / p.credits);
    expect([...unitaires].sort((a, b) => b - a)).toEqual(unitaires);
  });

  it("reste plus cher à l'unité que l'abonnement", () => {
    // Sinon personne n'aurait de raison de s'abonner, et le revenu récurrent
    // disparaîtrait au profit d'achats occasionnels moins chers.
    const chantier = planParCode("chantier")!;
    const impliciteAbonnement = chantier.prixMensuelCents / chantier.quotaMensuel!;
    for (const pack of PACKS) {
      expect(pack.prixCents / pack.credits).toBeGreaterThan(impliciteAbonnement);
    }
  });

  it("ignore un code de pack inventé", () => {
    expect(packParCode("gratuit-svp")).toBeUndefined();
  });
});

describe("montants", () => {
  it("s'écrit à la française, jamais en flottant", () => {
    expect(enEuros(8900)).toBe("89,00 €");
    expect(enEuros(1200)).toBe("12,00 €");
    expect(enEuros(0)).toBe("0,00 €");
  });
});
