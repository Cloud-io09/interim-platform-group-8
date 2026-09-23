"use client";

import { useId, useMemo, useState } from "react";
import { normaliser } from "@interimatch/core/cv";

export interface Element {
  code: string;
  libelle: string;
  /** Regroupement affiché au-dessus, quand le référentiel en fournit un. */
  groupe?: string;
}

interface Props {
  elements: Element[];
  selection: string[];
  surChangement: (codes: string[]) => void;
  legende: string;
  /** Une phrase qui dit à quoi sert la sélection, pas ce qu'est un champ. */
  aide?: string;
  placeholder?: string;
  /** Au-delà, on demande d'affiner plutôt que de dérouler des centaines de lignes. */
  maximumAffiche?: number;
}

/** Nombre de lignes au-delà duquel un champ de recherche apparaît. */
export const SEUIL_RECHERCHE = 12;

/**
 * Choix multiple dans un référentiel long.
 *
 * Cinquante-deux métiers, près de trois cents compétences : une liste de cases à
 * cocher qu'on déroule n'est pas une interface de saisie, c'est un inventaire. Trois
 * choses la rendent praticable.
 *
 * 1. **Ce qui est déjà choisi remonte en haut**, sous forme de puces retirables. Sans
 *    ça, on perd de vue sa propre sélection dès qu'on fait défiler.
 * 2. **La recherche tolère l'orthographe du chantier** : elle passe par la même
 *    normalisation que le reste du produit, donc « macon » trouve « Maçon ».
 * 3. **Au-delà d'un certain nombre de résultats, on ne déroule pas** : on dit combien
 *    il y en a et on invite à affiner. Faire défiler trois cents lignes sur un
 *    téléphone n'aide personne.
 */
export default function SelecteurReferentiel({
  elements,
  selection,
  surChangement,
  legende,
  aide,
  placeholder = "Rechercher…",
  maximumAffiche = 40,
}: Props) {
  const idRecherche = useId();
  const [recherche, setRecherche] = useState("");

  const parCode = useMemo(() => new Map(elements.map((e) => [e.code, e])), [elements]);

  const trouves = useMemo(() => {
    const aiguille = normaliser(recherche);
    if (!aiguille) return elements;
    return elements.filter((e) => normaliser(`${e.libelle} ${e.groupe ?? ""}`).includes(aiguille));
  }, [elements, recherche]);

  const affiches = trouves.slice(0, maximumAffiche);
  const groupes = useMemo(() => {
    const parGroupe = new Map<string, Element[]>();
    for (const e of affiches) {
      const cle = e.groupe ?? "";
      parGroupe.set(cle, [...(parGroupe.get(cle) ?? []), e]);
    }
    return [...parGroupe.entries()];
  }, [affiches]);

  const basculer = (code: string) =>
    surChangement(selection.includes(code) ? selection.filter((c) => c !== code) : [...selection, code]);

  return (
    <fieldset className="selecteur">
      <legend>{legende}</legend>
      {aide && <p className="petit secondaire">{aide}</p>}

      {selection.length > 0 && (
        <ul className="liste-nue puces puces--retirables">
          {selection.map((code) => (
            <li key={code}>
              <button type="button" className="puce puce--acquise" onClick={() => basculer(code)}>
                {parCode.get(code)?.libelle ?? code}
                {/* Le libellé du bouton dit déjà quoi retirer ; la croix est décorative. */}
                <span aria-hidden="true"> ✕</span>
                <span className="hors-ecran"> - retirer</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {elements.length > SEUIL_RECHERCHE && (
        <div className="champ">
          <label htmlFor={idRecherche} className="petit">Rechercher dans la liste</label>
          <input
            id={idRecherche}
            type="search"
            value={recherche}
            placeholder={placeholder}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
      )}

      <p className="petit secondaire" role="status">
        {trouves.length === 0
          ? "Aucun résultat. Essayez un autre mot."
          : trouves.length > affiches.length
            ? `${trouves.length} résultats - les ${affiches.length} premiers sont affichés, affinez votre recherche.`
            : `${trouves.length} résultat${trouves.length > 1 ? "s" : ""}`}
        {selection.length > 0 && ` · ${selection.length} sélectionné${selection.length > 1 ? "s" : ""}`}
      </p>

      {groupes.map(([groupe, lignes]) => (
        <div key={groupe} className="groupe-cases">
          {groupe && <h3 className="petit sur-titre">{groupe}</h3>}
          <div className="cases">
            {lignes.map((e) => (
              <label key={e.code} className="case">
                <input
                  type="checkbox"
                  checked={selection.includes(e.code)}
                  onChange={() => basculer(e.code)}
                />
                <span>{e.libelle}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
