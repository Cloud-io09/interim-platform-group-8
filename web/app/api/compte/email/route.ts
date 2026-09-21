import { connexion } from "@interimatch/core/db";
import { normaliserEmail, redis, validerEmail, verifierMotDePasse } from "@interimatch/core";
import { corpsJson, erreur, succes } from "@/lib/reponses";
import { sessionOuErreur } from "@/lib/garde";
import {
  envoyerChangementEmail,
  origine,
  prevenirAncienneAdresse,
} from "@/lib/verification-email";

export const dynamic = "force-dynamic";

/**
 * Adresse du compte et état de sa vérification.
 *
 * Relue en base plutôt que prise dans la session : le cookie porte l'adresse telle
 * qu'elle était à l'ouverture, et il n'a aucune raison de savoir si elle a été
 * confirmée depuis, éventuellement depuis un autre appareil.
 */
export async function GET() {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const sql = connexion();
  try {
    const [compte] = await sql<{ email: string; email_verifie_le: Date | null }[]>`
      select email, email_verifie_le from compte where id = ${garde.session.compteId}`;
    if (!compte) return erreur("Compte introuvable.", 404);
    return succes({ email: compte.email, verifie: compte.email_verifie_le !== null });
  } finally {
    await sql.end();
  }
}

/**
 * Demande de changement d'adresse e-mail.
 *
 * **Rien n'est écrit ici.** La demande émet un jeton et part vers la nouvelle boîte ;
 * l'adresse du compte ne bouge qu'à la confirmation. Écrire tout de suite serait le
 * piège classique : une faute de frappe couperait le titulaire de son propre compte —
 * un identifiant de connexion qu'il ignore, et plus aucun lien de récupération
 * accessible.
 *
 * **Le mot de passe est exigé.** L'adresse e-mail est un facteur de reprise en main :
 * qui la change prend le contrôle du compte. Un cookie volé, ou une session laissée
 * ouverte sur une tablette de chantier, ne doit pas suffire.
 *
 * **L'ancienne adresse est prévenue.** Seul avertissement que recevra le titulaire si
 * quelqu'un a obtenu son mot de passe, et il arrive tant que cette boîte est encore
 * celle du compte.
 */
export async function POST(requete: Request) {
  const garde = await sessionOuErreur();
  if ("reponse" in garde) return garde.reponse;

  const saisie = await corpsJson<{ email?: string; motDePasse?: string }>(requete);
  if (!saisie?.email || !saisie?.motDePasse) {
    return erreur("Formulaire incomplet.", 422, [
      { champ: "email", message: "La nouvelle adresse et votre mot de passe sont nécessaires." },
    ]);
  }

  const probleme = validerEmail(saisie.email);
  if (probleme) return erreur("Adresse e-mail invalide.", 422, [probleme]);

  const nouvelle = normaliserEmail(saisie.email);

  const sql = connexion();
  try {
    const [compte] = await sql<
      { email: string; mot_de_passe_hash: string; mot_de_passe_sel: string }[]
    >`select email, mot_de_passe_hash, mot_de_passe_sel
        from compte where id = ${garde.session.compteId}`;
    if (!compte) return erreur("Compte introuvable.", 404);

    const valide = await verifierMotDePasse(
      saisie.motDePasse,
      compte.mot_de_passe_hash,
      compte.mot_de_passe_sel
    );
    if (!valide) {
      return erreur("Mot de passe incorrect.", 403, [
        { champ: "motDePasse", message: "Ce n'est pas votre mot de passe." },
      ]);
    }

    if (nouvelle === compte.email) {
      return erreur("C'est déjà l'adresse de votre compte.", 422, [
        { champ: "email", message: "Indiquez une adresse différente." },
      ]);
    }

    // Adresse déjà prise : c'est dit franchement, contrairement à l'endpoint public
    // de réinitialisation. Ici l'appelant est authentifié — il ne peut sonder qu'à
    // raison d'un mot de passe par essai, et le taire l'enverrait dans un parcours
    // qui échouera de toute façon à la confirmation.
    const [occupee] = await sql<{ id: number }[]>`
      select id from compte where email = ${nouvelle} and id <> ${garde.session.compteId}`;
    if (occupee) {
      return erreur("Cette adresse est déjà utilisée par un autre compte.", 409, [
        { champ: "email", message: "Cette adresse est déjà utilisée." },
      ]);
    }

    await envoyerChangementEmail(redis(), garde.session.compteId, nouvelle, origine(requete));
    await prevenirAncienneAdresse(compte.email, nouvelle);

    return succes({
      demande: true,
      cible: nouvelle,
      message:
        `Un lien de confirmation a été envoyé à ${nouvelle}. ` +
        `Votre adresse actuelle reste active tant que vous ne l'avez pas ouvert.`,
    });
  } finally {
    await sql.end();
  }
}
