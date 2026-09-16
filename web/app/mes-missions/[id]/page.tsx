import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connexion } from "@interimatch/core/db";
import { distanceKm, joursDeChevauchement, nombreDeJours, matcher, typeCertification } from "@interimatch/core";
import { exigerSession } from "@/lib/garde";
import { chargerMission, chargerProfils } from "@/lib/depot";

export const metadata: Metadata = { title: "Détail de la mission", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

export default async function DetailMissionInterimaire({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerSession("interimaire");
  const { id } = await params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId)) notFound();

  const sql = connexion();
  try {
    const mission = await chargerMission(sql, missionId);
    // Seules les missions publiées sont consultables : un brouillon appartient à
    // l'entreprise qui le rédige.
    if (!mission || mission.statut !== "publiee") notFound();

    const profils = await chargerProfils(sql, mission.metierCode);
    const moi = profils.find((p) => p.interimaireId === session.compteId);
    const resultat = matcher(mission, profils);
    const retenu = resultat.retenus.find((r) => r.interimaireId === session.compteId);
    const ecarte = resultat.ecartes.find((e) => e.interimaireId === session.compteId);

    // État détenu pour chaque habilitation exigée : c'est ce qui permet à
    // l'intérimaire de savoir quoi renouveler, et pas seulement qu'il est écarté.
    const etatExigences = mission.certificationsRequises.map((exigence) => {
      const detenues = (moi?.certifications ?? []).filter(
        (c) =>
          c.typeCode === exigence.typeCode &&
          (exigence.categorieCode === null || c.categorieCode === exigence.categorieCode)
      );
      const meilleure = detenues.sort((a, b) => b.dateEcheance.localeCompare(a.dateEcheance))[0];
      return {
        libelle:
          (typeCertification(exigence.typeCode)?.libelle ?? exigence.typeCode) +
          (exigence.categorieCode ? ` — catégorie ${exigence.categorieCode}` : ""),
        etat: !meilleure
          ? ("absente" as const)
          : meilleure.dateEcheance >= mission.dateFin
            ? ("valide" as const)
            : ("trop_tot" as const),
        dateEcheance: meilleure?.dateEcheance ?? null,
      };
    });

    const distance = moi ? Math.round(distanceKm(moi, mission) * 10) / 10 : null;
    const joursMission = nombreDeJours(mission);
    const couverts = moi ? joursDeChevauchement(mission, moi.disponibilites) : 0;

    return (
      <section className="section">
        <div className="colonne colonne--formulaire">
          <p className="petit secondaire"><a href="/mes-missions">← Les missions</a></p>
          <h1>{mission.titre}</h1>
          <p className="secondaire">
            {mission.raisonSociale} · {mission.ville} · du {enDateFr(mission.dateDebut)} au{" "}
            {enDateFr(mission.dateFin)} · {joursMission} jours
            {mission.tauxHoraireMin !== null && (
              <> · {mission.tauxHoraireMin.toFixed(2)} €/h
                {mission.tauxHoraireMax !== null && mission.tauxHoraireMax !== mission.tauxHoraireMin && (
                  <> à {mission.tauxHoraireMax.toFixed(2)} €/h</>
                )}
              </>
            )}
          </p>

          <div className={`bandeau ${retenu ? "bandeau--ok" : ecarte ? "bandeau--alerte" : "bandeau--neutre"}`}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {retenu
                ? `Vous êtes conforme pour cette mission — compatibilité ${Math.round(retenu.total * 100)} %`
                : ecarte
                  ? "Il vous manque une habilitation pour cette mission"
                  : "Ce métier n'est pas déclaré sur votre profil"}
            </p>
            {!retenu && !ecarte && (
              <p className="petit" style={{ margin: "0.4rem 0 0" }}>
                Ajoutez-le depuis <a href="/espace/interimaire/profil">votre profil</a> pour
                savoir si vous y êtes conforme.
              </p>
            )}
          </div>

          {mission.description && (
            <>
              <h2>Le chantier</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{mission.description}</p>
            </>
          )}

          <h2>Habilitations exigées</h2>
          {etatExigences.length === 0 ? (
            <p className="secondaire">Cette mission n&apos;exige aucune habilitation particulière.</p>
          ) : (
            <ul className="liste-nue">
              {etatExigences.map((e) => (
                <li key={e.libelle} className="carte" style={{ marginBottom: "0.6rem" }}>
                  <div className="ligne-certification">
                    <div>
                      <h3 style={{ fontSize: "1rem", margin: 0 }}>{e.libelle}</h3>
                      {e.etat === "trop_tot" && e.dateEcheance && (
                        <p className="petit secondaire" style={{ margin: "0.3rem 0 0" }}>
                          Le vôtre expire le {enDateFr(e.dateEcheance)}, avant la fin du chantier
                          le {enDateFr(mission.dateFin)}.
                        </p>
                      )}
                      {e.etat === "valide" && e.dateEcheance && (
                        <p className="petit secondaire" style={{ margin: "0.3rem 0 0" }}>
                          Le vôtre est valable jusqu&apos;au {enDateFr(e.dateEcheance)}.
                        </p>
                      )}
                    </div>
                    <span
                      className={`etiquette ${
                        e.etat === "valide" ? "etiquette--ok" : e.etat === "trop_tot" ? "etiquette--attention" : "etiquette--alerte"
                      }`}
                    >
                      {e.etat === "valide" ? "Vous l'avez" : e.etat === "trop_tot" ? "Expire trop tôt" : "Manquante"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {moi && (
            <>
              <h2>Ce que ça donne pour vous</h2>
              <ul className="liste-nue grille grille--3">
                <li className="carte">
                  <p className="statistique" style={{ fontSize: "1.75rem" }}>{distance} km</p>
                  <p className="petit secondaire" style={{ margin: 0 }}>
                    du chantier, pour une zone déclarée de {moi.rayonMobiliteKm} km
                  </p>
                </li>
                <li className="carte">
                  <p className="statistique" style={{ fontSize: "1.75rem" }}>{couverts}/{joursMission}</p>
                  <p className="petit secondaire" style={{ margin: 0 }}>
                    jours couverts par vos disponibilités
                  </p>
                </li>
                <li className="carte">
                  <p className="statistique" style={{ fontSize: "1.75rem" }}>
                    {retenu ? `${Math.round(retenu.competences * 100)} %` : "—"}
                  </p>
                  <p className="petit secondaire" style={{ margin: 0 }}>
                    des compétences attendues
                  </p>
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
