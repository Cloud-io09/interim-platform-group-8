import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergement et propriété intellectuelle de la plateforme Intérimatch.",
  alternates: { canonical: "/mentions-legales" },
};

export default function MentionsLegales() {
  return (
    <section className="section">
      <div className="colonne colonne--formulaire">
        <h1>Mentions légales</h1>

        <h2>Éditeur</h2>
        <p>
          Intérimatch est un projet pédagogique réalisé dans le cadre de la formation
          Epitech (promotion MSc Pro 2027), par Sandrine Yu, Godglory Kondo, Claudio
          Alvadia, Celia Bunel et Benjamin Missoffe.
        </p>
        <p className="secondaire">
          Il ne s&apos;agit pas d&apos;un service commercial. Aucune mise en relation
          réelle n&apos;est opérée, et aucune prestation de travail temporaire
          n&apos;est proposée.
        </p>

        <h2>Hébergement</h2>
        <p>
          Application hébergée par Vercel Inc., 440 N Barranca Ave #4133, Covina,
          CA 91723, États-Unis. Les fonctions serveur s&apos;exécutent dans la région
          de Francfort (Allemagne).
        </p>
        <p>
          Base de données relationnelle hébergée par Supabase, région{" "}
          <span lang="en">eu-central-1</span> (Francfort). Base non relationnelle hébergée
          par Upstash.
        </p>

        <h2>Données publiques réutilisées</h2>
        <p>
          Les volumétries et les fiches de poste enrichies s&apos;appuient sur l&apos;API
          Offres d&apos;emploi de France Travail et sur la nomenclature ROME. Le
          géocodage utilise la Base Adresse Nationale (
          <span lang="en">data.gouv.fr</span>), sous licence ouverte.
        </p>

        <h2>Contact</h2>
        <p>
          Pour toute question relative à ce projet, contactez l&apos;équipe via
          l&apos;établissement.
        </p>
      </div>
    </section>
  );
}
