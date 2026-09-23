"use client";

import { useEffect, useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";

interface TypeCertification {
  code: string;
  libelle: string;
  validiteMois: number;
  categories: string[];
  verification: { url: string; organisme: string } | null;
}

interface Certification {
  id: number;
  typeCode: string;
  typeLibelle: string;
  categorieCode: string | null;
  organismeEmetteur: string;
  numero: string;
  dateObtention: string;
  dateEcheance: string;
}

/**
 * Fin de validité déduite de la date d'obtention et de la durée du type.
 *
 * Elle était saisie à la main alors que la durée de chaque titre est connue — dix ans
 * pour un CACES R482, cinq pour un R490, trois pour une habilitation électrique. Or
 * c'est **cette date qui décide de l'éligibilité** : une faute de frappe y écarte
 * quelqu'un d'un chantier auquel il a droit, ou l'y envoie sans titre valable.
 *
 * Le champ reste modifiable : un titre réel peut porter une date différente, après un
 * recyclage notamment. Mais le défaut est le calcul, et l'écart est signalé.
 */
function echeanceCalculee(obtention: string, validiteMois: number): string {
  if (!obtention || !validiteMois) return "";
  const d = new Date(`${obtention}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCMonth(d.getUTCMonth() + validiteMois);
  return d.toISOString().slice(0, 10);
}

/**
 * Organismes testeurs les plus fréquents sur les habilitations du bâtiment.
 *
 * Proposés, jamais imposés : la liste réelle compte des dizaines de centres
 * certifiés, et refuser celui qui n'y figure pas empêcherait de déclarer un titre
 * valable — exactement ce que ce produit existe pour éviter.
 */
const ORGANISMES = [
  "AFPA",
  "AFTRAL",
  "APAVE",
  "Bureau Veritas",
  "CACES Formation",
  "Dekra",
  "ECF",
  "GRETA",
  "Promotrans",
  "Socotec",
] as const;

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

/** Jours restants avant échéance. Négatif si le titre est déjà périmé. */
function joursAvant(iso: string): number {
  const MS = 86_400_000;
  const aujourdhui = new Date();
  const cible = new Date(`${iso}T00:00:00Z`);
  const zero = Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate());
  return Math.round((cible.getTime() - zero) / MS);
}

export default function Certifications() {
  const [types, setTypes] = useState<TypeCertification[]>([]);
  const [liste, setListe] = useState<Certification[]>([]);
  const [typeChoisi, setTypeChoisi] = useState("");
  const [obtention, setObtention] = useState("");
  const [echeance, setEcheance] = useState("");
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ids = { type: useId(), cat: useId(), org: useId(), num: useId(), obt: useId(), ech: useId() };

  const type = types.find((t) => t.code === typeChoisi);
  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  async function recharger() {
    const r = await fetch("/api/certifications");
    if (r.ok) setListe((await r.json()).certifications);
  }

  useEffect(() => {
    fetch("/api/referentiel/certifications")
      .then((r) => r.json())
      .then((d) => setTypes(d.types))
      .catch(() => setErreur("Impossible de charger la liste des certifications."));
    recharger();
  }, []);

  async function ajouter(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = evenement.currentTarget;
    const donnees = Object.fromEntries(new FormData(formulaire));
    setEnCours(true);
    setProblemes([]);
    setErreur(null);
    setSucces(null);

    const { ok, corps } = await envoyerJson("/api/certifications", "POST", donnees);
    setEnCours(false);

    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Enregistrement impossible.");
      return;
    }
    formulaire.reset();
    setTypeChoisi("");
    setObtention("");
    setEcheance("");
    setSucces("Certification ajoutée.");
    await recharger();
  }

  async function supprimer(id: number, libelle: string) {
    if (!confirm(`Supprimer « ${libelle} » de votre profil ?`)) return;
    await fetch(`/api/certifications/${id}`, { method: "DELETE" });
    await recharger();
  }

  return (
    <section aria-labelledby="titre-certifications">
      <h2 id="titre-certifications">Mes certifications</h2>
      <p className="secondaire">
        Ce sont elles qui décident si vous pouvez aller sur un chantier. Une certification
        expirée avant la fin d&apos;une mission vous en écarte automatiquement, c&apos;est
        pour ça que la date compte autant que le titre.
      </p>
      <p className="petit secondaire">
        Intérimatch ne vérifie pas l&apos;authenticité des titres : aucun registre national
        n&apos;est interrogeable. Nous contrôlons la cohérence des dates, et vous renvoyons
        vers l&apos;organisme concerné.
      </p>

      {liste.length > 0 && (
        <ul className="liste-nue liste-cartes" style={{ marginBottom: "2rem" }}>
          {liste.map((c) => {
            const jours = joursAvant(c.dateEcheance);
            const perime = jours < 0;
            const bientot = jours >= 0 && jours <= 90;
            return (
              <li key={c.id} className="carte">
                <div className="ligne-certification">
                  <div>
                    <h3 style={{ marginBottom: "0.25rem" }}>
                      {c.typeLibelle}
                      {c.categorieCode && <> - catégorie {c.categorieCode}</>}
                    </h3>
                    <p className="petit secondaire" style={{ margin: 0 }}>
                      {c.organismeEmetteur} · n° {c.numero} · obtenu le {enDateFr(c.dateObtention)}
                    </p>
                    {types.find((t) => t.code === c.typeCode)?.verification && (
                      <p className="petit secondaire" style={{ margin: "0.3rem 0 0" }}>
                        <a
                          href={types.find((t) => t.code === c.typeCode)!.verification!.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Vérifier auprès de {types.find((t) => t.code === c.typeCode)!.verification!.organisme}
                        </a>
                        {" "}
                        <span aria-hidden="true">↗</span>
                        <span className="hors-ecran"> (nouvelle fenêtre)</span>
                      </p>
                    )}
                    <p className="petit" style={{ margin: "0.4rem 0 0", fontWeight: 500 }}>
                      {perime ? (
                        <span className="etiquette etiquette--alerte">
                          Périmé depuis le {enDateFr(c.dateEcheance)}
                        </span>
                      ) : bientot ? (
                        <span className="etiquette etiquette--attention">
                          Expire le {enDateFr(c.dateEcheance)}, dans {jours} jours
                        </span>
                      ) : (
                        <span className="etiquette etiquette--ok">
                          Valide jusqu&apos;au {enDateFr(c.dateEcheance)}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="bouton bouton--secondaire"
                    onClick={() => supprimer(c.id, c.typeLibelle)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={ajouter} className="carte" noValidate>
        <h3>Ajouter une certification</h3>

        <div className="champ">
          <label htmlFor={ids.type}>Type de titre</label>
          <select
            id={ids.type}
            name="typeCode"
            required
            value={typeChoisi}
            onChange={(e) => {
              setTypeChoisi(e.target.value);
              const choisi = types.find((t) => t.code === e.target.value);
              if (choisi && obtention) setEcheance(echeanceCalculee(obtention, choisi.validiteMois));
            }}
            aria-describedby={problemeDe("typeCode") ? `${ids.type}-err` : undefined}
          >
            <option value="">Choisissez dans la liste…</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.libelle} - valable {t.validiteMois / 12} ans
              </option>
            ))}
          </select>
          {problemeDe("typeCode") && (
            <p id={`${ids.type}-err`} className="petit message-erreur">{problemeDe("typeCode")}</p>
          )}
        </div>

        {type?.verification && (
          <p className="petit secondaire" style={{ marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
            Titre délivré par un organisme accrédité.{" "}
            <a href={type.verification.url} target="_blank" rel="noopener noreferrer">
              Consulter {type.verification.organisme}
            </a>
            {" "}
            <span aria-hidden="true">↗</span>
            <span className="hors-ecran"> (nouvelle fenêtre)</span>
          </p>
        )}

        {type && type.categories.length > 0 && (
          <div className="champ">
            <label htmlFor={ids.cat}>Catégorie</label>
            <select
              id={ids.cat}
              name="categorieCode"
              required
              aria-describedby={problemeDe("categorieCode") ? `${ids.cat}-err` : undefined}
            >
              <option value="">Choisissez…</option>
              {type.categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {problemeDe("categorieCode") && (
              <p id={`${ids.cat}-err`} className="petit message-erreur">{problemeDe("categorieCode")}</p>
            )}
          </div>
        )}

        <div className="champ">
          <label htmlFor={ids.org}>Organisme qui a délivré le titre</label>
          <input
            id={ids.org}
            name="organismeEmetteur"
            required
            maxLength={160}
            list={`${ids.org}-liste`}
            placeholder="APAVE, Bureau Veritas, AFTRAL…"
            aria-describedby={`${ids.org}-aide`}
          />
          {/* Une liste de suggestions, pas une liste fermée : les organismes
              testeurs certifiés sont des dizaines, et en refuser un absent de notre
              liste empêcherait quelqu'un de déclarer un titre parfaitement valable.
              Les plus fréquents épargnent la frappe, le champ reste libre. */}
          <datalist id={`${ids.org}-liste`}>
            {ORGANISMES.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          {/* Un champ libre sans exemple laisse deviner ce qu'on attend : le centre de
              formation ? l'employeur ? Ce sont les organismes testeurs certifiés, et
              trois noms réels le disent mieux qu'une définition. */}
          <p id={`${ids.org}-aide`} className="petit secondaire">
            Le centre qui vous a fait passer le test, indiqué sur votre attestation.
          </p>
          {problemeDe("organismeEmetteur") && (
            <p className="petit message-erreur">{problemeDe("organismeEmetteur")}</p>
          )}
        </div>

        <div className="champ">
          <label htmlFor={ids.num}>Numéro du titre</label>
          <input
            id={ids.num}
            name="numero"
            required
            maxLength={80}
            aria-describedby={`${ids.num}-aide`}
          />
          <p id={`${ids.num}-aide`} className="petit secondaire">
            Il figure sur votre carte ou votre attestation. Il sert à vérifier le titre
            auprès de l&apos;organisme, et il est <strong>chiffré</strong> en base.
          </p>
          {problemeDe("numero") && <p className="petit message-erreur">{problemeDe("numero")}</p>}
        </div>

        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.obt}>Date d&apos;obtention</label>
            <input
              id={ids.obt}
              name="dateObtention"
              type="date"
              required
              value={obtention}
              onChange={(e) => {
                setObtention(e.target.value);
                // On ne recalcule que tant que la date n'a pas été touchée : écraser
                // une saisie délibérée serait pire que ne rien proposer.
                if (type) setEcheance(echeanceCalculee(e.target.value, type.validiteMois));
              }}
            />
            <p className="petit secondaire">Celle qui figure sur votre titre.</p>
            {problemeDe("dateObtention") && (
              <p className="petit message-erreur">{problemeDe("dateObtention")}</p>
            )}
          </div>
          <div className="champ">
            <label htmlFor={ids.ech}>Date de fin de validité</label>
            <input
              id={ids.ech}
              name="dateEcheance"
              type="date"
              required
              value={echeance}
              onChange={(e) => setEcheance(e.target.value)}
            />
            {type && obtention ? (
              echeance === echeanceCalculee(obtention, type.validiteMois) ? (
                <p className="petit secondaire">
                  Calculée : {type.validiteMois % 12 === 0
                    ? `${type.validiteMois / 12} an${type.validiteMois > 12 ? "s" : ""}`
                    : `${type.validiteMois} mois`}{" "}
                  après l&apos;obtention. Corrigez-la si votre titre porte une autre date.
                </p>
              ) : (
                <p className="petit">
                  Différente de la durée habituelle de ce titre. C&apos;est possible après un
                  recyclage - vérifiez simplement qu&apos;elle correspond bien au document.
                </p>
              )
            ) : (
              <p className="petit secondaire">
                Choisissez le type et la date d&apos;obtention : elle se calcule toute seule.
              </p>
            )}
            {problemeDe("dateEcheance") && (
              <p className="petit message-erreur">{problemeDe("dateEcheance")}</p>
            )}
          </div>
        </div>

        <RetourFormulaire erreur={erreur} succes={succes} problemes={problemes} />

        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Ajouter cette certification"}
        </button>
      </form>
    </section>
  );
}
