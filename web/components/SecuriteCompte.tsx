"use client";

import { useEffect, useId, useState } from "react";
import CodesRecuperation from "./CodesRecuperation";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";

/**
 * Sécurité du compte : mot de passe et codes de récupération.
 *
 * Les deux opérations exigent le mot de passe actuel, même pour quelqu'un de déjà
 * connecté. Un cookie volé, ou une session laissée ouverte sur une tablette de
 * chantier, ne doit pas suffire à verrouiller le compte de son propriétaire ni à se
 * fabriquer un accès permanent.
 */
export default function SecuriteCompte() {
  const ids = { ancien: useId(), nouveau: useId(), confirmation: useId() };
  const [restants, setRestants] = useState<number | null>(null);
  const [nouveauxCodes, setNouveauxCodes] = useState<string[] | null>(null);
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  useEffect(() => {
    fetch("/api/compte/codes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRestants(d?.restants ?? null))
      .catch(() => {});
  }, [nouveauxCodes]);

  async function changerMotDePasse(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = evenement.currentTarget;
    const d = new FormData(formulaire);
    const nouveau = String(d.get("nouveau") ?? "");

    if (nouveau !== String(d.get("confirmation") ?? "")) {
      setProblemes([{ champ: "confirmation", message: "Les deux saisies diffèrent." }]);
      setErreur("Le nouveau mot de passe n'est pas confirmé.");
      return;
    }

    setEnCours(true);
    setProblemes([]);
    setErreur(null);
    setSucces(null);

    const { ok, corps } = await envoyerJson<{ sessionsFermees: number }>(
      "/api/auth/mot-de-passe",
      "POST",
      { ancien: String(d.get("ancien") ?? ""), nouveau }
    );
    setEnCours(false);

    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Changement impossible.");
      return;
    }

    formulaire.reset();
    setSucces(
      corps.sessionsFermees > 0
        ? `Mot de passe changé. ${corps.sessionsFermees} autre${corps.sessionsFermees > 1 ? "s" : ""} session${corps.sessionsFermees > 1 ? "s ont" : " a"} été fermée${corps.sessionsFermees > 1 ? "s" : ""}.`
        : "Mot de passe changé."
    );
  }

  async function regenerer() {
    const motDePasse = prompt("Confirmez votre mot de passe pour régénérer vos codes :");
    if (!motDePasse) return;

    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const { ok, corps } = await envoyerJson<{ codes: string[] }>("/api/compte/codes", "POST", {
      motDePasse,
    });
    setEnCours(false);

    if (!ok) {
      setErreur(corps.message ?? "Régénération impossible.");
      return;
    }
    setNouveauxCodes(corps.codes);
  }

  if (nouveauxCodes) {
    return (
      <CodesRecuperation
        codes={nouveauxCodes}
        libelleSuite="J'ai noté mes nouveaux codes"
        surConfirmation={() => setNouveauxCodes(null)}
      />
    );
  }

  return (
    <section aria-labelledby="titre-securite">
      <h2 id="titre-securite">Sécurité du compte</h2>

      <form onSubmit={changerMotDePasse} className="carte" noValidate>
        <h3 style={{ fontSize: "1rem", marginTop: 0 }}>Changer mon mot de passe</h3>

        <div className="champ">
          <label htmlFor={ids.ancien}>Mot de passe actuel</label>
          <input id={ids.ancien} name="ancien" type="password" autoComplete="current-password" required />
          {problemeDe("ancien") && <p className="petit message-erreur">{problemeDe("ancien")}</p>}
        </div>

        <div className="champ">
          <label htmlFor={ids.nouveau}>Nouveau mot de passe</label>
          <input id={ids.nouveau} name="nouveau" type="password" autoComplete="new-password" required />
          <p className="petit secondaire">Douze caractères au minimum.</p>
          {problemeDe("nouveau") && <p className="petit message-erreur">{problemeDe("nouveau")}</p>}
        </div>

        <div className="champ">
          <label htmlFor={ids.confirmation}>Confirmer le nouveau mot de passe</label>
          <input id={ids.confirmation} name="confirmation" type="password" autoComplete="new-password" required />
          {problemeDe("confirmation") && <p className="petit message-erreur">{problemeDe("confirmation")}</p>}
        </div>

        <p className="petit secondaire">
          Vos autres sessions seront fermées. Celle-ci reste ouverte.
        </p>

        <RetourFormulaire erreur={erreur} succes={succes} problemes={[]} />
        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? "Changement…" : "Changer mon mot de passe"}
        </button>
      </form>

      <div className="carte" style={{ marginTop: "1rem" }}>
        <div className="tete-carte">
          <h3 style={{ fontSize: "1rem", margin: 0 }}>Codes de récupération</h3>
          {restants !== null && (
            <span className={restants > 2 ? "pastille pastille--ok" : "pastille pastille--attention"}>
              {restants} restant{restants > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="petit secondaire">
          Ce sont eux qui vous permettront de reprendre la main si vous oubliez votre mot
          de passe. Ils ne peuvent pas être relus : régénérer en produit de nouveaux et
          annule les précédents.
        </p>
        <button className="bouton bouton--secondaire" onClick={regenerer} disabled={enCours}>
          Régénérer mes codes
        </button>
      </div>
    </section>
  );
}
