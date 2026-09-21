import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configDiscord,
  creerSalonPrive,
  messageDAccueil,
  nomDeSalon,
  posterDansSalon,
  rejoindreServeur,
  supprimerSalon,
  type ConfigDiscord,
} from "../src/discord";

/**
 * Salon Discord privé.
 *
 * Ce qui est éprouvé ici n'est pas l'intégration — elle dépend d'un serveur réel —
 * mais **ce qui décide de la confidentialité** : les exceptions de permission posées
 * à la création. Une erreur à cet endroit produit un salon lisible par tout le
 * serveur, et rien à l'exécution ne le signalerait : le message partirait, la
 * personne le recevrait, et les autres aussi.
 */

const config: ConfigDiscord = {
  jetonBot: "jeton-de-bot",
  serveurId: "900000000000000001",
  applicationId: "700000000000000002",
};

/** `VIEW_CHANNEL`, le bit qui décide qui voit le salon. */
const VOIR = String(1 << 10);

describe("nom de salon", () => {
  it("réduit un nom de personne à quelque chose que Discord accepte", () => {
    expect(nomDeSalon("Karim Benali")).toBe("karim-benali");
    expect(nomDeSalon("BTP Reims SARL")).toBe("btp-reims-sarl");
  });

  it("retire les accents au lieu de les remplacer par des tirets", () => {
    // « beno-t » serait illisible pour l'intéressé, qui doit reconnaître son salon.
    expect(nomDeSalon("Benoît Lemée")).toBe("benoit-lemee");
    expect(nomDeSalon("Émile Ângelo")).toBe("emile-angelo");
  });

  it("ajoute l'identifiant du compte en suffixe", () => {
    // Deux homonymes donneraient sinon deux salons indistinguables — et c'est
    // précisément quand il faut en supprimer un qu'on ne veut pas hésiter.
    expect(nomDeSalon("Martin Dupont", 42)).toBe("martin-dupont-42");
    expect(nomDeSalon("Martin Dupont", 77)).toBe("martin-dupont-77");
  });

  it("ne rend jamais un nom vide", () => {
    expect(nomDeSalon("   ")).toBe("membre");
    expect(nomDeSalon("!!!", 7)).toBe("membre-7");
  });

  it("borne la longueur", () => {
    expect(nomDeSalon("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("configuration", () => {
  const environnement = { ...process.env };
  afterEach(() => {
    process.env = { ...environnement };
  });

  it("rend null tant qu'il manque une valeur", () => {
    // Le produit doit fonctionner sans relais : l'absence se voit, elle ne casse rien.
    process.env.DISCORD_BOT_TOKEN = "j";
    delete process.env.DISCORD_SERVEUR_ID;
    process.env.DISCORD_CLIENT_ID = "c";
    expect(configDiscord()).toBeNull();
  });

  it("rend la configuration quand les trois valeurs sont là", () => {
    process.env.DISCORD_BOT_TOKEN = "j";
    process.env.DISCORD_SERVEUR_ID = "s";
    process.env.DISCORD_CLIENT_ID = "c";
    expect(configDiscord()).toEqual({ jetonBot: "j", serveurId: "s", applicationId: "c" });
  });
});

describe("création du salon privé", () => {
  let appel: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    appel = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "555000000000000003" }), { status: 201 })
    );
  });
  afterEach(() => vi.restoreAllMocks());

  function corpsEnvoye() {
    return JSON.parse(String((appel.mock.calls[0]![1] as RequestInit).body));
  }

  it("refuse @everyone, autorise la personne, et autorise le bot", async () => {
    // Les trois lignes ensemble font la confidentialité. En retirer une suffit à
    // rendre le salon public, ou à créer un salon où le bot ne peut pas écrire.
    const r = await creerSalonPrive(config, { nom: "karim-benali-42", utilisateurId: "123" });
    expect(r).toEqual({ ok: true, valeur: "555000000000000003" });

    const exceptions = corpsEnvoye().permission_overwrites;
    expect(exceptions).toEqual([
      // L'identifiant du rôle @everyone est celui du serveur lui-même.
      { id: config.serveurId, type: 0, deny: VOIR },
      { id: "123", type: 1, allow: VOIR },
      { id: config.applicationId, type: 1, allow: VOIR },
    ]);
  });

  it("crée un salon textuel, et s'authentifie en tant que bot", async () => {
    await creerSalonPrive(config, { nom: "x", utilisateurId: "123", sujet: "Notifications" });

    const [url, options] = appel.mock.calls[0]!;
    expect(String(url)).toBe(`https://discord.com/api/v10/guilds/${config.serveurId}/channels`);
    expect((options as RequestInit).method).toBe("POST");
    const entetes = (options as RequestInit).headers as Record<string, string>;
    expect(entetes.Authorization).toBe("Bot jeton-de-bot");
    expect(corpsEnvoye()).toMatchObject({ type: 0, topic: "Notifications" });
  });

  it("ne prétend pas avoir réussi si Discord ne rend aucun identifiant", async () => {
    appel.mockResolvedValue(new Response("{}", { status: 201 }));
    const r = await creerSalonPrive(config, { nom: "x", utilisateurId: "123" });
    expect(r.ok).toBe(false);
  });

  it("nomme la limitation de débit plutôt que de la confondre avec une panne", async () => {
    // Discord limite fortement la création de salons. Un message générique enverrait
    // chercher une erreur de configuration qui n'existe pas.
    appel.mockResolvedValue(new Response('{"retry_after":3}', { status: 429 }));
    const r = await creerSalonPrive(config, { nom: "x", utilisateurId: "123" });
    expect(r.ok).toBe(false);
    expect(r.motif).toMatch(/limite/i);
  });

  it("ne lève pas quand le réseau tombe", async () => {
    appel.mockRejectedValue(new Error("délai dépassé"));
    const r = await creerSalonPrive(config, { nom: "x", utilisateurId: "123" });
    expect(r).toEqual({ ok: false, motif: "délai dépassé" });
  });
});

describe("les autres appels", () => {
  afterEach(() => vi.restoreAllMocks());

  it("traite « déjà membre » comme un succès", async () => {
    // Discord répond 204 sans corps quand la personne est déjà dans le serveur.
    // C'est le cas de quiconque relie son compte une seconde fois.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    expect(await rejoindreServeur(config, "123", "jeton-acces")).toEqual({ ok: true });
  });

  it("poste le message tel quel, sans le réécrire", async () => {
    const appel = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await posterDansSalon(config, "555", "**Karim**, votre CACES expire dans 23 jours.");

    const [url, options] = appel.mock.calls[0]!;
    expect(String(url)).toBe("https://discord.com/api/v10/channels/555/messages");
    expect(JSON.parse(String((options as RequestInit).body)).content).toBe(
      "**Karim**, votre CACES expire dans 23 jours."
    );
  });

  it("supprime un salon", async () => {
    const appel = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    expect(await supprimerSalon(config, "555")).toEqual({ ok: true });
    expect((appel.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });
});

describe("message d'accueil", () => {
  it("dit qui peut lire, ce qui arrivera, et comment s'en défaire", () => {
    // Un salon qui apparaît sans explication ressemble à une erreur. Et sans la
    // dernière phrase, se désinscrire supposerait de deviner où chercher.
    const texte = messageDAccueil("Karim");
    expect(texte).toContain("Karim");
    expect(texte).toMatch(/vous seul/i);
    expect(texte).toMatch(/échéance/i);
    expect(texte).toMatch(/missions/i);
    expect(texte).toMatch(/détachez/i);
  });
});
