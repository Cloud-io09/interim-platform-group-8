"use client";

import { useState } from "react";
import { envoyerJson, rechargerVers } from "@/lib/client";

type Statut = "brouillon" | "publiee" | "pourvue" | "close";

const LIBELLE: Record<Statut, string> = {
  brouillon: "Brouillon",
  publiee: "Publiée",
  pourvue: "Pourvue",
  close: "Close",
};

/** Actions proposées selon l'état courant, avec ce qu'elles impliquent. */
const ACTIONS: Record<Statut, { vise: Statut; libelle: string; consequence: string }[]> = {
  brouillon: [
    { vise: "publiee", libelle: "Publier", consequence: "La fiche devient visible et reçoit des candidats." },
    { vise: "close", libelle: "Fermer cette fiche", consequence: "Elle n'accepte plus de candidature et disparaît des recherches." },
  ],
  publiee: [
    {
      vise: "pourvue",
      // « Marquer pourvue » se lisait comme une écriture comptable. Le cas réel est
      // précis : le poste s'est pourvu ailleurs, on ferme aux candidatures sans
      // clore la fiche. Quand l'affectation se fait ici, ce bouton ne sert pas —
      // accepter une candidature suffit.
      libelle: "Poste pourvu ailleurs",
      consequence: "La fiche n'accepte plus de candidature, mais reste consultable.",
    },
    { vise: "brouillon", libelle: "Dépublier", consequence: "La fiche n'est plus proposée aux intérimaires." },
    { vise: "close", libelle: "Fermer cette fiche", consequence: "Elle n'accepte plus de candidature et disparaît des recherches." },
  ],
  pourvue: [
    { vise: "publiee", libelle: "Republier", consequence: "Si l'affectation tombe, la fiche redevient ouverte." },
    { vise: "close", libelle: "Fermer cette fiche", consequence: "Elle n'accepte plus de candidature et disparaît des recherches." },
  ],
  close: [],
};

export default function StatutMission({ missionId, statut }: { missionId: number; statut: Statut }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function changer(vise: Statut, consequence: string) {
    if (vise === "close" && !confirm(`Clore cette fiche ? ${consequence} Cette action est irréversible.`)) return;
    setEnCours(true);
    setErreur(null);
    const { ok, corps } = await envoyerJson(`/api/missions/${missionId}`, "PATCH", { statut: vise });
    setEnCours(false);
    if (!ok) {
      setErreur(corps.message ?? "Changement impossible.");
      return;
    }
    rechargerVers(`/missions/${missionId}`);
  }

  return (
    <div className="statut-mission">
      <p style={{ margin: 0 }}>
        État : <span className="etiquette">{LIBELLE[statut]}</span>
      </p>
      <div className="statut-actions">
        {ACTIONS[statut].map((a) => (
          <button
            key={a.vise}
            className={a.vise === "close" ? "bouton bouton--secondaire" : "bouton"}
            onClick={() => changer(a.vise, a.consequence)}
            disabled={enCours}
            title={a.consequence}
          >
            {a.libelle}
          </button>
        ))}
        {ACTIONS[statut].length === 0 && (
          <span className="petit secondaire">Cette fiche est close, elle n&apos;évolue plus.</span>
        )}
      </div>
      {erreur && (
        <p role="alert" className="petit message-erreur" style={{ margin: 0, width: "100%" }}>
          {erreur}
        </p>
      )}
    </div>
  );
}
