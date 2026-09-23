"use client";

import { useState } from "react";
import { envoyerJson } from "@/lib/client";

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
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function debloquer() {
    setEnCours(true);
    setErreur(null);
    const { ok, corps } = await envoyerJson<{ message: string }>("/api/deblocages", "POST", {
      interimaireId,
      missionId,
    });
    if (!ok) {
      setEnCours(false);
      setErreur(corps.message ?? "Déblocage impossible.");
      return;
    }
    // Rechargement plutôt que mise à jour locale : l'identité et le bouton de
    // sollicitation sont rendus côté serveur, et c'est lui qui fait autorité.
    //
    // Mais un rechargement efface tout message local : l'écran changeait sans rien
    // dire, et on se demandait si le crédit était parti. La confirmation voyage donc
    // par l'URL, que la page lit puis efface.
    const url = new URL(window.location.href);
    url.searchParams.set("debloque", "1");
    window.location.replace(url.toString());
  }

  const reste =
    quotaRestant === null
      ? "Déblocages sans limite sur votre palier."
      : quotaRestant > 0
        ? `${quotaRestant} déblocage${quotaRestant > 1 ? "s" : ""} inclus restant${quotaRestant > 1 ? "s" : ""} ce mois-ci.`
        : credits > 0
          ? `${credits} crédit${credits > 1 ? "s" : ""} restant${credits > 1 ? "s" : ""}.`
          : "Vous n'avez plus de déblocage disponible.";

  return (
    <div className="carte carte--notification">
      <div className="tete-carte">
        <h2 className="titre-carte">Coordonnées masquées</h2>
        <span className="pastille">palier {plan}</span>
      </div>

      <p className="petit secondaire">
        Vous voyez tout ce qui sert à décider : conformité habilitation par
        habilitation, distance, disponibilités, score détaillé. Le nom complet, le
        téléphone et le droit de solliciter {prenom} demandent un déblocage.
      </p>
      <p className="petit secondaire">
        Un déblocage vaut pour <strong>ce profil sur cette mission</strong>. {reste}
      </p>

      {erreur && (
        <p className="petit message-erreur" role="alert">
          {erreur}
        </p>
      )}

      {peutDebloquer ? (
        <>
          <button className="bouton" onClick={debloquer} disabled={enCours}>
            {enCours ? "Déblocage…" : "Débloquer les coordonnées"}
          </button>
          {/* Ce qu'il restera après, pas seulement ce qu'il reste avant : c'est la
              question qu'on se pose la main sur le bouton. */}
          <p className="petit secondaire" style={{ margin: "0.5rem 0 0" }}>
            {quotaRestant === null
              ? "Votre palier ne limite pas les déblocages."
              : quotaRestant > 0
                ? `Il vous en restera ${quotaRestant - 1} ce mois-ci.`
                : `Il vous restera ${credits - 1} crédit${credits - 1 > 1 ? "s" : ""}.`}
          </p>
        </>
      ) : (
        <a className="bouton lien-bloc" href="/espace/entreprise/abonnement">
          Voir les formules
        </a>
      )}
    </div>
  );
}
