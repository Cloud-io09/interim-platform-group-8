"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

interface Probleme {
  champ: string;
  message: string;
}

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
  const router = useRouter();
  const idEmail = useId();
  const idMotDePasse = useId();
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [messageGeneral, setMessageGeneral] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const resume = useRef<HTMLDivElement>(null);

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ);

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (enCours) return;

    const donnees = new FormData(evenement.currentTarget);
    setEnCours(true);
    setProblemes([]);
    setMessageGeneral(null);

    try {
      const reponse = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(donnees.get("email") ?? ""),
          motDePasse: String(donnees.get("motDePasse") ?? ""),
          ...(role ? { role } : {}),
        }),
      });
      const corps = await reponse.json();

      if (!reponse.ok) {
        setProblemes(corps.problemes ?? []);
        setMessageGeneral(corps.message ?? "Une erreur est survenue.");
        // RGAA 7.4 : le résultat d'une soumission doit être porté à la connaissance
        // de l'utilisateur, y compris au lecteur d'écran. On déplace le focus dessus.
        requestAnimationFrame(() => resume.current?.focus());
        return;
      }

      router.push(corps.etapeSuivante ?? "/");
      router.refresh();
    } catch {
      setMessageGeneral("Impossible de joindre le serveur. Vérifiez votre connexion.");
      requestAnimationFrame(() => resume.current?.focus());
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={envoyer} noValidate>
      <h1>{titre}</h1>
      <p className="secondaire">{intro}</p>

      {messageGeneral && (
        <div
          ref={resume}
          tabIndex={-1}
          role="alert"
          className="carte"
          style={{ borderColor: "var(--alerte)", marginBottom: "1.5rem" }}
        >
          <p style={{ margin: 0, color: "var(--alerte)", fontWeight: 500 }}>{messageGeneral}</p>
          {problemes.length > 0 && (
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              {problemes.map((p) => (
                <li key={p.champ}>{p.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

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
          aria-describedby={
            mode === "inscription" ? `${idMotDePasse}-aide` : problemeDe("motDePasse") ? `${idMotDePasse}-erreur` : undefined
          }
        />
        {mode === "inscription" && (
          <p id={`${idMotDePasse}-aide`} className="petit secondaire">
            {LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum. Une phrase dont vous vous
            souvenez vaut mieux qu&apos;un mot compliqué.
          </p>
        )}
        {problemeDe("motDePasse") && (
          <p id={`${idMotDePasse}-erreur`} className="petit message-erreur">
            {problemeDe("motDePasse")!.message}
          </p>
        )}
      </div>

      <button className="bouton" type="submit" disabled={enCours} style={{ width: "100%" }}>
        {enCours ? "Envoi en cours…" : libelleBouton}
      </button>
    </form>
  );
}
