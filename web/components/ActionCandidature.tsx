"use client";

import { useState } from "react";
import { actionsPossibles, libelleAction, type Acteur, type EtatCandidature } from "@interimatch/core/candidature";
import { envoyerJson, rechargerVers } from "@/lib/client";

interface Props {
  missionId: number;
  /** Requis côté entreprise ; côté intérimaire le serveur n'agit que pour la session. */
  interimaireId?: number;
  acteur: Acteur;
  etat: EtatCandidature;
  /** Où revenir après l'action : la page entière change d'état. */
  retour: string;
  /** Rendu quand plus aucune action n'est possible. */
  conclusion?: string;
}

/**
 * Actions offertes sur une candidature.
 *
 * Les boutons sont déduits de la table de transitions du cœur, jamais écrits en dur :
 * une action affichée ici mais refusée par le serveur serait une impasse, et l'inverse
 * une fonctionnalité invisible.
 *
 * Décliner demande un motif facultatif. Il n'est pas là pour la statistique : une
 * entreprise qui écarte un profil doit pouvoir dire pourquoi, sans quoi l'intérimaire
 * ne peut rien en tirer.
 */
export default function ActionCandidature({
  missionId,
  interimaireId,
  acteur,
  etat,
  retour,
  conclusion,
}: Props) {
  const possibles = actionsPossibles(etat, acteur);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [demandeMotif, setDemandeMotif] = useState(false);

  async function agir(vers: EtatCandidature) {
    if (vers === "declinee" && !demandeMotif) {
      setDemandeMotif(true);
      return;
    }
    setEnCours(true);
    setErreur(null);
    const { ok, corps } = await envoyerJson<{ avertissement: string | null }>("/api/candidatures", "POST", {
      missionId,
      interimaireId,
      vers,
      motif: vers === "declinee" ? motif : undefined,
    });
    if (!ok) {
      setEnCours(false);
      setErreur(corps.message ?? "Action impossible pour le moment.");
      return;
    }
    // L'écran est rechargé : un message en état local serait perdu. Il voyage donc
    // par l'URL, que la page de destination lit puis efface.
    rechargerVers(
      corps.avertissement
        ? `${retour}${retour.includes("?") ? "&" : "?"}avertissement=${encodeURIComponent(corps.avertissement)}`
        : retour
    );
  }

  if (possibles.length === 0) {
    return conclusion ? <p className="secondaire">{conclusion}</p> : null;
  }

  return (
    <div className="bloc-action">
      {erreur && (
        // Le refus le plus fréquent est une habilitation qui a expiré entre le
        // rapprochement et la décision : le message le dit, il ne dit pas « erreur ».
        <p className="alerte-texte" role="alert">{erreur}</p>
      )}

      {demandeMotif && (
        <div className="champ">
          <label htmlFor={`motif-${missionId}`}>
            Motif {acteur === "entreprise" ? "du retrait" : "du refus"} <span className="secondaire">(facultatif)</span>
          </label>
          <input
            id={`motif-${missionId}`}
            type="text"
            value={motif}
            maxLength={200}
            onChange={(e) => setMotif(e.target.value)}
            placeholder={acteur === "entreprise" ? "Profil retenu ailleurs" : "Chantier trop éloigné"}
          />
        </div>
      )}

      <div className="boutons-action">
        {possibles.map((vers) => (
          <button
            key={vers}
            className={vers === "declinee" ? "bouton bouton--secondaire" : "bouton"}
            disabled={enCours}
            onClick={() => agir(vers)}
          >
            {enCours ? "…" : libelleAction(vers, acteur, etat)}
          </button>
        ))}
      </div>
    </div>
  );
}
