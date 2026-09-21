"use client";

import { useEffect, useState } from "react";

/**
 * Proposition de recevoir ses notifications sur Discord.
 *
 * **Pourquoi ce n'est pas un bandeau.** Le rattachement est un consentement à
 * transmettre des données à un tiers. Une bannière qui revient à chaque écran est une
 * pression au consentement — ce qu'on reproche à juste titre aux bandeaux de cookies.
 * Et l'espace en porte déjà un, pour l'adresse non vérifiée : celui-là signale un
 * vrai trou de sécurité, et en ajouter un second le banaliserait.
 *
 * **Où elle est placée, et pourquoi là.** Sous le fil d'activité, c'est-à-dire à côté
 * de ce qu'elle améliore. Proposer « recevez ceci ailleurs » au moment précis où l'on
 * regarde « ceci » demande zéro explication ; la même phrase sur le tableau de bord
 * en général en demanderait un paragraphe.
 *
 * **Elle s'écarte, et ne revient pas.** Le refus est retenu dans le navigateur. Le
 * ranger en base coûterait une colonne et une migration pour une préférence qui ne
 * vaut que pour un rappel — et ce que l'on veut éviter, c'est le harcèlement sur
 * l'appareil où la personne travaille. Un `try/catch` entoure chaque accès : en
 * navigation privée, la lecture peut lever, et la proposition doit alors s'afficher
 * normalement plutôt que de faire tomber l'écran.
 */

const CLE_REFUS = "interimatch:discord-propose";

export default function ProposerDiscord() {
  const [afficher, setAfficher] = useState(false);

  useEffect(() => {
    let ecarte = false;
    try {
      ecarte = window.localStorage.getItem(CLE_REFUS) === "ecarte";
    } catch {
      /* stockage indisponible : on propose, c'est le comportement le moins gênant */
    }
    if (ecarte) return;

    // On ne propose ni à qui a déjà relié son compte, ni sur un déploiement où le
    // relais n'est pas monté : un bouton qui échoue vaut moins que pas de bouton.
    fetch("/api/discord")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAfficher(Boolean(d?.disponible && !d.relie)))
      .catch(() => {});
  }, []);

  function ecarter() {
    setAfficher(false);
    try {
      window.localStorage.setItem(CLE_REFUS, "ecarte");
    } catch {
      /* rien à faire : la proposition réapparaîtra, sans conséquence */
    }
  }

  if (!afficher) return null;

  return (
    <div className="carte proposition-discord">
      <p className="petit" style={{ margin: 0 }}>
        <strong>Recevoir ces alertes sur Discord ?</strong> Dans un salon créé pour vous
        seul — échéances de vos habilitations, missions qui vous correspondent. C&apos;est
        facultatif, et tout reste visible ici.
      </p>
      <div className="actions-proposition">
        <a className="bouton bouton--secondaire lien-bloc" href="/api/discord/lier">
          Relier mon Discord
        </a>
        <button type="button" className="bouton-discret" onClick={ecarter}>
          Non merci
        </button>
      </div>
    </div>
  );
}
