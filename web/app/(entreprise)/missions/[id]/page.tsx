import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connexion } from "@interimatch/core/db";
import { typeCertification } from "@interimatch/core";
import AffectationConclue from "@/components/AffectationConclue";
import CandidaturesRecues from "@/components/CandidaturesRecues";
import ResultatsMatching from "@/components/ResultatsMatching";
import StatutMission from "@/components/StatutMission";
import { exigerSession } from "@/lib/garde";
import { chargerMission } from "@/lib/depot";

export const metadata: Metadata = {
  title: "Candidats de la mission",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

export default async function DetailMission({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerSession("entreprise");
  const { id } = await params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId)) notFound();

  const sql = connexion();
  try {
    const mission = await chargerMission(sql, missionId);
    // Une mission qui n'appartient pas à l'entreprise est traitée comme inexistante :
    // un « accès refusé » confirmerait qu'elle existe.
    if (!mission || mission.entrepriseId !== session.compteId) notFound();

    return (
      <section className="section">
        <div className="colonne">
          <p className="petit secondaire">
            <a href="/missions">← Mes fiches de poste</a>
          </p>
          <h1 className="titre-page">{mission.titre}</h1>
          <p className="petit secondaire">
            <a href={`/missions/${missionId}/contrat`}>Document de mission et mentions obligatoires</a>
          </p>
          <p className="secondaire">
            {mission.ville} · du {enDateFr(mission.dateDebut)} au {enDateFr(mission.dateFin)}
            {mission.tauxHoraireMin !== null && (
              <> · {mission.tauxHoraireMin.toFixed(2)} €/h
                {mission.tauxHoraireMax !== null && mission.tauxHoraireMax !== mission.tauxHoraireMin && (
                  <> à {mission.tauxHoraireMax.toFixed(2)} €/h</>
                )}
              </>
            )}
          </p>

          <StatutMission
            missionId={missionId}
            statut={mission.statut as "brouillon" | "publiee" | "pourvue" | "close"}
          />
          {mission.statut !== "pourvue" && mission.statut !== "close" && (
            <p className="petit" style={{ margin: "0.75rem 0 0" }}>
              <a href={`/missions/${missionId}/modifier`}>Modifier cette fiche</a>
            </p>
          )}

          {mission.certificationsRequises.length > 0 && (
            <div className="carte" style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1rem" }}>Habilitations exigées</h2>
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {mission.certificationsRequises.map((c) => (
                  <li key={c.typeCode}>
                    {typeCertification(c.typeCode)?.libelle ?? c.typeCode}
                    {c.categorieCode && ` - catégorie ${c.categorieCode}`}
                  </li>
                ))}
              </ul>
              <p className="petit secondaire" style={{ margin: "0.75rem 0 0" }}>
                Validité vérifiée contre le <strong>{enDateFr(mission.dateFin)}</strong>, date
                de fin de la mission - pas contre la date du jour.
              </p>
            </div>
          )}

          {/* Une fois pourvue, la question n'est plus « qui pourrait venir » mais
              « qui vient » : le nom et le numéro passent devant tout le reste. */}
          {mission.statut === "pourvue" && (
            <AffectationConclue missionId={missionId} />
          )}

          {/* Les candidatures d'abord : quelqu'un qui a levé la main compte plus
              qu'un profil que le moteur a seulement suggéré. */}
          <CandidaturesRecues missionId={missionId} entrepriseId={session.compteId} />

          <ResultatsMatching missionId={missionId} />
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
