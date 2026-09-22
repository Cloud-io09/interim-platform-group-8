/**
 * Salon Discord privé, un par personne.
 *
 * **Le problème qu'on corrige.** Les deux automatisations postaient vers une URL de
 * webhook unique : tout le monde lisait les alertes de tout le monde. Or une alerte
 * d'échéance nomme la personne, son habilitation et sa date d'expiration — ce sont
 * des données personnelles, et les diffuser dans un salon commun est un défaut, pas
 * un détail de présentation.
 *
 * **Pourquoi un bot et non un webhook.** Un webhook est attaché à un salon existant
 * et ne sait rien faire d'autre qu'y écrire. Créer un salon, et surtout le restreindre
 * à une personne, relève de l'API du serveur : il faut un bot et la permission de
 * gérer les salons. C'est la seule voie, pas un choix d'architecture.
 *
 * **Rien n'est permanent.** Tous les appels sont du REST sans état — aucune connexion
 * websocket, aucun processus qui tourne. Le produit reste déployable sur une
 * plateforme sans serveur, et n8n peut appeler les mêmes points d'entrée.
 *
 * **Le produit fonctionne sans.** Faute de configuration, les fonctions rendent un
 * échec explicite et journalisé plutôt que de lever : les notifications dans
 * l'application restent la source de vérité, Discord n'en est qu'un relais.
 */

const API = "https://discord.com/api/v10";

/** `VIEW_CHANNEL` — le bit qui décide si quelqu'un voit le salon. */
const VOIR_LE_SALON = 1 << 10;

/** Type de cible d'une exception de permission : 0 pour un rôle, 1 pour un membre. */
const CIBLE_ROLE = 0;
const CIBLE_MEMBRE = 1;

export interface ConfigDiscord {
  jetonBot: string;
  serveurId: string;
  /**
   * Identifiant de l'application, qui est aussi celui du bot.
   *
   * Nécessaire aux exceptions de permission : un salon qui refuse `@everyone` le
   * refuse aussi au bot, sauf si son rôle est administrateur. On ne peut pas parier
   * là-dessus — il faut donc s'autoriser explicitement, sans quoi le bot crée un
   * salon où il ne pourra pas écrire.
   */
  applicationId: string;
}

export interface ResultatDiscord<T> {
  ok: boolean;
  valeur?: T;
  /** Renseigné en cas d'échec, pour le journal du serveur et l'écran de l'utilisateur. */
  motif?: string;
}

/** Configuration lue dans l'environnement, ou `null` si le relais n'est pas monté. */
export function configDiscord(): ConfigDiscord | null {
  const jetonBot = process.env.DISCORD_BOT_TOKEN?.trim();
  const serveurId = process.env.DISCORD_SERVEUR_ID?.trim();
  const applicationId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!jetonBot || !serveurId || !applicationId) return null;
  return { jetonBot, serveurId, applicationId };
}

/**
 * Nom de salon à partir d'un nom de personne ou d'entreprise.
 *
 * Discord impose ses propres transformations aux salons textuels — minuscules, pas
 * d'espaces. On les applique nous-mêmes plutôt que de les subir : le nom stocké est
 * alors celui qui s'affiche, et on peut l'éprouver par un test au lieu de le
 * découvrir à l'exécution.
 *
 * Les accents sont retirés, pas remplacés par des tirets : `Benoît` donne `benoit`,
 * et non `beno-t`, qui serait illisible pour l'intéressé.
 */
export function nomDeSalon(libelle: string, suffixe?: string | number): string {
  const base = libelle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const racine = base || "membre";
  return suffixe === undefined ? racine : `${racine}-${suffixe}`;
}

async function appelDiscord(
  config: ConfigDiscord,
  chemin: string,
  options: { methode?: string; corps?: unknown } = {}
): Promise<ResultatDiscord<unknown>> {
  try {
    const reponse = await fetch(`${API}${chemin}`, {
      method: options.methode ?? "GET",
      headers: {
        Authorization: `Bot ${config.jetonBot}`,
        "Content-Type": "application/json",
      },
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
      // Sans délai maximum, une indisponibilité de Discord immobiliserait la requête
      // de quelqu'un qui attend une réponse à un geste très simple.
      signal: AbortSignal.timeout(8000),
    });

    // 204 : la demande a abouti sans contenu — notamment quand la personne est déjà
    // membre du serveur. Ce n'est pas un échec.
    if (reponse.status === 204) return { ok: true };

    if (!reponse.ok) {
      const detail = await reponse.text();
      // Discord limite fortement la création de salons. Le dire explicitement évite
      // qu'un « échec » laisse croire à une erreur de configuration.
      const motif =
        reponse.status === 429
          ? "Discord limite le nombre de demandes : réessayez dans quelques instants."
          : `Discord a refusé (${reponse.status}) : ${detail.slice(0, 300)}`;
      return { ok: false, motif };
    }

    const texte = await reponse.text();
    return { ok: true, valeur: texte ? JSON.parse(texte) : undefined };
  } catch (erreur) {
    return { ok: false, motif: erreur instanceof Error ? erreur.message : "erreur inconnue" };
  }
}

