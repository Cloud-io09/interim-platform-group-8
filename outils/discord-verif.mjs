#!/usr/bin/env node
/**
 * Vérifie la configuration Discord, et dit ce qui manque.
 *
 *   npm run discord
 *
 * Quatre variables, une invitation et une URL de retour : six choses qui peuvent
 * manquer, et dont aucune ne se signale clairement à l'usage. Un rattachement qui
 * échoue affiche « Discord a refusé la création du salon » sans dire laquelle des six
 * est en cause — d'où cet outil, qui interroge Discord plutôt que de deviner.
 *
 * Ne modifie rien : il lit, compare et rend un compte rendu.
 */

const API = "https://discord.com/api/v10";

/** `Manage Channels` (16) + `Send Messages` (2048) + `Create Instant Invite` (1). */
const PERMISSIONS = (1 << 4) | (1 << 11) | (1 << 0);

let manquant = 0;
const ok = (t, d = "") => console.log(`  ok   ${t}${d ? ` — ${d}` : ""}`);
const ko = (t, d = "") => {
  manquant++;
  console.log(`MANQUE ${t}${d ? ` — ${d}` : ""}`);
};

const lire = (nom) => process.env[nom]?.trim() ?? "";

console.log("Configuration Discord\n");

const clientId = lire("DISCORD_CLIENT_ID");
const secret = lire("DISCORD_CLIENT_SECRET");
const jeton = lire("DISCORD_BOT_TOKEN");
const serveurId = lire("DISCORD_SERVEUR_ID");
const publique = lire("URL_PUBLIQUE").replace(/\/+$/, "");

clientId ? ok("DISCORD_CLIENT_ID") : ko("DISCORD_CLIENT_ID");
secret ? ok("DISCORD_CLIENT_SECRET") : ko("DISCORD_CLIENT_SECRET");
jeton ? ok("DISCORD_BOT_TOKEN") : ko("DISCORD_BOT_TOKEN");

if (!jeton) {
  console.log("\nSans le jeton du bot, rien d'autre n'est vérifiable.");
  process.exit(1);
}

const entetes = { Authorization: `Bot ${jeton}` };

// --- Le jeton est-il valable ? ----------------------------------------------
const moi = await fetch(`${API}/users/@me`, { headers: entetes });
if (!moi.ok) {
  ko("le jeton du bot est refusé", `${moi.status} — régénérez-le dans l'onglet Bot`);
  process.exit(1);
}
const bot = await moi.json();
ok("le jeton du bot est valable", `${bot.username} · id ${bot.id}`);

if (clientId && clientId !== bot.id) {
  // L'identifiant d'application et celui du bot sont le même nombre. S'ils diffèrent,
  // les deux valeurs viennent de deux applications distinctes — et le bot créerait un
  // salon où il ne s'autoriserait pas lui-même.
  ko("DISCORD_CLIENT_ID ne correspond pas au bot", `attendu ${bot.id}`);
} else if (clientId) {
  ok("DISCORD_CLIENT_ID correspond bien au bot");
}

// --- L'URL de retour est-elle déclarée ? ------------------------------------
const app = await (await fetch(`${API}/oauth2/applications/@me`, { headers: entetes })).json();
const attendue = publique ? `${publique}/api/discord/retour` : null;
const declarees = app.redirect_uris ?? [];

if (!attendue) {
  ko("URL_PUBLIQUE", "sans elle, l'URL de retour ne peut pas être comparée");
} else if (declarees.includes(attendue)) {
  ok("l'URL de retour est déclarée", attendue);
} else {
  ko("l'URL de retour n'est pas déclarée", `attendue : ${attendue}`);
  console.log(`       déclarées : ${declarees.length ? declarees.join(", ") : "aucune"}`);
  console.log("       → Developer Portal → OAuth2 → Redirects");
}

// --- Le bot est-il dans un serveur ? ----------------------------------------
const serveurs = await (await fetch(`${API}/users/@me/guilds`, { headers: entetes })).json();

if (!Array.isArray(serveurs) || serveurs.length === 0) {
  ko("le bot n'est dans aucun serveur");
  console.log("       Ouvrez cette adresse et choisissez le serveur :");
  console.log(
    `       https://discord.com/oauth2/authorize?client_id=${bot.id}&scope=bot&permissions=${PERMISSIONS}`
  );
} else {
  ok(`le bot est dans ${serveurs.length} serveur(s)`);
  for (const s of serveurs) console.log(`       ${s.name} · DISCORD_SERVEUR_ID=${s.id}`);

  if (!serveurId) {
    ko("DISCORD_SERVEUR_ID", "reprenez l'identifiant ci-dessus");
  } else if (!serveurs.some((s) => s.id === serveurId)) {
    ko("DISCORD_SERVEUR_ID désigne un serveur où le bot n'est pas");
  } else {
    ok("DISCORD_SERVEUR_ID désigne un serveur où le bot est présent");

    // Être présent ne suffit pas : sans ces permissions, la création échoue à
    // l'exécution, et c'est le pire moment pour l'apprendre.
    //
    // Les droits viennent de la réponse déjà obtenue. La redemander était inutile, et
    // surtout Discord limitait le second appel : l'outil tombait alors en annonçant
    // une erreur de programmation là où tout était correctement configuré.
    const courant = serveurs.find((s) => s.id === serveurId);
    const droits = BigInt(courant?.permissions ?? "0");
    const nommees = [
      ["Manage Channels", 1n << 4n],
      ["Send Messages", 1n << 11n],
      ["Create Instant Invite", 1n << 0n],
    ];
    const absentes = nommees.filter(([, bit]) => (droits & bit) === 0n).map(([n]) => n);
    // Le drapeau administrateur emporte tout le reste.
    if ((droits & (1n << 3n)) !== 0n) ok("permissions", "administrateur");
    else if (absentes.length === 0) ok("permissions", "les trois nécessaires sont accordées");
    else {
      ko("permissions manquantes", absentes.join(", "));
      console.log(
        `       Réinvitez le bot : https://discord.com/oauth2/authorize?client_id=${bot.id}&scope=bot&permissions=${PERMISSIONS}`
      );
    }
  }
}

console.log(
  manquant === 0
    ? "\nTout est en place. Reliez un compte depuis Profil → Notifications sur Discord."
    : `\n${manquant} point(s) à traiter.`
);
process.exit(manquant === 0 ? 0 : 1);
