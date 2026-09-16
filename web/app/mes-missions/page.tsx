import type { Metadata } from "next";
import MesMissionsInterimaire from "@/components/MesMissionsInterimaire";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Mes missions",
  robots: { index: false, follow: false },
};

export default async function MesMissions() {
  await exigerSession("interimaire");

  return (
    <section className="section">
      <div className="colonne">
        <h1>Mes missions</h1>
        <p className="secondaire">
          Les missions ouvertes qui correspondent à vos métiers, classées par
          compatibilité. Vous ne voyez comme accessibles que celles pour lesquelles vos
          habilitations sont valides jusqu&apos;à la fin du chantier.
        </p>
        <MesMissionsInterimaire />
        <p className="petit secondaire" style={{ marginTop: "2rem" }}>
          <a href="/espace/interimaire">Mon espace : profil, certifications, disponibilités</a>
        </p>
      </div>
    </section>
  );
}
