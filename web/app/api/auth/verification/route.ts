import { connexion } from "@interimatch/core/db";
import { consommerJeton, fermerToutesLesSessions, redis } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { retirerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Confirmation d'une adresse e-mail, par le lien reçu dans la boîte concernée.
 *
 * Un seul écran reçoit les deux parcours — première vérification et changement
 * d'adresse — parce que l'utilisateur qui clique ne sait pas, et n'a pas à savoir,
 * lequel des deux jetons il porte. Le type reste vérifié : c'est lui qui décide si
 * l'adresse est seulement marquée vérifiée, ou remplacée.
 *
 * **Aucune authentification n'est exigée.** Le lien arrive souvent sur le téléphone,
 * dans une application de messagerie, alors que la session est ouverte sur un autre
 * appareil. Exiger d'être connecté ferait échouer le cas le plus courant. La preuve
 * apportée est celle qui compte ici : relever cette boîte.
 */
export async function POST(requete: Request) {
  const saisie = await corpsJson<{ jeton?: string }>(requete);
  const cache = redis();

  const contenu = await consommerJeton(cache, saisie?.jeton, [
    "verification_email",
    "changement_email",
  ]);
  if (!contenu?.cible) {
    return erreur(
      "Ce lien n'est plus valable : il a expiré, ou il a déjà servi. Demandez-en un nouveau depuis votre espace.",
      400
    );
  }

  const sql = connexion();
  try {
    const [compte] = await sql<{ id: number; email: string }[]>`
      select id, email from compte where id = ${contenu.compteId}`;
    if (!compte) return erreur("Ce compte n'existe plus.", 404);

    if (contenu.type === "verification_email") {
      // Le jeton porte l'adresse visée. Si le compte en a changé entre-temps, ce
      // lien vérifierait une adresse qui n'est plus la sienne : on le refuse plutôt
      // que de marquer vérifiée une adresse que personne n'a confirmée.
      if (compte.email !== contenu.cible) {
        return erreur(
          "Ce lien concerne une adresse qui n'est plus celle du compte. Demandez-en un nouveau depuis votre espace.",
          409
        );
      }
      await sql`update compte set email_verifie_le = now() where id = ${compte.id}`;
      return succes({
        confirme: "adresse",
        email: compte.email,
        message: "Votre adresse est confirmée. Le lien de réinitialisation peut désormais y être envoyé.",
      });
    }

    // --- Changement d'adresse -------------------------------------------------
    const remplace = await sql<{ id: number }[]>`
      update compte
         set email = ${contenu.cible}, email_verifie_le = now()
       where id = ${compte.id}
         and not exists (select 1 from compte where email = ${contenu.cible} and id <> ${compte.id})
      returning id`;

    // L'adresse a pu être prise par quelqu'un d'autre entre la demande et le clic —
    // 24 heures laissent le temps. Le `not exists` le traite dans la même requête,
    // donc sans fenêtre entre le contrôle et l'écriture.
    if (remplace.length === 0) {
      return erreur(
        "Cette adresse est désormais utilisée par un autre compte. Votre adresse actuelle reste inchangée.",
        409
      );
    }

    // Changer l'identifiant de connexion ferme tout : la prochaine ouverture se fera
    // avec la nouvelle adresse, et toute session antérieure — y compris celle d'un
    // tiers qui aurait obtenu le mot de passe — tombe.
    await fermerToutesLesSessions(cache, compte.id);
    await retirerSession();

    return succes({
      confirme: "changement",
      email: contenu.cible,
      message:
        "Votre adresse est changée et confirmée. Reconnectez-vous avec cette nouvelle adresse.",
    });
  } finally {
    await sql.end();
  }
}
