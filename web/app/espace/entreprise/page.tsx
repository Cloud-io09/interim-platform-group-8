import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import EnteteEspace from "@/components/EnteteEspace";
import Notifications from "@/components/Notifications";
import { exigerSession } from "@/lib/garde";
import { tableauBordEntreprise, type FicheSuivie } from "@/lib/tableau-bord";

export const metadata: Metadata = { title: "Mon espace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");
const enJourMois = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

function delai(jours: number): string {
  if (jours < 0) return "en cours";
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  return `dans ${jours} jours`;
}

const pluriel = (n: number, mot: string, terminaison = "s") => `${n} ${mot}${n > 1 ? terminaison : ""}`;

/**
 * Ligne d'une fiche de poste suivie.
 *
 * Trois chiffres, et ils ne disent pas la même chose : les profils conformes sont ce
 * que le moteur a retenu, les propositions en attente ce qui est parti sans réponse,
 * les acceptations ce qui est acquis. Les fondre en un seul compteur ferait perdre
 * la seule information actionnable — qui attend quoi.
 */
function LigneFiche({ fiche }: { fiche: FicheSuivie }) {
  const brouillon = fiche.statut === "brouillon";
  return (
    <li className="carte carte-mission">
      <div className="carte-mission-corps">
        <h3>
          <a className="lien-bloc" href={`/missions/${fiche.id}`}>{fiche.titre}</a>
        </h3>
        <p className="petit secondaire ligne-meta">
          <span>
            {fiche.ville} · {enJourMois(fiche.dateDebut)} → {enJourMois(fiche.dateFin)}
          </span>
          {brouillon ? (
            <span className="pastille pastille--attention">Brouillon</span>
          ) : (
            <span className="pastille pastille--info">Démarre {delai(fiche.joursAvantDebut)}</span>
          )}
        </p>
        {brouillon && (
          <p className="petit secondaire" style={{ margin: "0.5rem 0 0" }}>
            Tant qu&apos;elle n&apos;est pas publiée, cette fiche n&apos;est proposée à personne.
          </p>
        )}
      </div>

      <div className="encart-score">
        {brouillon ? (
          <>
            <p className="petit secondaire" style={{ margin: "0 0 0.9rem" }}>
              Aucun candidat tant que la fiche est en brouillon.
            </p>
            <a className="bouton" href={`/missions/${fiche.id}`}>Terminer et publier</a>
          </>
        ) : (
          <>
            <p className="encart-score-tete">
              <span className="petit secondaire">Profils conformes</span>
              <strong>{fiche.candidatsConformes}</strong>
            </p>
            <p className="petit secondaire" style={{ margin: "0 0 0.9rem" }}>
              {fiche.propositionsEnAttente > 0
                ? `${pluriel(fiche.propositionsEnAttente, "proposition")} sans réponse`
                : "Aucune proposition en attente"}
              {fiche.acceptees > 0 && ` · ${pluriel(fiche.acceptees, "acceptée", "s")}`}
            </p>
            <a className="bouton" href={`/missions/${fiche.id}`}>Voir les candidats</a>
          </>
        )}
      </div>
    </li>
  );
}

