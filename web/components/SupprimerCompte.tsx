"use client";

import { useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson, rechargerVers } from "@/lib/client";

/**
 * Suppression du compte — droit à l'effacement.
 *
 * Repliée par défaut : c'est une action irréversible, elle n'a pas à côtoyer les
 * réglages courants. Le mot de passe est redemandé, parce qu'une session laissée
 * ouverte sur un poste partagé ne doit pas suffire à effacer un profil.
 */
export default function SupprimerCompte() {
  const idMotDePasse = useId();
  const [ouvert, setOuvert] = useState(false);
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function supprimer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const motDePasse = String(new FormData(evenement.currentTarget).get("motDePasse") ?? "");
    if (!confirm("Supprimer définitivement votre compte et toutes vos données ? Cette action est irréversible.")) return;

    setEnCours(true);
    setErreur(null);
    setProblemes([]);
    const { ok, corps } = await envoyerJson("/api/compte", "DELETE", { motDePasse });
    setEnCours(false);
    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Suppression impossible.");
      return;
    }
    rechargerVers("/");
  }

  return (
    <section className="zone-dangereuse" aria-labelledby="titre-suppression">
      <h2 id="titre-suppression" style={{ fontSize: "1.05rem" }}>Supprimer mon compte</h2>
      {!ouvert ? (
        <>
          <p className="petit secondaire" style={{ margin: "0 0 0.75rem" }}>
            Efface définitivement votre profil, vos certifications, vos disponibilités et
            vos candidatures. Rien n&apos;est conservé.
          </p>
          <button className="bouton bouton--secondaire" onClick={() => setOuvert(true)}>
            Je veux supprimer mon compte
          </button>
        </>
      ) : (
        <form onSubmit={supprimer} noValidate>
          <div className="champ">
            <label htmlFor={idMotDePasse}>Confirmez avec votre mot de passe</label>
            <input id={idMotDePasse} name="motDePasse" type="password" required autoComplete="current-password" />
          </div>
          <RetourFormulaire erreur={erreur} succes={null} problemes={problemes} />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="bouton bouton--danger" type="submit" disabled={enCours}>
              {enCours ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button type="button" className="bouton bouton--secondaire" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
