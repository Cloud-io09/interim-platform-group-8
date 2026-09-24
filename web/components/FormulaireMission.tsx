"use client";

import { useEffect, useRef, useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson, rechargerVers } from "@/lib/client";

interface Domaine {
  domaine: string;
  libelle: string;
  metiers: { code: string; libelle: string }[];
}

interface TypeCertification {
  code: string;
  libelle: string;
  categories: string[];
}

interface Enrichissement {
  metier: { libelle: string };
  portee: "departement" | "national";
  departement: string | null;
  effectif: number;
  intitulesFrequents: string[];
  remuneration: {
    mediane: number;
    q1: number;
    q3: number;
    effectif: number;
    /** « domaine » quand le métier n'a aucune offre et qu'on s'est replié sur ses voisins. */
    source: "metier" | "domaine";
    domaine: string;
  } | null;
  certifications: { typeCode: string; libelle: string; occurrences: number; part: number }[];
  competences: { code: string; libelle: string; occurrences: number; part: number }[];
}

interface Exigence {
  typeCode: string;
  categorieCode: string;
}

/** Fiche déjà enregistrée, quand le formulaire sert à la modifier. */
export interface MissionAModifier {
  id: number;
  titre: string;
  metierCode: string;
  description: string | null;
  adresse: string | null;
  codePostal: string;
  ville: string;
  dateDebut: string;
  dateFin: string;
  horaires: string | null;
  tauxHoraireMin: number | null;
  tauxHoraireMax: number | null;
  certificationsRequises: { typeCode: string; categorieCode: string | null }[];
  competencesRequises: string[];
}

/**
 * Formulaire de fiche de poste, en création comme en modification.
 *
 * **La modification n'existait pas.** Une faute de frappe dans un intitulé, une date
 * décalée d'un jour, une habilitation oubliée : il fallait clore la fiche et tout
 * ressaisir. Un même formulaire sert les deux cas, sans quoi les deux divergeraient
 * au premier champ ajouté.
 */
/**
 * Horaires courants sur un chantier, proposés avant la saisie libre.
 *
 * Le champ était entièrement libre : on pouvait y écrire n'importe quoi, alors que
 * c'est une mention obligatoire du contrat de mission. Les formules les plus
 * fréquentes se choisissent d'un geste ; « Autre » garde la liberté pour les
 * chantiers qui alternent des journées de longueurs différentes.
 */
const HORAIRES_COURANTS = [
  "7h30-12h / 13h-16h30, 35 h par semaine",
  "8h-12h / 13h-17h, 39 h par semaine",
  "7h-15h en journée continue, 35 h par semaine",
  "6h-13h en horaires décalés, 35 h par semaine",
];

