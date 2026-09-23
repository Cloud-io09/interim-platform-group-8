import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibilité et écoconception",
  description:
    "Déclaration d'accessibilité RGAA et pratiques d'écoconception appliquées sur la plateforme Intérimatch.",
  alternates: { canonical: "/accessibilite" },
};

export default function Accessibilite() {
  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <h1>Accessibilité et écoconception</h1>

        <h2>Déclaration d&apos;accessibilité</h2>
        <p>
          Intérimatch s&apos;adresse à des ouvriers du bâtiment, qui consultent souvent
          depuis un téléphone, sur chantier, parfois avec des gants. L&apos;accessibilité
          n&apos;est donc pas une contrainte annexe : c&apos;est une condition d&apos;usage.
        </p>
        <p>
          <strong>État : partiellement conforme</strong> au RGAA 4.1. Cette déclaration
          porte sur une version de démonstration.
        </p>

        <h3>Ce qui est vérifié automatiquement</h3>
        <p>
          Les critères vérifiables sur le code rendu le sont par des tests exécutés à
          chaque modification, sur les dix-sept pages du produit. Un manquement casse la
          construction : il ne peut pas partir en production.
        </p>
        <ul>
          <li>Langue du document déclarée, un seul <code>h1</code> par page, aucun niveau de titre sauté.</li>
          <li>Repères <code>header</code>, <code>main</code>, <code>footer</code> et navigation nommée présents partout.</li>
          <li>Lien d&apos;évitement présent, et sa cible existante.</li>
          <li>Aucun <code>tabindex</code> positif, aucun lien ou bouton retiré de la tabulation.</li>
          <li>Aucune action confiée à un élément non interactif.</li>
          <li>Chaque champ associé à une étiquette - par <code>for</code>, par ARIA, ou par enveloppement.</li>
          <li>Chaque <code>fieldset</code> nommé par une <code>legend</code>.</li>
          <li>Aucune image sans alternative, logo masqué aux technologies d&apos;assistance.</li>
          <li>Aucun état de certification signalé par la seule couleur.</li>
        </ul>

        <h3>Ce qui est mis en œuvre, sans être automatiquement vérifiable</h3>
        <ul>
          <li>Lien d&apos;évitement vers le contenu principal, visible à la prise de focus.</li>
          <li>Un seul <code>h1</code> par page, hiérarchie de titres continue.</li>
          <li>Formulaires à étiquettes explicites, groupés par <code>fieldset</code> et <code>legend</code>.</li>
          <li>Messages d&apos;erreur reliés au champ concerné, et signalés aux technologies d&apos;assistance.</li>
          <li>Cibles tactiles d&apos;au moins 44 pixels, y compris les liens de navigation.</li>
          <li>Aucune information portée par la couleur seule : les états de certification sont toujours écrits en toutes lettres.</li>
          <li>Champs de saisie à 16 pixels minimum, pour éviter le zoom automatique sur iOS.</li>
          <li>Contrastes mesurés : 16,2:1 pour le texte principal, 6,3:1 pour le texte secondaire, 5,9:1 pour les états d&apos;alerte, tous au-dessus du seuil de 4,5:1.</li>
          <li>Prise de focus visible en permanence, et respect du réglage système de réduction des animations.</li>
        </ul>

        <h3>Limites connues</h3>
        <p>
          Un test automatique vérifie la structure, pas l&apos;expérience. Ces points
          restent à éprouver à la main :
        </p>
        <ul>
          <li>La cohérence perçue de l&apos;ordre de tabulation n&apos;a pas été parcourue écran par écran.</li>
          <li>La restitution réelle par un lecteur d&apos;écran n&apos;a pas été testée.</li>
          <li>Les jauges de score sont décoratives et toujours accompagnées de leur valeur chiffrée, mais leur annonce n&apos;a pas été vérifiée.</li>
          <li>Le parcours n&apos;a pas été éprouvé avec un utilisateur en situation de handicap.</li>
          <li>Aucun audit RGAA complet n&apos;a été conduit par un tiers.</li>
        </ul>

        <h2>Écoconception</h2>
        <p>
          Deux pratiques appliquées et mesurables, conformément au référentiel général
          d&apos;écoconception des services numériques.
        </p>
        <h3>Réduction du nombre de requêtes</h3>
        <p>
          Les résultats de correspondance sont mis en cache quinze minutes en base non
          relationnelle. Un calcul parcourt tous les profils du métier concerné : le
          rejouer à chaque affichage du tableau de bord consommerait sans rien apporter.
          Le chargement des offres publiques procède par lots de 200 lignes plutôt
          qu&apos;une requête par offre - sur 1 762 offres, la durée passe de plus de deux
          minutes à moins de trois secondes.
        </p>
        <h3>Sobriété de la page</h3>
        <p>
          Aucune police externe, aucune bibliothèque de composants, aucun traceur. La page
          d&apos;accueil est rendue statiquement et pèse environ 20 kilo-octets de HTML.
          Les images éventuelles sont servies en AVIF ou WebP, et la compression est
          activée sur l&apos;ensemble des réponses.
        </p>
      </div>
    </section>
  );
}
