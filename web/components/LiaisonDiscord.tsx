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
  "salon-impossible": {
    ton: "echec",
    texte: "Discord a refusé la création du salon. Réessayez dans quelques instants ; si cela persiste, le serveur est peut-être mal configuré.",
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
      .then((d) => setEtat(d ? { disponible: d.disponible, relie: d.relie, salonId: d.salonId, relieLe: d.relieLe } : null))
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
    <section aria-labelledby="titre-discord" className="carte" style={{ marginTop: "1rem" }}>
      <div className="tete-carte">
        <h3 id="titre-discord" style={{ fontSize: "1rem", margin: 0 }}>
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
          Le relais Discord n&apos;est pas configuré sur ce déploiement. Vos notifications
          restent consultables dans votre espace.
        </p>
      ) : etat.relie ? (
        <>
          <p className="petit secondaire">
            Vous avez un <strong>salon privé</strong> sur notre serveur Discord. Vous seul
            pouvez le lire — ni les autres membres, ni les entreprises. Vous y recevez vos
            habilitations qui approchent de leur échéance, et les missions qui correspondent
            à votre profil.
            {etat.relieLe && (
              <> Rattaché le {new Date(etat.relieLe).toLocaleDateString("fr-FR")}.</>
            )}
          </p>
          <p className="petit secondaire">
            Détacher supprime le salon et tout ce qui y a été posté.
          </p>
          <button className="bouton bouton--secondaire" onClick={detacher} disabled={enCours}>
            {enCours ? "Détachement…" : "Détacher mon compte Discord"}
          </button>
        </>
      ) : (
        <>
          <p className="petit secondaire">
            Recevez vos alertes d&apos;échéance et vos missions correspondantes dans un{" "}
            <strong>salon Discord créé pour vous seul</strong>. C&apos;est facultatif : les
            mêmes informations restent dans votre espace.
          </p>
          <p className="petit secondaire">
            Nous demandons à Discord votre identifiant et le droit de vous ajouter à notre
            serveur — <strong>ni votre adresse e-mail, ni vos messages</strong>. Votre
            adresse Discord n&apos;a pas besoin d&apos;être la même qu&apos;ici.
          </p>
          <a className="bouton lien-bloc" href="/api/discord/lier">
            Relier mon compte Discord
          </a>
        </>
      )}
    </section>
  );
}
