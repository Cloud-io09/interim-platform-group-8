import type { Metadata } from "next";
import MesMissionsInterimaire from "@/components/MesMissionsInterimaire";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Opportunités",
  robots: { index: false, follow: false },
};

/**
 * Ce que le moteur propose, et sur quoi on peut agir.
 *
 * Séparé de « Mes missions », qui ne montre que les affectations : confondre ce qu'on
 * pourrait faire et ce qu'on s'est engagé à faire est la confusion la plus coûteuse
 * pour quelqu'un qui organise ses semaines de travail.
 */
export default async function Opportunites() {
  await exigerSession("interimaire");

  return (
    <section className="section">
      <div className="colonne">
        <h1>Opportunités</h1>
        <p className="secondaire">
          Les missions ouvertes qui correspondent à vos métiers, classées par
          compatibilité. Ne sont accessibles que celles dont les habilitations exigées
          restent valides <strong>jusqu&apos;à la fin du chantier</strong> — pas
          seulement aujourd&apos;hui.
        </p>
        <MesMissionsInterimaire />
      </div>
    </section>
  );
}
