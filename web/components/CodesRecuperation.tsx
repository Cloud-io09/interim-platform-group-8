"use client";

/**
 * Remise des codes de récupération.
 *
 * Ils ne sont montrés **qu'une fois** : la base n'en garde que les empreintes, et
 * aucune route ne permet de les relire. L'écran doit donc être clair sur ce point,
 * et rendre le fait de les garder plus facile que de passer outre — d'où la copie en
 * un geste et l'impression, plutôt qu'une simple liste à recopier.
 *
 * Une case à cocher barre la suite. Ce n'est pas une formalité juridique : sans code,
 * un intérimaire qui oublie son mot de passe perd ses habilitations, ses
 * disponibilités et ses candidatures.
 */

import { useState } from "react";

export default function CodesRecuperation({
  codes,
  surConfirmation,
  libelleSuite,
}: {
  codes: string[];
  surConfirmation: () => void;
  libelleSuite: string;
}) {
  const [garde, setGarde] = useState(false);
  const [copie, setCopie] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopie(true);
    } catch {
      // Le presse-papiers peut être refusé par le navigateur : les codes restent
      // lisibles à l'écran, ce qui suffit à les recopier.
      setCopie(false);
    }
  }

  return (
    <div className="carte carte--verdict-bloque">
      <p className="sur-titre sur-titre--marque">À conserver maintenant</p>
      <h2 className="titre-carte">Vos codes de récupération</h2>
      <p className="petit secondaire">
        Ils vous permettront de reprendre la main si vous oubliez votre mot de passe.
        <strong> Ils ne seront plus jamais affichés.</strong> Notez-en au moins un
        quelque part — un papier dans le portefeuille suffit.
      </p>

      <ul className="liste-nue codes">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>

      <p className="petit secondaire">
        Chaque code ne sert qu&apos;une fois. Vous pourrez en régénérer depuis votre
        espace, ce qui annulera les précédents.
      </p>

      <div className="boutons-action">
        <button type="button" className="bouton bouton--secondaire" onClick={copier}>
          {copie ? "Copiés" : "Copier les codes"}
        </button>
        <button type="button" className="bouton bouton--secondaire" onClick={() => window.print()}>
          Imprimer
        </button>
      </div>

      <label className="case" style={{ marginTop: "1rem" }}>
        <input type="checkbox" checked={garde} onChange={() => setGarde(!garde)} />
        <span>J&apos;ai noté mes codes en lieu sûr.</span>
      </label>

      <button className="bouton pleine-largeur" disabled={!garde} onClick={surConfirmation}>
        {libelleSuite}
      </button>
    </div>
  );
}
