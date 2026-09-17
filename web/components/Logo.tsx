/**
 * Pavé Intérimatch : deux crochets qui se font face — l'intérimaire et l'entreprise —
 * l'espace entre eux étant la mise en relation.
 *
 * Tracé en ligne plutôt que chargé depuis `/logo/*.svg` : trois formes ne justifient
 * pas une requête réseau, et le rayon reste proportionnel à la taille demandée, comme
 * l'exige la charte (3 % du côté, jamais une valeur absolue).
 *
 * Le jaune est le seul emploi non fonctionnel de cette couleur dans la charte : il
 * identifie, il ne signale rien. Il n'apparaît donc qu'une fois par écran.
 */
export default function Logo({
  taille = 28,
  inverse = false,
}: {
  taille?: number;
  /** Variante à poser sur fond encre : pavé clair, jaune sourd pour garder du contraste. */
  inverse?: boolean;
}) {
  const pave = inverse ? "#F6F6F4" : "#1A1A18";
  const crochetGauche = inverse ? "#1A1A18" : "#F6F6F4";
  const crochetDroit = inverse ? "#C9A800" : "#F5D90A";

  return (
    <svg
      viewBox="0 0 132 132"
      width={taille}
      height={taille}
      // Le nom de la marque est écrit en toutes lettres à côté : répéter l'information
      // en texte alternatif la ferait annoncer deux fois par un lecteur d'écran.
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", display: "block" }}
    >
      <rect x="0" y="0" width="132" height="132" rx="4" fill={pave} />
      <path d="M28 30 h30 v14 h-16 v44 h16 v14 h-30 z" fill={crochetGauche} />
      <path d="M104 30 h-30 v14 h16 v44 h-16 v14 h30 z" fill={crochetDroit} />
    </svg>
  );
}
