import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connexion } from "@interimatch/core/db";
import { distanceKm, estConforme, joursDeChevauchement, libelleEtat, nombreDeJours, type EtatCandidature } from "@interimatch/core";
import ActionCandidature from "@/components/ActionCandidature";
import { ListeConformite, PastilleConformite } from "@/components/Conformite";
import { exigerSession } from "@/lib/garde";
import { chargerMission, chargerProfils } from "@/lib/depot";
import { chargerMissionPourConformite, conformiteDetaillee } from "@/lib/candidatures";

export const metadata: Metadata = { title: "Profil du candidat", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");
const enKm = (km: number) => `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;

/**
 * Un profil, vu depuis la mission d'où l'on vient.
 *
 * La validité d'une habilitation n'a de sens que rapportée à des dates de chantier :
 * une fiche de profil « dans l'absolu » afficherait des titres valides pour une
 * mission et périmés pour la suivante. C'est pourquoi cette page vit sous la mission,
 * et non sous une liste de candidats.
 */
export default async function ProfilPourMission({
  params,
}: {
  params: Promise<{ id: string; interimaireId: string }>;
}) {
  const session = await exigerSession("entreprise");
  const { id, interimaireId: brut } = await params;
  const missionId = Number(id);
  const interimaireId = Number(brut);
  if (!Number.isInteger(missionId) || !Number.isInteger(interimaireId)) notFound();

  const sql = connexion();
  try {
    const mission = await chargerMission(sql, missionId);
    if (!mission || mission.entrepriseId !== session.compteId) notFound();

    const profils = await chargerProfils(sql, mission.metierCode);
    const profil = profils.find((p) => p.interimaireId === interimaireId);
    if (!profil) notFound();

    const [identite] = await sql<{ prenom: string; nom: string; ville: string; metiers: string[] }[]>`
      select i.prenom, i.nom, i.ville,
             coalesce(array_agg(m.libelle) filter (where m.libelle is not null), '{}') as metiers
      from interimaire i
      left join interimaire_metier im on im.interimaire_id = i.compte_id
      left join metier m on m.code = im.metier_code
      where i.compte_id = ${interimaireId}
      group by i.prenom, i.nom, i.ville`;
    if (!identite) notFound();

    const pourConformite = (await chargerMissionPourConformite(sql, missionId))!;
    const conformite = await conformiteDetaillee(sql, pourConformite, interimaireId);
    const conforme = estConforme(conformite);
    const bloquantes = conformite.filter((c) => c.bloquant);

    const [candidature] = await sql<{ statut: EtatCandidature; motif: string | null }[]>`
      select statut, motif from candidature
      where mission_id = ${missionId} and interimaire_id = ${interimaireId}`;
    const etat: EtatCandidature = candidature?.statut ?? "proposee";

    const distance = Math.round(distanceKm(profil, mission) * 10) / 10;
    const joursMission = nombreDeJours(mission);
    const couverts = joursDeChevauchement(mission, profil.disponibilites);

    return (
      <section className="section">
        <div className="colonne colonne--formulaire">
          <p className="petit secondaire">
            <a href={`/missions/${missionId}`}>← {mission.titre}</a>
          </p>

          <h1 className="titre-page">
            {identite.prenom} {identite.nom}
          </h1>
          <p className="secondaire ligne-meta">
            <span>
              {identite.ville} · {enKm(distance)} du chantier · rayon déclaré{" "}
              {profil.rayonMobiliteKm} km
            </span>
            <span className="pastille pastille--info">{libelleEtat(etat)}</span>
          </p>

          {/* Le verdict est rendu du point de vue de cette mission-ci, jamais dans
              l'absolu : c'est la date de fin de chantier qui décide. */}
          <div className={`carte ${conforme ? "carte--verdict-ok" : "carte--verdict-bloque"}`}>
            <div className="tete-carte">
              <h2 className="titre-carte">
                {conforme
                  ? "Conforme pour ce chantier"
                  : bloquantes.length === 1
                    ? "Une habilitation l'écarte de ce chantier"
                    : `${bloquantes.length} habilitations l'écartent de ce chantier`}
              </h2>
              <PastilleConformite etat={conforme ? "valide" : bloquantes[0]!.etat} />
            </div>
            <p className="petit secondaire" style={{ margin: 0 }}>
              {conforme
                ? `Toutes les habilitations exigées couvrent la mission jusqu'au ${enDateFr(mission.dateFin)}.`
                : "Affecter ce profil engagerait votre responsabilité : la validité se juge à la date de fin de chantier, pas à celle du jour."}
            </p>

            <div className="separation-action">
              <ActionCandidature
                missionId={missionId}
                interimaireId={interimaireId}
                acteur="entreprise"
                etat={etat}
                retour={`/missions/${missionId}/profils/${interimaireId}`}
                conclusion={
                  etat === "acceptee"
                    ? `${identite.prenom} est affecté à ce chantier.`
                    : etat === "declinee"
                      ? `Dossier clos.${candidature?.motif ? ` Motif : ${candidature.motif}` : ""}`
                      : etat === "expiree"
                        ? "La mission a été pourvue par quelqu'un d'autre."
                        : `En attente de la réponse de ${identite.prenom}.`
                }
              />
            </div>
          </div>

          <h2>Habilitations exigées par cette mission</h2>
          <ListeConformite
            exigences={conformite}
            vide="Cette mission n'exige aucune habilitation particulière."
          />

          <h2>Métiers déclarés</h2>
          {identite.metiers.length === 0 ? (
            <p className="secondaire">Aucun métier déclaré.</p>
          ) : (
            <ul className="liste-nue puces">
              {identite.metiers.map((m) => (
                <li key={m} className="puce puce--acquise">{m}</li>
              ))}
            </ul>
          )}

          <h2>Disponibilités et distance</h2>
          <ul className="liste-nue lignes">
            <li className="ligne">
              <span>
                <strong className="petit">Jours couverts</strong>
                <span className="petit secondaire"> sur les {joursMission} jours du chantier</span>
              </span>
              <span className={couverts >= joursMission ? "pastille pastille--ok" : "pastille pastille--attention"}>
                {couverts}/{joursMission}
              </span>
            </li>
            <li className="ligne">
              <span>
                <strong className="petit">Distance</strong>
                <span className="petit secondaire"> pour un rayon déclaré de {profil.rayonMobiliteKm} km</span>
              </span>
              <span className={distance <= profil.rayonMobiliteKm ? "pastille pastille--ok" : "pastille pastille--attention"}>
                {enKm(distance)}
              </span>
            </li>
          </ul>
          {profil.disponibilites.length > 0 && (
            <ul className="liste-nue lignes">
              {profil.disponibilites.map((d) => (
                <li key={d.dateDebut} className="ligne">
                  <span className="petit">
                    {enDateFr(d.dateDebut)} → {enDateFr(d.dateFin)}
                  </span>
                  <span className="pastille pastille--ok">Disponible</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
