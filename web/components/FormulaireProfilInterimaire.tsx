"use client";

import { useEffect, useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import SelecteurReferentiel, { type Element } from "./SelecteurReferentiel";
import { envoyerJson } from "@/lib/client";

interface Domaine {
  domaine: string;
  libelle: string;
  metiers: { code: string; libelle: string }[];
}

interface Profil {
  prenom: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  codePostal: string;
  ville: string;
  rayonMobiliteKm: number;
  carteBtpNumero: string | null;
  carteBtpEcheance: string | null;
  metiers: string[];
  competences: string[];
}

const RAYON_DEFAUT_KM = 50;

export default function FormulaireProfilInterimaire({ apresEnregistrement }: { apresEnregistrement?: string }) {
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [charge, setCharge] = useState(false);
  const [rayon, setRayon] = useState(RAYON_DEFAUT_KM);
  const [metiers, setMetiers] = useState<string[]>([]);
  const [competences, setCompetences] = useState<string[]>([]);
  const [refCompetences, setRefCompetences] = useState<Element[]>([]);
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ids = {
    prenom: useId(), nom: useId(), tel: useId(), adresse: useId(),
    cp: useId(), ville: useId(), rayon: useId(), carte: useId(), carteEch: useId(),
  };

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  useEffect(() => {
    const parametre = metiers.length ? `?metiers=${metiers.join(",")}` : "";
    fetch(`/api/referentiel/competences${parametre}`)
      .then((r) => (r.ok ? r.json() : { competences: [] }))
      .then((d) => setRefCompetences(d.competences ?? []))
      .catch(() => {});
  }, [metiers]);

  useEffect(() => {
    Promise.all([
      fetch("/api/referentiel/metiers").then((r) => r.json()),
      fetch("/api/profil/interimaire").then((r) => (r.ok ? r.json() : { profil: null })),
    ])
      .then(([ref, mien]) => {
        setDomaines(ref.domaines);
        if (mien.profil) {
          // Sans cette relecture, revenir sur son profil affichait des champs vides,
          // et enregistrer écrasait silencieusement ce qui avait déjà été saisi.
          setProfil(mien.profil);
          setRayon(mien.profil.rayonMobiliteKm);
          setMetiers(mien.profil.metiers);
          setCompetences(mien.profil.competences ?? []);
        }
      })
      .catch(() => setErreur("Impossible de charger votre profil."))
      .finally(() => setCharge(true));
  }, []);

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const d = new FormData(evenement.currentTarget);
    setEnCours(true);
    setProblemes([]);
    setErreur(null);
    setSucces(null);

    const { ok, corps } = await envoyerJson<{ position: { libelle: string } }>(
      "/api/profil/interimaire",
      "POST",
      {
        prenom: d.get("prenom"),
        nom: d.get("nom"),
        telephone: d.get("telephone"),
        adresse: d.get("adresse"),
        codePostal: d.get("codePostal"),
        ville: d.get("ville"),
        rayonMobiliteKm: rayon,
        carteBtpNumero: d.get("carteBtpNumero"),
        carteBtpEcheance: d.get("carteBtpEcheance"),
        metiers,
        competences,
      }
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
        <legend>Qui êtes-vous</legend>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.prenom}>Prénom</label>
            <input id={ids.prenom} name="prenom" required autoComplete="given-name" defaultValue={profil?.prenom ?? ""} />
            {problemeDe("prenom") && <p className="petit message-erreur">{problemeDe("prenom")}</p>}
          </div>
          <div className="champ">
            <label htmlFor={ids.nom}>Nom</label>
            <input id={ids.nom} name="nom" required autoComplete="family-name" defaultValue={profil?.nom ?? ""} />
            {problemeDe("nom") && <p className="petit message-erreur">{problemeDe("nom")}</p>}
          </div>
        </div>
        <div className="champ">
          <label htmlFor={ids.tel}>Téléphone</label>
          <input id={ids.tel} name="telephone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={profil?.telephone ?? ""} />
          <p className="petit secondaire">Facultatif. Chiffré, visible seulement par une entreprise qui vous propose une mission.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Où vous pouvez travailler</legend>
        <div className="champ">
          <label htmlFor={ids.adresse}>Adresse</label>
          <input id={ids.adresse} name="adresse" autoComplete="street-address" defaultValue={profil?.adresse ?? ""} />
          <p className="petit secondaire">Facultative et chiffrée. Elle sert seulement à calculer les distances.</p>
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
        <div className="champ">
          <label htmlFor={ids.rayon}>Jusqu&apos;où acceptez-vous de vous déplacer ? {rayon} km</label>
          <input id={ids.rayon} type="range" min={5} max={200} step={5} value={rayon} onChange={(e) => setRayon(Number(e.target.value))} />
          <p className="petit secondaire">
            {RAYON_DEFAUT_KM} km par défaut, le périmètre habituel du CDI intérimaire.
          </p>
          {problemeDe("rayonMobiliteKm") && <p className="petit message-erreur">{problemeDe("rayonMobiliteKm")}</p>}
        </div>
      </fieldset>

      <div>
        {problemeDe("metiers") && <p className="petit message-erreur">{problemeDe("metiers")}</p>}
        <SelecteurReferentiel
          legende="Vos métiers"
          aide="Ils décident des missions qui vous sont proposées. Cherchez par mot — « maçon », « engins », « couverture »."
          placeholder="Maçon, grutier, coffreur…"
          elements={domaines.flatMap((d) => d.metiers.map((m) => ({ ...m, groupe: d.libelle })))}
          selection={metiers}
          surChangement={setMetiers}
        />
      </div>

      {/* Les compétences pèsent 40 % du classement. Avant, elles ne pouvaient venir
          que d'un CV déposé : un intérimaire sans CV partait avec ce critère à zéro
          sans jamais l'apprendre. */}
      <SelecteurReferentiel
        legende="Vos compétences de chantier"
        aide={
          metiers.length > 0
            ? "Classées par fréquence dans les offres réelles de vos métiers. Facultatif, mais elles comptent pour beaucoup dans votre classement."
            : "Choisissez d'abord vos métiers : la liste sera classée par pertinence pour eux."
        }
        placeholder="Coffrage, ferraillage, lecture de plans…"
        elements={refCompetences}
        selection={competences}
        surChangement={setCompetences}
      />

      <fieldset>
        {/* Bloc séparé des certifications : la carte BTP atteste d'une situation
            d'emploi régulière, pas d'une compétence, et n'entre jamais dans le matching. */}
        <legend>Carte BTP</legend>
        <p className="petit secondaire">
          Obligatoire sur chantier, mais elle n&apos;atteste d&apos;aucune compétence : elle
          ne remplace ni un CACES ni une habilitation, et n&apos;entre pas dans le calcul
          des missions qui vous sont proposées.
        </p>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.carte}>Numéro de carte</label>
            <input id={ids.carte} name="carteBtpNumero" maxLength={40} defaultValue={profil?.carteBtpNumero ?? ""} />
          </div>
          <div className="champ">
            <label htmlFor={ids.carteEch}>Fin de validité</label>
            <input id={ids.carteEch} name="carteBtpEcheance" type="date" defaultValue={profil?.carteBtpEcheance ?? ""} />
            {problemeDe("carteBtpEcheance") && <p className="petit message-erreur">{problemeDe("carteBtpEcheance")}</p>}
          </div>
        </div>
      </fieldset>

      <RetourFormulaire erreur={erreur} succes={succes} problemes={problemes} />

      <button className="bouton" type="submit" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer mon profil"}
      </button>
    </form>
  );
}
