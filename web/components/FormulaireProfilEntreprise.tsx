"use client";

import { useId, useState } from "react";

interface Probleme {
  champ: string;
  message: string;
}

export default function FormulaireProfilEntreprise() {
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ids = { raison: useId(), siret: useId(), adresse: useId(), cp: useId(), ville: useId(), tel: useId() };

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = Object.fromEntries(new FormData(evenement.currentTarget));
    setEnCours(true);
    setProblemes([]);
    setMessage(null);
    setSucces(null);

    const reponse = await fetch("/api/profil/entreprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(donnees),
    });
    const corps = await reponse.json();
    setEnCours(false);

    if (!reponse.ok) {
      setProblemes(corps.problemes ?? []);
      setMessage(corps.message ?? "Enregistrement impossible.");
      return;
    }
    setSucces(`Profil enregistré. Adresse retenue : ${corps.position.libelle}.`);
  }

  return (
    <form onSubmit={envoyer} noValidate>
      {message && (
        <div role="alert" className="encart-erreur">
          <p style={{ margin: 0, fontWeight: 500 }}>{message}</p>
          {problemes.length > 0 && (
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              {problemes.map((p) => <li key={p.champ}>{p.message}</li>)}
            </ul>
          )}
        </div>
      )}
      {succes && (
        <div role="status" className="encart-succes">
          <p style={{ margin: 0, fontWeight: 500 }}>{succes}</p>
        </div>
      )}

      <fieldset>
        <legend>Votre entreprise</legend>
        <div className="champ">
          <label htmlFor={ids.raison}>Raison sociale</label>
          <input id={ids.raison} name="raisonSociale" required maxLength={160} autoComplete="organization" />
          {problemeDe("raisonSociale") && <p className="petit message-erreur">{problemeDe("raisonSociale")}</p>}
        </div>
        <div className="champ">
          <label htmlFor={ids.siret}>SIRET</label>
          <input id={ids.siret} name="siret" inputMode="numeric" maxLength={20} />
          <p className="petit secondaire">Facultatif. S&apos;il est renseigné, nous vérifions sa clé de contrôle.</p>
          {problemeDe("siret") && <p className="petit message-erreur">{problemeDe("siret")}</p>}
        </div>
        <div className="champ">
          <label htmlFor={ids.tel}>Téléphone</label>
          <input id={ids.tel} name="telephone" type="tel" inputMode="tel" autoComplete="tel" />
          <p className="petit secondaire">Facultatif et chiffré.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Adresse de référence</legend>
        <p className="petit secondaire">
          Elle sert de point de départ au calcul des distances. Chaque mission pourra avoir
          sa propre adresse de chantier.
        </p>
        <div className="champ">
          <label htmlFor={ids.adresse}>Adresse</label>
          <input id={ids.adresse} name="adresse" autoComplete="street-address" />
        </div>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.cp}>Code postal</label>
            <input id={ids.cp} name="codePostal" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" />
            {problemeDe("codePostal") && <p className="petit message-erreur">{problemeDe("codePostal")}</p>}
          </div>
          <div className="champ">
            <label htmlFor={ids.ville}>Ville</label>
            <input id={ids.ville} name="ville" required autoComplete="address-level2" />
            {problemeDe("ville") && <p className="petit message-erreur">{problemeDe("ville")}</p>}
          </div>
        </div>
      </fieldset>

      <button className="bouton" type="submit" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer le profil"}
      </button>
    </form>
  );
}