/**
 * Ajoute quelqu'un au serveur, avec le jeton obtenu à la liaison.
 *
 * Sans cette étape, créer un salon à son nom ne servirait à rien : on ne voit pas un
 * salon d'un serveur qu'on n'a pas rejoint. Répondre `204` signifie « déjà membre »,
 * ce qui est un succès et non une erreur — c'est le cas de quelqu'un qui relie son
 * compte une seconde fois.
 */
export async function rejoindreServeur(
  config: ConfigDiscord,
  utilisateurId: string,
  jetonAcces: string
): Promise<ResultatDiscord<unknown>> {
  return appelDiscord(config, `/guilds/${config.serveurId}/members/${utilisateurId}`, {
    methode: "PUT",
    corps: { access_token: jetonAcces },
  });
}

/**
 * Crée un salon que seule la personne concernée — et le bot — peuvent voir.
 *
 * La confidentialité tient entièrement aux trois exceptions de permission : refuser
 * `@everyone`, autoriser l'intéressé, autoriser le bot. L'identifiant du rôle
 * `@everyone` est celui du serveur lui-même, ce qui n'est pas intuitif mais fait
 * partie du modèle de Discord.
 */
export async function creerSalonPrive(
  config: ConfigDiscord,
  { nom, utilisateurId, sujet }: { nom: string; utilisateurId: string; sujet?: string }
): Promise<ResultatDiscord<string>> {
  const resultat = await appelDiscord(config, `/guilds/${config.serveurId}/channels`, {
    methode: "POST",
    corps: {
      name: nom,
      type: 0,
      ...(sujet ? { topic: sujet } : {}),
      permission_overwrites: [
        { id: config.serveurId, type: CIBLE_ROLE, deny: String(VOIR_LE_SALON) },
        { id: utilisateurId, type: CIBLE_MEMBRE, allow: String(VOIR_LE_SALON) },
        { id: config.applicationId, type: CIBLE_MEMBRE, allow: String(VOIR_LE_SALON) },
      ],
    },
  });

  if (!resultat.ok) return { ok: false, motif: resultat.motif };
  const id = (resultat.valeur as { id?: string } | undefined)?.id;
  return id ? { ok: true, valeur: id } : { ok: false, motif: "Discord n'a rendu aucun identifiant." };
}

/**
 * Le salon existe-t-il encore ?
 *
 * `false` seulement sur un 404 : une panne de Discord ou une coupure réseau ne
 * doivent pas faire conclure à une disparition, sans quoi on recréerait un salon à
 * chaque incident et l'ancien resterait là, avec son historique.
 */
export async function salonExiste(
  config: ConfigDiscord,
  salonId: string
): Promise<boolean | null> {
  const resultat = await appelDiscord(config, `/channels/${salonId}`);
  if (resultat.ok) return true;
  return resultat.motif?.includes("(404)") ? false : null;
}

/** Poste un message dans un salon. */
export async function posterDansSalon(
  config: ConfigDiscord,
  salonId: string,
  contenu: string
): Promise<ResultatDiscord<unknown>> {
  return appelDiscord(config, `/channels/${salonId}/messages`, {
    methode: "POST",
    corps: { content: contenu },
  });
}

/**
 * Supprime un salon.
 *
 * Appelé à la suppression de compte et au détachement. Un salon qui survivrait au
 * compte garderait des messages nominatifs — nom, habilitations, dates d'échéance —
 * dans un serveur où l'intéressé n'a plus rien à faire. Annoncer un droit à
 * l'effacement et laisser cela derrière soi serait pire que ne rien annoncer.
 */
export async function supprimerSalon(
  config: ConfigDiscord,
  salonId: string
): Promise<ResultatDiscord<unknown>> {
  return appelDiscord(config, `/channels/${salonId}`, { methode: "DELETE" });
}

/**
 * Message d'accueil posté dans le salon au moment de sa création.
 *
 * Un salon qui apparaît sans explication ressemble à une erreur. Celui-ci dit ce
 * qu'il est, ce qui y arrivera, qui peut le lire, et comment s'en défaire — cette
 * dernière phrase n'est pas une politesse : sans elle, se désinscrire supposerait
 * de deviner où chercher.
 */
export function messageDAccueil(prenom: string): string {
  return (
    `Bonjour **${prenom}**, ce salon est le vôtre.\n\n` +
    `Vous seul pouvez le lire — ni les autres membres du serveur, ni les entreprises.\n\n` +
    `Vous y recevrez deux choses, et rien d'autre :\n` +
    `• **Vos habilitations qui approchent de leur échéance**, avec le nombre de missions ` +
    `ouvertes qu'un renouvellement vous rouvrirait.\n` +
    `• **Les missions publiées qui correspondent à votre profil**, avec la distance et ` +
    `la compatibilité calculée.\n\n` +
    `Ces mêmes informations restent disponibles dans votre espace Intérimatch : ce salon ` +
    `est un relais, pas la source.\n\n` +
    `Pour ne plus rien recevoir ici, détachez votre compte Discord depuis votre profil ` +
    `Intérimatch — le salon sera supprimé.`
  );
}
