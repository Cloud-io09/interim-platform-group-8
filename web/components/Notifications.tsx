"use client";

import { useState } from "react";
import type { Notification } from "@/lib/notifications";

const LIBELLE_TYPE: Record<Notification["type"], string> = {
  mission_correspondante: "Mission",
  certification_expire: "Échéance",
  candidature_proposee: "Proposition",
  candidature_repondue: "Réponse",
};

/** « il y a 3 jours » plutôt qu'une date : sur un fil, l'ancienneté prime. */
function ilYA(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  return jours <= 1 ? "hier" : `il y a ${jours} jours`;
}

/**
 * Fil des notifications.
 *
 * Le marquage comme lu est optimiste : l'information a déjà été vue à l'écran, rien
 * ne justifie de faire attendre l'utilisateur derrière une requête. Un échec réseau
 * ne perd rien — la notification reste non lue côté serveur.
 */
export default function Notifications({
  initiales,
  messageVide,
}: {
  initiales: Notification[];
  /** Ce qu'on annonce quand le fil est vide : il diffère selon le rôle. */
  messageVide: string;
}) {
  const [liste, setListe] = useState(initiales);
  const nonLues = liste.filter((n) => !n.lue).length;

  async function toutMarquer() {
    setListe((l) => l.map((n) => ({ ...n, lue: true })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  }

  if (liste.length === 0) {
    return (
      <p className="petit secondaire" style={{ margin: 0 }}>
        {messageVide}
      </p>
    );
  }

  return (
    <>
      <ul className="liste-nue fil">
        {liste.map((n) => (
          <li key={n.id} className={n.lue ? "fil-ligne" : "fil-ligne fil-ligne--neuve"}>
            <a className="lien-bloc" href={n.lien}>
              <span className="fil-tete">
                <span className="etiquette-type">{LIBELLE_TYPE[n.type]}</span>
                <span className="petit secondaire">{ilYA(n.creeLe)}</span>
              </span>
              <strong>{n.titre}</strong>
              {n.corps && <span className="petit secondaire">{n.corps}</span>}
            </a>
          </li>
        ))}
      </ul>
      {nonLues > 0 && (
        <button className="bouton bouton--discret" onClick={toutMarquer}>
          Tout marquer comme lu
        </button>
      )}
    </>
  );
}
