import { connexion } from "@interimatch/core/db";
import { configDiscord } from "@interimatch/core";
import { erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { detacher, oauthConfigure } from "@/lib/discord";

export const dynamic = "force-dynamic";

/** État de la liaison Discord du compte, pour l'écran de profil. */
export async function GET() {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    const [compte] = await sql<
      { discord_utilisateur_id: string | null; discord_salon_id: string | null; discord_relie_le: Date | null }[]
    >`select discord_utilisateur_id, discord_salon_id, discord_relie_le
        from compte where id = ${garde.session.compteId}`;
    if (!compte) return erreur("Compte introuvable.", 404);

    const config = configDiscord();
    return succes({
      // Le relais est-il monté côté serveur ? L'écran doit pouvoir le dire plutôt
      // que de proposer un bouton qui échouera.
      disponible: oauthConfigure() && config !== null,
      relie: compte.discord_utilisateur_id !== null,
      salonId: compte.discord_salon_id,
      relieLe: compte.discord_relie_le,
      // Adresse directe du salon. Sans elle, on annonce à quelqu'un qu'un salon
      // existe pour lui en le laissant le chercher dans une liste — or il vient
      // d'être créé, il est tout en bas, et son nom ne lui dit rien.
      //
      // L'identifiant du serveur n'est pas un secret : il est visible de tout
      // membre, et il ne donne accès à rien sans y avoir été invité.
      lienSalon:
        config && compte.discord_salon_id
          ? `https://discord.com/channels/${config.serveurId}/${compte.discord_salon_id}`
          : null,
    });
  } finally {
    await sql.end();
  }
}

/**
 * Détache le compte de Discord et supprime son salon.
 *
 * Pas de mot de passe demandé, contrairement au changement d'adresse : détacher ne
 * donne accès à rien et n'ouvre aucune reprise en main. C'est un retrait de
 * consentement, et le rendre coûteux serait contraire à l'esprit du RGPD.
 */
export async function DELETE() {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    await detacher(sql, garde.session.compteId);
    return succes({ detache: true, message: "Votre compte Discord est détaché et le salon supprimé." });
  } finally {
    await sql.end();
  }
}
