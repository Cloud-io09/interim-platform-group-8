import { connexion } from "@interimatch/core/db";
import {
  fermerToutesLesSessions,
  hacherMotDePasse,
  redis,
  validerMotDePasse,
  verifierMotDePasse,
} from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import { jetonSessionCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Changement de mot de passe, pour un utilisateur connecté.
 *
 * L'ancien mot de passe est exigé. Être connecté ne suffit pas : un cookie volé, ou
 * une session laissée ouverte sur une tablette de chantier, permettrait sinon de
 * verrouiller le compte de son propriétaire.
 *
 * Toutes les autres sessions sont fermées. C'est ce qui distingue un changement de
 * mot de passe d'un simple remplacement de chaîne : si quelqu'un d'autre était
 * connecté, il est éjecté au moment même où le propriétaire reprend la main. La
 * session courante est épargnée — déconnecter l'utilisateur de l'écran où il vient
 * d'agir serait une punition, pas une mesure de sécurité.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ ancien?: string; nouveau?: string }>(requete);
  if (!saisie?.ancien || !saisie?.nouveau) {
    return erreur("Formulaire incomplet.", 422, [
      { champ: "ancien", message: "Votre mot de passe actuel et le nouveau sont nécessaires." },
    ]);
  }

  const probleme = validerMotDePasse(saisie.nouveau);
  if (probleme) return erreur("Le nouveau mot de passe est trop faible.", 422, [probleme]);

  if (saisie.nouveau === saisie.ancien) {
    return erreur("Choisissez un mot de passe différent.", 422, [
      { champ: "nouveau", message: "Le nouveau mot de passe est identique à l'ancien." },
    ]);
  }

  const sql = connexion();
  try {
    const [compte] = await sql<{ mot_de_passe_hash: string; mot_de_passe_sel: string }[]>`
      select mot_de_passe_hash, mot_de_passe_sel from compte where id = ${garde.session.compteId}`;
    if (!compte) return erreur("Compte introuvable.", 404);

    const valide = await verifierMotDePasse(
      saisie.ancien,
      compte.mot_de_passe_hash,
      compte.mot_de_passe_sel
    );
    if (!valide) {
      return erreur("Mot de passe actuel incorrect.", 403, [
        { champ: "ancien", message: "Ce n'est pas votre mot de passe actuel." },
      ]);
    }

    const { hash, sel } = await hacherMotDePasse(saisie.nouveau);
    await sql`
      update compte set mot_de_passe_hash = ${hash}, mot_de_passe_sel = ${sel}
      where id = ${garde.session.compteId}`;

    const fermees = await fermerToutesLesSessions(
      redis(),
      garde.session.compteId,
      await jetonSessionCourant()
    );

    return succes({ change: true, sessionsFermees: fermees });
  } finally {
    await sql.end();
  }
}
