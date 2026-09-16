"use client";

import { useEffect, useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";

interface Profil {
  raisonSociale: string;
  siret: string | null;
  adresse: string | null;
  codePostal: string;
  ville: string;
  telephone: string | null;
}

export default function FormulaireProfilEntreprise({ apresEnregistrement }: { apresEnregistrement?: string }) {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [charge, setCharge] = useState(false);
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ids = { raison: useId(), siret: useId(), adresse: useId(), cp: useId(), ville: useId(), tel: useId() };

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  useEffect(() => {
    fetch("/api/profil/entreprise")
      .then((r) => (r.ok ? r.json() : { profil: null }))
      .then((d) => setProfil(d.profil))
      .catch(() => setErreur("Impossible de charger votre profil."))
      .finally(() => setCharge(true));
  }, []);

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const d = Object.fromEntries(new FormData(evenement.currentTarget));
    setEnCours(true);
    setProblemes([]);
    setErreur(null);
    setSucces(null);

    const { ok, corps } = await envoyerJson<{ position: { libelle: string } }>(
      "/api/profil/entreprise",
      "POST",
      d
    );
    setEnCours(false);

    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Enregistrement impossible.");
      return;
    }
    setSucces(`Profil enregistré. Adresse retenue : ${corps.position.libelle}.`);
    if (apresEnregistrement) setTimeout(() => window.location.assign(apresEnregistrement), 900);
  }

  if (!charge) return <p className="secondaire">Chargement de votre profil…</p>;

  return (
    <form onSubmit={envoyer} noValidate>
      <fieldset>
        <legend>Votre entreprise</legend>
        <div className="champ">
          <label htmlFor={ids.raison}>Raison sociale</label>
          <input id={ids.raison} name="raisonSociale" required maxLength={160} autoComplete="organization" defaultValue={profil?.raisonSociale ?? ""} />
          {problemeDe("raisonSociale") && <p className="petit message-erreur">{problemeDe("raisonSociale")}</p>}
        </div>
        <div className="champ">
          <label htmlFor={ids.siret}>SIRET</label>
          <input id={ids.siret} name="siret" inputMode="numeric" maxLength={20} defaultValue={profil?.siret ?? ""} />
          <p className="petit secondaire">Facultatif. S&apos;il est renseigné, nous vérifions sa clé de contrôle.</p>
          {problemeDe("siret") && <p className="petit message-erreur">{problemeDe("siret")}</p>}
        </div>
        <div className="champ">
          <label htmlFor={ids.tel}>Téléphone</label>
          <input id={ids.tel} name="telephone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={profil?.telephone ?? ""} />
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
          <input id={ids.adresse} name="adresse" autoComplete="street-address" defaultValue={profil?.adresse ?? ""} />
        </div>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.cp}>Code postal</label>
            <input id={ids.cp} name="codePostal" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" defaultValue={profil?.codePostal ?? ""} />
            {problemeDe("codePostal") && <p className="petit message-erreur">{problemeDe("codePostal")}</p>}
          </div>
          <div className="champ">
            <label htmlFor={ids.ville}>Ville</label>
            <input id={ids.ville} name="ville" required autoComplete="address-level2" defaultValue={profil?.ville ?? ""} />
            {problemeDe("ville") && <p className="petit message-erreur">{problemeDe("ville")}</p>}
          </div>
        </div>
      </fieldset>

      <RetourFormulaire erreur={erreur} succes={succes} problemes={problemes} />

      <button className="bouton" type="submit" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer le profil"}
      </button>
    </form>
  );
}
