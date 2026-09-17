"use client";

import { useEffect, useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";

interface Analyse {
  metiers: { code: string; libelle: string; declencheur: string }[];
  competences: { code: string; libelle: string }[];
  certifications: { typeCode: string; categorieCode: string | null; extrait: string }[];
  tropCourt: boolean;
}

interface Cv {
  nomFichier: string | null;
  deposeLe?: string | null;
  longueur: number;
}

interface Suggestion {
  missionId: number;
  titre: string;
  entreprise: string;
  ville: string;
  dateDebut: string;
  dateFin: string;
  proximite: number;
  motsCommuns: string[];
  conformite: "conforme" | "ecarte" | "metier_non_declare";
}

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

const VERDICT: Record<Suggestion["conformite"], { libelle: string; classe: string }> = {
  conforme: { libelle: "Vous êtes conforme", classe: "etiquette--ok" },
  ecarte: { libelle: "Habilitation manquante", classe: "etiquette--alerte" },
  metier_non_declare: { libelle: "Métier non déclaré", classe: "etiquette--attention" },
};

export default function DepotCv() {
  const idFichier = useId();
  const [cv, setCv] = useState<Cv | null>(null);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [metiersCoches, setMetiers] = useState<string[]>([]);
  const [competencesCochees, setCompetences] = useState<string[]>([]);
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [charge, setCharge] = useState(false);

  function accueillirAnalyse(a: Analyse) {
    setAnalyse(a);
    setMetiers(a.metiers.map((m) => m.code));
    setCompetences(a.competences.map((c) => c.code));
  }

  useEffect(() => {
    fetch("/api/cv")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.cv) {
          setCv(d.cv);
          accueillirAnalyse(d.analyse);
        }
      })
      .catch(() => {})
      .finally(() => setCharge(true));
  }, []);

  async function deposer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = evenement.currentTarget;
    const donnees = new FormData(formulaire);
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    setProblemes([]);
    setSuggestions(null);

    const reponse = await fetch("/api/cv", { method: "POST", body: donnees });
    const corps = await reponse.json().catch(() => ({ message: "Réponse illisible." }));
    setEnCours(false);

    if (!reponse.ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Dépôt impossible.");
      return;
    }
    setCv(corps.cv);
    accueillirAnalyse(corps.analyse);
    setSucces("CV lu. Vérifiez ce qui a été détecté avant de l'ajouter à votre profil.");
    formulaire.reset();
  }

  async function appliquer() {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const { ok, corps } = await envoyerJson<{ metiersAjoutes: number; competencesAjoutees: number }>(
      "/api/cv/appliquer",
      "POST",
      { metiers: metiersCoches, competences: competencesCochees }
    );
    setEnCours(false);
    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Application impossible.");
      return;
    }
    setSucces(
      `${corps.metiersAjoutes} métier(s) et ${corps.competencesAjoutees} compétence(s) ajoutés à votre profil.`
    );
  }

  async function chargerSuggestions() {
    setEnCours(true);
    setErreur(null);
    const r = await fetch("/api/cv/missions");
    const d = await r.json();
    setEnCours(false);
    if (!r.ok) {
      setErreur(d.message ?? "Suggestions indisponibles.");
      return;
    }
    setSuggestions(d.suggestions);
  }

  async function retirer() {
    if (!confirm("Retirer votre CV ? Le texte enregistré sera effacé.")) return;
    await fetch("/api/cv", { method: "DELETE" });
    setCv(null);
    setAnalyse(null);
    setSuggestions(null);
    setSucces("CV retiré.");
  }

  const basculer = (liste: string[], poser: (v: string[]) => void, code: string) =>
    poser(liste.includes(code) ? liste.filter((x) => x !== code) : [...liste, code]);

  if (!charge) return <p className="secondaire">Chargement…</p>;

  return (
    <section aria-labelledby="titre-cv">
      <h2 id="titre-cv">Dépôt du CV</h2>
      <p className="secondaire">
        Déposez votre CV pour préremplir votre profil. Nous en extrayons vos métiers, vos
        compétences et les habilitations citées — vous validez chaque élément avant qu&apos;il
        soit ajouté.
      </p>
      <p className="petit secondaire">
        Le fichier n&apos;est pas conservé : seul son texte est enregistré, chiffré, et
        effacé si vous retirez votre CV ou supprimez votre compte. Aucun service externe
        n&apos;est appelé.
      </p>

      {cv && (
        <div className="bandeau bandeau--neutre">
          <p style={{ margin: 0 }}>
            <strong>{cv.nomFichier}</strong>
            <span className="petit secondaire"> — {cv.longueur.toLocaleString("fr-FR")} caractères lus</span>
          </p>
          <button className="bouton bouton--secondaire" onClick={retirer}>Retirer mon CV</button>
        </div>
      )}

      <form onSubmit={deposer} className="carte" noValidate style={{ marginBottom: "2rem" }}>
        <div className="champ">
          <label htmlFor={idFichier}>{cv ? "Remplacer par un autre fichier" : "Votre CV"}</label>
          <input id={idFichier} name="cv" type="file" accept=".pdf,.docx,.txt" required />
          <p className="petit secondaire">
            PDF, Word (.docx) ou texte, 4 Mo maximum. Un PDF scanné sans texte ne pourra pas
            être lu.
          </p>
        </div>
        <RetourFormulaire erreur={erreur} succes={succes} problemes={problemes} />
        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? "Lecture…" : cv ? "Remplacer le CV" : "Déposer mon CV"}
        </button>
      </form>

      {analyse && !analyse.tropCourt && (
        <>
          <h3>Ce que nous avons trouvé</h3>

          {analyse.metiers.length > 0 && (
            <fieldset>
              <legend>Métiers</legend>
              <div className="cases">
                {analyse.metiers.map((m) => (
                  <label key={m.code} className="case">
                    <input
                      type="checkbox"
                      checked={metiersCoches.includes(m.code)}
                      onChange={() => basculer(metiersCoches, setMetiers, m.code)}
                    />
                    <span>{m.libelle}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {analyse.competences.length > 0 && (
            <fieldset>
              <legend>Compétences</legend>
              <div className="cases">
                {analyse.competences.map((c) => (
                  <label key={c.code} className="case">
                    <input
                      type="checkbox"
                      checked={competencesCochees.includes(c.code)}
                      onChange={() => basculer(competencesCochees, setCompetences, c.code)}
                    />
                    <span>{c.libelle}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {analyse.certifications.length > 0 && (
            <fieldset>
              <legend>Habilitations citées</legend>
              {/* Volontairement non cochables : un CV donne le type du titre, jamais sa
                  date d'échéance ni son numéro — et c'est la date qui décide de tout. */}
              <p className="petit secondaire">
                Elles ne peuvent pas être ajoutées automatiquement : il manque le numéro,
                l&apos;organisme et surtout la <strong>date de fin de validité</strong>, qui
                est ce qui décide de votre accès aux chantiers.
              </p>
              <ul className="liste-nue petit">
                {analyse.certifications.map((c, i) => (
                  <li key={`${c.typeCode}-${c.categorieCode ?? i}`} style={{ marginBottom: "0.4rem" }}>
                    <strong>{c.typeCode.replace(/_/g, " ")}{c.categorieCode ? ` — ${c.categorieCode}` : ""}</strong>
                    <br />
                    <span className="secondaire">« {c.extrait} »</span>
                  </li>
                ))}
              </ul>
              <a className="bouton bouton--secondaire" href="/espace/interimaire/certifications">
                Les déclarer avec leurs dates
              </a>
            </fieldset>
          )}

          {analyse.metiers.length + analyse.competences.length > 0 && (
            <button className="bouton" onClick={appliquer} disabled={enCours}>
              {enCours ? "Application…" : "Ajouter à mon profil"}
            </button>
          )}

          <hr className="separateur" />

          <h3>Missions qui ressemblent à votre CV</h3>
          <p className="secondaire">
            Ce rapprochement se fait sur le <strong>vocabulaire</strong> de votre CV. Il ne
            dit rien de votre éligibilité : chaque suggestion porte donc le verdict du
            moteur, qui lui regarde vos habilitations et leurs dates.
          </p>
          {suggestions === null ? (
            <button className="bouton bouton--secondaire" onClick={chargerSuggestions} disabled={enCours}>
              {enCours ? "Recherche…" : "Chercher des missions proches"}
            </button>
          ) : suggestions.length === 0 ? (
            <p className="secondaire">Aucune mission ouverte ne partage assez de vocabulaire avec votre CV.</p>
          ) : (
            <ul className="liste-nue">
              {suggestions.map((s) => (
                <li key={s.missionId} className="carte" style={{ marginBottom: "0.75rem" }}>
                  <div className="ligne-certification">
                    <div>
                      <h4 style={{ fontSize: "1rem", margin: "0 0 0.2rem" }}>
                        <a href={`/mes-missions/${s.missionId}`}>{s.titre}</a>
                      </h4>
                      <p className="petit secondaire" style={{ margin: 0 }}>
                        {s.entreprise} · {s.ville} · du {enDateFr(s.dateDebut)} au {enDateFr(s.dateFin)}
                      </p>
                      <p className="petit secondaire" style={{ margin: "0.3rem 0 0" }}>
                        Termes communs : {s.motsCommuns.join(", ")}
                      </p>
                    </div>
                    <span className={`etiquette ${VERDICT[s.conformite].classe}`}>
                      {VERDICT[s.conformite].libelle}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
