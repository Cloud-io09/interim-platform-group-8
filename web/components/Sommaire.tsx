interface Entree {
  href: string;
  titre: string;
  texte: string;
  etat?: { libelle: string; complet: boolean };
}

/**
 * Sommaire d'un espace client.
 *
 * Chaque entrée dit où elle mène **et** dans quel état elle se trouve : un profil
 * incomplet doit se voir depuis l'accueil de l'espace, pas se découvrir en ouvrant
 * le formulaire.
 */
export default function Sommaire({ entrees }: { entrees: Entree[] }) {
  return (
    <ul className="liste-nue grille grille--2">
      {entrees.map((e) => (
        <li key={e.href} className="carte">
          <h2 style={{ fontSize: "1.125rem", marginBottom: "0.35rem" }}>
            <a href={e.href}>{e.titre}</a>
          </h2>
          <p className="petit secondaire" style={{ margin: 0 }}>{e.texte}</p>
          {e.etat && (
            <p style={{ margin: "0.75rem 0 0" }}>
              <span className={`etiquette ${e.etat.complet ? "etiquette--ok" : "etiquette--attention"}`}>
                {e.etat.libelle}
              </span>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
