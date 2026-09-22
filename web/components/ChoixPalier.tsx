"use client";

import { useState } from "react";
import { enEuros, PACKS, PLANS } from "@interimatch/core/offre";
import { envoyerJson } from "@/lib/client";

/**
 * Choix d'un palier, et achat de crédits.
 *
 * Les deux coexistent parce que le bâtiment recrute par à-coups : une entreprise qui
 * embauche deux fois l'an ne s'abonnera pas, et lui refuser le produit pour autant
 * serait absurde. Un seul mécanisme dessous — le déblocage — deux façons de l'acheter.
 */
export default function ChoixPalier({
  planActuel,
  credits,
}: {
  planActuel: string;
  credits: number;
}) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function envoyer(corps: { planCode?: string; packCode?: string }, cle: string) {
    setEnCours(cle);
    setMessage(null);
    const { ok, corps: reponse } = await envoyerJson<{ message: string }>(
      "/api/abonnement",
      "POST",
      corps
    );
    setEnCours(null);
    setMessage(reponse.message ?? (ok ? "C'est fait." : "Opération impossible."));
    if (ok) window.location.reload();
  }

  return (
    <>
      <p className="bandeau bandeau--neutre" role="status">
        <span>
          <strong>Paiement simulé.</strong> Aucune carte n&apos;est demandée et aucun
          prestataire n&apos;est appelé : ce sont les quotas, l&apos;imputation et le
          registre des déblocages qui sont réels.
        </span>
      </p>

      {message && (
        <p className="encart-succes" role="status">
          {message}
        </p>
      )}

      <h2>Paliers</h2>
      <ul className="liste-nue grille grille--3">
        {PLANS.map((p) => (
          <li key={p.code} className={`carte${p.code === planActuel ? " carte--verdict-ok" : ""}`}>
            <div className="tete-carte">
              <h3 style={{ fontSize: "1rem", margin: 0 }}>{p.libelle}</h3>
              {p.code === planActuel && <span className="pastille pastille--ok">actuel</span>}
            </div>
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
                  ? `${p.creditsOfferts} déblocages offerts à l'ouverture`
                  : `${p.quotaMensuel} déblocages par mois`}
            </p>
            <p className="petit secondaire">{p.argument}</p>
            {p.code !== planActuel && (
              <button
                className="bouton bouton--secondaire"
                onClick={() => envoyer({ planCode: p.code }, p.code)}
                disabled={enCours !== null}
              >
                {enCours === p.code ? "…" : `Passer au palier ${p.libelle}`}
              </button>
            )}
          </li>
        ))}
      </ul>

      <h2 style={{ marginTop: "2.5rem" }}>Crédits à l&apos;acte</h2>
      <p className="secondaire">
        Ils <strong>n&apos;expirent pas</strong> et se consomment après le quota de votre
        palier. Vous en avez {credits} en réserve.
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
            <button
              className="bouton bouton--secondaire"
              onClick={() => envoyer({ packCode: p.code }, p.code)}
              disabled={enCours !== null}
            >
              {enCours === p.code ? "…" : "Acheter"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
