import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
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
  // Ce qui attend une réponse humaine passe devant un chiffre du moteur.
  const aRepondre = !brouillon && fiche.candidaturesRecues > 0;
  return (
    <li className="carte carte-mission carte--cliquable">
      <div className="carte-mission-corps">
        <h3>
          <a className="lien-etire" href={`/missions/${fiche.id}`}>{fiche.titre}</a>
        </h3>
        {/* **Un compteur n'est pas un score.** Le nombre de candidatures tenait
            dans une tuile chiffrée empruntée au score de compatibilité : un « 1 »
            en gros caractères, à côté d'un libellé cassé sur deux lignes, dans un
            cadre posé à l'intérieur d'un autre cadre. Il se dit en toutes lettres,
            sur la ligne qui porte déjà le lieu, les dates et l'état. */}
        <p className="petit secondaire ligne-meta">
          <span>
            {fiche.ville} · {enJourMois(fiche.dateDebut)} → {enJourMois(fiche.dateFin)}
          </span>
          {brouillon ? (
            <span className="pastille pastille--attention">Brouillon</span>
          ) : (
            <span className="pastille pastille--info">Démarre {delai(fiche.joursAvantDebut)}</span>
          )}
          {aRepondre && (
            <span className="pastille pastille--attention">
              {pluriel(fiche.candidaturesRecues, "candidature")} à traiter
            </span>
          )}
        </p>
        <p className="petit secondaire" style={{ margin: 0 }}>
          {brouillon
            ? "Tant qu'elle n'est pas publiée, cette fiche n'est proposée à personne."
            : aRepondre
              ? `${pluriel(fiche.candidatsConformes, "profil conforme")} rapproché${fiche.candidatsConformes > 1 ? "s" : ""} par ailleurs`
              : fiche.propositionsEnAttente > 0
                ? `${pluriel(fiche.propositionsEnAttente, "proposition")} sans réponse`
                : `${pluriel(fiche.candidatsConformes, "profil conforme")} rapproché${fiche.candidatsConformes > 1 ? "s" : ""} · personne n'a encore postulé`}
          {!brouillon && fiche.acceptees > 0 && ` · ${pluriel(fiche.acceptees, "acceptée", "s")}`}
        </p>
      </div>

      <div className="carte-mission-action">
        <a className="bouton" href={`/missions/${fiche.id}`}>
          {brouillon ? "Terminer et publier" : aRepondre ? "Répondre aux candidats" : "Voir les candidats"}
        </a>
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


    const enAttente = b.fiches.reduce((n, f) => n + f.propositionsEnAttente, 0);

    return (
      <section className="section">
        <div className="colonne">
          {/* Le bandeau du layout nomme l'entreprise ; ce titre nomme l'écran. */}
          <h1 className="titre-page">Tableau de bord</h1>
          <p className="secondaire">
            Ce qui attend une réponse de votre part, et les chantiers qui approchent.
          </p>

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
            <>
              {/* Bandeau de chiffres, en tête : ce qu'on vient vérifier d'un coup
                  d'œil avant de lire quoi que ce soit. Les trois valeurs sont déjà
                  en mémoire — aucune requête n'est ajoutée pour les afficher. */}
              <ul className="liste-nue bandeau-chiffres">
                <li>
                  <a className="chiffre-lien" href="/missions">
                    <strong className="chiffre">{b.fiches.filter((f) => f.statut === "publiee").length}</strong>
                    <span className="petit secondaire">fiche(s) de poste ouverte(s)</span>
                  </a>
                </li>
                <li>
                  <a className="chiffre-lien" href="/candidatures">
                    <strong className="chiffre">
                      {b.fiches.reduce((t, f) => t + f.propositionsEnAttente, 0)}
                    </strong>
                    <span className="petit secondaire">candidature(s) en attente de réponse</span>
                  </a>
                </li>
                <li>
                  <a className="chiffre-lien" href="/missions">
                    <strong className="chiffre">{b.fiches.filter((f) => f.statut === "pourvue").length}</strong>
                    <span className="petit secondaire">poste(s) pourvu(s)</span>
                  </a>
                </li>
              </ul>

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
                  {/* **Le tableau de bord n'est pas une seconde liste.** Il
                      montrait les mêmes fiches que « Mes fiches », dans le même
                      ordre : rien ne disait laquelle faisait autorité. Ici, ce qui
                      attend une réponse passe devant — le reste est à un clic. */}
                  <div className="tete-section">
                    <h2 id="titre-fiches">
                      {b.fiches.some((f) => f.candidaturesRecues > 0)
                        ? "Ce qui attend votre réponse"
                        : "Vos chantiers qui approchent"}
                    </h2>
                    <p className="petit secondaire">
                      {b.fiches.some((f) => f.candidaturesRecues > 0)
                        ? "candidatures d'abord, puis par date de démarrage"
                        : "par date de démarrage"}
                    </p>
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
                        {[...b.fiches]
                          .sort(
                            (a, c) =>
                              c.candidaturesRecues - a.candidaturesRecues ||
                              a.dateDebut.localeCompare(c.dateDebut)
                          )
                          .slice(0, 5)
                          .map((f) => (
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
                    <p className="petit secondaire" style={{ margin: "1rem 0 0" }}>
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
            </>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
