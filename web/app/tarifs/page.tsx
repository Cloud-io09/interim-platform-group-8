import type { Metadata } from "next";
import { enEuros, PACKS, PLANS } from "@interimatch/core/offre";

export const metadata: Metadata = {
  title: "Tarifs - Intérimatch BTP",
  description:
    "Le rapprochement, le score et la conformité de chaque profil sont gratuits. Seul l'accès aux coordonnées d'un candidat se paie, à l'acte ou par abonnement.",
  alternates: { canonical: "/tarifs" },
};

/**
 * Grille tarifaire, publique.
 *
 * **Publique, et pas seulement dans l'espace client.** Les prix n'étaient visibles
 * qu'après inscription : une entreprise devait créer un compte pour savoir ce que le
 * produit coûte. C'est aussi la page où la promesse s'énonce devant tout le monde —
 * dite en interne, c'est une petite ligne ; dite ici, c'est un engagement.
 *
 * **Les chiffres viennent de `core`**, jamais recopiés. Une grille affichée qui
 * diverge de ce que le code facture serait pire que pas de grille du tout.
 */
export default function Tarifs() {
  return (
    <section className="section">
      <div className="colonne">
        <h1 className="titre-page">Ce qui est gratuit, et ce qui se paie</h1>
        <p className="secondaire">
          Vous ne payez jamais pour <strong>décider</strong>, seulement pour{" "}
          <strong>agir</strong>.
        </p>

        <div className="grille grille--2" style={{ marginTop: "1.5rem" }}>
          <div className="carte">
            <h2 className="titre-carte">Gratuit, et ça le restera</h2>
            <ul className="petit">
              <li>Publier autant de fiches de poste que vous voulez</li>
              <li>Voir quels profils le moteur rapproche, et leur score détaillé</li>
              <li>
                <strong>La conformité de chaque profil, habilitation par habilitation</strong>
              </li>
              <li>La distance au chantier et les disponibilités déclarées</li>
              <li>Le rappel de vos fiches non pourvues</li>
            </ul>
          </div>

          <div className="carte">
            <h2 className="titre-carte">Ce qui se paie</h2>
            <ul className="petit">
              <li>Le nom complet et les coordonnées d&apos;un profil</li>
              <li>Le droit de le solliciter</li>
            </ul>
            <p className="petit secondaire">
              Un déblocage vaut pour <strong>un profil sur une mission</strong>. Nous ne
              vendons pas l&apos;accès à une base de candidats, et chaque intérimaire voit
              combien d&apos;entreprises ont accédé à ses coordonnées.
            </p>
          </div>
        </div>

        {/* La conformité reste du côté gratuit, et ce n'est pas un geste commercial :
            ce produit existe pour empêcher qu'on envoie quelqu'un sur un chantier sans
            titre valable. Faire payer ce verdict reviendrait à vendre le risque. */}
        <p className="carte" style={{ marginTop: "1.5rem" }}>
          <strong>Pourquoi la conformité ne se paie pas.</strong> Une affectation non
          conforme engage la responsabilité pénale de l&apos;entreprise utilisatrice.
          Mettre ce verdict derrière un paiement reviendrait à vendre le risque que
          cette plateforme existe pour supprimer.
        </p>

        <h2 style={{ marginTop: "2rem" }}>Abonnements</h2>
        <ul className="liste-nue grille grille--3">
          {PLANS.map((p) => (
            <li
              key={p.code}
              className={p.code === "chantier" ? "carte carte--recommandee" : "carte"}
            >
              {p.code === "chantier" && <span className="etiquette-recommandee">Recommandé</span>}
              <h3 className="titre-carte" style={{ margin: 0 }}>{p.libelle}</h3>
              <p className="chiffre">
                {p.prixMensuelCents === 0 ? "Gratuit" : enEuros(p.prixMensuelCents)}
              </p>
              <p className="petit secondaire">
                {p.prixMensuelCents === 0 ? "sans engagement" : "par mois"}
              </p>
              <p className="petit">
                {p.quotaMensuel === null
                  ? "Déblocages sans limite"
                  : p.quotaMensuel === 0
                    ? `${p.creditsOfferts} déblocages offerts à l'ouverture du compte`
                    : `${p.quotaMensuel} déblocages par mois`}
              </p>
              <p className="petit secondaire">{p.argument}</p>
            </li>
          ))}
        </ul>

        <h2 style={{ marginTop: "2rem" }}>Sans abonnement</h2>
        <p className="secondaire">
          Le bâtiment recrute par à-coups. Ces crédits <strong>n&apos;expirent pas</strong>{" "}
          et se consomment après le quota de votre abonnement, s&apos;il y en a un.
        </p>
        <ul className="liste-nue grille grille--3">
          {PACKS.map((p) => (
            <li key={p.code} className="carte">
              <p className="chiffre">{p.credits}</p>
              <p className="petit secondaire">
                déblocage{p.credits > 1 ? "s" : ""} · {enEuros(p.prixCents)}
              </p>
              <p className="petit secondaire">
                soit {enEuros(Math.round(p.prixCents / p.credits))} l&apos;unité
              </p>
            </li>
          ))}
        </ul>

        <h2 style={{ marginTop: "2rem" }}>Et pour les intérimaires ?</h2>
        <p className="secondaire">
          Tout est gratuit, sans exception et sans condition. Déclarer ses habilitations,
          consulter les missions, postuler, être prévenu d&apos;une échéance qui approche :
          rien n&apos;est facturé à la personne qui cherche du travail.
        </p>

        <p style={{ marginTop: "2rem" }}>
          <a className="bouton lien-bloc" href="/inscription/entreprise">
            Publier une fiche de poste
          </a>
        </p>
      </div>
    </section>
  );
}
