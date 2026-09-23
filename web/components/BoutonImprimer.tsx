"use client";

/**
 * Enregistrement du document en PDF, par l'impression du navigateur.
 *
 * **Pourquoi pas une génération côté serveur.** Il aurait fallu embarquer un moteur
 * de rendu dans une fonction sans état : des mégaoctets chargés à chaque appel, pour
 * produire ce que tout navigateur sait déjà faire — et mieux, puisqu'il respecte les
 * réglages d'impression de la personne, sa langue et sa taille de papier. C'est aussi
 * la logique qui a fait passer la lecture de CV côté navigateur.
 *
 * Le libellé dit « enregistrer », pas « imprimer » : sur un téléphone, la boîte de
 * dialogue propose d'abord « Enregistrer au format PDF », et c'est l'usage attendu —
 * un intérimaire garde son document dans son téléphone, pas dans une imprimante.
 */
export default function BoutonImprimer({ libelle }: { libelle?: string }) {
  return (
    <button
      type="button"
      className="bouton bouton--secondaire ne-pas-imprimer"
      onClick={() => window.print()}
    >
      {libelle ?? "Enregistrer en PDF ou imprimer"}
    </button>
  );
}
