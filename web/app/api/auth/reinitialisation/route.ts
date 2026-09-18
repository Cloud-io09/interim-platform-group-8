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

export const dynamic = "force-dynamic";

/**
 * Base publique du site, pour composer un lien cliquable.
 *
 * `||` et non `??` : une variable **présente mais vide** — le cas par défaut du
 * `.env.example` — doit retomber sur l'origine de la requête. Avec `??` elle était
 * retenue telle quelle, et le courriel partait avec un chemin relatif, donc un lien
 * mort. La barre oblique finale est retirée pour ne pas composer un double slash.
 */
function origine(requete: Request): string {
  const publique = process.env.URL_PUBLIQUE?.trim();
  return (publique || new URL(requete.url).origin).replace(/\/+$/, "");
}

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
    const [compte] = await sql<{ id: number }[]>`select id from compte where email = ${email}`;
    if (!compte) return reponse;

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
