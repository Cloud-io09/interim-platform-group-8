import OngletsEspace, { type Onglet } from "./OngletsEspace";

interface Props {
  initiales: string;
  titre: string;
  /** Une ligne de contexte : métier, commune, rayon. Jamais deux. */
  sousTitre: string;
  onglets: Onglet[];
  libelleNavigation: string;
}

/**
 * En-tête d'un espace connecté.
 *
 * Posé dans le layout du rôle, pas dans chaque page : la barre reste en place d'un
 * écran à l'autre au lieu d'être démontée et remontée, et l'utilisateur ne perd
 * jamais de vue où il se trouve.
 *
 * Le titre de la page vit sous cette barre, dans chaque page — ce `h1`-ci nomme la
 * personne, pas l'écran.
 */
export default function EnteteEspace({ initiales, titre, sousTitre, onglets, libelleNavigation }: Props) {
  return (
    <header className="entete-espace">
      <div className="identite">
        {/* Décoratif : le nom est juste à côté, en texte. */}
        <span className="pastille-initiales" aria-hidden="true">{initiales}</span>
        <div>
          <p className="identite-nom">{titre}</p>
          <p className="petit secondaire">{sousTitre}</p>
        </div>
      </div>
      <OngletsEspace onglets={onglets} libelle={libelleNavigation} />
    </header>
  );
}
