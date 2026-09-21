import { exigerSession } from "@/lib/garde";
import { debutLiaison, oauthConfigure } from "@/lib/discord";
import { origine } from "@/lib/verification-email";

export const dynamic = "force-dynamic";

/**
 * Départ de la liaison Discord : redirige vers l'écran d'autorisation.
 *
 * Une redirection et non un appel en arrière-plan : c'est la personne elle-même qui
 * doit voir ce qu'elle autorise, sur un domaine qu'elle reconnaît. Un consentement
 * obtenu sans écran n'en est pas un.
 */
export async function GET(requete: Request) {
  const session = await exigerSession();
  const profil = session.role === "entreprise" ? "/espace/entreprise/profil/notifications"
      : "/espace/interimaire/profil/notifications";

  if (!oauthConfigure()) {
    return Response.redirect(`${origine(requete)}${profil}?discord=non-configure`, 302);
  }

  return Response.redirect(await debutLiaison(session.compteId, origine(requete)), 302);
}
