"use client";

import { useEffect, useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";
import { lireCv, LectureImpossible, type EtapeLecture } from "@/lib/lecture-cv";

interface Analyse {
  metiers: { code: string; libelle: string; declencheur: string; extrait: string }[];
  competences: { code: string; libelle: string; extrait: string }[];
  certifications: { typeCode: string; categorieCode: string | null; extrait: string }[];
  tropCourt: boolean;
}

interface Cv {
  nomFichier: string | null;
  deposeLe?: string | null;
  longueur: number;
  texte: string;
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
  /** Le titre qui bloque, et pourquoi. `null` quand rien ne bloque. */
  certificationManquante: string | null;
  explication: string | null;
}

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

const VERDICT: Record<Suggestion["conformite"], { libelle: string; classe: string }> = {
  conforme: { libelle: "Vous êtes conforme", classe: "etiquette--ok" },
  ecarte: { libelle: "Titre manquant", classe: "etiquette--alerte" },
  metier_non_declare: { libelle: "Métier non déclaré", classe: "etiquette--attention" },
};

/**
 * Les trois verdicts, séparés, et dans cet ordre.
 *
 * Ils étaient mélangés dans une liste unique, distingués par une seule étiquette. On
 * lisait donc « Habilitation manquante » sans savoir **laquelle** — parmi neuf types
 * et quatorze catégories — ni si elle manquait ou expirait trop tôt. Or la conduite à
 * tenir diffère : postuler, passer un examen, ou simplement déclarer un métier qu'on
 * exerce déjà.
 *
 * L'ordre est celui de l'effort demandé, du moindre au plus grand.
 */
const SECTIONS = [
  {
    cle: "conforme" as const,
    titre: "Vous pouvez postuler",
    intro: "Le moteur vous retient sur ces missions : habilitations à jour jusqu'au bout du chantier.",
  },
  {
    cle: "metier_non_declare" as const,
    titre: "Il vous suffit de déclarer le métier",
    intro:
      "Ces missions relèvent d'un métier absent de votre profil, donc le moteur ne vous y a pas évalué. L'ajouter ne prend qu'un instant.",
  },
  {
    cle: "ecarte" as const,
    titre: "Un titre vous en sépare",
    intro:
      "Ces missions correspondent à votre profil, mais une habilitation manque ou expire avant la fin du chantier.",
  },
];

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
  const [progression, setProgression] = useState<EtapeLecture | null>(null);

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
    const fichier = (new FormData(formulaire).get("cv") as File | null) ?? null;
    if (!fichier || fichier.size === 0) {
      setErreur("Choisissez un fichier.");
      return;
    }

    setEnCours(true);
    setErreur(null);
    setSucces(null);
    setProblemes([]);
    setSuggestions(null);
    setProgression({ etape: "lecture", message: "Ouverture du document…" });

    let texte: string;
    try {
      // La lecture se fait ici, dans le navigateur : le fichier ne part pas.
      texte = await lireCv(fichier, setProgression);
    } catch (e) {
      setEnCours(false);
      setProgression(null);
      // Le message affiché reste compréhensible ; la cause exacte va dans la console,
      // sans quoi un échec de lecture est indiagnosticable à distance.
      console.error("Lecture du CV impossible :", e);
      setErreur(
        e instanceof LectureImpossible
          ? e.message
          : "Ce document n'a pas pu être lu. Essayez un autre export, ou un PDF contenant du texte."
      );
      return;
    }

    setProgression(null);
    const { ok, corps } = await envoyerJson<{ cv: Cv; analyse: Analyse }>("/api/cv", "POST", {
      nomFichier: fichier.name,
      texte,
    });
    setEnCours(false);

    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Enregistrement impossible.");
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
        <strong>Votre document ne quitte pas cet appareil.</strong> Il est lu ici même,
        dans votre navigateur ; seul le texte qui en est extrait nous est transmis, puis
        chiffré. Il est effacé si vous retirez votre CV ou supprimez votre compte, et
        aucun service externe n&apos;est appelé.
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
          <input
            id={idFichier}
            name="cv"
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            required
          />
          <p className="petit secondaire">
            PDF, Word (.docx), texte, ou une photo de votre CV. 12 Mo maximum. Un document
            scanné est lu par reconnaissance de caractères : comptez quelques dizaines de
            secondes.
          </p>
        </div>
        {progression && (
          <div className="progression" role="status">
            <p style={{ margin: 0 }}>{progression.message}</p>
            {progression.etape === "reconnaissance" && (
              <>
                <div className="jauge">
                  <div
                    className="jauge-remplie"
                    style={{ width: `${Math.round(progression.progression * 100)}%` }}
                  />
                </div>
                <p className="petit secondaire" style={{ margin: "0.25rem 0 0" }}>
                  {Math.round(progression.progression * 100)} % — ce document est un scan,
                  sa lecture demande un peu plus de temps.
                </p>
              </>
            )}
          </div>
        )}

        <RetourFormulaire erreur={erreur} succes={succes} problemes={problemes} />
        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? "Lecture en cours…" : cv ? "Remplacer le CV" : "Déposer mon CV"}
        </button>
      </form>

      {cv?.texte && (
        <details className="carte" style={{ marginBottom: "2rem" }}>
          <summary>
            Relire le texte lu dans votre document
            <span className="petit secondaire"> — {cv.longueur.toLocaleString("fr-FR")} caractères</span>
          </summary>
          {/* Après une reconnaissance de caractères, l'utilisateur doit pouvoir
              constater ce qui a été compris — et repérer une lecture fautive. */}
          <p className="petit secondaire" style={{ marginTop: "0.75rem" }}>
            Si ce texte est incompréhensible, votre document est probablement un scan de
            mauvaise qualité. Un export PDF depuis un traitement de texte donnera un bien
            meilleur résultat.
          </p>
          <pre className="texte-lu">{cv.texte}</pre>
        </details>
      )}

      {analyse && !analyse.tropCourt && (
        <>
          <h3>Ce que nous avons trouvé</h3>
          <p className="secondaire">
            Chaque élément est accompagné du passage qui l&apos;a déclenché. Décochez ce
            qui ne correspond pas avant d&apos;ajouter à votre profil.
          </p>

          {analyse.metiers.length > 0 && (
            <fieldset>
              <legend>Métiers</legend>
              <div className="cases">
                {analyse.metiers.map((m) => (
                  <div key={m.code} className="detection">
                    <label className="case">
                      <input
                        type="checkbox"
                        checked={metiersCoches.includes(m.code)}
                        onChange={() => basculer(metiersCoches, setMetiers, m.code)}
                      />
                      <span>{m.libelle}</span>
                    </label>
                    {m.extrait && <p className="extrait-source">« {m.extrait} »</p>}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {analyse.competences.length > 0 && (
            <fieldset>
              <legend>Compétences</legend>
              <div className="cases">
                {analyse.competences.map((c) => (
                  <div key={c.code} className="detection">
                    <label className="case">
                      <input
                        type="checkbox"
                        checked={competencesCochees.includes(c.code)}
                        onChange={() => basculer(competencesCochees, setCompetences, c.code)}
                      />
                      <span>{c.libelle}</span>
                    </label>
                    {c.extrait && <p className="extrait-source">« {c.extrait} »</p>}
                  </div>
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
                  <li key={`${c.typeCode}-${c.categorieCode ?? i}`} style={{ marginBottom: "0.5rem" }}>
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
            SECTIONS.map(({ cle, titre, intro }) => {
              const lot = suggestions.filter((s) => s.conformite === cle);
              if (lot.length === 0) return null;
              return (
                <section key={cle} style={{ marginTop: "1.5rem" }}>
                  <h4 style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>
                    {titre} <span className="secondaire">({lot.length})</span>
                  </h4>
                  <p className="petit secondaire" style={{ marginTop: 0 }}>{intro}</p>
                  <ul className="liste-nue liste-cartes">
                    {lot.map((s) => (
                      <li key={s.missionId} className="carte">
                        <div className="ligne-certification">
                          <div>
                            <h5 style={{ fontSize: "1rem", margin: "0 0 0.25rem" }}>
                              <a href={`/mes-missions/${s.missionId}`}>{s.titre}</a>
                            </h5>
                            <p className="petit secondaire" style={{ margin: 0 }}>
                              {s.entreprise} · {s.ville} · du {enDateFr(s.dateDebut)} au{" "}
                              {enDateFr(s.dateFin)}
                            </p>
                            {s.certificationManquante && (
                              <p className="petit" style={{ margin: "0.5rem 0 0" }}>
                                <strong>{s.certificationManquante}</strong> — {s.explication}
                              </p>
                            )}
                            <p className="petit secondaire" style={{ margin: "0.25rem 0 0" }}>
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
                </section>
              );
            })
          )}
        </>
      )}
    </section>
  );
}
