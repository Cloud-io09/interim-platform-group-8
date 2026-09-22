import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connexion } from "@interimatch/core/db";
import FormulaireMission, { type MissionAModifier } from "@/components/FormulaireMission";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Modifier la fiche",
  robots: { index: false, follow: false },
};

export default async function ModifierMission({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerSession("entreprise");
  const missionId = Number((await params).id);
  if (!Number.isInteger(missionId)) notFound();

  const sql = connexion();
  try {
    const [m] = await sql<
      {
        id: number; titre: string; metier_code: string; description: string | null;
        adresse: string | null; code_postal: string; ville: string;
        date_debut: string; date_fin: string; horaires: string | null;
        taux_horaire_min: string | null; taux_horaire_max: string | null; statut: string;
      }[]
    >`
      select id, titre, metier_code, description, adresse, code_postal, ville,
             date_debut::text, date_fin::text, horaires,
             taux_horaire_min::text, taux_horaire_max::text, statut
        from mission where id = ${missionId} and entreprise_id = ${session.compteId}`;
    if (!m) notFound();

    const exigences = await sql<{ type_code: string; categorie_code: string | null }[]>`
      select mcr.type_code, cat.code as categorie_code
        from mission_certification_requise mcr
        left join categorie_certification cat on cat.id = mcr.categorie_id
       where mcr.mission_id = ${missionId}`;
    const competences = await sql<{ competence_code: string }[]>`
      select competence_code from mission_competence where mission_id = ${missionId}`;

    const initiale: MissionAModifier = {
      id: m.id,
      titre: m.titre,
      metierCode: m.metier_code,
      description: m.description,
      adresse: m.adresse,
      codePostal: m.code_postal,
      ville: m.ville,
      dateDebut: m.date_debut,
      dateFin: m.date_fin,
      horaires: m.horaires,
      tauxHoraireMin: m.taux_horaire_min === null ? null : Number(m.taux_horaire_min),
      tauxHoraireMax: m.taux_horaire_max === null ? null : Number(m.taux_horaire_max),
      certificationsRequises: exigences.map((e) => ({
        typeCode: e.type_code,
        categorieCode: e.categorie_code,
      })),
      competencesRequises: competences.map((c) => c.competence_code),
    };

    return (
      <section className="section">
        <div className="colonne colonne--formulaire">
          <p className="petit secondaire"><a href={`/missions/${missionId}`}>← {m.titre}</a></p>
          <h1 className="titre-page">Modifier la fiche</h1>
          {m.statut === "pourvue" || m.statut === "close" ? (
            <div className="carte carte--verdict-bloque">
              <h2 className="titre-carte">Cette fiche ne se modifie plus</h2>
              <p className="petit secondaire">
                Son contenu a servi de base à un engagement : le réécrire ferait mentir
                le document de mission déjà remis à l&apos;intérimaire.
              </p>
            </div>
          ) : (
            <>
              <p className="secondaire">
                Les profils déjà rapprochés seront réévalués : modifier une habilitation
                exigée change qui peut aller sur ce chantier.
              </p>
              <FormulaireMission initiale={initiale} />
            </>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
