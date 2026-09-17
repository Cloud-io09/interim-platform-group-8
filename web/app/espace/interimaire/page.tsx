import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import EnteteEspace from "@/components/EnteteEspace";
import Notifications from "@/components/Notifications";
import ActionCandidature from "@/components/ActionCandidature";
import { exigerSession } from "@/lib/garde";
import { tableauBordInterimaire, type EcheanceCertification, type MissionSuggeree } from "@/lib/tableau-bord";

export const metadata: Metadata = { title: "Mon espace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");
const enJourMois = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
/** Virgule décimale : le produit est français, « 345.9 km » se lit comme une faute. */
const enKm = (km: number) => `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;

/** « dans 12 jours », « aujourd'hui » — un délai se lit mieux qu'une date. */
function delai(jours: number): string {
  if (jours < 0) return `il y a ${-jours} jour${-jours > 1 ? "s" : ""}`;
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  return `dans ${jours} jours`;
}

/**
 * État d'une habilitation.
 *
 * Trois paliers, et jamais la couleur seule : le texte dit toujours ce que la
 * pastille signale (RGAA 3.1).
 */
function etatEcheance(c: EcheanceCertification): { libelle: string; classe: string } {
  if (c.joursRestants < 0) return { libelle: "Périmée", classe: "pastille--alerte" };
  if (c.joursRestants <= 90) return { libelle: `Expire ${delai(c.joursRestants)}`, classe: "pastille--attention" };
  return { libelle: "Valide", classe: "pastille--ok" };
}

function CarteMission({ mission }: { mission: MissionSuggeree }) {
  const manquantes = mission.competencesRequises.filter((c) => !mission.competencesCommunes.includes(c));
  return (
    <li className="carte carte-mission">
      <div className="carte-mission-corps">
        <h3>
          <a className="lien-bloc" href={`/mes-missions/${mission.id}`}>{mission.titre}</a>
        </h3>
        <p className="petit secondaire ligne-meta">
          <span>
            {mission.entreprise} · {mission.ville} · {enKm(mission.distanceKm)}
          </span>
          {mission.horsRayon && (
            <span className="pastille pastille--attention">au-delà de votre rayon</span>
          )}
        </p>

        {mission.competencesRequises.length > 0 && (
          <ul className="liste-nue puces">
            {mission.competencesCommunes.map((c) => (
              <li key={c} className="puce puce--acquise">{c}</li>
            ))}
            {manquantes.map((c) => (
              <li key={c} className="puce">{c}</li>
            ))}
          </ul>
        )}

        <p className="ligne-conditions">
          {mission.tauxHoraireMin !== null && (
            <strong>
              {mission.tauxHoraireMin.toFixed(2).replace(".", ",")} € <span className="petit secondaire">/h</span>
            </strong>
          )}
          <span className="secondaire">
            {enJourMois(mission.dateDebut)} → {enJourMois(mission.dateFin)}
          </span>
          <span className="petit secondaire">{mission.joursMission} jours</span>
        </p>
      </div>

      {/* Le score n'est jamais porté par la seule jauge : le pourcentage est écrit,
          et la ligne en dessous dit de quoi il est fait. */}
      <div className="encart-score">
        <p className="encart-score-tete">
          <span className="petit secondaire">Compatibilité</span>
          <strong>{mission.score} %</strong>
        </p>
        <div className="jauge">
          <div className="jauge-remplie jauge-remplie--marque" style={{ width: `${mission.score}%` }} />
        </div>
        <p className="petit secondaire">
          {mission.competencesCommunes.length}/{mission.competencesRequises.length} compétences ·{" "}
          {enKm(mission.distanceKm)} · {mission.joursCouverts}/{mission.joursMission} jours couverts
        </p>
        <a className="bouton" href={`/mes-missions/${mission.id}`}>Voir la fiche</a>
      </div>
    </li>
  );
}

export default async function EspaceInterimaire() {
  const session = await exigerSession("interimaire");

  const sql = connexion();
  try {
    const b = await tableauBordInterimaire(sql, session.compteId);
    const p = b.profil;

    const onglets = [
      { href: "/espace/interimaire", libelle: "Tableau de bord", actif: true },
      { href: "/opportunites", libelle: "Opportunités" },
      { href: "/mes-candidatures", libelle: "Mes candidatures" },
      { href: "/mes-missions", libelle: "Mes missions" },
      { href: "/espace/interimaire/certifications", libelle: "Habilitations" },
      { href: "/espace/interimaire/cv", libelle: "Profil & CV" },
    ];

    return (
      <section className="section">
        <div className="colonne">
          <EnteteEspace
            initiales={b.initiales}
            titre={p ? `${p.prenom} ${p.nom}` : "Bienvenue"}
            sousTitre={
              p
                ? `${p.metiers.length} métier${p.metiers.length > 1 ? "s" : ""} déclaré${p.metiers.length > 1 ? "s" : ""} · ${p.ville} · jusqu'à ${p.rayonMobiliteKm} km`
                : "Renseignez votre profil pour commencer"
            }
            onglets={onglets}
          />

          {!p ? (
            <div className="carte carte--sombre">
              <p className="sur-titre sur-titre--marque">Première étape</p>
              <h2>Renseignez votre profil</h2>
              <p className="sur-sombre-secondaire">
                Sans commune ni métier déclaré, aucune mission ne peut vous être proposée :
                le moteur n&apos;a rien à comparer.
              </p>
              <a className="bouton bouton--marque" href="/espace/interimaire/profil">
                Renseigner mon profil
              </a>
            </div>
          ) : (
            <div className="grille-bord">
              <div className="colonne-principale">
                {/* La carte sombre porte la seule chose qui appelle une décision.
                    En mettre deux reviendrait à n'en signaler aucune. */}
                {b.propositions.length > 0 ? (
                  <div className="carte carte--sombre">
                    <p className="sur-titre sur-titre--marque">
                      {b.propositions.length > 1
                        ? `${b.propositions.length} sollicitations en attente de votre réponse`
                        : "Une entreprise vous sollicite"}
                    </p>
                    <h2>{b.propositions[0]!.titre}</h2>
                    <p className="sur-sombre-secondaire">
                      {b.propositions[0]!.entreprise} · {b.propositions[0]!.ville} · du{" "}
                      {enDateFr(b.propositions[0]!.dateDebut)} au {enDateFr(b.propositions[0]!.dateFin)}, début{" "}
                      {delai(b.propositions[0]!.joursAvantDebut)}.
                    </p>
                    <div className="separation-action">
                      <ActionCandidature
                        missionId={b.propositions[0]!.id}
                        acteur="interimaire"
                        etat={b.propositions[0]!.statut}
                        retour="/espace/interimaire"
                      />
                    </div>
                  </div>
                ) : b.certificationsPerimees > 0 ? (
                  <div className="carte carte--sombre">
                    <p className="sur-titre sur-titre--marque">À régulariser</p>
                    <h2>
                      {b.certificationsPerimees} habilitation
                      {b.certificationsPerimees > 1 ? "s périmées" : " périmée"}
                    </h2>
                    <p className="sur-sombre-secondaire">
                      Vous êtes écarté de toute mission qui l&apos;exige, quelle que soit votre
                      expérience. C&apos;est la date qui décide, pas le métier.
                    </p>
                    <a className="bouton bouton--marque" href="/espace/interimaire/certifications">
                      Mettre à jour
                    </a>
                  </div>
                ) : b.certifications.length === 0 ? (
                  <div className="carte carte--sombre">
                    <p className="sur-titre sur-titre--marque">Il manque l&apos;essentiel</p>
                    <h2>Vous n&apos;avez déclaré aucune certification</h2>
                    <p className="sur-sombre-secondaire">
                      CACES, AIPR, habilitation électrique : ce sont elles qui ouvrent l&apos;accès
                      aux chantiers, et leur date d&apos;échéance décide seule de votre éligibilité.
                      Sans elles, vous êtes écarté de toute mission qui en exige une.
                    </p>
                    <a className="bouton bouton--marque" href="/espace/interimaire/certifications">
                      Déclarer mes habilitations
                    </a>
                  </div>
                ) : b.prochaine ? (
                  <div className="carte carte--sombre">
                    <p className="sur-titre sur-titre--marque">Votre prochaine mission</p>
                    <p className="chiffre-geant">
                      {delai(b.prochaine.joursAvantDebut)}
                      <span className="chiffre-suffixe">{enDateFr(b.prochaine.dateDebut)}</span>
                    </p>
                    <hr className="filet-sombre" />
                    <p className="sur-sombre-secondaire" style={{ margin: 0 }}>
                      <strong>{b.prochaine.titre}</strong>
                      <br />
                      {b.prochaine.entreprise} · {b.prochaine.ville} · jusqu&apos;au{" "}
                      {enDateFr(b.prochaine.dateFin)}
                    </p>
                  </div>
                ) : null}

                <section aria-labelledby="titre-suggestions">
                  <div className="tete-section">
                    <h2 id="titre-suggestions">
                      {b.suggestions.length > 0 ? "Missions pour vous" : "Aucune mission ouverte"}
                    </h2>
                    <p className="petit secondaire">triées par compatibilité</p>
                  </div>

                  {b.suggestions.length === 0 ? (
                    <div className="carte">
                      <p style={{ margin: 0 }}>
                        Aucune mission ouverte ne correspond à vos métiers pour le moment.
                      </p>
                      <p className="petit secondaire" style={{ margin: "0.5rem 0 1rem" }}>
                        Vous pouvez consulter l&apos;ensemble des missions publiées, y compris hors
                        de vos métiers déclarés.
                      </p>
                      <a className="bouton bouton--secondaire" href="/mes-missions">Voir toutes les missions</a>
                    </div>
                  ) : (
                    <>
                      <ul className="liste-nue">
                        {b.suggestions.map((m) => (
                          <CarteMission key={m.id} mission={m} />
                        ))}
                      </ul>
                      <a className="bouton bouton--secondaire pleine-largeur" href="/mes-missions">
                        Voir toutes les missions
                      </a>
                      {b.bloquees > 0 && (
                        <p className="petit secondaire" style={{ marginTop: "0.75rem" }}>
                          {b.bloquees} mission{b.bloquees > 1 ? "s" : ""} de vos métiers vous{" "}
                          {b.bloquees > 1 ? "sont fermées" : "est fermée"} faute d&apos;habilitation
                          valide. <a href="/mes-missions">Voir lesquelles et pourquoi</a>.
                        </p>
                      )}
                    </>
                  )}
                </section>
              </div>

              <aside className="colonne-laterale">
                <section className="carte" aria-labelledby="titre-fil">
                  <div className="tete-carte">
                    <h2 id="titre-fil" className="titre-carte">Activité</h2>
                    {b.nonLues > 0 && <span className="pastille pastille--info">{b.nonLues} nouvelle{b.nonLues > 1 ? "s" : ""}</span>}
                  </div>
                  <Notifications
                    initiales={b.notifications}
                    messageVide="Rien de neuf. Vous serez prévenu ici dès qu'une mission publiée vous correspondra, ou qu'une habilitation approchera de son échéance."
                  />
                </section>

                <section className="carte" aria-labelledby="titre-habilitations">
                  <div className="tete-carte">
                    <h2 id="titre-habilitations" className="titre-carte">Habilitations</h2>
                    <a className="petit" href="/espace/interimaire/certifications">Gérer</a>
                  </div>
                  {b.certifications.length === 0 ? (
                    <p className="petit secondaire" style={{ margin: 0 }}>
                      Aucune déclarée. Ce sont elles qui ouvrent l&apos;accès aux chantiers.
                    </p>
                  ) : (
                    <ul className="liste-nue lignes">
                      {b.certifications.slice(0, 5).map((c) => {
                        const etat = etatEcheance(c);
                        return (
                          <li key={c.id} className="ligne">
                            <span>
                              <strong className="petit">
                                {c.libelle}
                                {c.categorieCode ? ` — ${c.categorieCode}` : ""}
                              </strong>
                              <span className="petit secondaire"> {enDateFr(c.dateEcheance)}</span>
                            </span>
                            <span className={`pastille ${etat.classe}`}>{etat.libelle}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="carte" aria-labelledby="titre-dispos">
                  <div className="tete-carte">
                    <h2 id="titre-dispos" className="titre-carte">Disponibilités</h2>
                    <a className="petit" href="/espace/interimaire/disponibilites">Modifier</a>
                  </div>
                  {b.disponibilites.length === 0 ? (
                    <p className="petit secondaire" style={{ margin: 0 }}>
                      Aucune période déclarée : votre classement en pâtit sur toutes les missions.
                    </p>
                  ) : (
                    <ul className="liste-nue lignes">
                      {b.disponibilites.map((d) => (
                        <li key={d.debut} className="ligne">
                          <span className="petit">
                            {enDateFr(d.debut)} → {enDateFr(d.fin)}
                          </span>
                          <span className="pastille pastille--ok">Disponible</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="carte" aria-labelledby="titre-cv">
                  <div className="tete-carte">
                    <h2 id="titre-cv" className="titre-carte">Mon CV</h2>
                    <a className="petit" href="/espace/interimaire/cv">{b.cvDepose ? "Remplacer" : "Déposer"}</a>
                  </div>
                  <p className="petit secondaire" style={{ margin: 0 }}>
                    {b.cvDepose
                      ? "Déposé. Il sert à préremplir votre profil, jamais à décider de votre éligibilité."
                      : "Facultatif. Il préremplit vos métiers et vos compétences — vous validez chaque élément."}
                  </p>
                </section>

                <p className="petit secondaire">
                  <a href="/espace/interimaire/profil">Modifier mon profil et ma carte BTP</a>
                </p>
              </aside>
            </div>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
