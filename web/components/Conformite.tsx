import type { EtatConformite } from "@interimatch/core/conformite";
import type { ConformiteLisible } from "@/lib/candidatures";

/**
 * Lisibilité de la conformité.
 *
 * C'est le différenciateur du produit : il doit se voir sans être lu. Trois exigences
 * se croisent ici.
 *
 * 1. `expire_pendant` n'est **pas** une nuance de « valide ». Un titre bon aujourd'hui
 *    et périmé avant la fin du chantier est exactement la situation que le produit
 *    existe pour rendre visible.
 * 2. L'information ne repose jamais sur la couleur seule — contrainte RGAA 3.1, et les
 *    daltonismes sont fréquents dans les métiers manuels. Chaque état porte donc un
 *    libellé écrit **et** un symbole de forme distincte.
 * 3. La même formulation sert aux deux rôles : deux phrases divergentes sur le même
 *    fait seraient une source de litige.
 */

const ETATS: Record<EtatConformite, { libelle: string; symbole: string; classe: string }> = {
  valide: { libelle: "Valide", symbole: "✓", classe: "conformite--ok" },
  // Le symbole diffère par la forme, pas seulement par la couleur.
  expire_pendant: { libelle: "Expire pendant la mission", symbole: "▲", classe: "conformite--alerte" },
  expiree: { libelle: "Expirée", symbole: "✕", classe: "conformite--bloque" },
  absente: { libelle: "Non déclarée", symbole: "-", classe: "conformite--bloque" },
};

export function PastilleConformite({ etat }: { etat: EtatConformite }) {
  const e = ETATS[etat];
  return (
    <span className={`conformite ${e.classe}`}>
      {/* Décoratif : le libellé juste à côté porte l'information. */}
      <span aria-hidden="true" className="conformite-symbole">{e.symbole}</span>
      {e.libelle}
    </span>
  );
}

/**
 * Détail habilitation par habilitation.
 *
 * Rendu sans interaction : un verdict global — « non conforme » — n'apprend rien à
 * qui doit décider s'il renouvelle un titre, ni à une entreprise qui doit expliquer
 * un refus.
 */
export function ListeConformite({
  exigences,
  vide,
}: {
  exigences: ConformiteLisible[];
  /** Ce qu'on dit quand la mission n'exige rien. */
  vide: string;
}) {
  if (exigences.length === 0) {
    return <p className="secondaire">{vide}</p>;
  }

  return (
    <ul className="liste-nue lignes-conformite">
      {exigences.map((e) => (
        <li key={`${e.typeCode}-${e.categorieCode ?? ""}`} className="ligne-conformite">
          <div>
            <strong>
              {e.libelleType}
              {e.categorieCode ? `, catégorie ${e.categorieCode}` : ""}
            </strong>
            <p className="petit secondaire" style={{ margin: "0.25rem 0 0" }}>
              {e.precision}
            </p>
          </div>
          <PastilleConformite etat={e.etat} />
        </li>
      ))}
    </ul>
  );
}
