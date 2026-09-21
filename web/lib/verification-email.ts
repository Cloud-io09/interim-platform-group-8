import { emettreJeton, envoyerCourriel } from "@interimatch/core";
import type { MagasinSession } from "@interimatch/core";

/**
 * Vérification de l'adresse e-mail, et changement d'adresse.
 *
 * **Pourquoi vérifier.** Depuis que le lien envoyé par courriel est le chemin
 * principal de récupération, une adresse mal saisie n'est plus une simple coquille :
 * qui s'inscrit avec « karim@gmial.com » remet au propriétaire réel de cette boîte le
 * moyen de réinitialiser son mot de passe, et donc son compte.
 *
 * **Ce que la vérification bloque, et ce qu'elle ne bloque pas.** Elle ne bloque ni
 * l'inscription, ni la connexion, ni aucune fonctionnalité : le public visé — des
 * ouvriers qui s'inscrivent souvent depuis un téléphone, entre deux chantiers —
 * abandonnerait au premier obstacle, et une configuration d'envoi défaillante
 * enfermerait tout le monde dehors. Elle conditionne une seule chose : **l'envoi
 * d'un lien de réinitialisation**. C'est exactement la surface de la faille, ni plus.
 *
 * Personne n'est pour autant sans recours : les codes de récupération, remis à
 * l'inscription, restent utilisables quelle que soit l'adresse.
 */

/**
 * Base publique du site, pour composer un lien cliquable.
 *
 * `||` et non `??` : une variable **présente mais vide** — le cas par défaut du
 * `.env.example` — doit retomber sur l'origine de la requête. Avec `??` elle était
 * retenue telle quelle, et le courriel partait avec un chemin relatif, donc un lien
 * mort. La barre oblique finale est retirée pour ne pas composer un double slash.
 */
export function origine(requete: Request): string {
  const publique = process.env.URL_PUBLIQUE?.trim();
  return (publique || new URL(requete.url).origin).replace(/\/+$/, "");
}

/**
 * Émet un jeton de vérification et l'envoie à l'adresse concernée.
 *
 * Ne lève jamais et ne rend rien d'exploitable : l'appelant ne doit pas faire dépendre
 * sa réponse de l'acheminement. Une inscription qui échouerait parce que le
 * prestataire de courriel est en panne serait un très mauvais échange.
 */
export async function envoyerVerification(
  cache: MagasinSession,
  compteId: number,
  adresse: string,
  base: string
): Promise<void> {
  const { jeton } = await emettreJeton(cache, {
    type: "verification_email",
    compteId,
    cible: adresse,
  });
  const lien = `${base}/verification?jeton=${encodeURIComponent(jeton)}`;

  await envoyerCourriel({
    destinataire: adresse,
    sujet: "Confirmez votre adresse e-mail Intérimatch",
    texte:
      `Bonjour,\n\n` +
      `Confirmez que cette adresse est bien la vôtre en ouvrant ce lien :\n${lien}\n\n` +
      `Tant qu'elle ne l'est pas, votre compte fonctionne normalement, mais aucun lien ` +
      `de réinitialisation de mot de passe ne pourra y être envoyé — c'est ce qui ` +
      `empêche qu'une adresse saisie par erreur donne accès à votre compte. Vos codes ` +
      `de récupération, eux, restent utilisables.\n\n` +
      `Ce lien est valable 48 heures et ne fonctionne qu'une fois.\n\n` +
      `Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.\n\n` +
      `— Intérimatch`,
  });
}

/**
 * Émet un jeton de changement d'adresse, envoyé à la **nouvelle** boîte.
 *
 * L'adresse en base ne change qu'à la confirmation. Sans cela, se tromper en la
 * saisissant couperait le titulaire de son propre compte : plus de lien de
 * récupération accessible, et une adresse de connexion qu'il ignore.
 */
export async function envoyerChangementEmail(
  cache: MagasinSession,
  compteId: number,
  nouvelle: string,
  base: string
): Promise<void> {
  const { jeton } = await emettreJeton(cache, {
    type: "changement_email",
    compteId,
    cible: nouvelle,
  });
  const lien = `${base}/verification?jeton=${encodeURIComponent(jeton)}`;

  await envoyerCourriel({
    destinataire: nouvelle,
    sujet: "Confirmez votre nouvelle adresse Intérimatch",
    texte:
      `Bonjour,\n\n` +
      `Vous avez demandé à utiliser cette adresse pour votre compte Intérimatch.\n\n` +
      `Elle ne remplacera l'ancienne qu'après avoir ouvert ce lien :\n${lien}\n\n` +
      `Ce lien est valable 24 heures et ne fonctionne qu'une fois. Jusque-là, ` +
      `connectez-vous avec votre adresse actuelle.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\n` +
      `— Intérimatch`,
  });
}

/**
 * Prévient l'**ancienne** adresse qu'un changement a été demandé.
 *
 * Le mot de passe est déjà exigé pour demander le changement, donc ce message ne
 * protège pas contre un inconnu — il protège contre quelqu'un qui a obtenu le mot de
 * passe. C'est le seul avertissement que le titulaire recevra, et il arrive tant que
 * l'ancienne boîte est encore celle du compte.
 */
export async function prevenirAncienneAdresse(
  ancienne: string,
  nouvelle: string
): Promise<void> {
  await envoyerCourriel({
    destinataire: ancienne,
    sujet: "Demande de changement d'adresse sur votre compte Intérimatch",
    texte:
      `Bonjour,\n\n` +
      `Une demande de changement d'adresse vient d'être faite sur votre compte ` +
      `Intérimatch, vers ${nouvelle}.\n\n` +
      `Si vous en êtes à l'origine, ouvrez le lien de confirmation envoyé à cette ` +
      `nouvelle adresse. Rien n'est changé avant.\n\n` +
      `**Si vous n'en êtes pas à l'origine, quelqu'un connaît votre mot de passe.** ` +
      `Changez-le immédiatement depuis votre espace : cela fermera toutes les ` +
      `sessions ouvertes, y compris la sienne.\n\n` +
      `— Intérimatch`,
  });
}
