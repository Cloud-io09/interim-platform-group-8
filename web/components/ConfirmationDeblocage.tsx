"use client";

import { useRef, useState } from "react";
import { envoyerJson } from "@/lib/client";

export interface DroitsAffiches {
  plan: string;
  illimite: boolean;
  /** `null` quand le palier est illimité : l'infini ne passe pas en JSON. */
  quotaRestant: number | null;
  credits: number;
  peutDebloquer: boolean;
}

/**
 * Ce qu'un déblocage va consommer, dit avant le clic.
 *
 * Même ordre que le serveur : le quota du mois passe avant les crédits, parce qu'il se
 * remet à zéro alors qu'un crédit acheté ne périme pas.
 */
function cout(d: DroitsAffiches): { consomme: string; reste: string } {
  if (d.illimite) {
    return { consomme: `Inclus dans votre palier ${d.plan}, sans limite.`, reste: "" };
  }
  const quota = d.quotaRestant ?? 0;
  if (quota > 0) {
    return {
      consomme: `Utilise 1 des ${quota} contacts inclus ce mois-ci dans votre palier ${d.plan}.`,
      reste: `Il vous en restera ${quota - 1} ce mois-ci.`,
    };
  }
  return {
    consomme: "Utilise 1 crédit.",
    reste: `Il vous restera ${d.credits - 1} crédit${d.credits - 1 > 1 ? "s" : ""}.`,
  };
}

/**
 * Bouton de déblocage, précédé d'une confirmation.
 *
 * **Un crédit partait sans prévenir.** Le bouton débitait au premier clic : on
 * découvrait après coup qu'un déblocage avait été imputé, sans savoir s'il venait du
 * forfait ou des crédits. La fenêtre dit ce que l'on obtient, ce que cela coûte, et ce
 * qu'il restera — avant, pas après.
 *
 * `<dialog>` natif plutôt qu'une fenêtre maison : le piège du focus, la touche Échap
 * et le fond inerte sont fournis par le navigateur, et restitués correctement par les
 * lecteurs d'écran.
 */
export default function ConfirmationDeblocage({
  interimaireId,
  missionId,
  prenom,
  droits,
  libelle = "Débloquer les coordonnées",
  apresSollicitation = false,
  onTermine,
}: {
  interimaireId: number;
  missionId: number;
  prenom: string;
  droits: DroitsAffiches;
  libelle?: string;
  /** Enchaîne la sollicitation une fois le déblocage acquis. */
  apresSollicitation?: boolean;
  onTermine: () => void;
}) {
  const fenetre = useRef<HTMLDialogElement>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const { consomme, reste } = cout(droits);

  async function confirmer() {
    setEnCours(true);
    setErreur(null);
    const d = await envoyerJson<{ message: string }>("/api/deblocages", "POST", { interimaireId, missionId });
    if (!d.ok) {
      setEnCours(false);
      setErreur(d.corps.message ?? "Déblocage impossible.");
      return;
    }
    if (apresSollicitation) {
      const s = await envoyerJson<{ message: string }>("/api/candidatures", "POST", {
        missionId,
        interimaireId,
        vers: "sollicitee",
      });
      if (!s.ok) {
        // Le déblocage est acquis : on le dit, plutôt que de laisser croire que tout
        // a échoué et que le crédit est perdu.
        setEnCours(false);
        setErreur(`Coordonnées débloquées, mais la sollicitation a échoué : ${s.corps.message ?? "réessayez"}.`);
        return;
      }
    }
    fenetre.current?.close();
    setEnCours(false);
    onTermine();
  }

  return (
    <>
      <button type="button" className="bouton" onClick={() => fenetre.current?.showModal()}>
        {libelle}
      </button>

      <dialog ref={fenetre} className="fenetre" aria-labelledby={`deblocage-${interimaireId}`}>
        <h2 id={`deblocage-${interimaireId}`} className="titre-carte">
          {droits.peutDebloquer
            ? `Débloquer ${prenom} pour cette mission ?`
            : "Plus de déblocage disponible"}
        </h2>

        {droits.peutDebloquer ? (
          <>
            <p className="petit">Vous obtenez :</p>
            <ul className="petit">
              <li>son nom complet et son téléphone ;</li>
              <li>le nom de son agence d&apos;emploi, s&apos;il en a déclaré une ;</li>
              <li>le droit de le solliciter sur cette mission.</li>
            </ul>
            <p className="petit">
              <strong>{consomme}</strong> {reste}
            </p>
            <p className="petit secondaire">
              Le déblocage vaut pour ce profil sur cette mission. Le rouvrir plus tard ne
              coûte rien. Ce qui sert à décider (conformité, score, distance,
              disponibilités) reste visible sans déblocage.
            </p>
          </>
        ) : (
          <p className="petit">
            Votre palier {droits.plan} n&apos;a plus de contact inclus ce mois-ci, et vous
            n&apos;avez pas de crédit. Vous pouvez acheter des crédits à l&apos;unité ou
            changer de palier.
          </p>
        )}

        {erreur && (
          <p className="petit message-erreur" role="alert">
            {erreur}
          </p>
        )}

        <div className="fenetre-actions">
          <button
            type="button"
            className="bouton bouton--secondaire"
            onClick={() => fenetre.current?.close()}
            disabled={enCours}
          >
            Annuler
          </button>
          {droits.peutDebloquer ? (
            <button type="button" className="bouton" onClick={confirmer} disabled={enCours}>
              {enCours ? "Déblocage…" : apresSollicitation ? "Débloquer et solliciter" : "Confirmer le déblocage"}
            </button>
          ) : (
            <a className="bouton" href="/espace/entreprise/abonnement">
              Voir les formules
            </a>
          )}
        </div>
      </dialog>
    </>
  );
}
