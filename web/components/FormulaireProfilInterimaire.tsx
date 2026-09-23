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
  agences: { nom: string; ville: string | null }[];
}

const RAYON_DEFAUT_KM = 50;

export default function FormulaireProfilInterimaire({ apresEnregistrement }: { apresEnregistrement?: string }) {
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [charge, setCharge] = useState(false);
  const [rayon, setRayon] = useState(RAYON_DEFAUT_KM);
  const [metiers, setMetiers] = useState<string[]>([]);
  const [agences, setAgences] = useState<{ nom: string; ville: string }[]>([]);
  const [competences, setCompetences] = useState<string[]>([]);
  const [experience, setExperience] = useState<Record<string, string>>({});
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
          setAgences((mien.profil.agences ?? []).map((a: { nom: string; ville: string | null }) => ({ nom: a.nom, ville: a.ville ?? "" })));
          setExperience(
            Object.fromEntries(
              Object.entries(mien.profil.experienceParMetier ?? {}).map(([code, annees]) => [
                code,
                annees === null || annees === undefined ? "" : String(annees),
              ])
            )
          );
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
        // Un objet par métier : le code, et l'expérience si elle a été saisie.
        metiers: metiers.map((code) => ({
          code,
          anneesExperience: experience[code]?.trim() ? Number(experience[code]) : null,
        })),
        competences,
        agences: agences.filter((a) => a.nom.trim().length >= 2),
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

      {metiers.length > 0 && (
        <fieldset>
          <legend>Votre expérience</legend>
          <p className="petit secondaire">
            Le nombre d&apos;années sur chaque métier déclaré. Facultatif, et c&apos;est
            volontaire : <strong>l&apos;expérience n&apos;entre pas dans le calcul de
            correspondance</strong> — ce sont vos habilitations et leurs dates qui
            décident de votre accès aux chantiers. Elle est montrée à l&apos;entreprise
            qui consulte votre profil.
          </p>
          <ul className="liste-nue lignes">
            {metiers.map((code) => {
              const libelle =
                domaines.flatMap((d) => d.metiers).find((m) => m.code === code)?.libelle ?? code;
              return (
                <li key={code} className="ligne ligne-experience">
                  <label htmlFor={`experience-${code}`}>{libelle}</label>
                  <span className="saisie-annees">
                    <input
                      id={`experience-${code}`}
                      type="number"
                      min={0}
                      max={60}
                      step={1}
                      inputMode="numeric"
                      placeholder="—"
                      value={experience[code] ?? ""}
                      onChange={(e) => setExperience({ ...experience, [code]: e.target.value })}
                    />
                    <span className="petit secondaire">ans</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {problemeDe("metiers") && <p className="petit message-erreur">{problemeDe("metiers")}</p>}
        </fieldset>
      )}

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
        {/* **Le maillon que le produit taisait.** Le contrat de mission lie l'agence
            et le salarié, jamais l'entreprise utilisatrice : sans cette donnée, une
            entreprise débloquait un téléphone puis découvrait qu'il fallait un
            second appel pour savoir par qui passer. Déclaratif, comme le reste. */}
        <legend>Vos agences d&apos;emploi</legend>
        <p className="petit secondaire">
          C&apos;est votre agence qui établit le contrat de mission, pas l&apos;entreprise
          du chantier. L&apos;indiquer permet à celle-ci de la contacter directement —
          sans quoi elle vous appelle, puis rappelle votre agence.
        </p>

        <ul className="liste-nue liste-cartes">
          {agences.map((a, i) => (
            <li key={i} className="champ">
              <div className="grille grille--2">
                <div className="champ">
                  <label htmlFor={`agence-nom-${i}`}>Agence</label>
                  <input
                    id={`agence-nom-${i}`}
                    value={a.nom}
                    placeholder="Adecco, Randstad, Manpower…"
                    maxLength={120}
                    onChange={(e) =>
                      setAgences(agences.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="champ">
                  <label htmlFor={`agence-ville-${i}`}>Ville de l&apos;agence</label>
                  <input
                    id={`agence-ville-${i}`}
                    value={a.ville}
                    placeholder="Reims"
                    maxLength={80}
                    onChange={(e) =>
                      setAgences(agences.map((x, j) => (j === i ? { ...x, ville: e.target.value } : x)))
                    }
                  />
                </div>
              </div>
              <button
                type="button"
                className="bouton-discret"
                onClick={() => setAgences(agences.filter((_, j) => j !== i))}
              >
                Retirer cette agence
              </button>
            </li>
          ))}
        </ul>

        {agences.length < 10 && (
          <button
            type="button"
            className="bouton bouton--secondaire"
            onClick={() => setAgences([...agences, { nom: "", ville: "" }])}
          >
            {agences.length === 0 ? "Ajouter mon agence" : "Ajouter une autre agence"}
          </button>
        )}
        {agences.length === 0 && (
          <p className="petit secondaire">
            Vous pouvez postuler sans en déclarer : l&apos;entreprise saura simplement
            qu&apos;il faudra passer par la sienne, ce qui rallonge la mise en place.
          </p>
        )}
      </fieldset>

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
