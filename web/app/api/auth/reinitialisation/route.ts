import { connexion } from "@interimatch/core/db";
import {
  cle,
  emettreJeton,
  envoyerCourriel,
  MAX_DEMANDES_REINITIALISATION,
  normaliserEmail,
  redis,
  TTL,
} from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { origine } from "@/lib/verification-email";

export const dynamic = "force-dynamic";

/**
 * Demande de réinitialisation par courriel.
 *
 * **La réponse est toujours la même.** Compte connu ou inconnu, courriel parti ou
 * non : dire « cette adresse est inconnue » ferait de cet endpoint un moyen
 * d'énumérer les inscrits, sans authentification et à la vitesse du réseau.
 *
 * **L'envoi ne conditionne pas la réponse.** Si le prestataire est indisponible, le
 * jeton existe tout de même et l'incident se lit dans le journal du serveur. Faire
 * échouer la requête n'aiderait personne : l'utilisateur redemanderait un lien, et
 * l'attaquant apprendrait que l'adresse existe.
 *
 * **Rien n'est envoyé à une adresse non vérifiée.** C'est la condition qui referme la
 * faille : sans elle, s'inscrire avec « karim@gmial.com » suffit à ce que le
 * propriétaire réel de cette boîte demande un lien et prenne le compte. Le titulaire
 * n'est pas pour autant sans recours — ses codes de récupération restent valables, et
 * ils sont le seul chemin tant qu'il n'a pas confirmé son adresse.
 */
export async function POST(requete: Request) {
  const saisie = await corpsJson<{ email?: string }>(requete);
  if (!saisie?.email) {
    return erreur("Adresse e-mail obligatoire.", 422, [
      { champ: "email", message: "Indiquez l'adresse de votre compte." },
    ]);
  }

  const email = normaliserEmail(saisie.email);
  const cache = redis();

  // Sans ce compteur, l'endpoint serait un moyen d'inonder la boîte de n'importe
  // qui — et il ne peut pas exiger d'authentification, c'est tout son objet.
  const clefDemandes = cle.demandesReinitialisation(email);
  const demandes = await cache.incr(clefDemandes);
  if (demandes === 1) await cache.expire(clefDemandes, TTL.demandesReinitialisation);

  // Même réponse au-delà du seuil : annoncer « trop de demandes » confirmerait au
  // passage que le compte existe.
  const reponse = succes({
    demande: true,
    message:
      "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'y être envoyé. Il est valable une heure.",
  });
  if (demandes > MAX_DEMANDES_REINITIALISATION) return reponse;

  const sql = connexion();
  try {
    const [compte] = await sql<{ id: number; email_verifie_le: Date | null }[]>`
      select id, email_verifie_le from compte where email = ${email}`;
    if (!compte) return reponse;

    // Adresse non confirmée : même réponse, aucun envoi. Le distinguer dans le
    // message rendrait l'endpoint bavard sur l'état des comptes.
    if (!compte.email_verifie_le) return reponse;

    const { jeton } = await emettreJeton(cache, { type: "reinitialisation", compteId: compte.id });
    const lien = `${origine(requete)}/reinitialisation?jeton=${encodeURIComponent(jeton)}`;

    await envoyerCourriel({
      destinataire: email,
      sujet: "Réinitialiser votre mot de passe Intérimatch",
      texte:
        `Bonjour,\n\n` +
        `Vous avez demandé à réinitialiser le mot de passe de votre compte Intérimatch.\n\n` +
        `Ouvrez ce lien pour choisir un nouveau mot de passe :\n${lien}\n\n` +
        `Ce lien est valable une heure et ne fonctionne qu'une fois.\n\n` +
        `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : ` +
        `votre mot de passe actuel reste valable et personne n'a eu accès à votre compte.\n\n` +
        `— Intérimatch`,
    });

    return reponse;
  } finally {
    await sql.end();
  }
}
