"use client";

import { useEffect, useState } from "react";
import {
  actionsPossibles,
  libelleAction,
  libelleEtat,
  type EtatCandidature,
} from "@interimatch/core/candidature";
import { envoyerJson } from "@/lib/client";

interface Score {
  interimaireId: number;
  prenom?: string;
  nom?: string;
  ville?: string;
  competences: number;
  distance: number;
  disponibilite: number;
  total: number;
  detail: {
    competencesCommunes: string[];
    competencesRequises: string[];
    distanceKm: number;
    rayonKm: number;
    joursChevauchement: number;
    joursMission: number;
  };
}

interface Exclusion {
  interimaireId: number;
  prenom?: string;
  nom?: string;
  ville?: string;
  motif: string;
  typeLibelle: string;
  categorieCode: string | null;
  explication: string;
}

interface Resultat {
  ponderations: { competences: number; distance: number; disponibilite: number };
  calculeLe: string;
  depuisCache: boolean;
  evalues: number;
  retenus: Score[];
  ecartes: Exclusion[];
}

const pourcent = (n: number) => `${Math.round(n * 100)} %`;

/** Barre de critère : la valeur est toujours écrite, jamais portée par la seule largeur. */
function Critere({ libelle, valeur, poids, detail }: { libelle: string; valeur: number; poids: number; detail: string }) {
  return (
    <div className="critere">
      <div className="critere-entete">
        <span>
          {libelle} <span className="secondaire petit">— pondéré {Math.round(poids * 100)} %</span>
        </span>
        <strong>{pourcent(valeur)}</strong>
      </div>
      <div className="jauge" role="presentation">
        <div className="jauge-remplie" style={{ width: `${Math.round(valeur * 100)}%` }} />
      </div>
      <p className="petit secondaire" style={{ margin: "0.25rem 0 0" }}>{detail}</p>
    </div>
  );
}

