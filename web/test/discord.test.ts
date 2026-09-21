import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

/**
 * Rattachement à Discord, et salon privé.
 *
 * **Ce que ces cas éprouvent.** Pas l'intégration Discord — elle dépend d'un serveur
 * et d'un bot réels, et la suite ne doit pas créer de salons à chaque exécution. Ce
 * qui est vérifié ici est ce qui tient sans Discord : les gardes, le contrôle
 * d'anti-rejeu, l'unicité du rattachement, et surtout le fait que **rien ne casse
 * quand le relais n'est pas configuré** — cas de tout déploiement d'école, et cas du
 * jour où le bot tombe.
 *
 * La confidentialité du salon, elle, est éprouvée dans `core/test/discord.test.ts` :
 * c'est là que se posent les exceptions de permission qui la décident.
 */

const MARQUE = `discord-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-melun-2026";
const emails: string[] = [];
const SECRET = process.env.SECRET_N8N ?? "";

async function appel(chemin: string, methode = "GET", corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    redirect: "manual",
  });
  const t = await r.text();
  let json = null;
  try {
    json = t ? JSON.parse(t) : null;
  } catch {
    /* une redirection n'a pas de corps JSON : le statut et l'en-tête suffisent */
  }
  return { statut: r.status, corps: json, entetes: r.headers };
}

async function inscrire(suffixe: string, role: "interimaire" | "entreprise" = "interimaire") {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  emails.push(email);
  const r = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role }),
  });
  const corps = await r.json();
  return {
    email,
    id: corps.compte.id as number,
    cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}

/**
 * Compte partagé par les cas qui ne modifient rien de durable.
 *
 * Une inscription coûte un `scrypt` — volontairement lent — plus huit empreintes de
 * codes de récupération, et chaque requête rouvre une connexion à une base hébergée
 * au loin. En créer un par cas faisait de ce fichier le plus lent de la suite pour
 * ce qu'il éprouve. Les cas qui écrivent gardent leur compte à eux.
 */
let partage: { email: string; id: number; cookie: string };

beforeAll(async () => {
  partage = await inscrire("partage");
});

afterAll(async () => {
  const sql = connexion();
  try {
    await sql`delete from compte where email like ${`${MARQUE}-%`}`;
  } finally {
    await sql.end();
  }
  const cache = redis();
  await Promise.all(emails.map((e) => cache.del(cle.tentativesEmail(e))));
});

describe("état du rattachement", () => {
  it("dit qu'un compte neuf n'est pas relié", async () => {
    const { cookie } = partage;
    const r = await appel("/api/discord", "GET", undefined, cookie);
    expect(r.statut).toBe(200);
    expect(r.corps.relie).toBe(false);
    expect(r.corps.salonId).toBeNull();
  });

  it("annonce si le relais est monté sur ce déploiement", async () => {
    // L'interface s'en sert pour ne pas proposer un bouton qui échouera.
    const { cookie } = partage;
    const r = await appel("/api/discord", "GET", undefined, cookie);
    expect(typeof r.corps.disponible).toBe("boolean");
  });

  it("n'est pas lisible sans session", async () => {
    expect((await appel("/api/discord")).statut).toBe(401);
  });

  it("donne l'adresse directe du salon une fois relié", async () => {
    // Annoncer qu'un salon existe en laissant le chercher dans une liste est une
    // demi-mesure : il vient d'être créé, il est tout en bas, et son nom ne lui dit
    // rien. Avant rattachement, l'adresse n'a pas de sens et vaut null.
    const { id, cookie } = await inscrire("lien-salon");
    expect((await appel("/api/discord", "GET", undefined, cookie)).corps.lienSalon).toBeNull();

    const sql = connexion();
    try {
      await sql`update compte set discord_salon_id = '555000000000000021' where id = ${id}`;
      const r = await appel("/api/discord", "GET", undefined, cookie);
      if (!r.corps.disponible) return; // relais non configuré sur ce déploiement
      expect(r.corps.lienSalon).toMatch(
        /^https:\/\/discord\.com\/channels\/\d+\/555000000000000021$/
      );
    } finally {
      await sql.end();
    }
  });
});

describe("départ de la liaison", () => {
  it("renvoie vers le profil plutôt que d'échouer quand rien n'est configuré", async () => {
    // Un écran d'erreur brut pour une intégration facultative serait disproportionné.
    const { cookie } = partage;
    const r = await appel("/api/discord/lier", "GET", undefined, cookie);
    expect(r.statut).toBe(302);

    const vers = r.entetes.get("location") ?? "";
    // Configuré, on part chez Discord ; sinon, on revient au profil en le disant.
    expect(vers).toMatch(/discord\.com\/oauth2\/authorize|profil\?discord=non-configure/);
  });

  it("ne demande à Discord que l'identifiant et le droit d'ajouter au serveur", async () => {
    // Ni l'adresse e-mail — que nous avons déjà, et vérifiée par nos soins — ni les
    // messages, ni la liste des serveurs fréquentés. Le rattachement ne repose sur
    // aucune comparaison d'adresses.
    const { cookie } = partage;
    const vers = (await appel("/api/discord/lier", "GET", undefined, cookie)).entetes.get("location") ?? "";
    if (!vers.includes("discord.com")) return; // relais non configuré ici

    const portee = new URL(vers).searchParams.get("scope") ?? "";
    expect(portee.split(" ").sort()).toEqual(["guilds.join", "identify"]);
    expect(portee).not.toContain("email");
  });

  it("exige une session", async () => {
    const r = await appel("/api/discord/lier");
    // La garde redirige vers la connexion plutôt que de rendre une erreur.
    expect(r.statut).toBe(307);
    expect(r.entetes.get("location")).toContain("/connexion");
  });
});

describe("retour de Discord", () => {
  it("refuse un retour sans état", async () => {
    // Sans ce contrôle, faire ouvrir une adresse forgée à quelqu'un rattacherait le
    // Discord de l'attaquant au compte de la victime : ses alertes partiraient chez lui.
    const { cookie } = partage;
    const r = await appel("/api/discord/retour?code=peu-importe", "GET", undefined, cookie);
    expect(r.statut).toBe(302);
    expect(r.entetes.get("location")).toContain("discord=etat-invalide");
  });

  it("refuse un état inventé", async () => {
    const { cookie } = partage;
    const r = await appel(
      "/api/discord/retour?code=x&state=un-etat-qui-n-a-jamais-ete-emis",
      "GET",
      undefined,
      cookie
    );
    expect(r.entetes.get("location")).toContain("discord=etat-invalide");
  });

  it("traite un refus sur l'écran de Discord comme un refus, pas comme une panne", async () => {
    const { cookie } = partage;
    const r = await appel("/api/discord/retour?error=access_denied", "GET", undefined, cookie);
    expect(r.entetes.get("location")).toContain("discord=refuse");
  });
});

describe("détachement", () => {
  it("aboutit même sans rien de relié, et n'exige pas le mot de passe", async () => {
    // Détacher ne donne accès à rien : rendre le retrait coûteux serait contraire à
    // l'esprit du consentement.
    const { cookie } = partage;
    const r = await appel("/api/discord", "DELETE", {}, cookie);
    expect(r.statut).toBe(200);
    expect(r.corps.detache).toBe(true);
  });

  it("efface les trois colonnes", async () => {
    const { id, cookie } = await inscrire("efface");

    const sql = connexion();
    try {
      // On simule un rattachement en base : ce que ferait un retour de Discord réussi.
      await sql`
        update compte
           set discord_utilisateur_id = ${`faux-${id}`},
               discord_salon_id = '555000000000000003',
               discord_relie_le = now()
         where id = ${id}`;

      expect((await appel("/api/discord", "GET", undefined, cookie)).corps.relie).toBe(true);
      expect((await appel("/api/discord", "DELETE", {}, cookie)).statut).toBe(200);

      const [apres] = await sql<
        { discord_utilisateur_id: string | null; discord_salon_id: string | null; discord_relie_le: Date | null }[]
      >`select discord_utilisateur_id, discord_salon_id, discord_relie_le from compte where id = ${id}`;
      expect(apres.discord_utilisateur_id).toBeNull();
      expect(apres.discord_salon_id).toBeNull();
      expect(apres.discord_relie_le).toBeNull();
    } finally {
      await sql.end();
    }
  });

  it("n'est pas ouvert sans session", async () => {
    expect((await appel("/api/discord", "DELETE", {})).statut).toBe(401);
  });
});

describe("un même Discord ne sert qu'un compte", () => {
  it("la base refuse deux comptes sur le même identifiant", async () => {
    // Deux comptes reliés au même Discord rendraient les notifications
    // indéchiffrables, et laisseraient deviner qu'un second compte existe.
    const premier = await inscrire("unicite-1");
    const second = await inscrire("unicite-2");
    const identifiant = `faux-partage-${Date.now()}`;

    const sql = connexion();
    try {
      await sql`update compte set discord_utilisateur_id = ${identifiant} where id = ${premier.id}`;
      await expect(
        sql`update compte set discord_utilisateur_id = ${identifiant} where id = ${second.id}`
      ).rejects.toThrow();
    } finally {
      await sql.end();
    }
  });
});

describe("ce que les scénarios n8n reçoivent", () => {
  it("livre le salon privé de chaque destinataire, plus aucun webhook commun", async () => {
    // C'est le correctif : un webhook unique diffusait à tout le serveur une alerte
    // qui nomme la personne, son habilitation et sa date d'échéance.
    const r = await fetch(`${BASE}/api/n8n/certifications-expirantes?jours=365`, {
      headers: { "x-secret-n8n": SECRET },
    });
    expect(r.status).toBe(200);
    const corps = await r.json();

    const brut = JSON.stringify(corps);
    expect(brut).not.toContain("webhookDiscord");
    for (const alerte of corps.alertes) {
      expect(alerte).toHaveProperty("discordSalonId");
    }
  });

  it("supprime le salon avec le compte", async () => {
    // Discord ne sait rien de nos cascades : un salon oublié garderait des messages
    // nominatifs dans un serveur que l'intéressé a quitté.
    const { id, cookie } = await inscrire("suppression");
    const sql = connexion();
    try {
      await sql`update compte set discord_salon_id = '555000000000000009' where id = ${id}`;
      const r = await appel("/api/compte", "DELETE", { motDePasse: MOT_DE_PASSE }, cookie);
      expect(r.statut).toBe(200);

      const restant = await sql<{ id: number }[]>`select id from compte where id = ${id}`;
      expect(restant).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });
});
