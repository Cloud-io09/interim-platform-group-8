"use client";

import { useEffect, useId, useState } from "react";
import CodesRecuperation from "./CodesRecuperation";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";

/**
 * Sécurité du compte : adresse e-mail, mot de passe et codes de récupération.
 *
 * Toutes ces opérations exigent le mot de passe actuel, même pour quelqu'un de déjà
 * connecté. Un cookie volé, ou une session laissée ouverte sur une tablette de
 * chantier, ne doit pas suffire à verrouiller le compte de son propriétaire, à se
 * fabriquer un accès permanent, ni à détourner l'adresse qui sert à le récupérer.
 */
export default function SecuriteCompte() {
  const ids = {
    ancien: useId(),
    nouveau: useId(),
    confirmation: useId(),
    email: useId(),
    motDePasseEmail: useId(),
  };
  const [restants, setRestants] = useState<number | null>(null);
  const [adresse, setAdresse] = useState<{ email: string; verifie: boolean } | null>(null);
  const [retourAdresse, setRetourAdresse] = useState<string | null>(null);
  const [erreurAdresse, setErreurAdresse] = useState<string | null>(null);
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

  useEffect(() => {
    fetch("/api/compte/email")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdresse(d ? { email: d.email, verifie: d.verifie } : null))
      .catch(() => {});
  }, []);

  async function renvoyerVerification() {
    setEnCours(true);
    setErreurAdresse(null);
    setRetourAdresse(null);
    const { ok, corps } = await envoyerJson<{ message: string }>(
      "/api/compte/verification",
      "POST",
      {}
    );
    setEnCours(false);
    if (ok) setRetourAdresse(corps.message);
    else setErreurAdresse(corps.message ?? "Envoi impossible.");
  }

  async function demanderChangementAdresse(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = evenement.currentTarget;
    const d = new FormData(formulaire);

    setEnCours(true);
    setErreurAdresse(null);
    setRetourAdresse(null);
    const { ok, corps } = await envoyerJson<{ message: string }>("/api/compte/email", "POST", {
      email: String(d.get("email") ?? ""),
      motDePasse: String(d.get("motDePasseEmail") ?? ""),
    });
    setEnCours(false);

    if (!ok) {
      setErreurAdresse(corps.message ?? "Changement impossible.");
      return;
    }
    formulaire.reset();
    setRetourAdresse(corps.message);
  }

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

      <div className={`carte${adresse && !adresse.verifie ? " carte--verdict-bloque" : ""}`}>
        <div className="tete-carte">
          <h3 style={{ fontSize: "1rem", margin: 0 }}>Adresse e-mail</h3>
          {adresse && (
            <span
              className={adresse.verifie ? "pastille pastille--ok" : "pastille pastille--attention"}
            >
              {adresse.verifie ? "✓ confirmée" : "△ non confirmée"}
            </span>
          )}
        </div>

        <p className="petit" style={{ marginBottom: "0.25rem" }}>
          {adresse?.email ?? "…"}
        </p>

        {adresse && !adresse.verifie && (
          <>
            <p className="petit secondaire">
              Tant qu'elle n'est pas confirmée, aucun lien de réinitialisation ne peut y
              être envoyé : c'est ce qui évite qu'une adresse saisie de travers donne accès
              à votre compte. Vos codes de récupération, eux, fonctionnent déjà.
            </p>
            <button
              className="bouton bouton--secondaire"
              onClick={renvoyerVerification}
              disabled={enCours}
            >
              M'envoyer un lien de confirmation
            </button>
          </>
        )}

        <form onSubmit={demanderChangementAdresse} noValidate style={{ marginTop: "1rem" }}>
          <div className="champ">
            <label htmlFor={ids.email}>Nouvelle adresse</label>
            <input id={ids.email} name="email" type="email" autoComplete="email" required />
          </div>
          <div className="champ">
            <label htmlFor={ids.motDePasseEmail}>Votre mot de passe</label>
            <input
              id={ids.motDePasseEmail}
              name="motDePasseEmail"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <p className="petit secondaire">
            Votre adresse actuelle reste celle du compte tant que vous n'avez pas ouvert le
            lien envoyé à la nouvelle. Vos sessions seront alors fermées.
          </p>
          <RetourFormulaire erreur={erreurAdresse} succes={retourAdresse} problemes={[]} />
          <button className="bouton bouton--secondaire" type="submit" disabled={enCours}>
            Changer mon adresse
          </button>
        </form>
      </div>

      <form onSubmit={changerMotDePasse} className="carte" noValidate style={{ marginTop: "1rem" }}>
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
