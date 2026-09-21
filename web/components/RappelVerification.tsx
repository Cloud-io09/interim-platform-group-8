import type { RoleCompte } from "@interimatch/core";

/**
 * Rappel d'adresse non confirmée, posé dans le chrome des deux espaces.
 *
 * Il est là parce que personne ne va spontanément dans « sécurité du compte » : sans
 * ce rappel, une adresse saisie de travers le resterait, et son titulaire ne
 * découvrirait qu'il n'a pas de chemin de récupération que le jour où il en a besoin.
 *
 * Il **informe sans interdire**. Rien n'est bloqué — ni la connexion, ni les
 * candidatures — et la phrase dit ce qui est en jeu plutôt que « action requise » :
 * le seul effet réel est qu'aucun lien de réinitialisation ne partira vers cette
 * adresse, et les codes de récupération restent disponibles.
 */
export default function RappelVerification({
  email,
  role,
}: {
  email: string;
  role: RoleCompte;
}) {
  const profil = role === "entreprise" ? "/espace/entreprise/profil" : "/espace/interimaire/profil";

  return (
    <div className="colonne">
      <p className="bandeau bandeau--attention" role="status">
        <span>
          <strong>Confirmez votre adresse.</strong> Nous avons écrit à {email}. Tant que
          vous n&apos;avez pas ouvert ce message, aucun lien de réinitialisation ne pourra
          y être envoyé — seuls vos codes de récupération vous permettraient de reprendre
          la main.
        </span>
        <a className="bouton bouton--secondaire" href={`${profil}#titre-securite`}>
          Renvoyer le lien
        </a>
      </p>
    </div>
  );
}
