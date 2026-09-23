import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connexion } from "@interimatch/core/db";
import {
  distanceKm,
  estConforme,
  joursDeChevauchement,
  libelleEtat,
  nombreDeJours,
  type EtatCandidature,
} from "@interimatch/core";
import ActionCandidature from "@/components/ActionCandidature";
import { ListeConformite, PastilleConformite } from "@/components/Conformite";
import FicheChantier from "@/components/FicheChantier";
import { exigerSession } from "@/lib/garde";
import { chargerMission, chargerProfils } from "@/lib/depot";
import { chargerMissionPourConformite, conformiteDetaillee } from "@/lib/candidatures";

export const metadata: Metadata = { title: "Détail de la mission", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");
const enKm = (km: number) => `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
const enEuros = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

export default async function DetailMissionInterimaire({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerSession("interimaire");
  const { id } = await params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId)) notFound();

  const sql = connexion();
  try {
    const mission = await chargerMission(sql, missionId);
    if (!mission) notFound();

    // Une mission pourvue reste consultable par l'intérimaire affecté : c'est son
    // chantier.
    //
    // **Et par quiconque s'y est porté candidat**, même si elle a été pourvue par un
    // autre. Sans cette seconde condition, un lien parfaitement légitime depuis
    // « Mes candidatures » tombait sur un 404 brut : le produit répondait « cette
    // page n'existe pas » à quelqu'un qui demandait des nouvelles de sa candidature.
    // L'écran sait déjà dire « pourvue par quelqu'un d'autre » — encore fallait-il
    // le laisser s'afficher.
    const [affectation] = await sql<{ interimaire_affecte_id: number | null }[]>`
      select interimaire_affecte_id from mission where id = ${missionId}`;
    const jeSuisAffecte = affectation?.interimaire_affecte_id === session.compteId;

    const [maCandidature] = await sql<{ id: number }[]>`
      select id from candidature
       where mission_id = ${missionId} and interimaire_id = ${session.compteId}`;

    if (mission.statut !== "publiee" && !jeSuisAffecte && !maCandidature) notFound();

    const pourConformite = (await chargerMissionPourConformite(sql, missionId))!;
    const conformite = await conformiteDetaillee(sql, pourConformite, session.compteId);
    const conforme = estConforme(conformite);
    const bloquantes = conformite.filter((c) => c.bloquant);

    const [candidature] = await sql<{ statut: EtatCandidature; motif: string | null }[]>`
      select statut, motif from candidature
      where mission_id = ${missionId} and interimaire_id = ${session.compteId}`;
    const etat: EtatCandidature = candidature?.statut ?? "proposee";

    const profils = await chargerProfils(sql, mission.metierCode);
    const moi = profils.find((p) => p.interimaireId === session.compteId);
    const distance = moi ? Math.round(distanceKm(moi, mission) * 10) / 10 : null;
    const joursMission = nombreDeJours(mission);
    const couverts = moi ? joursDeChevauchement(mission, moi.disponibilites) : 0;

    return (
      <section className="section">
        <div className="colonne colonne--formulaire">
          <p className="petit secondaire">
            <a href="/mes-missions">← Mes missions</a>
          </p>

          <h1 className="titre-page">{mission.titre}</h1>
          <p className="secondaire ligne-meta">
            <span>
              {mission.raisonSociale} · {mission.ville}
              {distance !== null && ` · ${enKm(distance)} de chez vous`}
            </span>
            <span className="pastille pastille--info">{libelleEtat(etat)}</span>
          </p>
          <p className="secondaire">
            Du {enDateFr(mission.dateDebut)} au {enDateFr(mission.dateFin)} · {joursMission} jours
            {mission.tauxHoraireMin !== null && (
              <>
                {" · "}
                {enEuros(mission.tauxHoraireMin)}
                {mission.tauxHoraireMax !== null && mission.tauxHoraireMax !== mission.tauxHoraireMin
                  ? ` à ${enEuros(mission.tauxHoraireMax)}`
                  : ""}
                {" /h"}
              </>
            )}
          </p>

          {/* Le verdict d'abord, et la raison avec lui : un intérimaire qui découvre
              qu'il est écarté doit apprendre dans la même phrase ce qui le débloque. */}
          <div className={`carte ${conforme ? "carte--verdict-ok" : "carte--verdict-bloque"}`}>
            <div className="tete-carte">
              <h2 className="titre-carte">
                {conforme
                  ? "Vous pouvez travailler sur ce chantier"
                  : bloquantes.length === 1
                    ? "Une habilitation vous en écarte"
                    : `${bloquantes.length} habilitations vous en écartent`}
              </h2>
              <PastilleConformite etat={conforme ? "valide" : bloquantes[0]!.etat} />
            </div>
            <p className="petit secondaire" style={{ margin: 0 }}>
              {conforme
                ? "Toutes les habilitations exigées couvrent la durée de la mission."
                : "La validité est comparée à la date de fin du chantier, pas à celle du jour : un titre valable aujourd'hui peut ne pas suffire."}
            </p>

            {!conforme && (
              <p className="petit" style={{ margin: "0.75rem 0 0" }}>
                <a href="/espace/interimaire/certifications">Mettre à jour mes habilitations</a>
              </p>
            )}

            <div className="separation-action">
              <ActionCandidature
                missionId={missionId}
                acteur="interimaire"
                etat={etat}
                retour={`/mes-missions/${missionId}`}
                conclusion={
                  etat === "acceptee"
                    ? "Vous êtes affecté à ce chantier. L'entreprise a été prévenue."
                    : etat === "declinee"
                      ? `Vous avez décliné cette mission.${candidature?.motif ? ` Motif : ${candidature.motif}` : ""}`
                      : etat === "expiree"
                        ? "Cette mission a été pourvue par quelqu'un d'autre."
                        : "Votre candidature est en cours d'examen par l'entreprise."
                }
              />
              {/* Une fois l'affectation conclue, c'est le document qui compte : il
                  porte les six mentions obligatoires, et c'est l'intérimaire qui doit
                  pouvoir le présenter sur le chantier. */}
              {etat === "acceptee" && (
                <p className="petit" style={{ margin: "0.75rem 0 0" }}>
                  <a className="bouton bouton--secondaire lien-bloc" href={`/mes-missions/${missionId}/document`}>
                    Mon document de mission
                  </a>
                </p>
              )}
            </div>
          </div>

          {/* Une fois l'affectation conclue, l'écran doit servir à s'y rendre :
              adresse, horaires, et qui appeler quand le portail est fermé. */}
          {etat === "acceptee" && <FicheChantier missionId={missionId} />}

          <h2>Habilitations exigées</h2>
          <ListeConformite
            exigences={conformite}
            vide="Cette mission n'exige aucune habilitation particulière."
          />

          {mission.description && (
            <>
              <h2>Le chantier</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{mission.description}</p>
            </>
          )}

          {moi && (
            <>
              <h2>Ce que ça donne pour vous</h2>
              <ul className="liste-nue lignes">
                <li className="ligne">
                  <span>
                    <strong className="petit">Distance</strong>
                    <span className="petit secondaire">
                      {" "}
                      pour une zone déclarée de {moi.rayonMobiliteKm} km
                    </span>
                  </span>
                  <span className={distance !== null && distance <= moi.rayonMobiliteKm ? "pastille pastille--ok" : "pastille pastille--attention"}>
                    {distance !== null ? enKm(distance) : "—"}
                  </span>
                </li>
                <li className="ligne">
                  <span>
                    <strong className="petit">Jours couverts</strong>
                    <span className="petit secondaire"> par vos disponibilités déclarées</span>
                  </span>
                  <span className={couverts >= joursMission ? "pastille pastille--ok" : "pastille pastille--attention"}>
                    {couverts}/{joursMission}
                  </span>
                </li>
              </ul>
              {couverts < joursMission && (
                <p className="petit secondaire">
                  <a href="/espace/interimaire/disponibilites">Ajuster mes disponibilités</a>
                </p>
              )}
            </>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
