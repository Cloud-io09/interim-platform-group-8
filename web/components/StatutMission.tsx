"use client";

import { useRef, useState } from "react";
import { envoyerJson, rechargerVers } from "@/lib/client";

type Statut = "brouillon" | "publiee" | "pourvue" | "close";

const LIBELLE: Record<Statut, string> = {
  brouillon: "Brouillon",
  publiee: "Publiée",
  pourvue: "Pourvue",
  close: "Close",
};

/** Ce que l'état courant signifie, écrit en toutes lettres sous l'étiquette. */
const SENS: Record<Statut, string> = {
  brouillon: "Visible de vous seul. Personne ne la reçoit tant qu'elle n'est pas publiée.",
  publiee: "Proposée aux intérimaires, elle reçoit des candidatures.",
  pourvue: "Le poste est pourvu : la fiche reste consultable mais n'accepte plus de candidature.",
  close: "Fiche close définitivement. Elle n'évolue plus.",
};

/**
 * Motifs de clôture. **Deux boutons voisins disaient presque la même chose.**
 * « Poste pourvu ailleurs » et « Fermer cette fiche » arrêtaient tous deux les
 * candidatures, et leur différence ne vivait que dans une infobulle, invisible au
 * doigt. On demande désormais pourquoi on clôt, et chaque réponse dit ce qu'elle fait.
 */
const MOTIFS: { vise: Statut; libelle: string; effet: string }[] = [
  {
    vise: "pourvue",
    libelle: "J'ai trouvé quelqu'un en dehors d'Intérimatch",
    effet:
      "La fiche reste consultable. Les candidatures en cours sont closes. Vous pourrez la republier si l'embauche tombe.",
  },
  {
    vise: "close",
    libelle: "Je n'ai plus besoin de ce poste",
    effet:
      "Définitif. La fiche disparaît des recherches, les candidatures en cours sont closes, et elle ne pourra plus être republiée.",
  },
];

export default function StatutMission({ missionId, statut }: { missionId: number; statut: Statut }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [motif, setMotif] = useState<Statut>("pourvue");
  const fenetre = useRef<HTMLDialogElement>(null);

  async function changer(vise: Statut) {
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

  const clorePossible = statut === "publiee" || statut === "brouillon";

  return (
    <div className="statut-mission">
      <div>
        <p style={{ margin: 0 }}>
          État : <span className="etiquette">{LIBELLE[statut]}</span>
        </p>
        <p className="petit secondaire" style={{ margin: "0.25rem 0 0" }}>{SENS[statut]}</p>
      </div>

      <div className="statut-actions">
        {statut === "brouillon" && (
          <button className="bouton" onClick={() => changer("publiee")} disabled={enCours}>
            Publier
          </button>
        )}
        {statut === "publiee" && (
          <button className="bouton bouton--secondaire" onClick={() => changer("brouillon")} disabled={enCours}>
            Repasser en brouillon
          </button>
        )}
        {statut === "pourvue" && (
          <button className="bouton bouton--secondaire" onClick={() => changer("publiee")} disabled={enCours}>
            Republier, l&apos;embauche est tombée
          </button>
        )}
        {(clorePossible || statut === "pourvue") && (
          <button
            className="bouton bouton--secondaire"
            onClick={() => {
              setMotif(statut === "publiee" ? "pourvue" : "close");
              fenetre.current?.showModal();
            }}
            disabled={enCours}
          >
            Clore la fiche…
          </button>
        )}
      </div>

      {erreur && (
        <p role="alert" className="petit message-erreur" style={{ margin: 0, width: "100%" }}>
          {erreur}
        </p>
      )}

      <dialog ref={fenetre} className="fenetre" aria-labelledby={`clore-${missionId}`}>
        <h2 id={`clore-${missionId}`} className="titre-carte">Pourquoi clore cette fiche ?</h2>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="petit secondaire">Chaque choix dit ce qu&apos;il fait.</legend>
          {MOTIFS.filter((m) => statut === "publiee" || m.vise === "close").map((m) => (
            <label key={m.vise} className="choix-motif">
              <input
                type="radio"
                name={`motif-${missionId}`}
                checked={motif === m.vise}
                onChange={() => setMotif(m.vise)}
              />
              <span>
                <strong>{m.libelle}</strong>
                <span className="petit secondaire" style={{ display: "block" }}>{m.effet}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="fenetre-actions">
          <button className="bouton bouton--secondaire" onClick={() => fenetre.current?.close()} disabled={enCours}>
            Annuler
          </button>
          <button
            className={motif === "close" ? "bouton bouton--danger" : "bouton"}
            onClick={() => changer(motif)}
            disabled={enCours}
          >
            {enCours ? "…" : motif === "close" ? "Clore définitivement" : "Marquer le poste comme pourvu"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
