import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import ChoixPalier from "@/components/ChoixPalier";
import { exigerSession } from "@/lib/garde";
import { lireDroits } from "@/lib/deblocage";

export const metadata: Metadata = {
  title: "Mon abonnement",
  robots: { index: false, follow: false },
};

export default async function Abonnement() {
  const session = await exigerSession("entreprise");

  const sql = connexion();
  try {
    const droits = await lireDroits(sql, session.compteId);
    const [consommes] = await sql<{ n: number }[]>`
      select count(*)::int as n from deblocage where entreprise_id = ${session.compteId}`;

    return (
      <section className="section">
        <div className="colonne">
          <p className="petit secondaire"><a href="/espace/entreprise">← Mon espace</a></p>
          <h1 className="titre-page">Mon abonnement</h1>
          <p className="secondaire">
            Le rapprochement, le score et la conformité de chaque profil sont gratuits et
            le resteront. Ce qui se paie, c&apos;est l&apos;accès aux coordonnées d&apos;un
            profil pour une mission donnée.
          </p>

          <ul className="liste-nue bandeau-chiffres">
            <li>
              <div>
                <strong className="chiffre">
                  {droits.illimite ? "∞" : droits.quotaRestant}
                </strong>
                <span className="petit secondaire">contact(s) inclus ce mois-ci</span>
              </div>
            </li>
            <li>
              <div>
                <strong className="chiffre">{droits.credits}</strong>
                <span className="petit secondaire">crédit(s) en réserve</span>
              </div>
            </li>
            <li>
              <div>
                <strong className="chiffre">{consommes?.n ?? 0}</strong>
                <span className="petit secondaire">contact(s) obtenu(s) au total</span>
              </div>
            </li>
          </ul>

          <ChoixPalier planActuel={droits.plan.code} credits={droits.credits} />
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
