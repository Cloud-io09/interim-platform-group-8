"use client";

import { useEffect, useState } from "react";

interface Resume {
  id: number;
  titre: string;
  ville: string;
  entreprise: string;
  dateDebut: string;
  dateFin: string;
  tauxHoraireMin: number | null;
  tauxHoraireMax: number | null;
}

interface Accessible extends Resume {
  score: number;
  distanceKm: number;
  joursCouverts: number;
  joursMission: number;
}

interface Bloquee extends Resume {
  motif: string;
  certificationManquante: string;
  explication: string;
}

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

function remuneration(m: Resume): string {
  if (m.tauxHoraireMin === null) return "";
  const max = m.tauxHoraireMax !== null && m.tauxHoraireMax !== m.tauxHoraireMin
    ? ` à ${m.tauxHoraireMax.toFixed(2)} €/h`
    : " €/h";
  return ` · ${m.tauxHoraireMin.toFixed(2)}${max}`;
}

export default function MesMissionsInterimaire() {
  const [accessibles, setAccessibles] = useState<Accessible[]>([]);
  const [bloquees, setBloquees] = useState<Bloquee[]>([]);
  const [horsMetier, setHorsMetier] = useState<Resume[]>([]);
  const [toutes, setToutes] = useState(false);
  const [enCours, setEnCours] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setEnCours(true);
    fetch(`/api/interimaire/missions${toutes ? "?portee=toutes" : ""}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message ?? "Chargement impossible.");
        setAccessibles(d.accessibles);
        setBloquees(d.bloquees);
        setHorsMetier(d.horsMetier ?? []);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setEnCours(false));
  }, [toutes]);

  if (erreur) return <div role="alert" className="encart-erreur"><p style={{ margin: 0 }}>{erreur}</p></div>;

  return (
    <>
      <fieldset className="filtre-portee">
        <legend className="petit">Que voulez-vous voir ?</legend>
        <label className="case">
          <input type="radio" name="portee" checked={!toutes} onChange={() => setToutes(false)} />
          <span>Les missions de mes métiers</span>
        </label>
        <label className="case">
          <input type="radio" name="portee" checked={toutes} onChange={() => setToutes(true)} />
          <span>Toutes les missions ouvertes</span>
        </label>
      </fieldset>

      {enCours && <p className="secondaire" role="status">Recherche des missions…</p>}

      <section aria-labelledby="titre-accessibles">
        <h2 id="titre-accessibles">Missions pour lesquelles vous êtes conforme</h2>
        {accessibles.length === 0 ? (
          <p className="secondaire">
            Aucune mission ouverte ne correspond pour l&apos;instant à vos métiers et à vos
            habilitations. Complétez vos certifications et vos disponibilités pour élargir
            les propositions.
          </p>
        ) : (
          <ul className="liste-nue">
            {accessibles.map((m) => (
              <li key={m.id} className="carte" style={{ marginBottom: "0.75rem" }}>
                <div className="ligne-certification">
                  <div>
                    <h3 style={{ marginBottom: "0.2rem" }}>{m.titre}</h3>
                    <p className="petit secondaire" style={{ margin: 0 }}>
                      {m.entreprise} · {m.ville} · du {enDateFr(m.dateDebut)} au {enDateFr(m.dateFin)}
                      {remuneration(m)}
                    </p>
                    <p className="petit secondaire" style={{ margin: "0.3rem 0 0" }}>
                      À {m.distanceKm} km de chez vous · vous couvrez {m.joursCouverts} des{" "}
                      {m.joursMission} jours
                    </p>
                  </div>
                  <span className="score-total">{m.score} %</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {horsMetier.length > 0 && (
        <section aria-labelledby="titre-hors-metier" style={{ marginTop: "2.5rem" }}>
          <h2 id="titre-hors-metier">Autres missions ouvertes</h2>
          <p className="secondaire">
            Elles ne relèvent pas des métiers déclarés sur votre profil, donc elles ne
            sont pas évaluées. Ajoutez le métier à votre profil pour savoir si vous y
            êtes conforme.
          </p>
          <ul className="liste-nue">
            {horsMetier.map((m) => (
              <li key={m.id} className="carte" style={{ marginBottom: "0.75rem" }}>
                <h3 style={{ fontSize: "1rem", marginBottom: "0.2rem" }}>{m.titre}</h3>
                <p className="petit secondaire" style={{ margin: 0 }}>
                  {m.entreprise} · {m.ville} · du {enDateFr(m.dateDebut)} au {enDateFr(m.dateFin)}
                  {remuneration(m)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bloquees.length > 0 && (
        <section aria-labelledby="titre-bloquees" style={{ marginTop: "2.5rem" }}>
          <h2 id="titre-bloquees">Missions qu&apos;une habilitation vous rouvrirait</h2>
          <p className="secondaire">
            Elles correspondent à vos métiers, mais un titre manque ou expire trop tôt. Le
            renouveler ou le déclarer vous y donnerait accès.
          </p>
          <ul className="liste-nue">
            {bloquees.map((m) => (
              <li key={m.id} className="carte" style={{ marginBottom: "0.75rem" }}>
                <div className="ligne-certification">
                  <div>
                    <h3 style={{ fontSize: "1rem", marginBottom: "0.2rem" }}>{m.titre}</h3>
                    <p className="petit secondaire" style={{ margin: 0 }}>
                      {m.entreprise} · {m.ville} · du {enDateFr(m.dateDebut)} au {enDateFr(m.dateFin)}
                      {remuneration(m)}
                    </p>
                    <p className="petit" style={{ margin: "0.4rem 0 0" }}>
                      <strong>{m.certificationManquante}</strong> — {m.explication}
                    </p>
                  </div>
                  <span
                    className={`etiquette ${m.motif === "certification_expiree" ? "etiquette--attention" : "etiquette--alerte"}`}
                  >
                    {m.motif === "certification_expiree" ? "Titre expiré" : "Titre absent"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
