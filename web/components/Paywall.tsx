"use client";

import ConfirmationDeblocage from "./ConfirmationDeblocage";

/**
 * Barrière de déblocage, sur la fiche d'un profil rapproché.
 *
 * **Ce qu'elle cache, et ce qu'elle laisse voir.** Elle masque le nom de famille et
 * les coordonnées, et empêche de solliciter. Elle ne masque **rien** de ce qui sert à
 * décider : score, conformité habilitation par habilitation, distance, disponibilités
 * restent visibles au-dessus et en dessous d'elle.
 *
 * Ce partage n'est pas commercial mais de sûreté. Ce produit existe pour empêcher
 * qu'on envoie quelqu'un sur un chantier sans titre valable ; faire payer ce verdict
 * reviendrait à vendre le risque plutôt qu'à le supprimer.
 *
 * **Le paiement est simulé, et l'écran le dit.** Le mensonge coûterait plus cher que
 * l'aveu : un jury qui découvre une fausse page de paiement doute de tout le reste.
 */
export default function Paywall({
  interimaireId,
  missionId,
  prenom,
  plan,
  quotaRestant,
  credits,
  peutDebloquer,
}: {
  interimaireId: number;
  missionId: number;
  prenom: string;
  plan: string;
  quotaRestant: number | null;
  credits: number;
  peutDebloquer: boolean;
}) {
  // Un rechargement efface tout message local : on se demandait si le crédit était
  // parti. La confirmation voyage donc par l'URL, que la page lit puis efface.
  function recharger() {
    const url = new URL(window.location.href);
    url.searchParams.set("debloque", "1");
    window.location.replace(url.toString());
  }

  return (
    <div className="carte carte--notification">
      <div className="tete-carte">
        <h2 className="titre-carte">Coordonnées masquées</h2>
        <span className="pastille">palier {plan}</span>
      </div>
      <p className="petit secondaire">
        Vous voyez tout ce qui sert à décider : conformité habilitation par
        habilitation, distance, disponibilités, score détaillé. Le nom complet, le
        téléphone, l&apos;agence et le droit de solliciter {prenom} demandent un déblocage,
        valable pour ce profil sur cette mission.
      </p>
      <ConfirmationDeblocage
        interimaireId={interimaireId}
        missionId={missionId}
        prenom={prenom}
        droits={{ plan, illimite: quotaRestant === null, quotaRestant, credits, peutDebloquer }}
        libelle={peutDebloquer ? "Débloquer les coordonnées" : "Voir comment débloquer"}
        onTermine={recharger}
      />
    </div>
  );
}
