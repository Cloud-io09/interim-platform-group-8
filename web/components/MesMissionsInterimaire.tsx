"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { normaliser } from "@interimatch/core/cv";

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

interface Criteres {
  motCle: string;
  /** Distance maximale acceptée, `null` quand l'utilisateur ne la borne pas. */
  distanceMax: number | null;
  tauxMin: number | null;
  /** Ne garder que les missions qui démarrent après cette date. */
  aPartirDu: string;
}

const CRITERES_VIDES: Criteres = { motCle: "", distanceMax: null, tauxMin: null, aPartirDu: "" };

/** Une mission passe-t-elle les critères ? Les champs vides ne filtrent rien. */
function retenue(m: Resume & { distanceKm?: number }, c: Criteres): boolean {
  if (c.motCle) {
    const aiguille = normaliser(c.motCle);
    const cible = normaliser(`${m.titre} ${m.entreprise} ${m.ville}`);
    if (!cible.includes(aiguille)) return false;
  }
  // La distance n'est connue que des missions évaluées : une mission hors métier
  // n'a pas de score, la borner reviendrait à la faire disparaître sans raison.
  if (c.distanceMax !== null && m.distanceKm !== undefined && m.distanceKm > c.distanceMax) return false;
  if (c.tauxMin !== null && (m.tauxHoraireMax ?? m.tauxHoraireMin ?? 0) < c.tauxMin) return false;
  if (c.aPartirDu && m.dateDebut < c.aPartirDu) return false;
  return true;
}

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

