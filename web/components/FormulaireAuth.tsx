"use client";

import { useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson, rechargerVers } from "@/lib/client";

interface Props {
  mode: "connexion" | "inscription";
  /** Obligatoire à l'inscription : les deux parcours sont distincts. */
  role?: "entreprise" | "interimaire";
  titre: string;
  intro: string;
  libelleBouton: string;
}

const LONGUEUR_MIN_MOT_DE_PASSE = 12;

export default function FormulaireAuth({ mode, role, titre, intro, libelleBouton }: Props) {
  const idEmail = useId();
  const idMotDePasse = useId();
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ);

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (enCours) return;

    const donnees = new FormData(evenement.currentTarget);
    setEnCours(true);
    setProblemes([]);
    setErreur(null);

    try {
      const { ok, corps } = await envoyerJson<{ etapeSuivante?: string }>(
        `/api/auth/${mode}`,
        "POST",
        {
          email: String(donnees.get("email") ?? ""),
          motDePasse: String(donnees.get("motDePasse") ?? ""),
          ...(role ? { role } : {}),
        }
      );

      if (!ok) {
        setProblemes(corps.problemes ?? []);
        setErreur(corps.message ?? "Une erreur est survenue.");
        setEnCours(false);
        return;
      }

      // Rechargement complet : après un changement de compte, le cache du routeur
      // servirait des pages rendues pour l'utilisateur précédent.
      rechargerVers(corps.etapeSuivante ?? "/espace");
    } catch {
      setErreur("Impossible de joindre le serveur. Vérifiez votre connexion.");
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={envoyer} noValidate>
      <h1>{titre}</h1>
      <p className="secondaire">{intro}</p>

      <div className="champ">
        <label htmlFor={idEmail}>Adresse e-mail</label>
        <input
          id={idEmail}
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={problemeDe("email") ? true : undefined}
          aria-describedby={problemeDe("email") ? `${idEmail}-erreur` : undefined}
        />
        {problemeDe("email") && (
          <p id={`${idEmail}-erreur`} className="petit message-erreur">
            {problemeDe("email")!.message}
          </p>
        )}
      </div>

      <div className="champ">
        <label htmlFor={idMotDePasse}>Mot de passe</label>
        <input
          id={idMotDePasse}
          name="motDePasse"
          type="password"
          autoComplete={mode === "connexion" ? "current-password" : "new-password"}
          required
          aria-invalid={problemeDe("motDePasse") ? true : undefined}
          aria-describedby={mode === "inscription" ? `${idMotDePasse}-aide` : undefined}
        />
        {mode === "inscription" && (
          <p id={`${idMotDePasse}-aide`} className="petit secondaire">
            {LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum. Une phrase dont vous vous
            souvenez vaut mieux qu&apos;un mot compliqué.
          </p>
        )}
        {problemeDe("motDePasse") && (
          <p className="petit message-erreur">{problemeDe("motDePasse")!.message}</p>
        )}
      </div>

      <RetourFormulaire erreur={erreur} succes={null} problemes={problemes} />

      <button className="bouton" type="submit" disabled={enCours} style={{ width: "100%" }}>
        {enCours ? "Envoi en cours…" : libelleBouton}
      </button>
    </form>
  );
}
