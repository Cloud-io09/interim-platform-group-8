interface Action {
  href: string;
  titre: string;
  texte: string;
  /** `true` quand il reste quelque chose à faire : la carte le signale. */
  aFaire?: boolean;
  etat?: string;
}

interface Chiffre {
  valeur: string;
  legende: string;
  href?: string;
}

interface Props {
  salutation: string;
  sousTitre: string;
  /**消 Une seule chose à faire en priorité, mise en avant. */
  urgence?: { texte: string; lienTexte: string; href: string } | null;
  chiffres: Chiffre[];
  actions: Action[];
}

/**
 * Accueil d'un espace connecté.
 *
 * Trois niveaux de lecture, dans cet ordre : ce qui bloque, où on en est, ce qu'on
 * peut faire. Une grille uniforme de cartes obligerait à tout lire pour comprendre
 * qu'un profil est incomplet — ici, ça se voit avant le reste.
 */
export default function Espace({ salutation, sousTitre, urgence, chiffres, actions }: Props) {
  return (
    <div className="espace">
      <header className="espace-entete">
        <h1>{salutation}</h1>
        <p className="secondaire">{sousTitre}</p>
      </header>

      {urgence && (
        <div className="bandeau bandeau--attention" role="status">
          <p style={{ margin: 0 }}>
            <strong>{urgence.texte}</strong>
          </p>
          <a className="bouton" href={urgence.href}>{urgence.lienTexte}</a>
        </div>
      )}

      {chiffres.length > 0 && (
        <ul className="liste-nue bandeau-chiffres">
          {chiffres.map((c) => (
            <li key={c.legende}>
              {c.href ? <a href={c.href} className="chiffre-lien">
                <span className="chiffre">{c.valeur}</span>
                <span className="petit secondaire">{c.legende}</span>
              </a> : <>
                <span className="chiffre">{c.valeur}</span>
                <span className="petit secondaire">{c.legende}</span>
              </>}
            </li>
          ))}
        </ul>
      )}

      <h2 className="sur-titre">Que voulez-vous faire ?</h2>
      <ul className="liste-nue actions">
        {actions.map((a) => (
          <li key={a.href}>
            <a href={a.href} className={`action ${a.aFaire ? "action--a-faire" : ""}`}>
              <span className="action-titre">
                {a.titre}
                {a.etat && (
                  <span className={`etiquette ${a.aFaire ? "etiquette--attention" : "etiquette--ok"}`}>
                    {a.etat}
                  </span>
                )}
              </span>
              <span className="petit secondaire">{a.texte}</span>
              <span className="action-fleche" aria-hidden="true">→</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
