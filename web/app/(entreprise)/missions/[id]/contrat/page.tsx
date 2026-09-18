import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connexion } from "@interimatch/core/db";
import {
  ARTICLE_DUREE_MAX,
  DUREE_MAX_MOIS,
  LIBELLE_MENTION,
  MENTIONS_OBLIGATOIRES,
  mentionsManquantes,
  moisEntre,
  typeCertification,
} from "@interimatch/core";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = { title: "Contrat de mission", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");
const enEuros = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

interface Ligne {
  titre: string;
  description: string | null;
  adresse: string | null;
  code_postal: string;
  ville: string;
  date_debut: string;
  date_fin: string;
  horaires: string | null;
  taux_horaire_min: string | null;
  taux_horaire_max: string | null;
  metier_libelle: string | null;
  raison_sociale: string;
  siret: string | null;
  entreprise_ville: string;
  affecte_prenom: string | null;
  affecte_nom: string | null;
}

/**
 * Document de mission.
 *
 * Le sujet impose de respecter les grandes règles de l'intérim. Deux se vérifient par
 * le logiciel : la durée maximale, opposée à la saisie, et les mentions obligatoires,
 * rassemblées ici.
 *
 * **Ce n'est pas un contrat de travail.** Le contrat lie l'agence d'emploi et le
 * salarié temporaire ; ce document récapitule ce que l'entreprise utilisatrice doit
 * fournir pour qu'il puisse être établi. Le dire est plus honnête que de laisser
 * croire qu'une signature en ligne tiendrait lieu d'engagement — la signature
 * électronique est d'ailleurs hors périmètre.
 */
export default async function ContratMission({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerSession("entreprise");
  const { id } = await params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId)) notFound();

  const sql = connexion();
  try {
    const [m] = await sql<Ligne[]>`
      select m.titre, m.description, m.adresse, m.code_postal, m.ville,
             m.date_debut::text, m.date_fin::text, m.horaires,
             m.taux_horaire_min::text, m.taux_horaire_max::text,
             met.libelle as metier_libelle,
             e.raison_sociale, e.siret, e.ville as entreprise_ville,
             i.prenom as affecte_prenom, i.nom as affecte_nom
      from mission m
      join entreprise e on e.compte_id = m.entreprise_id
      left join metier met on met.code = m.metier_code
      left join interimaire i on i.compte_id = m.interimaire_affecte_id
      where m.id = ${missionId} and m.entreprise_id = ${session.compteId}`;
    if (!m) notFound();

    const exigences = await sql<{ type_code: string; categorie_code: string | null }[]>`
      select mcr.type_code, cat.code as categorie_code
      from mission_certification_requise mcr
      left join categorie_certification cat on cat.id = mcr.categorie_id
      where mcr.mission_id = ${missionId}`;

    const tauxMin = m.taux_horaire_min === null ? null : Number(m.taux_horaire_min);
    const tauxMax = m.taux_horaire_max === null ? null : Number(m.taux_horaire_max);

    const manquantes = mentionsManquantes({
      titre: m.titre,
      metierLibelle: m.metier_libelle,
      dateFin: m.date_fin,
      ville: m.ville,
      horaires: m.horaires,
      tauxHoraireMin: tauxMin,
    });

    const mois = moisEntre(m.date_debut, m.date_fin);
    const qualification = [
      m.metier_libelle,
      ...exigences.map(
        (e) =>
          (typeCertification(e.type_code)?.libelle ?? e.type_code.replace(/_/g, " ")) +
          (e.categorie_code ? ` — catégorie ${e.categorie_code}` : "")
      ),
    ].filter(Boolean);

    const valeurs: Record<string, React.ReactNode> = {
      poste: m.titre,
      qualification: qualification.join(" · "),
      terme: `Du ${enDateFr(m.date_debut)} au ${enDateFr(m.date_fin)} (${mois === 0 ? "moins d'un mois" : `${mois} mois`})`,
      lieu: [m.adresse, `${m.code_postal} ${m.ville}`].filter(Boolean).join(", "),
      horaires: m.horaires,
      remuneration:
        tauxMin === null
          ? null
          : tauxMax !== null && tauxMax !== tauxMin
            ? `De ${enEuros(tauxMin)} à ${enEuros(tauxMax)} brut par heure`
            : `${enEuros(tauxMin)} brut par heure`,
    };

    return (
      <section className="section">
        <div className="colonne colonne--formulaire">
          <p className="petit secondaire">
            <a href={`/missions/${missionId}`}>← {m.titre}</a>
          </p>

          <h1 className="titre-page">Document de mission</h1>
          <p className="secondaire">
            Récapitulatif des mentions que l&apos;entreprise utilisatrice doit fournir pour
            qu&apos;un contrat de mission puisse être établi. Ce document n&apos;est pas le
            contrat de travail temporaire : celui-ci lie l&apos;agence d&apos;emploi et le
            salarié.
          </p>

          {manquantes.length > 0 ? (
            <div className="carte carte--verdict-bloque">
              <h2 className="titre-carte">
                {manquantes.length === 1
                  ? "Une mention obligatoire manque"
                  : `${manquantes.length} mentions obligatoires manquent`}
              </h2>
              <p className="petit secondaire" style={{ margin: "0 0 0.75rem" }}>
                Un contrat de mission incomplet est irrégulier. Complétez la fiche de poste.
              </p>
              <ul className="liste-nue puces">
                {manquantes.map((mention) => (
                  <li key={mention} className="puce">{LIBELLE_MENTION[mention]}</li>
                ))}
              </ul>
              <p className="petit" style={{ margin: "1rem 0 0" }}>
                <a href={`/missions/${missionId}`}>Compléter la fiche</a>
              </p>
            </div>
          ) : (
            <div className="carte carte--verdict-ok">
              <h2 className="titre-carte">Toutes les mentions obligatoires sont renseignées</h2>
              <p className="petit secondaire" style={{ margin: 0 }}>
                Durée de {mois === 0 ? "moins d&apos;un mois" : `${mois} mois`}, dans la limite
                de {DUREE_MAX_MOIS} mois fixée par l&apos;{ARTICLE_DUREE_MAX}.
              </p>
            </div>
          )}

          <h2>Entreprise utilisatrice</h2>
          <ul className="liste-nue lignes">
            <li className="ligne">
              <span className="petit">Raison sociale</span>
              <strong className="petit">{m.raison_sociale}</strong>
            </li>
            {m.siret && (
              <li className="ligne">
                <span className="petit">SIRET</span>
                <strong className="petit">{m.siret}</strong>
              </li>
            )}
          </ul>

          <h2>Mentions obligatoires</h2>
          <ul className="liste-nue lignes">
            {MENTIONS_OBLIGATOIRES.map((mention) => (
              <li key={mention} className="ligne">
                <span>
                  <strong className="petit">{LIBELLE_MENTION[mention]}</strong>
                  <p className="petit secondaire" style={{ margin: "0.15rem 0 0" }}>
                    {valeurs[mention] ?? "— non renseigné"}
                  </p>
                </span>
                <span className={manquantes.includes(mention) ? "pastille pastille--alerte" : "pastille pastille--ok"}>
                  {manquantes.includes(mention) ? "Manquante" : "Renseignée"}
                </span>
              </li>
            ))}
          </ul>

          {m.affecte_prenom && (
            <>
              <h2>Salarié affecté</h2>
              <p>
                {m.affecte_prenom} {m.affecte_nom}
              </p>
            </>
          )}

          {m.description && (
            <>
              <h2>Description du poste</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{m.description}</p>
            </>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