/** Virgule décimale : le produit est français, « 14.00 € » se lit comme une faute. */
const enEuros = (v: number) => v.toFixed(2).replace(".", ",");
const enKm = (km: number) => `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;

function remuneration(m: Resume): string {
  if (m.tauxHoraireMin === null) return "";
  const max = m.tauxHoraireMax !== null && m.tauxHoraireMax !== m.tauxHoraireMin
    ? ` à ${enEuros(m.tauxHoraireMax)} €/h`
    : " €/h";
  return ` · ${enEuros(m.tauxHoraireMin)}${max}`;
}

export default function MesMissionsInterimaire() {
  const [accessibles, setAccessibles] = useState<Accessible[]>([]);
  const [bloquees, setBloquees] = useState<Bloquee[]>([]);
  const [horsMetier, setHorsMetier] = useState<Resume[]>([]);
  const [toutes, setToutes] = useState(false);
  const [enCours, setEnCours] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [criteres, setCriteres] = useState<Criteres>(CRITERES_VIDES);
  const ids = { motCle: useId(), distance: useId(), taux: useId(), date: useId() };

  // Le filtrage se fait sur la liste déjà chargée : elle est bornée côté serveur, et
  // un aller-retour réseau à chaque frappe rendrait la recherche pénible en 4G.
  const vusAccessibles = useMemo(() => accessibles.filter((m) => retenue(m, criteres)), [accessibles, criteres]);
  const vusBloquees = useMemo(() => bloquees.filter((m) => retenue(m, criteres)), [bloquees, criteres]);
  const vusHorsMetier = useMemo(() => horsMetier.filter((m) => retenue(m, criteres)), [horsMetier, criteres]);
  const filtreActif = JSON.stringify(criteres) !== JSON.stringify(CRITERES_VIDES);
  const totalCharge = accessibles.length + bloquees.length + horsMetier.length;
  const totalVu = vusAccessibles.length + vusBloquees.length + vusHorsMetier.length;

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
    <div className="page-opportunites">
      <div className="barre-filtres">
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

        <fieldset className="filtre-criteres">
          <legend className="petit">Affiner</legend>

          <div className="champ">
            <label htmlFor={ids.motCle} className="petit">Mot-clé</label>
            <input
              id={ids.motCle}
              type="search"
              value={criteres.motCle}
              placeholder="Coffrage, pelle, Reims…"
              onChange={(e) => setCriteres({ ...criteres, motCle: e.target.value })}
            />
          </div>

          <div className="champ">
            <label htmlFor={ids.distance} className="petit">
              Distance maximale{criteres.distanceMax !== null && ` : ${criteres.distanceMax} km`}
            </label>
            {/* Un curseur seul ne dit pas sa valeur : elle est écrite dans l'étiquette,
                qui est lue par les technologies d'assistance à chaque mouvement. */}
            <input
              id={ids.distance}
              type="range"
              min={5}
              max={150}
              step={5}
              value={criteres.distanceMax ?? 150}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCriteres({ ...criteres, distanceMax: v >= 150 ? null : v });
              }}
            />
            <p className="petit secondaire" style={{ margin: 0 }}>
              {criteres.distanceMax === null ? "Sans limite" : "Glissez à fond à droite pour ne pas limiter."}
            </p>
          </div>

          <div className="champ">
            <label htmlFor={ids.taux} className="petit">Taux horaire minimum (€)</label>
            <input
              id={ids.taux}
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              value={criteres.tauxMin ?? ""}
              placeholder="12,00"
              onChange={(e) =>
                setCriteres({ ...criteres, tauxMin: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>

          <div className="champ">
            <label htmlFor={ids.date} className="petit">Démarrage à partir du</label>
            <input
              id={ids.date}
              type="date"
              value={criteres.aPartirDu}
              onChange={(e) => setCriteres({ ...criteres, aPartirDu: e.target.value })}
            />
          </div>

          <button type="button" className="bouton bouton--secondaire pleine-largeur" onClick={() => setCriteres(CRITERES_VIDES)}>
            Réinitialiser
          </button>
        </fieldset>
      </div>

      <div>
      {enCours ? (
        <p className="secondaire" role="status">Recherche des missions…</p>
      ) : (
        <p className="secondaire" role="status">
          {filtreActif
            ? `${totalVu} mission${totalVu > 1 ? "s" : ""} sur ${totalCharge} correspondent à vos critères.`
            : `${totalCharge} mission${totalCharge > 1 ? "s" : ""} ouverte${totalCharge > 1 ? "s" : ""}.`}
        </p>
      )}

      <section aria-labelledby="titre-accessibles">
        <h2 id="titre-accessibles">Missions pour lesquelles vous êtes conforme</h2>
        {vusAccessibles.length === 0 ? (
          <p className="secondaire">
            {filtreActif
              ? "Aucune mission ne correspond à vos critères. Élargissez la distance ou retirez le mot-clé."
              : "Aucune mission ouverte ne correspond pour l'instant à vos métiers et à vos habilitations. Complétez vos certifications et vos disponibilités pour élargir les propositions."}
          </p>
        ) : (
          <ul className="liste-nue">
            {vusAccessibles.map((m) => (
              <li key={m.id} className="carte" style={{ marginBottom: "0.75rem" }}>
                <div className="ligne-certification">
                  <div>
                    <h3 style={{ marginBottom: "0.2rem" }}>
                      <a href={`/mes-missions/${m.id}`}>{m.titre}</a>
                    </h3>
                    <p className="petit secondaire" style={{ margin: 0 }}>
                      {m.entreprise} · {m.ville} · du {enDateFr(m.dateDebut)} au {enDateFr(m.dateFin)}
                      {remuneration(m)}
                    </p>
                    <p className="petit secondaire" style={{ margin: "0.3rem 0 0" }}>
                      À {enKm(m.distanceKm)} de chez vous · vous couvrez {m.joursCouverts} des{" "}
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

      {vusHorsMetier.length > 0 && (
        <section aria-labelledby="titre-hors-metier" style={{ marginTop: "2.5rem" }}>
          <h2 id="titre-hors-metier">Autres missions ouvertes</h2>
          <p className="secondaire">
            Elles ne relèvent pas des métiers déclarés sur votre profil, donc elles ne
            sont pas évaluées. Ajoutez le métier à votre profil pour savoir si vous y
            êtes conforme.
          </p>
          <ul className="liste-nue">
            {vusHorsMetier.map((m) => (
              <li key={m.id} className="carte" style={{ marginBottom: "0.75rem" }}>
                <h3 style={{ fontSize: "1rem", marginBottom: "0.2rem" }}>
                  <a href={`/mes-missions/${m.id}`}>{m.titre}</a>
                </h3>
                <p className="petit secondaire" style={{ margin: 0 }}>
                  {m.entreprise} · {m.ville} · du {enDateFr(m.dateDebut)} au {enDateFr(m.dateFin)}
                  {remuneration(m)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vusBloquees.length > 0 && (
        <section aria-labelledby="titre-bloquees" style={{ marginTop: "2.5rem" }}>
          <h2 id="titre-bloquees">Missions qu&apos;une habilitation vous rouvrirait</h2>
          <p className="secondaire">
            Elles correspondent à vos métiers, mais un titre manque ou expire trop tôt. Le
            renouveler ou le déclarer vous y donnerait accès.
          </p>
          <ul className="liste-nue">
            {vusBloquees.map((m) => (
              <li key={m.id} className="carte" style={{ marginBottom: "0.75rem" }}>
                <div className="ligne-certification">
                  <div>
                    <h3 style={{ fontSize: "1rem", marginBottom: "0.2rem" }}>
                      <a href={`/mes-missions/${m.id}`}>{m.titre}</a>
                    </h3>
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
      </div>
    </div>
  );
}
