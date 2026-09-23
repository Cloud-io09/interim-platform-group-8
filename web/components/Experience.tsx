import { resumeExperience, type ExperienceConstatee } from "@interimatch/core/experience";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

interface Props {
  /** Ce que la plateforme a constaté : missions acceptées et terminées. */
  constatee: ExperienceConstatee;
  /** Ce que l'intérimaire a déclaré, par code métier. */
  declaree: { code: string; libelle: string; annees: number | null }[];
  /** Change la formulation selon qui lit : le titulaire, ou une entreprise. */
  vue: "titulaire" | "entreprise";
}

/**
 * Expérience, déclarée et constatée côte à côte.
 *
 * Le produit repose sur une distinction : une date d'échéance est un fait, un
 * mot-clé de CV est une affirmation. Elle vaut aussi ici. « Huit ans en maçonnerie »
 * est utile et invérifiable ; « trois missions, quarante-sept jours, pour deux
 * entreprises » est établi par la plateforme elle-même.
 *
 * Les deux sont montrées et **jamais fondues en un seul chiffre** : les additionner
 * donnerait une ancienneté qui n'existe nulle part. Ni l'une ni l'autre ne décide de
 * l'éligibilité — ce sont les habilitations datées qui la décident, et l'écran le dit
 * plutôt que de laisser supposer le contraire.
 */
export default function Experience({ constatee, declaree, vue }: Props) {
  const titulaire = vue === "titulaire";
  const rien = constatee.totalMissions === 0 && declaree.every((d) => d.annees === null);

  if (rien) {
    return (
      <p className="secondaire">
        {titulaire
          ? "Vous n'avez déclaré aucune expérience, et aucune mission n'a encore été réalisée via la plateforme."
          : "Aucune expérience déclarée, et aucune mission réalisée via la plateforme."}
      </p>
    );
  }

  return (
    <div className="section-experience">
      <h3>Constatée par la plateforme</h3>
      {constatee.totalMissions === 0 ? (
        <p className="petit secondaire">
          {titulaire
            ? "Aucune mission terminée pour l'instant. Elle se remplira d'elle-même : chaque chantier achevé via la plateforme y apparaîtra."
            : "Aucune mission terminée via la plateforme. Ce profil peut être expérimenté par ailleurs — voir ce qu'il déclare."}
        </p>
      ) : (
        <>
          <p className="petit secondaire">
            {constatee.totalMissions} mission{constatee.totalMissions > 1 ? "s" : ""} terminée
            {constatee.totalMissions > 1 ? "s" : ""} · {constatee.totalJours} jours travaillés ·{" "}
            {constatee.totalEntreprises} entreprise{constatee.totalEntreprises > 1 ? "s" : ""}
          </p>
          <ul className="liste-nue lignes">
            {constatee.parMetier.map((m) => (
              <li key={m.metierCode} className="ligne">
                <div>
                  <strong className="petit">{m.metierLibelle}</strong>
                  <p className="petit secondaire" style={{ margin: "0.25rem 0 0" }}>
                    {resumeExperience(m)} · dernière le {enDateFr(m.derniereFin)}
                  </p>
                </div>
                <span className="pastille pastille--ok">Vérifiée</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Déclarée</h3>
      {declaree.length === 0 ? (
        <p className="petit secondaire">Aucun métier déclaré.</p>
      ) : (
        <ul className="liste-nue lignes">
          {declaree.map((d) => (
            <li key={d.code} className="ligne">
              <span className="petit">{d.libelle}</span>
              <span className={d.annees === null ? "pastille pastille--info" : "pastille pastille--attention"}>
                {d.annees === null
                  ? "non renseignée"
                  : d.annees === 0
                    ? "débute sur ce métier"
                    : `${d.annees} an${d.annees > 1 ? "s" : ""} déclarés`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="petit secondaire" style={{ marginTop: "0.75rem" }}>
        {titulaire
          ? "Ce que vous déclarez n'est pas vérifiable par la plateforme, et n'entre donc pas dans le calcul de correspondance. Ce sont vos habilitations et leurs dates qui décident de votre accès aux chantiers."
          : "L'expérience déclarée n'est pas vérifiable et n'entre pas dans le calcul de correspondance. Seules les habilitations et leurs dates décident de l'accès au chantier."}
      </p>
    </div>
  );
}
