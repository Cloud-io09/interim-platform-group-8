import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adresseEnvoyable, envoyerCourriel, MARQUEUR_JOURNAL } from "../src/courriel";

/**
 * Le filtre des domaines réservés.
 *
 * Il ne relève pas du confort. Depuis que l'inscription envoie un message de
 * vérification, chaque exécution de l'essai de fumée, du parcours de bout en bout et
 * de la suite fonctionnelle créerait autant de rebonds durs chez le prestataire — et
 * les rebonds abîment durablement la réputation d'expéditeur d'un domaine.
 */
describe("adresses vers lesquelles il est légitime d'écrire", () => {
  it("laisse passer une adresse ordinaire", () => {
    expect(adresseEnvoyable("karim.benali@gmail.com")).toBe(true);
    expect(adresseEnvoyable("contact@btp-reims.fr")).toBe(true);
    expect(adresseEnvoyable("RH@Entreprise.CO.UK")).toBe(true);
  });

  it("refuse les domaines que la RFC 2606 réserve", () => {
    // Ceux qu'emploient nos propres outils.
    expect(adresseEnvoyable("fumee-1234@exemple.test")).toBe(false);
    expect(adresseEnvoyable("parcours@interimatch.test")).toBe(false);
    // Et les autres de la même famille, pour que le filtre ne tienne pas à une
    // orthographe particulière du mot « exemple ».
    expect(adresseEnvoyable("a@quelquechose.invalid")).toBe(false);
    expect(adresseEnvoyable("a@machin.example")).toBe(false);
    expect(adresseEnvoyable("a@localhost")).toBe(false);
    expect(adresseEnvoyable("a@example.com")).toBe(false);
    expect(adresseEnvoyable("a@example.org")).toBe(false);
  });

  it("ne se laisse pas tromper par la casse ni par les espaces", () => {
    expect(adresseEnvoyable("  Fumee@EXEMPLE.TEST  ")).toBe(false);
  });

  it("refuse ce qui n'est pas une adresse", () => {
    expect(adresseEnvoyable("pas-une-adresse")).toBe(false);
    expect(adresseEnvoyable("")).toBe(false);
  });

  it("ne refuse pas un domaine qui contient seulement le mot", () => {
    // « test » en milieu de domaine n'a rien de réservé : seul le dernier label compte.
    expect(adresseEnvoyable("a@test-btp.fr")).toBe(true);
    expect(adresseEnvoyable("a@example.fr")).toBe(true);
  });
});

describe("acheminement", () => {
  const environnement = { ...process.env };
  let ecrit = "";

  beforeEach(() => {
    ecrit = "";
    vi.spyOn(process.stderr, "write").mockImplementation((morceau: unknown) => {
      ecrit += String(morceau);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...environnement };
  });

  const message = {
    destinataire: "karim@btp-reims.fr",
    sujet: "Réinitialiser votre mot de passe",
    texte: "Bonjour,\nOuvrez ce lien.",
  };

  it("journalise le message entier faute de prestataire", () => {
    // Sans cela, une configuration oubliée passerait pour un envoi réussi, et le
    // parcours ne serait ni démontrable ni testable en développement.
    delete process.env.BREVO_API_KEY;
    return envoyerCourriel(message).then((r) => {
      expect(r).toEqual({ transmis: false, canal: "journal" });
      expect(ecrit).toContain(`${MARQUEUR_JOURNAL} → karim@btp-reims.fr`);
      expect(ecrit).toContain("Ouvrez ce lien.");
    });
  });

  it("n'appelle pas le prestataire pour un domaine réservé, même configuré", async () => {
    // La propriété qui protège la réputation d'expéditeur : nos propres outils
    // créent des comptes à chaque exécution, et une inscription envoie un courriel.
    process.env.BREVO_API_KEY = "cle-de-test";
    process.env.COURRIEL_EXPEDITEUR = "envoi@interimatch.fr";
    const appel = vi.spyOn(globalThis, "fetch");

    const r = await envoyerCourriel({ ...message, destinataire: "fumee@exemple.test" });

    expect(r).toEqual({ transmis: false, canal: "factice" });
    expect(appel).not.toHaveBeenCalled();
    // Journalisé tout de même : le parcours reste vérifiable.
    expect(ecrit).toContain("fumee@exemple.test");
  });

  it("transmet au prestataire une adresse ordinaire", async () => {
    process.env.BREVO_API_KEY = "cle-de-test";
    process.env.COURRIEL_EXPEDITEUR = "envoi@interimatch.fr";
    process.env.COURRIEL_EXPEDITEUR_NOM = "Intérimatch";
    const appel = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 201 }));

    expect(await envoyerCourriel(message)).toEqual({ transmis: true, canal: "brevo" });

    const [url, options] = appel.mock.calls[0]!;
    expect(String(url)).toContain("api.brevo.com");
    const corps = JSON.parse(String((options as RequestInit).body));
    expect(corps.to).toEqual([{ email: "karim@btp-reims.fr" }]);
    expect(corps.sender).toEqual({ email: "envoi@interimatch.fr", name: "Intérimatch" });
    expect(corps.textContent).toBe(message.texte);
  });

  it("ne lève jamais quand le prestataire refuse", async () => {
    // Un parcours d'authentification ne doit pas échouer parce qu'un service tiers
    // est indisponible : le jeton est déjà émis, et l'incident se lit au journal.
    process.env.BREVO_API_KEY = "cle-de-test";
    process.env.COURRIEL_EXPEDITEUR = "envoi@interimatch.fr";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("quota dépassé", { status: 402 }));

    const r = await envoyerCourriel(message);
    expect(r.transmis).toBe(false);
    expect(r.canal).toBe("brevo");
    expect(r.motif).toContain("402");
    expect(ecrit).toContain("ÉCHEC");
  });

  it("ne lève pas davantage quand le réseau tombe", async () => {
    process.env.BREVO_API_KEY = "cle-de-test";
    process.env.COURRIEL_EXPEDITEUR = "envoi@interimatch.fr";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("délai dépassé"));

    const r = await envoyerCourriel(message);
    expect(r.transmis).toBe(false);
    expect(r.motif).toBe("délai dépassé");
  });

  it("retombe au journal si l'expéditeur n'est pas renseigné", async () => {
    // Une clé sans adresse d'expédition ne suffit pas : Brevo refuserait, et le
    // message serait perdu au lieu d'être visible.
    process.env.BREVO_API_KEY = "cle-de-test";
    delete process.env.COURRIEL_EXPEDITEUR;
    const appel = vi.spyOn(globalThis, "fetch");

    expect(await envoyerCourriel(message)).toEqual({ transmis: false, canal: "journal" });
    expect(appel).not.toHaveBeenCalled();
  });
});
