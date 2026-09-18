"use client";

import { useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson, rechargerVers } from "@/lib/client";

/** Choix du nouveau mot de passe, une fois le lien ouvert. */
export default function FormulaireNouveauMotDePasse({ jeton }: { jeton: string }) {
  const ids = { nouveau: useId(), confirmation: useId() };
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const d = new FormData(evenement.currentTarget);
    const nouveau = String(d.get("nouveau") ?? "");

    if (nouveau !== String(d.get("confirmation") ?? "")) {
      setProblemes([{ champ: "confirmation", message: "Les deux saisies diffèrent." }]);
      setErreur("Le mot de passe n'est pas confirmé.");
      return;
    }

    setEnCours(true);
    setProblemes([]);
    setErreur(null);

    const { ok, corps } = await envoyerJson("/api/auth/reinitialisation/confirmation", "POST", {
      jeton,
      nouveau,
    });

    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Réinitialisation impossible.");
      setEnCours(false);
      return;
    }

    setSucces("Mot de passe changé. Vous allez être redirigé vers la connexion.");
    setTimeout(() => rechargerVers("/connexion"), 1500);
  }

  return (
    <form onSubmit={envoyer} noValidate>
      <div className="champ">
        <label htmlFor={ids.nouveau}>Nouveau mot de passe</label>
        <input id={ids.nouveau} name="nouveau" type="password" autoComplete="new-password" required />
        <p className="petit secondaire">
          Douze caractères au minimum. Une phrase dont vous vous souvenez vaut mieux
          qu&apos;un mot compliqué.
        </p>
        {problemeDe("nouveau") && <p className="petit message-erreur">{problemeDe("nouveau")}</p>}
        {problemeDe("jeton") && <p className="petit message-erreur">{problemeDe("jeton")}</p>}
      </div>

      <div className="champ">
        <label htmlFor={ids.confirmation}>Confirmer le mot de passe</label>
        <input id={ids.confirmation} name="confirmation" type="password" autoComplete="new-password" required />
        {problemeDe("confirmation") && <p className="petit message-erreur">{problemeDe("confirmation")}</p>}
      </div>

      <RetourFormulaire erreur={erreur} succes={succes} problemes={[]} />
      <button className="bouton pleine-largeur" type="submit" disabled={enCours}>
        {enCours ? "Changement…" : "Changer mon mot de passe"}
      </button>
    </form>
  );
}
