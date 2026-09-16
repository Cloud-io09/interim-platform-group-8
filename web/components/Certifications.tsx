"use client";

import { useEffect, useId, useState } from "react";

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

interface Probleme {
  champ: string;
  message: string;
}

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
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [message, setMessage] = useState<string | null>(null);
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
      .catch(() => setMessage("Impossible de charger la liste des certifications."));
    recharger();
  }, []);

  async function ajouter(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = evenement.currentTarget;
    const donnees = Object.fromEntries(new FormData(formulaire));
    setEnCours(true);
    setProblemes([]);
    setMessage(null);

    const reponse = await fetch("/api/certifications", {
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
    formulaire.reset();
    setTypeChoisi("");
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
        expirée avant la fin d&apos;une mission vous en écarte automatiquement — c&apos;est
        pour ça que la date compte autant que le titre.
      </p>
      <p className="petit secondaire">
        Intérimatch ne vérifie pas l&apos;authenticité des titres : aucun registre national
        n&apos;est interrogeable. Nous contrôlons la cohérence des dates, et vous renvoyons
        vers l&apos;organisme concerné.
      </p>

      {liste.length > 0 && (
        <ul className="liste-nue" style={{ marginBottom: "2rem" }}>
          {liste.map((c) => {
            const jours = joursAvant(c.dateEcheance);
            const perime = jours < 0;
            const bientot = jours >= 0 && jours <= 90;
            return (
              <li key={c.id} className="carte" style={{ marginBottom: "0.75rem" }}>
                <div className="ligne-certification">
                  <div>
                    <h3 style={{ marginBottom: "0.25rem" }}>
                      {c.typeLibelle}
                      {c.categorieCode && <> — catégorie {c.categorieCode}</>}
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
                          Expire le {enDateFr(c.dateEcheance)} — dans {jours} jours
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

        {message && (
          <div role="alert" className="encart-erreur">
            <p style={{ margin: 0, fontWeight: 500 }}>{message}</p>
          </div>
        )}

        <div className="champ">
          <label htmlFor={ids.type}>Type de titre</label>
          <select
            id={ids.type}
            name="typeCode"
            required
            value={typeChoisi}
            onChange={(e) => setTypeChoisi(e.target.value)}
            aria-describedby={problemeDe("typeCode") ? `${ids.type}-err` : undefined}
          >
            <option value="">Choisissez dans la liste…</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.libelle} — valable {t.validiteMois / 12} ans
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
          <input id={ids.org} name="organismeEmetteur" required maxLength={160} />
          {problemeDe("organismeEmetteur") && (
            <p className="petit message-erreur">{problemeDe("organismeEmetteur")}</p>
          )}
        </div>

        <div className="champ">
          <label htmlFor={ids.num}>Numéro du titre</label>
          <input id={ids.num} name="numero" required maxLength={80} />
          <p className="petit secondaire">Il figure sur votre carte ou votre attestation.</p>
          {problemeDe("numero") && <p className="petit message-erreur">{problemeDe("numero")}</p>}
        </div>

        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.obt}>Date d&apos;obtention</label>
            <input id={ids.obt} name="dateObtention" type="date" required />
            {problemeDe("dateObtention") && (
              <p className="petit message-erreur">{problemeDe("dateObtention")}</p>
            )}
          </div>
          <div className="champ">
            <label htmlFor={ids.ech}>Date de fin de validité</label>
            <input id={ids.ech} name="dateEcheance" type="date" required />
            {problemeDe("dateEcheance") && (
              <p className="petit message-erreur">{problemeDe("dateEcheance")}</p>
            )}
          </div>
        </div>

        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Ajouter cette certification"}
        </button>
      </form>
    </section>
  );
}
