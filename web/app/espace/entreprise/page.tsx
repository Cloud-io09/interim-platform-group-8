import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import Sommaire from "@/components/Sommaire";
import { exigerSession } from "@/lib/garde";
import { lireProfilEntreprise } from "@/lib/profils";

export const metadata: Metadata = { title: "Mon espace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EspaceEntreprise() {
  const session = await exigerSession("entreprise");

  const sql = connexion();
  try {
    const profil = await lireProfilEntreprise(sql, session.compteId);
    const [compte] = await sql<{ publiees: number; brouillons: number }[]>`
      select
        count(*) filter (where statut = 'publiee')::int as publiees,
        count(*) filter (where statut = 'brouillon')::int as brouillons
      from mission where entreprise_id = ${session.compteId}`;

    return (
      <section className="section">
        <div className="colonne">
          <h1>Mon espace</h1>
          <p className="secondaire">
            {profil
              ? `${profil.raisonSociale} — ${profil.ville}`
              : "Commencez par renseigner votre entreprise : sans elle, vous ne pouvez pas publier de fiche de poste."}
          </p>

          <Sommaire
            entrees={[
              {
                href: "/espace/entreprise/profil",
                titre: "Mon entreprise",
                texte: "Raison sociale, SIRET, adresse de référence servant au calcul des distances.",
                etat: profil
                  ? { libelle: "Renseignée", complet: true }
                  : { libelle: "À compléter", complet: false },
              },
              {
                href: "/missions",
                titre: "Mes fiches de poste",
                texte: "Consulter les candidats classés et les profils écartés, avec leur motif.",
                etat: {
                  libelle:
                    compte!.publiees === 0 && compte!.brouillons === 0
                      ? "Aucune fiche"
                      : `${compte!.publiees} publiée${compte!.publiees > 1 ? "s" : ""}` +
                        (compte!.brouillons > 0 ? `, ${compte!.brouillons} en brouillon` : ""),
                  complet: compte!.publiees > 0,
                },
              },
              {
                href: "/missions/nouvelle",
                titre: "Publier une fiche de poste",
                texte: "Le formulaire se préremplit depuis les offres publiques du métier choisi.",
              },
            ]}
          />
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
