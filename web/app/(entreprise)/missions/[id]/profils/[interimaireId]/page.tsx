import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connexion } from "@interimatch/core/db";
import { distanceKm, estConforme, joursDeChevauchement, libelleEtat, nombreDeJours, type EtatCandidature } from "@interimatch/core";
import ActionCandidature from "@/components/ActionCandidature";
import { ListeConformite, PastilleConformite } from "@/components/Conformite";
import { dechiffrerOptionnel } from "@interimatch/core";
import { exigerSession } from "@/lib/garde";
import { dejaDebloque, lireDroits } from "@/lib/deblocage";
import Paywall from "@/components/Paywall";
import { chargerMission, chargerProfils } from "@/lib/depot";
import { chargerMissionPourConformite, conformiteDetaillee } from "@/lib/candidatures";
import { chargerExperience } from "@/lib/experience";
import Experience from "@/components/Experience";

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
  searchParams,
}: {
  params: Promise<{ id: string; interimaireId: string }>;
  searchParams: Promise<{ debloque?: string }>;
}) {
  const session = await exigerSession("entreprise");
  const { id, interimaireId: brut } = await params;
  const { debloque: vientDeDebloquer } = await searchParams;
  const missionId = Number(id);
  const interimaireId = Number(brut);
  if (!Number.isInteger(missionId) || !Number.isInteger(interimaireId)) notFound();

  const sql = connexion();
  try {
    const mission = await chargerMission(sql, missionId);
    if (!mission || mission.entrepriseId !== session.compteId) notFound();

    // Le profil demandé est chargé même s'il n'a pas déclaré ce métier : il a pu
    // postuler, et l'écran rendait alors un 404 pour quelqu'un dont la candidature
    // s'affichait juste à côté.
    const profils = await chargerProfils(sql, mission.metierCode, [interimaireId]);
    const profil = profils.find((p) => p.interimaireId === interimaireId);
    if (!profil) notFound();

    const [identite] = await sql<
      { prenom: string; nom: string; ville: string; telephone_chiffre: string | null; email: string }[]
    >`
      select i.prenom, i.nom, i.ville, i.telephone_chiffre, c.email
        from interimaire i join compte c on c.id = i.compte_id
       where i.compte_id = ${interimaireId}`;
    if (!identite) notFound();

    // L'expérience accompagne le métier auquel elle se rapporte : « huit ans en
    // maçonnerie » veut dire quelque chose, « huit ans » tout court, non.
    const metiersDeclares = await sql<{ code: string; libelle: string; annees_experience: number | null }[]>`
      select m.code, m.libelle, im.annees_experience
      from interimaire_metier im
      join metier m on m.code = im.metier_code
      where im.interimaire_id = ${interimaireId}
      order by im.annees_experience desc nulls last, m.libelle`;
    const experience = await chargerExperience(sql, interimaireId);

    const pourConformite = (await chargerMissionPourConformite(sql, missionId))!;
    const conformite = await conformiteDetaillee(sql, pourConformite, interimaireId);
    const conforme = estConforme(conformite);
    const bloquantes = conformite.filter((c) => c.bloquant);

    const [candidature] = await sql<{ statut: EtatCandidature; motif: string | null }[]>`
      select statut, motif from candidature
      where mission_id = ${missionId} and interimaire_id = ${interimaireId}`;
    const etat: EtatCandidature = candidature?.statut ?? "proposee";

    // **Ce que l'entreprise voit sans payer, et ce qu'elle paie.**
    //
    // Gratuit : que ce profil est rapproché, son score, sa conformité habilitation
    // par habilitation, sa distance, ses disponibilités — tout ce qui sert à
    // *décider*. Payant : l'identité et les coordonnées, soit ce qui sert à *agir*.
    //
    // Le verdict de conformité reste de l'autre côté de la barrière, délibérément :
    // ce produit existe pour empêcher qu'on envoie quelqu'un sans titre valable, et
    // faire payer ce verdict reviendrait à vendre le risque.
    // **Le nombre d'agences est gratuit, leur identité ne l'est pas.**
    //
    // Savoir qu'un profil est déjà inscrit quelque part change la décision : la mise
    // en place sera rapide, ou il faudra l'inscrire dans sa propre agence. C'est donc
    // une information de décision, et le produit ne fait jamais payer celles-là.
    // Savoir *laquelle* et pouvoir l'appeler sert à agir : c'est derrière le
    // déblocage, avec le téléphone.
    const agences = await sql<{ nom: string; ville: string | null }[]>`
      select nom, ville from interimaire_agence
       where interimaire_id = ${interimaireId} order by nom`;

    const debloque = await dejaDebloque(sql, session.compteId, interimaireId, missionId);
    const droits = debloque ? null : await lireDroits(sql, session.compteId);

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
            {debloque ? (
              `${identite.prenom} ${identite.nom}`
            ) : (
              <>
                {identite.prenom} {identite.nom.charAt(0)}.
                <span className="petit secondaire" style={{ marginLeft: "0.5rem", fontWeight: 400 }}>
                  identité masquée
                </span>
              </>
            )}
          </h1>
          <p className="secondaire ligne-meta">
            <span>
              {identite.ville} · {enKm(distance)} du chantier · rayon déclaré{" "}
              {profil.rayonMobiliteKm} km
            </span>
            <span className="pastille pastille--info">{libelleEtat(etat)}</span>
            <span className={agences.length > 0 ? "pastille pastille--ok" : "pastille pastille--attention"}>
              {agences.length > 0
                ? `✓ inscrit dans ${agences.length} agence${agences.length > 1 ? "s" : ""}`
                : "△ aucune agence déclarée"}
            </span>
          </p>
          {agences.length === 0 && (
            <p className="petit secondaire">
              Le contrat de mission passe par une agence d&apos;emploi. Ce profil n&apos;en
              déclare aucune : il faudra l&apos;inscrire dans la vôtre, ce qui rallonge la
              mise en place de quelques jours.
            </p>
          )}

          {/* Le rechargement effaçait tout message : l'écran changeait sans rien
              dire, et on se demandait si le crédit était parti. */}
          {vientDeDebloquer === "1" && debloque && (
            <p className="bandeau bandeau--ok" role="status">
              <span>
                <strong>Coordonnées débloquées.</strong> Ce déblocage vaut pour{" "}
                {identite.prenom} sur cette mission ; il ne sera pas redemandé.
              </span>
              <a className="bouton bouton--secondaire" href="/espace/entreprise/abonnement">
                Voir mon solde
              </a>
            </p>
          )}

          {/* **Ce que le déblocage rend.** Il ne donnait qu'un nom de famille, ce qui
              ne valait pas son prix : on paie pour pouvoir joindre quelqu'un, pas
              pour lire une identité. Téléphone et adresse apparaissent ici, et nulle
              part ailleurs — c'est la seule page où le déblocage a été payé. */}
          {debloque && (
            <div className="carte carte--notification">
              <h2 className="titre-carte">Coordonnées</h2>
              <ul className="liste-nue">
                <li className="ligne">
                  <span>Téléphone</span>
                  {dechiffrerOptionnel(identite.telephone_chiffre) ? (
                    <strong>
                      <a href={`tel:${dechiffrerOptionnel(identite.telephone_chiffre)}`}>
                        {dechiffrerOptionnel(identite.telephone_chiffre)}
                      </a>
                    </strong>
                  ) : (
                    <span className="petit secondaire">non renseigné</span>
                  )}
                </li>
                <li className="ligne">
                  <span>Adresse e-mail</span>
                  <strong>
                    <a href={`mailto:${identite.email}`}>{identite.email}</a>
                  </strong>
                </li>
              </ul>
              {agences.length > 0 && (
                <>
                  <h3 style={{ fontSize: "1rem" }}>Son agence d&apos;emploi</h3>
                  <ul className="liste-nue">
                    {agences.map((a) => (
                      <li key={`${a.nom}-${a.ville}`} className="ligne">
                        <span>{a.ville ?? "—"}</span>
                        <strong>{a.nom}</strong>
                      </li>
                    ))}
                  </ul>
                  <p className="petit secondaire">
                    C&apos;est elle qui établit le contrat de mission : c&apos;est elle
                    qu&apos;il faut contacter, pas nous.
                  </p>
                </>
              )}
              <p className="petit secondaire">
                {identite.prenom} sait qu&apos;une entreprise a accédé à ses coordonnées
                pour cette mission. Elles ne servent qu&apos;à ce chantier.
              </p>
            </div>
          )}

          {droits && (
            <Paywall
              interimaireId={interimaireId}
              missionId={missionId}
              prenom={identite.prenom}
              plan={droits.plan.libelle}
              quotaRestant={droits.illimite ? null : droits.quotaRestant}
              credits={droits.credits}
              peutDebloquer={droits.peutDebloquer}
            />
          )}

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
              {/* Solliciter, c'est agir : cela envoie une notification nominative à
                  quelqu'un dont on n'a pas encore vu le nom. La barrière tombe donc
                  ici aussi, sans quoi on contournerait le déblocage. */}
              {!debloque ? (
                <p className="petit secondaire" style={{ margin: 0 }}>
                  Débloquez les coordonnées pour pouvoir solliciter ce profil.
                </p>
              ) : (
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
              )}
            </div>
          </div>

          <h2>Habilitations exigées par cette mission</h2>
          <ListeConformite
            exigences={conformite}
            vide="Cette mission n'exige aucune habilitation particulière."
          />

          <h2>Métiers et expérience</h2>
          <Experience
            vue="entreprise"
            constatee={experience}
            declaree={metiersDeclares.map((m) => ({
              code: m.code,
              libelle: m.libelle,
              annees: m.annees_experience,
            }))}
          />

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