export default async function EspaceEntreprise() {
  const session = await exigerSession("entreprise");

  const sql = connexion();
  try {
    const b = await tableauBordEntreprise(sql, session.compteId);
    const p = b.profil;

    const onglets = [
      { href: "/espace/entreprise", libelle: "Tableau de bord", actif: true },
      { href: "/missions", libelle: "Mes fiches" },
      { href: "/candidatures", libelle: "Candidatures" },
      { href: "/missions/nouvelle", libelle: "Publier" },
      { href: "/espace/entreprise/profil", libelle: "Mon entreprise" },
    ];

    const enAttente = b.fiches.reduce((n, f) => n + f.propositionsEnAttente, 0);

    return (
      <section className="section">
        <div className="colonne">
          <EnteteEspace
            initiales={b.initiales}
            titre={p ? p.raisonSociale : "Bienvenue"}
            sousTitre={
              p
                ? `${p.ville}${p.siret ? ` · SIRET ${p.siret}` : ""} · ${pluriel(b.fiches.length, "fiche")} en cours`
                : "Renseignez votre entreprise pour publier"
            }
            onglets={onglets}
          />

          {!p ? (
            <div className="carte carte--sombre">
              <p className="sur-titre sur-titre--marque">Première étape</p>
              <h2>Renseignez votre entreprise</h2>
              <p className="sur-sombre-secondaire">
                L&apos;adresse de référence sert au calcul des distances : sans elle, aucune
                fiche ne peut être publiée ni classée.
              </p>
              <a className="bouton bouton--marque" href="/espace/entreprise/profil">
                Renseigner mon entreprise
              </a>
            </div>
          ) : (
            <div className="grille-bord">
              <div className="colonne-principale">
                {/* Une seule carte sombre, pour la seule chose qui appelle une décision. */}
                {b.fiches.length === 0 ? (
                  <div className="carte carte--sombre">
                    <p className="sur-titre sur-titre--marque">Pour commencer</p>
                    <h2>Publiez votre première fiche de poste</h2>
                    <p className="sur-sombre-secondaire">
                      Le formulaire se préremplit depuis les offres publiques du métier choisi :
                      intitulés normalisés, habilitations typiques, fourchette de rémunération
                      observée localement.
                    </p>
                    <a className="bouton bouton--marque" href="/missions/nouvelle">
                      Publier une fiche
                    </a>
                  </div>
                ) : b.prochainChantier ? (
                  <div className="carte carte--sombre">
                    <p className="sur-titre sur-titre--marque">Prochain chantier</p>
                    <p className="chiffre-geant">
                      {delai(b.prochainChantier.joursAvantDebut)}
                      <span className="chiffre-suffixe">
                        {enDateFr(b.prochainChantier.dateDebut)}
                      </span>
                    </p>
                    <hr className="filet-sombre" />
                    <p className="sur-sombre-secondaire" style={{ margin: 0 }}>
                      <strong>{b.prochainChantier.titre}</strong>
                      <br />
                      {b.prochainChantier.ville} ·{" "}
                      {b.prochainChantier.acceptees > 0
                        ? `${pluriel(b.prochainChantier.acceptees, "intérimaire")} confirmé${b.prochainChantier.acceptees > 1 ? "s" : ""}`
                        : "aucun intérimaire confirmé à ce jour"}
                    </p>
                  </div>
                ) : null}

                <section aria-labelledby="titre-fiches">
                  <div className="tete-section">
                    <h2 id="titre-fiches">Mes fiches en cours</h2>
                    <p className="petit secondaire">par date de démarrage</p>
                  </div>

                  {b.fiches.length === 0 ? (
                    <div className="carte">
                      <p className="secondaire" style={{ margin: 0 }}>
                        Aucune fiche en cours. Les fiches dont le chantier est terminé
                        n&apos;apparaissent plus ici.
                      </p>
                    </div>
                  ) : (
                    <>
                      <ul className="liste-nue">
                        {b.fiches.slice(0, 5).map((f) => (
                          <LigneFiche key={f.id} fiche={f} />
                        ))}
                      </ul>
                      <a className="bouton bouton--secondaire pleine-largeur" href="/missions">
                        Voir toutes mes fiches
                      </a>
                    </>
                  )}
                </section>
              </div>

              <aside className="colonne-laterale">
                <section className="carte" aria-labelledby="titre-fil">
                  <div className="tete-carte">
                    <h2 id="titre-fil" className="titre-carte">Activité</h2>
                    {b.nonLues > 0 && (
                      <span className="pastille pastille--info">
                        {b.nonLues} nouvelle{b.nonLues > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <Notifications
                    initiales={b.notifications}
                    messageVide="Rien de neuf. Vous serez prévenu ici dès qu'un intérimaire répondra à l'une de vos propositions."
                  />
                </section>

                <section className="carte" aria-labelledby="titre-suivi">
                  <h2 id="titre-suivi" className="titre-carte">Suivi</h2>
                  <ul className="liste-nue lignes">
                    <li className="ligne">
                      <span className="petit">Propositions sans réponse</span>
                      <span className={enAttente > 0 ? "pastille pastille--attention" : "pastille pastille--ok"}>
                        {enAttente}
                      </span>
                    </li>
                    <li className="ligne">
                      <span className="petit">Brouillons non publiés</span>
                      <span className={b.brouillons > 0 ? "pastille pastille--attention" : "pastille pastille--ok"}>
                        {b.brouillons}
                      </span>
                    </li>
                  </ul>
                  {b.brouillons > 0 && (
                    <p className="petit secondaire" style={{ margin: "0.9rem 0 0" }}>
                      Un brouillon ne reçoit aucun candidat tant qu&apos;il n&apos;est pas publié.
                    </p>
                  )}
                </section>

                <section className="carte" aria-labelledby="titre-publier">
                  <h2 id="titre-publier" className="titre-carte">Publier une fiche</h2>
                  <p className="petit secondaire" style={{ margin: "0 0 1rem" }}>
                    Le formulaire se préremplit depuis les offres publiques du métier : intitulé
                    normalisé, habilitations typiques, rémunération observée localement.
                  </p>
                  <a className="bouton bouton--secondaire pleine-largeur" href="/missions/nouvelle">
                    Nouvelle fiche de poste
                  </a>
                </section>

                <p className="petit secondaire">
                  <a href="/espace/entreprise/profil">Modifier les informations de mon entreprise</a>
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
