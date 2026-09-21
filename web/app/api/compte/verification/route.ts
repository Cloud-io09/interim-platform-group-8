import { connexion } from "@interimatch/core/db";
import { cle, MAX_DEMANDES_REINITIALISATION, redis, TTL } from "@interimatch/core";
import { erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { envoyerVerification, origine } from "@/lib/verification-email";

export const dynamic = "force-dynamic";

/**
 * Renvoi du lien de vérification, à l'adresse du compte.
 *
 * Indispensable, et pas un simple confort : le message de l'inscription se perd — dans
 * les indésirables, dans une boîte relevée une fois par semaine, ou parce que le
 * prestataire était en panne ce jour-là. Sans ce renvoi, l'adresse resterait non
 * vérifiée pour toujours et le compte n'aurait jamais que ses codes de récupération.
 *
 * Authentifié, donc l'endpoint ne renseigne personne sur l'existence d'un compte et
 * n'a pas à rester muet comme celui de la réinitialisation. Il reste compté : le
 * destinataire est imposé par la session, mais rien n'empêcherait sinon de se servir
 * de son propre compte pour marteler le prestataire.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const cache = redis();
  const clefDemandes = cle.demandesReinitialisation(`verif:${garde.session.compteId}`);
  const demandes = await cache.incr(clefDemandes);
  if (demandes === 1) await cache.expire(clefDemandes, TTL.demandesReinitialisation);
  if (demandes > MAX_DEMANDES_REINITIALISATION) {
    return erreur(
      "Trop de demandes en peu de temps. Réessayez dans une heure, ou vérifiez vos indésirables.",
      429
    );
  }

  const sql = connexion();
  try {
    const [compte] = await sql<{ email: string; email_verifie_le: Date | null }[]>`
      select email, email_verifie_le from compte where id = ${garde.session.compteId}`;
    if (!compte) return erreur("Compte introuvable.", 404);

    if (compte.email_verifie_le) {
      return succes({ envoye: false, message: "Votre adresse est déjà confirmée." });
    }

    await envoyerVerification(cache, garde.session.compteId, compte.email, origine(requete));
    return succes({
      envoye: true,
      message: `Un lien de confirmation vient d'être envoyé à ${compte.email}. Il est valable 48 heures.`,
    });
  } finally {
    await sql.end();
  }
}
