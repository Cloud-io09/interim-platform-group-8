import { randomBytes } from "node:crypto";
import {
  cle,
  configDiscord,
  creerSalonPrive,
  messageDAccueil,
  nomDeSalon,
  posterDansSalon,
  redis,
  rejoindreServeur,
  supprimerSalon,
  TTL,
  type ConfigDiscord,
} from "@interimatch/core";
import type { Sql } from "postgres";

/**
 * Liaison d'un compte Intérimatch à un compte Discord, et salon privé associé.
 *
 * **Pourquoi OAuth plutôt qu'un identifiant collé à la main.** Pour restreindre un
 * salon à quelqu'un, il faut son identifiant Discord. Le lui demander supposerait
 * qu'il active le mode développeur, trouve son profil et copie un nombre de dix-huit
 * chiffres — quatre manipulations, pour un public qui s'inscrit depuis un téléphone
 * entre deux chantiers, et un chiffre mal collé ne notifie personne sans qu'on le
 * sache. Le détour par OAuth rend l'identifiant exact, et permet au passage d'ajouter
 * la personne au serveur : sans quoi elle ne verrait pas le salon créé pour elle.
 *
 * **Ce n'est pas une connexion tierce.** On ne s'authentifie pas avec Discord, et
 * aucun compte ne se crée par ce chemin : la session doit déjà être ouverte. Discord
 * ne sert qu'à établir, une fois, à qui appartient quel identifiant.
 */

const AUTORISATION = "https://discord.com/oauth2/authorize";
const JETON = "https://discord.com/api/v10/oauth2/token";
const MOI = "https://discord.com/api/v10/users/@me";

/**
 * `identify` donne l'identifiant, `guilds.join` permet d'ajouter au serveur.
 *
 * Rien de plus : ni les messages, ni la liste des serveurs fréquentés, ni l'adresse
 * e-mail — que nous avons déjà, et par un chemin que nous vérifions nous-mêmes.
 */
const PORTEE = "identify guilds.join";

export interface IdentiteDiscord {
  id: string;
  nom: string;
}

export function oauthConfigure(): boolean {
  return Boolean(process.env.DISCORD_CLIENT_ID?.trim() && process.env.DISCORD_CLIENT_SECRET?.trim());
}

function retour(base: string): string {
  return `${base}/api/discord/retour`;
}

/**
 * Prépare une demande d'autorisation et rend l'adresse vers laquelle rediriger.
 *
 * L'état est aléatoire, rangé en Redis avec le compte auquel il appartient et une
 * durée de vie courte. Sans lui, n'importe qui pourrait provoquer le rattachement de
 * **son** Discord au compte d'un autre en lui faisant ouvrir une adresse de retour
 * forgée : le compte de la victime notifierait alors l'attaquant.
 */
export async function debutLiaison(compteId: number, base: string): Promise<string> {
  const etat = randomBytes(32).toString("base64url");
  await redis().set(cle.etatDiscord(etat), String(compteId), { ex: TTL.etatDiscord });

  const parametres = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!.trim(),
    redirect_uri: retour(base),
    response_type: "code",
    scope: PORTEE,
    state: etat,
    // Redemander l'écran d'autorisation à chaque fois : relier un second compte
    // depuis le même navigateur ne doit pas réutiliser silencieusement le premier.
    prompt: "consent",
  });
  return `${AUTORISATION}?${parametres}`;
}

/** Consomme un état et rend le compte auquel il appartenait. À usage unique. */
export async function compteDeLEtat(etat: string | null): Promise<number | null> {
  if (!etat) return null;
  const magasin = redis();
  const brut = await magasin.get(cle.etatDiscord(etat));
  if (brut === null || brut === undefined) return null;
  await magasin.del(cle.etatDiscord(etat));
  const id = Number(brut);
  return Number.isInteger(id) ? id : null;
}

/** Échange le code contre un jeton d'accès, puis lit l'identité. */
export async function identiteDepuisCode(
  code: string,
  base: string
): Promise<{ identite: IdentiteDiscord; jetonAcces: string } | null> {
  const reponse = await fetch(JETON, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!.trim(),
      client_secret: process.env.DISCORD_CLIENT_SECRET!.trim(),
      grant_type: "authorization_code",
      code,
      redirect_uri: retour(base),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!reponse.ok) return null;

  const jetonAcces = ((await reponse.json()) as { access_token?: string }).access_token;
  if (!jetonAcces) return null;

  const profil = await fetch(MOI, {
    headers: { Authorization: `Bearer ${jetonAcces}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!profil.ok) return null;

  const donnees = (await profil.json()) as { id?: string; username?: string; global_name?: string };
  if (!donnees.id) return null;

  return {
    identite: { id: donnees.id, nom: donnees.global_name ?? donnees.username ?? donnees.id },
    jetonAcces,
  };
}

/**
 * Crée le salon privé et y poste le message d'accueil.
 *
 * L'ordre compte : on ajoute d'abord au serveur, sans quoi l'exception de permission
 * porterait sur quelqu'un qui n'en est pas membre et le salon resterait invisible.
 *
 * Le nom du salon porte l'identifiant du compte en suffixe. Deux Martin Dupont sur la
 * plateforme donneraient sinon deux salons homonymes, impossibles à distinguer en
 * exploitation — et c'est précisément quand il faut en supprimer un qu'on ne veut pas
 * hésiter.
 */
export async function ouvrirSalon(
  config: ConfigDiscord,
  compteId: number,
  libelle: string,
  prenom: string,
  identite: IdentiteDiscord,
  jetonAcces: string
): Promise<{ ok: true; salonId: string; nom: string } | { ok: false; motif: string }> {
  const arrivee = await rejoindreServeur(config, identite.id, jetonAcces);
  if (!arrivee.ok) return { ok: false, motif: arrivee.motif ?? "Ajout au serveur impossible." };

  const nom = nomDeSalon(libelle, compteId);
  const salon = await creerSalonPrive(config, {
    nom,
    utilisateurId: identite.id,
    sujet: "Notifications Intérimatch — visible de vous seul",
  });
  if (!salon.ok || !salon.valeur) {
    return { ok: false, motif: salon.motif ?? "Création du salon impossible." };
  }

  // L'échec du message d'accueil ne défait pas la liaison : le salon existe, il est
  // privé, et la personne recevra ses notifications. Un salon muet vaut mieux qu'un
  // parcours annulé pour un message d'accueil.
  await posterDansSalon(config, salon.valeur, messageDAccueil(prenom));

  return { ok: true, salonId: salon.valeur, nom };
}

/**
 * Détache un compte de Discord et supprime son salon.
 *
 * La suppression du salon n'est pas optionnelle : il porte des messages nominatifs —
 * nom, habilitations, dates d'échéance. Le laisser derrière soi contredirait ce que
 * la page de confidentialité annonce.
 */
export async function detacher(sql: Sql, compteId: number): Promise<void> {
  const [compte] = await sql<{ discord_salon_id: string | null }[]>`
    select discord_salon_id from compte where id = ${compteId}`;

  const config = configDiscord();
  if (config && compte?.discord_salon_id) {
    await supprimerSalon(config, compte.discord_salon_id);
  }

  await sql`
    update compte
       set discord_utilisateur_id = null, discord_salon_id = null, discord_relie_le = null
     where id = ${compteId}`;
}
