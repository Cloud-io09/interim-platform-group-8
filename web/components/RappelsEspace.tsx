import type { RoleCompte } from "@interimatch/core";

/**
 * Rappels d'actions en attente, dans le bandeau de l'espace.
 *
 * **Un seul à la fois, et c'est le point.** Deux bandeaux empilés ne se lisent plus :
 * le second apprend à ignorer le premier, et le premier — l'adresse non vérifiée —
 * signale un vrai défaut de sécurité. L'ordre est donc une priorité, pas une liste.
 *
 * Le rappel Discord ne s'affiche qu'une fois l'adresse confirmée. Ce n'est pas un
 * détail d'affichage : enchaîner deux demandes dès l'inscription transforme l'entrée
 * dans le produit en formalités, pour un public qui abandonne au premier obstacle.
 */
export default function RappelsEspace({
  email,
  role,
  adresseVerifiee,
  discordRelie,
  discordDisponible,
}: {
  email: string;
  role: RoleCompte;
  adresseVerifiee: boolean;
  discordRelie: boolean;
  discordDisponible: boolean;
}) {
  const base = role === "entreprise" ? "/espace/entreprise/profil" : "/espace/interimaire/profil";

  if (!adresseVerifiee) {
    return (
      <div className="colonne">
        <p className="bandeau bandeau--attention" role="status">
          <span>
            <strong>Confirmez votre adresse.</strong> Nous avons écrit à {email}. Sans cela,
            aucun lien de réinitialisation ne pourra y être envoyé — seuls vos codes de
            récupération vous permettraient de reprendre la main.
          </span>
          <a className="bouton bouton--secondaire" href={`${base}/securite`}>
            Renvoyer le lien
          </a>
        </p>
      </div>
    );
  }

  if (discordDisponible && !discordRelie) {
    return (
      <div className="colonne">
        <p className="bandeau bandeau--neutre" role="status">
          <span>
            <strong>Recevez vos alertes sur Discord.</strong> Un salon privé, lisible de
            vous seul : échéances d&apos;habilitations et missions correspondantes.
          </span>
          <a className="bouton bouton--secondaire" href={`${base}/notifications`}>
            Relier mon compte
          </a>
        </p>
      </div>
    );
  }

  return null;
}
