"use client";

import { useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson, rechargerVers } from "@/lib/client";

/**
 * Reprise en main d'un compte, par code de récupération.
 *
 * Le formulaire demande les trois choses en une fois — adresse, code, nouveau mot de
 * passe — plutôt qu'en deux étapes. Un parcours en deux temps supposerait un état
 * intermédiaire côté serveur, donc un second jeton à faire expirer, pour aucun gain :
 * l'utilisateur a déjà son code sous les yeux.
 */
export default function FormulaireRecuperation() {
  const ids = { email: useId(), code: useId(), nouveau: useId() };
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const d = new FormData(evenement.currentTarget);
    setEnCours(true);
    setProblemes([]);
    setErreur(null);

    const { ok, corps } = await envoyerJson<{ codesRestants: number }>(
      "/api/auth/recuperation",
      "POST",
      {
        email: String(d.get("email") ?? ""),
        code: String(d.get("code") ?? ""),
        nouveau: String(d.get("nouveau") ?? ""),
      }
    );

    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Récupération impossible.");
      setEnCours(false);
      return;
    }

    setSucces(
      `Mot de passe changé. Il vous reste ${corps.codesRestants} code${corps.codesRestants > 1 ? "s" : ""} de récupération.`
    );
    setTimeout(() => rechargerVers("/connexion"), 1500);
  }

  return (
    <form onSubmit={envoyer} noValidate>
      <div className="champ">
        <label htmlFor={ids.email}>Adresse e-mail</label>
        <input id={ids.email} name="email" type="email" autoComplete="username" required />
        {problemeDe("email") && <p className="petit message-erreur">{problemeDe("email")}</p>}
      </div>

      <div className="champ">
        <label htmlFor={ids.code}>Code de récupération</label>
        <input
          id={ids.code}
          name="code"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          required
        />
        <p className="petit secondaire">
          Les tirets, les espaces et les minuscules sont sans importance.
        </p>
        {problemeDe("code") && <p className="petit message-erreur">{problemeDe("code")}</p>}
      </div>

      <div className="champ">
        <label htmlFor={ids.nouveau}>Nouveau mot de passe</label>
        <input
          id={ids.nouveau}
          name="nouveau"
          type="password"
          autoComplete="new-password"
          required
        />
        <p className="petit secondaire">Douze caractères au minimum.</p>
        {problemeDe("nouveau") && <p className="petit message-erreur">{problemeDe("nouveau")}</p>}
      </div>

      <RetourFormulaire erreur={erreur} succes={succes} problemes={[]} />
      <button className="bouton pleine-largeur" type="submit" disabled={enCours}>
        {enCours ? "Vérification…" : "Changer mon mot de passe"}
      </button>
    </form>
  );
}
