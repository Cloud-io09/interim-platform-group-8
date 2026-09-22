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
  salonExiste,
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

/** Les deux appels que le rattachement enchaîne, pour pouvoir les distinguer. */
export type EtapeSalon = "serveur" | "salon";

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
  role: "interimaire" | "entreprise",
  identite: IdentiteDiscord,
  jetonAcces: string
): Promise<
  { ok: true; salonId: string; nom: string } | { ok: false; etape: EtapeSalon; motif: string }
> {
  // L'étape qui a cédé est rendue séparément du motif. Les deux échecs donnaient le
  // même message — « Discord a refusé la création du salon » — y compris quand c'est
  // l'ajout au serveur qui avait échoué, donc bien avant toute création. Chercher un
  // défaut là où il n'y en a pas coûte plus cher que de ne rien afficher.
  const arrivee = await rejoindreServeur(config, identite.id, jetonAcces);
  if (!arrivee.ok) {
    return { ok: false, etape: "serveur", motif: arrivee.motif ?? "Ajout au serveur impossible." };
  }

  const nom = nomDeSalon(libelle, compteId);
  const salon = await creerSalonPrive(config, {
    nom,
    utilisateurId: identite.id,
    sujet: "Notifications Intérimatch — visible de vous seul",
  });
  if (!salon.ok || !salon.valeur) {
    return { ok: false, etape: "salon", motif: salon.motif ?? "Création du salon impossible." };
  }

  // L'échec du message d'accueil ne défait pas la liaison : le salon existe, il est
  // privé, et la personne recevra ses notifications. Un salon muet vaut mieux qu'un
  // parcours annulé pour un message d'accueil.
  await posterDansSalon(config, salon.valeur, messageDAccueil(prenom, role));

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

/**
 * Recrée le salon d'un compte dont le salon a disparu côté Discord.
 *
 * Un salon supprimé à la main — par son titulaire, ou par un administrateur qui fait
 * le ménage — laissait un identifiant mort en base. Les scénarios n8n continuaient de
 * poster dessus, Discord répondait 404 à chaque exécution, et personne ne l'apprenait :
 * ni l'intéressé, qui ne recevait simplement plus rien, ni nous.
 *
 * La réparation ne demande aucun nouveau consentement : l'identifiant Discord du
 * titulaire est déjà connu, et c'est lui qui permet de restreindre le nouveau salon.
 * On ne le rejoint pas à nouveau — il est déjà membre.
 *
 * Rend le nouvel identifiant, ou `null` si rien n'était à réparer ou si la
 * réparation a échoué. Ne lève jamais : ce n'est pas au titulaire de subir un écran
 * d'erreur parce qu'un salon manquait.
 */
export async function reparerSalon(
  sql: Sql,
  compteId: number
): Promise<{ recree: boolean; salonId: string | null }> {
  const config = configDiscord();
  const [compte] = await sql<
    { discord_utilisateur_id: string | null; discord_salon_id: string | null }[]
  >`select discord_utilisateur_id, discord_salon_id from compte where id = ${compteId}`;

  if (!config || !compte?.discord_utilisateur_id || !compte.discord_salon_id) {
    return { recree: false, salonId: compte?.discord_salon_id ?? null };
  }

  const existe = await salonExiste(config, compte.discord_salon_id);
  // `null` = Discord injoignable : on ne touche à rien. Conclure à une disparition
  // sur une panne recréerait un salon à chaque incident.
  if (existe !== false) return { recree: false, salonId: compte.discord_salon_id };

  const [profil] = await sql<{ libelle: string; prenom: string; role: string }[]>`
    select coalesce(i.prenom || ' ' || i.nom, e.raison_sociale, 'compte-' || c.id) as libelle,
           coalesce(i.prenom, e.raison_sociale, 'à vous') as prenom,
           c.role
      from compte c
      left join interimaire i on i.compte_id = c.id
      left join entreprise e on e.compte_id = c.id
     where c.id = ${compteId}`;

  const salon = await creerSalonPrive(config, {
    nom: nomDeSalon(profil?.libelle ?? `compte-${compteId}`, compteId),
    utilisateurId: compte.discord_utilisateur_id,
    sujet: "Notifications Intérimatch — visible de vous seul",
  });
  if (!salon.ok || !salon.valeur) {
    process.stderr.write(`[discord] salon non recréé pour le compte ${compteId} : ${salon.motif}\n`);
    return { recree: false, salonId: null };
  }

  await posterDansSalon(
    config,
    salon.valeur,
    messageDAccueil(profil?.prenom ?? "à vous", profil?.role === "entreprise" ? "entreprise" : "interimaire")
  );
  await sql`update compte set discord_salon_id = ${salon.valeur} where id = ${compteId}`;
  return { recree: true, salonId: salon.valeur };
}
