"use client";

import { useCallback, useEffect, useState } from "react";
import RetourFormulaire from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";

/**
 * Rattachement du compte à Discord, et salon privé.
 *
 * **Ce que l'écran doit dire, et que l'ancienne version taisait.** Les notifications
 * partaient vers un webhook unique : chacun lisait les alertes des autres, et rien
 * dans l'interface ne le laissait deviner. Ici, l'état est explicite — relié ou non,
 * depuis quand — et le texte dit qui peut lire le salon.
 *
 * **Aucune adresse e-mail n'est comparée.** Le rattachement repose sur le fait que la
 * même personne tient une session Intérimatch ouverte *et* autorise sur Discord dans
 * le même aller-retour. On ne demande à Discord ni l'adresse, ni les serveurs
 * fréquentés, ni les messages : seulement l'identifiant, et le droit d'ajouter au
 * serveur — sans quoi le salon créé resterait invisible à son destinataire.
 */

type Etat = {
  disponible: boolean;
  relie: boolean;
  salonId: string | null;
  relieLe: string | null;
  /** Adresse directe du salon, pour ne pas le faire chercher dans une liste. */
  lienSalon: string | null;
  /** Le salon manquait et vient d'être refait. */
  salonRecree: boolean;
};

/** Ce que le retour d'OAuth range dans l'URL, traduit en phrase compréhensible. */
const RETOURS: Record<string, { ton: "ok" | "echec"; texte: string }> = {
  ok: { ton: "ok", texte: "Votre salon privé est créé. Un message d'accueil vous y attend." },
  refuse: { ton: "echec", texte: "Vous avez refusé l'autorisation sur Discord. Rien n'a été modifié." },
  "etat-invalide": {
    ton: "echec",
    texte: "Cette demande n'est plus valable — elle a expiré, ou elle a déjà servi. Réessayez depuis ce bouton.",
  },
  "deja-relie": {
    ton: "echec",
    texte: "Ce compte Discord est déjà rattaché à un autre compte Intérimatch. Détachez-le d'abord de là-bas.",
  },
  // Deux échecs distincts, deux phrases distinctes. Elles disent ce qui n'a pas eu
  // lieu et quoi faire — pas ce qui se passe dans nos appels : « le serveur est
  // peut-être mal configuré » n'aide pas quelqu'un qui voulait juste des alertes.
  "serveur-refuse": {
    ton: "echec",
    texte: "Nous n'avons pas pu vous ajouter à notre serveur Discord. Réessayez ; si le message revient, votre compte Discord a peut-être refusé l'accès.",
  },
  "salon-refuse": {
    ton: "echec",
    texte: "Votre salon n'a pas pu être créé. C'est temporaire le plus souvent : réessayez dans une minute.",
  },
  "non-configure": {
    ton: "echec",
    texte: "Le relais Discord n'est pas configuré sur ce déploiement.",
  },
  echec: { ton: "echec", texte: "Discord n'a pas répondu comme attendu. Réessayez." },
};

export default function LiaisonDiscord() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [retour, setRetour] = useState<(typeof RETOURS)[string] | null>(null);
  const [enCours, setEnCours] = useState(false);

  const relire = useCallback(() => {
    fetch("/api/discord")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setEtat(
          d
            ? {
                disponible: d.disponible,
                relie: d.relie,
                salonId: d.salonId,
                relieLe: d.relieLe,
                lienSalon: d.lienSalon,
                salonRecree: d.salonRecree,
              }
            : null
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    relire();

    // Le retour d'OAuth passe par l'URL. On le lit puis on l'efface de la barre
    // d'adresse : rechargé, il rejouerait un message sans rapport avec l'état réel.
    const parametres = new URLSearchParams(window.location.search);
    const code = parametres.get("discord");
    if (!code) return;
    setRetour(RETOURS[code] ?? RETOURS.echec!);
    parametres.delete("discord");
    const reste = parametres.toString();
    window.history.replaceState({}, "", window.location.pathname + (reste ? `?${reste}` : ""));
  }, [relire]);

  async function detacher() {
    setEnCours(true);
    setRetour(null);
    const { ok, corps } = await envoyerJson<{ message: string }>("/api/discord", "DELETE", {});
    setEnCours(false);
    setRetour({ ton: ok ? "ok" : "echec", texte: corps.message ?? "Détachement impossible." });
    relire();
  }

  if (!etat) return null;

  return (
    <section aria-labelledby="titre-discord" className="carte carte--notification">
      <div className="tete-carte">
        <h3 id="titre-discord" className="titre-carte" style={{ margin: 0 }}>
          Notifications sur Discord
        </h3>
        <span className={etat.relie ? "pastille pastille--ok" : "pastille"}>
          {etat.relie ? "✓ relié" : "non relié"}
        </span>
      </div>

      <RetourFormulaire
        erreur={retour?.ton === "echec" ? retour.texte : null}
        succes={retour?.ton === "ok" ? retour.texte : null}
      />

      {!etat.disponible ? (
        <p className="petit secondaire">
          Relais non configuré sur ce déploiement. Vos notifications restent dans votre
          espace.
        </p>
      ) : etat.relie ? (
        <>
          {etat.salonRecree && (
            <p className="petit" role="status">
              Votre salon avait disparu de Discord : nous l&apos;avons recréé.
            </p>
          )}
          <p className="petit secondaire">
            Salon privé, lisible de vous seul.
            {etat.relieLe && <> Rattaché le {new Date(etat.relieLe).toLocaleDateString("fr-FR")}.</>}{" "}
            Le détacher le supprime.
          </p>
          <div className="actions-proposition">
            {etat.lienSalon && (
              <a
                className="bouton lien-bloc"
                href={etat.lienSalon}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir mon salon
              </a>
            )}
            <button className="bouton bouton--secondaire" onClick={detacher} disabled={enCours}>
              {enCours ? "Détachement…" : "Détacher mon compte Discord"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="petit secondaire">
            Vos échéances et vos missions correspondantes, dans un{" "}
            <strong>salon lisible de vous seul</strong>. Facultatif.
          </p>
          <a className="bouton lien-bloc" href="/api/discord/lier">
            Relier mon compte Discord
          </a>
          {/* Replié : ce qui rassure quand on se pose la question, sans alourdir
              l'écran de ceux qui ne se la posent pas. */}
          <details className="petit secondaire">
            <summary>Quelles données Discord reçoit-il&nbsp;?</summary>
            <p>
              Nous lui demandons votre identifiant et le droit de vous ajouter à notre
              serveur. <strong>Ni votre adresse e-mail, ni vos messages.</strong> Votre
              adresse Discord n&apos;a pas besoin d&apos;être la même qu&apos;ici.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