/** La date du jour à Paris, celle que le serveur oppose aussi. */
const aujourdhuiParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export default function FormulaireMission({ initiale }: { initiale?: MissionAModifier }) {
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [types, setTypes] = useState<TypeCertification[]>([]);
  const [metierCode, setMetierCode] = useState(initiale?.metierCode ?? "");
  const [debut, setDebut] = useState(initiale?.dateDebut ?? "");
  const [choixHoraires, setChoixHoraires] = useState(
    !initiale?.horaires ? "" : HORAIRES_COURANTS.includes(initiale.horaires) ? initiale.horaires : "autre"
  );
  const [horairesLibres, setHorairesLibres] = useState(
    initiale?.horaires && !HORAIRES_COURANTS.includes(initiale.horaires) ? initiale.horaires : ""
  );

  // **Une saisie perdue sans prévenir.** Quitter la page au milieu d'une fiche
  // effaçait tout en silence. Le navigateur sait demander confirmation : on le lui
  // demande dès le premier champ touché, et on cesse après un envoi réussi.
  const [modifie, setModifie] = useState(false);
  const envoiReussi = useRef(false);
  useEffect(() => {
    if (!modifie) return;
    const retenir = (e: BeforeUnloadEvent) => {
      if (envoiReussi.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [modifie]);
  const [codePostal, setCodePostal] = useState(initiale?.codePostal ?? "");
  const [enrichissement, setEnrichissement] = useState<Enrichissement | null>(null);
  const [exigences, setExigences] = useState<Exigence[]>(
    initiale?.certificationsRequises.map((e) => ({
      typeCode: e.typeCode,
      categorieCode: e.categorieCode ?? "",
    })) ?? []
  );
  const [competences, setCompetences] = useState<string[]>(initiale?.competencesRequises ?? []);
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  // Les deux taux sont tenus en état pour pouvoir les comparer pendant la saisie.
  // La règle existe déjà côté serveur ; la répéter ici ne la déplace pas, elle
  // avance seulement le moment où on l'apprend — après l'envoi, il faut retrouver
  // le champ fautif en haut d'un formulaire long.
  const [tauxMin, setTauxMin] = useState(String(initiale?.tauxHoraireMin ?? ""));
  const [tauxMax, setTauxMax] = useState(String(initiale?.tauxHoraireMax ?? ""));
  // Vrai tant que les taux affichés sont ceux proposés par les offres observées, et
  // non une saisie : le texte sous les champs le dit, pour qu'on ne publie pas un
  // chiffre en croyant l'avoir choisi.
  const [tauxSuggeres, setTauxSuggeres] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ids = {
    titre: useId(), metier: useId(), desc: useId(), adresse: useId(), cp: useId(),
    ville: useId(), debut: useId(), fin: useId(), min: useId(), max: useId(),
    horaires: useId(),
  };

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  useEffect(() => {
    fetch("/api/referentiel/metiers").then((r) => r.json()).then((d) => setDomaines(d.domaines)).catch(() => {});
    fetch("/api/referentiel/certifications").then((r) => r.json()).then((d) => setTypes(d.types)).catch(() => {});
  }, []);

  // La fiche s'enrichit dès que le métier est connu ; le département affine la
  // rémunération sans être obligatoire.
  useEffect(() => {
    if (!metierCode) return void setEnrichissement(null);
    const departement = /^\d{5}$/.test(codePostal) ? codePostal.slice(0, 2) : "";
    const url = `/api/enrichissement?metier=${metierCode}${departement ? `&departement=${departement}` : ""}`;
    let annule = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !annule && setEnrichissement(d))
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [metierCode, codePostal]);

  // **La fourchette observée arrive dans les champs, pas seulement dans l'encart.**
  // Elle n'était affichée qu'en haut du formulaire, loin des taux, qui restaient
  // vides : on lisait deux champs libres sans repère. Ils sont préremplis sur la
  // moitié centrale des offres du métier, et seulement s'ils sont encore vides — une
  // saisie n'est jamais écrasée.
  useEffect(() => {
    const r = enrichissement?.remuneration;
    if (!r) return;
    setTauxMin((m) => (m === "" ? r.q1.toFixed(2) : m));
    setTauxMax((m) => (m === "" ? r.q3.toFixed(2) : m));
    setTauxSuggeres((s) => s || (tauxMin === "" && tauxMax === ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichissement]);

  function basculerExigence(typeCode: string) {
    setExigences((actuelles) => {
      const existe = actuelles.some((e) => e.typeCode === typeCode);
      if (existe) return actuelles.filter((e) => e.typeCode !== typeCode);
      return [...actuelles, { typeCode, categorieCode: "" }];
    });
  }

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const d = new FormData(evenement.currentTarget);
    setEnCours(true);
    setProblemes([]);
    setErreur(null);

    const { ok, corps } = await envoyerJson<{ id: number }>(
      initiale ? `/api/missions/${initiale.id}` : "/api/missions",
      initiale ? "PATCH" : "POST",
      {
        titre: d.get("titre"),
        metierCode,
        description: d.get("description"),
        adresse: d.get("adresse"),
        codePostal: d.get("codePostal"),
        ville: d.get("ville"),
        dateDebut: d.get("dateDebut"),
        dateFin: d.get("dateFin"),
        horaires: choixHoraires === "autre" ? horairesLibres : choixHoraires,
        tauxHoraireMin: d.get("tauxHoraireMin") ? Number(d.get("tauxHoraireMin")) : null,
        tauxHoraireMax: d.get("tauxHoraireMax") ? Number(d.get("tauxHoraireMax")) : null,
        certificationsRequises: exigences.map((e) => ({
          typeCode: e.typeCode,
          categorieCode: e.categorieCode || null,
        })),
        competencesRequises: competences,
        // Une fiche modifiée ne change pas d'état : elle reste où elle en est.
        ...(initiale ? {} : { publier: true }),
      }
    );
    setEnCours(false);

    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? (initiale ? "Modification impossible." : "Publication impossible."));
      return;
    }
    envoiReussi.current = true;
    rechargerVers(`/missions/${initiale?.id ?? corps.id}`);
  }

  /** Incohérence visible dès la seconde valeur saisie, avant tout envoi. */
  const tauxIncoherents =
    tauxMin !== "" && tauxMax !== "" && Number(tauxMax) <= Number(tauxMin);


  return (
    <form onSubmit={envoyer} onChange={() => setModifie(true)} noValidate>
      <fieldset>
        <legend>Le poste</legend>
        <div className="champ">
          <label htmlFor={ids.metier}>Métier</label>
          <select id={ids.metier} value={metierCode} onChange={(e) => setMetierCode(e.target.value)} required>
            <option value="">Choisissez le métier…</option>
            {domaines.map((d) => (
              <optgroup key={d.domaine} label={d.libelle}>
                {d.metiers.map((m) => <option key={m.code} value={m.code}>{m.libelle}</option>)}
              </optgroup>
            ))}
          </select>
          {problemeDe("metierCode") && <p className="petit message-erreur">{problemeDe("metierCode")}</p>}
        </div>

        {enrichissement && enrichissement.effectif > 0 && (
          <div className="encart-enrichi" role="status">
            <p className="sur-titre" style={{ marginBottom: "0.5rem" }}>
              D&apos;après les offres publiques
            </p>
            <p className="petit" style={{ margin: 0 }}>
              {enrichissement.effectif} offre{enrichissement.effectif > 1 ? "s" : ""} de{" "}
              {enrichissement.metier.libelle.toLowerCase()}
              {enrichissement.portee === "departement"
                ? ` dans le département ${enrichissement.departement}`
                : " en France"}
              {enrichissement.remuneration?.source === "metier" && (
                <>
                  {" "}· rémunération médiane <strong>{enrichissement.remuneration.mediane.toFixed(2)} €/h</strong>{" "}
                  (moitié centrale : {enrichissement.remuneration.q1.toFixed(2)} à{" "}
                  {enrichissement.remuneration.q3.toFixed(2)} €/h, sur {enrichissement.remuneration.effectif} offres)
                </>
              )}
              .
            </p>
          </div>
        )}

        <div className="champ">
          <label htmlFor={ids.titre}>Intitulé de la fiche de poste</label>
          <input
            id={ids.titre}
            name="titre" defaultValue={initiale?.titre ?? ""}
            required
            maxLength={160}
            placeholder={enrichissement?.intitulesFrequents[0] ?? ""}
          />
          {enrichissement && enrichissement.intitulesFrequents.length > 0 && (
            <p className="petit secondaire">
              Intitulés les plus courants : {enrichissement.intitulesFrequents.join(", ")}.
            </p>
          )}
          {problemeDe("titre") && <p className="petit message-erreur">{problemeDe("titre")}</p>}
        </div>

        <div className="champ">
          <label htmlFor={ids.desc}>Description du chantier</label>
          <textarea id={ids.desc} name="description" rows={4} maxLength={2000} defaultValue={initiale?.description ?? ""} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Habilitations exigées</legend>
        <p className="petit secondaire">
          Un profil qui ne les détient pas, ou dont le titre expire avant la fin de la
          mission, n&apos;apparaîtra pas dans vos candidats. C&apos;est volontaire.
        </p>

        {enrichissement && enrichissement.certifications.length > 0 && (
          <div className="encart-enrichi">
            <p className="petit" style={{ margin: "0 0 0.5rem" }}>
              Sur ce métier, les offres publiques citent :
            </p>
            <ul className="liste-nue petit" style={{ margin: 0 }}>
              {enrichissement.certifications.map((c) => (
                <li key={c.typeCode}>
                  <strong>{c.libelle}</strong> - {c.part} % des offres ({c.occurrences} sur{" "}
                  {enrichissement.effectif})
                </li>
              ))}
            </ul>
          </div>
        )}

        {problemeDe("certificationsRequises") && (
          <p className="petit message-erreur">{problemeDe("certificationsRequises")}</p>
        )}

        <div className="cases">
          {types.map((t) => {
            const choisie = exigences.find((e) => e.typeCode === t.code);
            return (
              <div key={t.code}>
                <label className="case">
                  <input type="checkbox" checked={Boolean(choisie)} onChange={() => basculerExigence(t.code)} />
                  <span>{t.libelle}</span>
                </label>
                {choisie && t.categories.length > 0 && (
                  <div className="champ" style={{ marginLeft: "2rem", marginBottom: "0.75rem" }}>
                    <label htmlFor={`cat-${t.code}`} className="petit">Catégorie exigée</label>
                    <select
                      id={`cat-${t.code}`}
                      value={choisie.categorieCode}
                      required
                      onChange={(e) =>
                        setExigences((a) =>
                          a.map((x) => (x.typeCode === t.code ? { ...x, categorieCode: e.target.value } : x))
                        )
                      }
                    >
                      <option value="">Choisissez…</option>
                      {t.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      {enrichissement && enrichissement.competences.length > 0 && (
        <fieldset>
          <legend>Compétences attendues</legend>
          <p className="petit secondaire">
            Les plus citées sur ce métier. Elles comptent dans le score, jamais dans
            l&apos;exclusion.
          </p>
          <div className="cases">
            {enrichissement.competences.map((c) => (
              <label key={c.code} className="case">
                <input
                  type="checkbox"
                  checked={competences.includes(c.code)}
                  onChange={() =>
                    setCompetences((a) => (a.includes(c.code) ? a.filter((x) => x !== c.code) : [...a, c.code]))
                  }
                />
                <span>{c.libelle} <span className="secondaire">- {c.part} %</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>Lieu et dates</legend>
        <div className="champ">
          <label htmlFor={ids.adresse}>Adresse du chantier</label>
          <input id={ids.adresse} name="adresse" defaultValue={initiale?.adresse ?? ""} />
        </div>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.cp}>Code postal</label>
            <input
              id={ids.cp} name="codePostal" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5}
              defaultValue={initiale?.codePostal ?? ""}
              value={codePostal} onChange={(e) => setCodePostal(e.target.value)}
            />
            {problemeDe("codePostal") && <p className="petit message-erreur">{problemeDe("codePostal")}</p>}
          </div>
          <div className="champ">
            <label htmlFor={ids.ville}>Commune</label>
            <input id={ids.ville} name="ville" defaultValue={initiale?.ville ?? ""} required />
            {problemeDe("ville") && <p className="petit message-erreur">{problemeDe("ville")}</p>}
          </div>
        </div>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.debut}>Début</label>
            {/* Le calendrier n'offre pas le passé. Un chantier déjà commencé garde
                son début, qu'on peut corriger sans devoir le repousser. */}
            <input
              id={ids.debut}
              name="dateDebut"
              type="date"
              required
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
              min={initiale && initiale.dateDebut < aujourdhuiParis() ? initiale.dateDebut : aujourdhuiParis()}
            />
            {problemeDe("dateDebut") && <p className="petit message-erreur">{problemeDe("dateDebut")}</p>}
          </div>
          <div className="champ">
            <label htmlFor={ids.fin}>Fin</label>
            <input
              id={ids.fin}
              name="dateFin"
              defaultValue={initiale?.dateFin ?? ""}
              type="date"
              required
              min={debut > aujourdhuiParis() ? debut : aujourdhuiParis()}
            />
            <p className="petit secondaire">
              C&apos;est contre cette date que la validité des habilitations est vérifiée.
            </p>
            {problemeDe("dateFin") && <p className="petit message-erreur">{problemeDe("dateFin")}</p>}
          </div>
        </div>

        {/* Mention obligatoire du contrat de mission. */}
        <div className="champ">
          <label htmlFor={ids.horaires}>Horaires de travail</label>
          <select id={ids.horaires} value={choixHoraires} onChange={(e) => setChoixHoraires(e.target.value)}>
            <option value="">Choisir des horaires…</option>
            {HORAIRES_COURANTS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
            <option value="autre">Autre, à préciser</option>
          </select>
          {choixHoraires === "autre" && (
            <input
              aria-label="Horaires, à préciser"
              type="text"
              maxLength={300}
              value={horairesLibres}
              onChange={(e) => setHorairesLibres(e.target.value)}
              placeholder="Lundi-jeudi 7h-16h, vendredi 7h-12h, 39 h par semaine"
              style={{ marginTop: "0.5rem" }}
            />
          )}
          <p className="petit secondaire">
            Mention obligatoire du contrat de mission. Sans elle, le document de mission
            est incomplet.
          </p>
          {problemeDe("horaires") && <p className="petit message-erreur">{problemeDe("horaires")}</p>}
        </div>

        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.min}>Taux horaire minimum</label>
            <input
              id={ids.min}
              name="tauxHoraireMin"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={tauxMin}
              onChange={(e) => {
                setTauxMin(e.target.value);
                setTauxSuggeres(false);
              }}
            />
            {problemeDe("tauxHoraireMin") && <p className="petit message-erreur">{problemeDe("tauxHoraireMin")}</p>}
          </div>
          <div className="champ">
            <label htmlFor={ids.max}>Taux horaire maximum</label>
            <input
              id={ids.max}
              name="tauxHoraireMax"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={tauxMax}
              onChange={(e) => {
                setTauxMax(e.target.value);
                setTauxSuggeres(false);
              }}
              aria-invalid={tauxIncoherents || undefined}
              aria-describedby={tauxIncoherents ? `${ids.max}-err` : undefined}
            />
            {tauxIncoherents ? (
              <p id={`${ids.max}-err`} className="petit message-erreur" role="status">
                Le maximum doit dépasser le minimum ({tauxMin} €). Laissez-le vide si le
                taux est fixe.
              </p>
            ) : (
              problemeDe("tauxHoraireMax") && (
                <p className="petit message-erreur">{problemeDe("tauxHoraireMax")}</p>
              )
            )}
          </div>
        </div>
        {enrichissement?.remuneration ? (
          <p className="petit secondaire" style={{ margin: 0 }}>
            {tauxSuggeres ? "Prérempli d'après " : "Repère : "}
            la moitié centrale des taux observés,{" "}
            <strong>
              {enrichissement.remuneration.q1.toFixed(2)} à {enrichissement.remuneration.q3.toFixed(2)} €/h
            </strong>{" "}
            (médiane {enrichissement.remuneration.mediane.toFixed(2)} €/h), sur{" "}
            {enrichissement.remuneration.source === "domaine" ? (
              <>
                {enrichissement.remuneration.effectif} offres d&apos;intérim du domaine «{" "}
                {enrichissement.remuneration.domaine} » en France : aucune offre n&apos;a été
                observée pour ce métier précis.
              </>
            ) : (
              <>
                {enrichissement.remuneration.effectif} offres d&apos;intérim de ce métier
                {enrichissement.portee === "departement"
                  ? ` dans le département ${enrichissement.departement}`
                  : " en France"}
                .
              </>
            )}{" "}
            Modifiable librement.
          </p>
        ) : (
          metierCode && (
            <p className="petit secondaire" style={{ margin: 0 }}>
              Aucune offre publique observée pour ce métier : pas de repère de
              rémunération à proposer.
            </p>
          )
        )}
      </fieldset>

      <RetourFormulaire erreur={erreur} succes={null} problemes={problemes} />

      <button className="bouton" type="submit" disabled={enCours || tauxIncoherents}>
        {enCours ? "Publication…" : "Publier la fiche de poste"}
      </button>
    </form>
  );
}
