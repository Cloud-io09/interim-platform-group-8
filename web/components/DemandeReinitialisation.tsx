"use client";

import { useId, useState } from "react";
import RetourFormulaire from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";

/**
 * Demande d'un lien de réinitialisation.
 *
 * La réponse est volontairement la même que le compte existe ou non — sans quoi
 * l'écran deviendrait un moyen de savoir qui est inscrit. Le message le dit
 * explicitement (« si un compte existe »), plutôt que de laisser croire à une
 * confirmation qui n'en est pas une.
 */
export default function DemandeReinitialisation() {
  const idEmail = useId();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const d = new FormData(evenement.currentTarget);
    setEnCours(true);
    setErreur(null);
    setSucces(null);

    const { ok, corps } = await envoyerJson<{ message: string }>(
      "/api/auth/reinitialisation",
      "POST",
      { email: String(d.get("email") ?? "") }
    );
    setEnCours(false);

    if (!ok) {
      setErreur(corps.message ?? "Demande impossible.");
      return;
    }
    setSucces(corps.message);
  }

  return (
    <form onSubmit={envoyer} noValidate>
      <div className="champ">
        <label htmlFor={idEmail}>Adresse e-mail de votre compte</label>
        <input id={idEmail} name="email" type="email" autoComplete="username" required />
      </div>

      <RetourFormulaire erreur={erreur} succes={succes} problemes={[]} />
      <button className="bouton pleine-largeur" type="submit" disabled={enCours}>
        {enCours ? "Envoi…" : "Recevoir un lien par e-mail"}
      </button>
    </form>
  );
}