export default function ResultatsMatching({ missionId }: { missionId: number }) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [candidatures, setCandidatures] = useState<Record<number, EtatCandidature>>({});
  const [enTraitement, setEnTraitement] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(true);

  async function chargerCandidatures() {
    const r = await fetch(`/api/missions/${missionId}/candidatures`);
    if (!r.ok) return;
    const d = await r.json();
    setCandidatures(
      Object.fromEntries(
        d.candidatures.map((c: { interimaireId: number; statut: EtatCandidature }) => [c.interimaireId, c.statut])
      )
    );
  }

  /**
   * Le rapprochement est bilatéral : une entreprise sollicite un profil, elle ne
   * l'affecte pas. L'affectation ne devient possible qu'après que l'intérimaire a
   * postulé — c'est la table de transitions du cœur qui en décide, pas cet écran.
   */
  async function decider(interimaireId: number, vers: EtatCandidature) {
    setEnTraitement(interimaireId);
    setErreur(null);
    const { ok, corps } = await envoyerJson("/api/candidatures", "POST", {
      missionId,
      interimaireId,
      vers,
    });
    setEnTraitement(null);
    if (!ok) {
      setErreur(corps.message ?? "Action impossible.");
      return;
    }
    setCandidatures((a) => ({ ...a, [interimaireId]: vers }));
  }

  async function charger(recalculer = false) {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/missions/${missionId}/matching${recalculer ? "?recalculer=1" : ""}`);
      const corps = await r.json();
      if (!r.ok) throw new Error(corps.message ?? "Calcul impossible.");
      setResultat(corps);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Calcul impossible.");
    } finally {
      setEnCours(false);
    }
  }

  useEffect(() => {
    charger();
    chargerCandidatures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  if (enCours && !resultat) return <p className="secondaire">Calcul des correspondances…</p>;
  if (erreur) return <div role="alert" className="encart-erreur"><p style={{ margin: 0 }}>{erreur}</p></div>;
  if (!resultat) return null;

  return (
    <div>
      <div className="ligne-certification" style={{ marginBottom: "1.5rem" }}>
        <p className="petit secondaire" style={{ margin: 0 }}>
          {resultat.evalues} profil{resultat.evalues > 1 ? "s" : ""} évalué{resultat.evalues > 1 ? "s" : ""} ·{" "}
          {resultat.retenus.length} retenu{resultat.retenus.length > 1 ? "s" : ""} ·{" "}
          {resultat.ecartes.length} écarté{resultat.ecartes.length > 1 ? "s" : ""}
          {resultat.depuisCache && " · résultat mis en cache"}
        </p>
        <button className="bouton bouton--secondaire" onClick={() => charger(true)} disabled={enCours}>
          {enCours ? "Recalcul…" : "Recalculer"}
        </button>
      </div>

      <h2>Candidats retenus</h2>
      {resultat.retenus.length === 0 ? (
        <p className="secondaire">
          Aucun profil ne détient toutes les habilitations exigées, valides jusqu&apos;à la
          fin de la mission.
        </p>
      ) : (
        <ul className="liste-nue liste-cartes">
          {resultat.retenus.map((s) => (
            <li key={s.interimaireId} className="carte" style={{ marginBottom: "1rem" }}>
              <div className="ligne-certification" style={{ marginBottom: "1rem" }}>
                <div>
                  {/* Le lien porte le nom de la personne : une fiche s'ouvre, pas
                      une URL. Elle rend la validité des titres au regard de cette
                      mission-ci, la seule qui ait un sens ici. */}
                  <h3 style={{ marginBottom: "0.15rem" }}>
                    <a className="lien-bloc" href={`/missions/${missionId}/profils/${s.interimaireId}`}>
                      {s.prenom} {s.nom}
                    </a>
                  </h3>
                  <p className="petit secondaire" style={{ margin: 0 }}>{s.ville}</p>
                </div>
                <span className="score-total">{pourcent(s.total)}</span>
              </div>

              <div className="actions-candidature">
                <span className="pastille pastille--info">
                  {libelleEtat(candidatures[s.interimaireId] ?? "proposee")}
                </span>
                {/* Les boutons viennent de la table de transitions : une action
                    affichée ici mais refusée par le serveur serait une impasse. */}
                {actionsPossibles(candidatures[s.interimaireId] ?? "proposee", "entreprise").map((vers) => (
                  <button
                    key={vers}
                    className={vers === "declinee" ? "bouton bouton--secondaire" : "bouton"}
                    onClick={() => decider(s.interimaireId, vers)}
                    disabled={enTraitement === s.interimaireId}
                  >
                    {enTraitement === s.interimaireId ? "…" : libelleAction(vers, "entreprise")}
                  </button>
                ))}
              </div>
              {/* Le score est exposé par critère, pas seulement en total : on doit
                  pouvoir expliquer pourquoi ce profil est devant un autre. */}
              <Critere
                libelle="Compétences"
                valeur={s.competences}
                poids={resultat.ponderations.competences}
                detail={
                  s.detail.competencesRequises.length === 0
                    ? "Aucune compétence exigée sur cette fiche."
                    : `${s.detail.competencesCommunes.length} sur ${s.detail.competencesRequises.length} compétences exigées.`
                }
              />
              <Critere
                libelle="Distance"
                valeur={s.distance}
                poids={resultat.ponderations.distance}
                detail={`${s.detail.distanceKm} km du chantier, pour une zone déclarée de ${s.detail.rayonKm} km.`}
              />
              <Critere
                libelle="Disponibilité"
                valeur={s.disponibilite}
                poids={resultat.ponderations.disponibilite}
                detail={`${s.detail.joursChevauchement} jours couverts sur les ${s.detail.joursMission} de la mission.`}
              />
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: "2.5rem" }}>Profils écartés</h2>
      <p className="secondaire">
        Ils ne sont pas classés : une habilitation manquante ou périmée ne se rattrape pas
        par un bon score ailleurs. Le motif est indiqué pour que vous puissiez répondre à
        la question « pourquoi celui-là n&apos;apparaît pas ? ».
      </p>
      {resultat.ecartes.length === 0 ? (
        <p className="secondaire">Aucun profil écarté.</p>
      ) : (
        <ul className="liste-nue liste-cartes">
          {resultat.ecartes.map((e) => (
            <li key={e.interimaireId} className="carte">
              <div className="ligne-certification">
                <div>
                  <h3 style={{ fontSize: "1rem", marginBottom: "0.15rem" }}>{e.prenom} {e.nom}</h3>
                  <p className="petit secondaire" style={{ margin: 0 }}>{e.explication}</p>
                </div>
                <span
                  className={`etiquette ${e.motif === "certification_expiree" ? "etiquette--attention" : "etiquette--alerte"}`}
                >
                  {e.motif === "certification_expiree" ? "Titre expiré" : "Titre absent"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
