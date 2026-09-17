interface Onglet {
  href: string;
  libelle: string;
  actif?: boolean;
}

interface Props {
  initiales: string;
  titre: string;
  /** Une ligne de contexte : métier, commune, rayon. Jamais deux. */
  sousTitre: string;
  onglets: Onglet[];
}

/**
 * En-tête d'un espace connecté.
 *
 * Identité à gauche, navigation de l'espace à droite : l'utilisateur sait en un coup
 * d'œil qui il est et où il est. L'ancien écran consacrait un titre de 3 rem à
 * « Bonjour Karim » — la moitié du premier écran pour une information qu'on connaît
 * déjà.
 */
export default function EnteteEspace({ initiales, titre, sousTitre, onglets }: Props) {
  return (
    <header className="entete-espace">
      <div className="identite">
        {/* Décoratif : le nom est juste à côté, en texte. */}
        <span className="pastille-initiales" aria-hidden="true">{initiales}</span>
        <div>
          <h1>{titre}</h1>
          <p className="petit secondaire">{sousTitre}</p>
        </div>
      </div>

      <nav className="onglets" aria-label="Sections de mon espace">
        <ul className="liste-nue">
          {onglets.map((o) => (
            <li key={o.href}>
              <a href={o.href} className={o.actif ? "onglet onglet--actif" : "onglet"} aria-current={o.actif ? "page" : undefined}>
                {o.libelle}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
