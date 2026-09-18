"use client";

import { useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import CodesRecuperation from "./CodesRecuperation";
import { envoyerJson, rechargerVers } from "@/lib/client";

interface Props {
  mode: "connexion" | "inscription";
  /** Obligatoire à l'inscription : les deux parcours sont distincts. */
  role?: "entreprise" | "interimaire";
  titre: string;
  intro: string;
  libelleBouton: string;
  /** « Étape 1 sur 2 » et consorts. Porté par le formulaire, donc il disparaît avec lui. */
  surTitre?: string;
}

const LONGUEUR_MIN_MOT_DE_PASSE = 12;

export default function FormulaireAuth({ mode, role, titre, intro, libelleBouton, surTitre }: Props) {
  const idEmail = useId();
  const idMotDePasse = useId();
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [etapeSuivante, setEtapeSuivante] = useState("/espace");

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ);

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (enCours) return;

    const donnees = new FormData(evenement.currentTarget);
    setEnCours(true);
    setProblemes([]);
    setErreur(null);

    try {
      const { ok, corps } = await envoyerJson<{ etapeSuivante?: string; codesRecuperation?: string[] }>(
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

      const suite = corps.etapeSuivante ?? "/espace";

      // À l'inscription, on s'arrête pour remettre les codes de récupération. Les
      // afficher après la redirection les noierait dans un formulaire de profil,
      // alors qu'ils ne seront plus jamais montrés.
      if (corps.codesRecuperation?.length) {
        setCodes(corps.codesRecuperation);
        setEtapeSuivante(suite);
        setEnCours(false);
        return;
      }

      // Rechargement complet : après un changement de compte, le cache du routeur
      // servirait des pages rendues pour l'utilisateur précédent.
      rechargerVers(suite);
    } catch {
      setErreur("Impossible de joindre le serveur. Vérifiez votre connexion.");
      setEnCours(false);
    }
  }

  if (codes) {
    return (
      <CodesRecuperation
        codes={codes}
        libelleSuite="J'ai noté mes codes, continuer"
        surConfirmation={() => rechargerVers(etapeSuivante)}
      />
    );
  }

  return (
    <div className="carte">
      {surTitre && <p className="sur-titre">{surTitre}</p>}
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

        <button className="bouton pleine-largeur" type="submit" disabled={enCours}>
          {enCours ? "Envoi en cours…" : libelleBouton}
        </button>
      </form>
    </div>
  );
}
