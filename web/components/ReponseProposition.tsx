"use client";

import { useState } from "react";
import { envoyerJson, rechargerVers } from "@/lib/client";

/**
 * Accepter ou refuser une proposition d'entreprise.
 *
 * Rechargement complet après réponse plutôt que mise à jour locale : la réponse
 * change le tableau de bord entier — la proposition disparaît, la mission devient
 * « prochaine », une notification part chez l'entreprise. Recoudre tout ça à la main
 * dans le client créerait un écart avec ce que le serveur sait.
 */
export default function ReponseProposition({ missionId }: { missionId: number }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function repondre(reponse: "acceptee" | "refusee") {
    setEnCours(true);
    setErreur(null);
    const { ok, corps } = await envoyerJson("/api/interimaire/candidatures", "POST", {
      missionId,
      reponse,
    });
    if (!ok) {
      setEnCours(false);
      setErreur(corps.message ?? "Réponse impossible pour le moment.");
      return;
    }
    rechargerVers("/espace/interimaire");
  }

  return (
    <div className="reponse-proposition">
      {erreur && <p className="petit alerte-texte">{erreur}</p>}
      <button className="bouton bouton--marque" disabled={enCours} onClick={() => repondre("acceptee")}>
        {enCours ? "Envoi…" : "J'accepte cette mission"}
      </button>
      <button className="bouton bouton--sur-sombre" disabled={enCours} onClick={() => repondre("refusee")}>
        Refuser
      </button>
    </div>
  );
}
