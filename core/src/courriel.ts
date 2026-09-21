/**
 * Envoi de courriel transactionnel.
 *
 * Volontairement derrière une abstraction, pour deux raisons.
 *
 * **Le produit doit fonctionner sans prestataire.** Tant qu'aucune clé n'est posée,
 * les messages partent au journal du serveur plutôt que de disparaître : le parcours
 * reste complet, testable et démontrable, et l'absence de configuration se voit au
 * lieu de produire un échec silencieux.
 *
 * **Le canal n'est pas décidé ici.** Les parcours demandent « envoie ce message à
 * cette adresse » ; brancher un autre prestataire, ou un SMS plus tard, ne touche
 * qu'à ce fichier.
 *
 * Ce n'est pas l'authentification : le sujet demande d'écrire soi-même le hachage,
 * les sessions et les jetons — ce qui est fait — et n'interdit pas de confier
 * l'acheminement d'un courriel à un service d'envoi.
 */

export interface Courriel {
  destinataire: string;
  sujet: string;
  /** Texte brut. Un message d'authentification n'a aucun besoin de mise en forme. */
  texte: string;
}

export type CanalCourriel = "brevo" | "journal" | "factice";

export interface ResultatEnvoi {
  transmis: boolean;
  canal: CanalCourriel;
  /** Renseigné quand l'envoi a échoué, pour le journal du serveur. */
  motif?: string;
}

/** Marqueur du journal, repérable par la suite fonctionnelle. */
export const MARQUEUR_JOURNAL = "[courriel]";

/**
 * Domaines réservés par la RFC 2606, qu'aucun utilisateur réel ne peut posséder.
 *
 * Ils sont garantis sans enregistrement DNS : rien n'y est jamais acheminé.
 */
const DOMAINES_RESERVES = ["test", "example", "invalid", "localhost"];
const DOMAINES_RESERVES_COMPLETS = ["example.com", "example.net", "example.org"];

/**
 * Une adresse vers laquelle il est légitime de faire partir un message.
 *
 * Nos propres outils — essai de fumée, parcours de bout en bout, suite fonctionnelle —
 * créent des comptes sur des adresses factices en `@exemple.test`. Depuis que
 * l'inscription envoie un message de vérification, les laisser partir vers un
 * prestataire produirait un rebond dur à chaque exécution, et les rebonds abîment
 * durablement la réputation d'expéditeur d'un domaine.
 *
 * Le filtre ne porte pas sur nos adresses d'essai en particulier, mais sur les
 * domaines que la RFC 2606 réserve précisément à cet usage : aucun compte réel ne
 * peut s'en réclamer, et tout outil écrit plus tard en hérite sans rien savoir d'ici.
 */
export function adresseEnvoyable(adresse: string): boolean {
  const domaine = adresse.trim().toLowerCase().split("@")[1];
  if (!domaine) return false;
  if (DOMAINES_RESERVES_COMPLETS.includes(domaine)) return false;
  return !DOMAINES_RESERVES.includes(domaine.split(".").pop() ?? "");
}

function expediteur(): { email: string; nom: string } | null {
  const email = process.env.COURRIEL_EXPEDITEUR;
  return email ? { email, nom: process.env.COURRIEL_EXPEDITEUR_NOM ?? "Intérimatch" } : null;
}

/**
 * Envoie un courriel par Brevo.
 *
 * Brevo plutôt qu'un autre : il autorise l'envoi depuis une **adresse personnelle
 * vérifiée**, sans posséder de domaine. C'est la seule contrainte qui bloquait
 * réellement un projet d'école.
 */
async function parBrevo(courriel: Courriel, cle: string, de: { email: string; nom: string }) {
  const reponse = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: de.email, name: de.nom },
      to: [{ email: courriel.destinataire }],
      subject: courriel.sujet,
      textContent: courriel.texte,
    }),
    // Sans délai maximum, un prestataire lent immobiliserait la requête de
    // l'utilisateur, qui attend déjà une réponse pour un geste très simple.
    signal: AbortSignal.timeout(8000),
  });

  if (!reponse.ok) {
    throw new Error(`Brevo a refusé l'envoi (${reponse.status}) : ${await reponse.text()}`);
  }
}

/** Écrit le message en entier au journal du serveur, préfixé pour être retrouvable. */
function journaliser(courriel: Courriel): void {
  process.stderr.write(
    `${MARQUEUR_JOURNAL} → ${courriel.destinataire}\n` +
      `${MARQUEUR_JOURNAL} sujet : ${courriel.sujet}\n` +
      courriel.texte
        .split("\n")
        .map((l) => `${MARQUEUR_JOURNAL} ${l}`)
        .join("\n") +
      "\n"
  );
}

/**
 * Envoie un courriel, ou le journalise faute de prestataire configuré.
 *
 * Ne lève jamais. Un parcours d'authentification ne doit pas échouer parce qu'un
 * service d'envoi est indisponible : le jeton est déjà émis, l'utilisateur peut
 * redemander un lien, et l'incident se lit dans le journal.
 */
export async function envoyerCourriel(courriel: Courriel): Promise<ResultatEnvoi> {
  const cle = process.env.BREVO_API_KEY;
  const de = expediteur();

  if (!adresseEnvoyable(courriel.destinataire)) {
    // Adresse d'un domaine réservé : on journalise comme sans prestataire, ce qui
    // garde le parcours vérifiable, et rien ne part.
    journaliser(courriel);
    return { transmis: false, canal: "factice" };
  }

  if (!cle || !de) {
    // Pas de prestataire : le message est écrit au journal, en entier. C'est ce qui
    // rend le parcours vérifiable en développement et en test, et ce qui évite
    // qu'une configuration oubliée passe pour un envoi réussi.
    journaliser(courriel);
    return { transmis: false, canal: "journal" };
  }

  try {
    await parBrevo(courriel, cle, de);
    return { transmis: true, canal: "brevo" };
  } catch (erreur) {
    const motif = erreur instanceof Error ? erreur.message : "erreur inconnue";
    process.stderr.write(`${MARQUEUR_JOURNAL} ÉCHEC vers ${courriel.destinataire} : ${motif}\n`);
    return { transmis: false, canal: "brevo", motif };
  }
}
