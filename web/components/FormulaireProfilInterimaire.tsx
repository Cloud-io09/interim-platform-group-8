"use client";

import { useEffect, useId, useState } from "react";

interface Domaine {
  domaine: string;
  libelle: string;
  metiers: { code: string; libelle: string }[];
}

interface Probleme {
  champ: string;
  message: string;
}

const RAYON_DEFAUT_KM = 50;

export default function FormulaireProfilInterimaire() {
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [rayon, setRayon] = useState(RAYON_DEFAUT_KM);
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ids = {
    prenom: useId(), nom: useId(), tel: useId(), adresse: useId(),
    cp: useId(), ville: useId(), rayon: useId(), carte: useId(), carteEch: useId(),
  };

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  useEffect(() => {
    fetch("/api/referentiel/metiers")
      .then((r) => r.json())
      .then((d) => setDomaines(d.domaines))
      .catch(() => setMessage("Impossible de charger la liste des métiers."));
  }, []);

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    setEnCours(true);
    setProblemes([]);
    setMessage(null);
    setSucces(null);

    const reponse = await fetch("/api/profil/interimaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prenom: donnees.get("prenom"),
        nom: donnees.get("nom"),
        telephone: donnees.get("telephone"),
        adresse: donnees.get("adresse"),
        codePostal: donnees.get("codePostal"),
        ville: donnees.get("ville"),
        rayonMobiliteKm: Number(donnees.get("rayonMobiliteKm")),
        carteBtpNumero: donnees.get("carteBtpNumero"),
        carteBtpEcheance: donnees.get("carteBtpEcheance"),
        metiers: donnees.getAll("metiers"),
      }),
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
        <legend>Qui êtes-vous</legend>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.prenom}>Prénom</label>
            <input id={ids.prenom} name="prenom" required autoComplete="given-name" />
            {problemeDe("prenom") && <p className="petit message-erreur">{problemeDe("prenom")}</p>}
          </div>
          <div className="champ">
            <label htmlFor={ids.nom}>Nom</label>
            <input id={ids.nom} name="nom" required autoComplete="family-name" />
            {problemeDe("nom") && <p className="petit message-erreur">{problemeDe("nom")}</p>}
          </div>
        </div>
        <div className="champ">
          <label htmlFor={ids.tel}>Téléphone</label>
          <input id={ids.tel} name="telephone" type="tel" autoComplete="tel" inputMode="tel" />
          <p className="petit secondaire">Facultatif. Chiffré, visible seulement par une entreprise qui vous propose une mission.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Où vous pouvez travailler</legend>
        <div className="champ">
          <label htmlFor={ids.adresse}>Adresse</label>
          <input id={ids.adresse} name="adresse" autoComplete="street-address" />
          <p className="petit secondaire">Facultative et chiffrée. Elle sert seulement à calculer les distances.</p>
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
        <div className="champ">
          <label htmlFor={ids.rayon}>Jusqu&apos;où acceptez-vous de vous déplacer ? {rayon} km</label>
          <input
            id={ids.rayon}
            name="rayonMobiliteKm"
            type="range"
            min={5}
            max={200}
            step={5}
            value={rayon}
            onChange={(e) => setRayon(Number(e.target.value))}
          />
          <p className="petit secondaire">
            {RAYON_DEFAUT_KM} km par défaut, le périmètre habituel du CDI intérimaire. Ajustez-le à votre situation.
          </p>
          {problemeDe("rayonMobiliteKm") && <p className="petit message-erreur">{problemeDe("rayonMobiliteKm")}</p>}
        </div>
      </fieldset>

      <fieldset>
        <legend>Vos métiers</legend>
        {problemeDe("metiers") && <p className="petit message-erreur">{problemeDe("metiers")}</p>}
        {domaines.map((d) => (
          <div key={d.domaine} className="groupe-cases">
            <h3 className="petit sur-titre">{d.libelle}</h3>
            <div className="cases">
              {d.metiers.map((m) => (
                <label key={m.code} className="case">
                  <input type="checkbox" name="metiers" value={m.code} />
                  <span>{m.libelle}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset>
        {/* Bloc volontairement séparé des certifications : la carte BTP atteste d'une
            situation d'emploi régulière, pas d'une compétence. Elle n'entre jamais
            dans le calcul de matching. */}
        <legend>Carte BTP</legend>
        <p className="petit secondaire">
          Obligatoire sur chantier, mais elle n&apos;atteste d&apos;aucune compétence : elle
          ne remplace ni un CACES ni une habilitation, et n&apos;entre pas dans le calcul
          des missions qui vous sont proposées.
        </p>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.carte}>Numéro de carte</label>
            <input id={ids.carte} name="carteBtpNumero" maxLength={40} />
          </div>
          <div className="champ">
            <label htmlFor={ids.carteEch}>Fin de validité</label>
            <input id={ids.carteEch} name="carteBtpEcheance" type="date" />
            {problemeDe("carteBtpEcheance") && <p className="petit message-erreur">{problemeDe("carteBtpEcheance")}</p>}
          </div>
        </div>
      </fieldset>

      <button className="bouton" type="submit" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer mon profil"}
      </button>
    </form>
  );
}
