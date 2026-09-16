import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import Espace from "@/components/Espace";
import { exigerSession } from "@/lib/garde";
import { lireProfilEntreprise } from "@/lib/profils";

export const metadata: Metadata = { title: "Mon espace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EspaceEntreprise() {
  const session = await exigerSession("entreprise");

  const sql = connexion();
  try {
    const profil = await lireProfilEntreprise(sql, session.compteId);
    const [c] = await sql<{ publiees: number; brouillons: number; a_venir: number }[]>`
      select
        count(*) filter (where statut = 'publiee')::int as publiees,
        count(*) filter (where statut = 'brouillon')::int as brouillons,
        count(*) filter (where statut = 'publiee' and date_debut >= current_date)::int as a_venir
      from mission where entreprise_id = ${session.compteId}`;

    const urgence = !profil
      ? { texte: "Renseignez votre entreprise : sans elle, vous ne pouvez pas publier de fiche de poste.", lienTexte: "Renseigner mon entreprise", href: "/espace/entreprise/profil" }
      : c!.publiees === 0
        ? { texte: "Vous n'avez publié aucune fiche de poste.", lienTexte: "Publier ma première fiche", href: "/missions/nouvelle" }
        : c!.brouillons > 0
          ? { texte: `${c!.brouillons} fiche${c!.brouillons > 1 ? "s" : ""} en brouillon : elles ne reçoivent aucun candidat tant qu'elles ne sont pas publiées.`, lienTexte: "Voir mes fiches", href: "/missions" }
          : null;

    return (
      <section className="section">
        <div className="colonne">
          <Espace
            salutation={profil ? profil.raisonSociale : "Bienvenue"}
            sousTitre={
              profil
                ? `${profil.ville}${profil.siret ? ` · SIRET ${profil.siret}` : ""}`
                : "Renseignez votre entreprise, puis publiez votre première fiche de poste."
            }
            urgence={urgence}
            chiffres={
              profil
                ? [
                    { valeur: String(c!.publiees), legende: "fiches publiées", href: "/missions" },
                    { valeur: String(c!.a_venir), legende: "chantiers à venir", href: "/missions" },
                    { valeur: String(c!.brouillons), legende: "brouillons", href: "/missions" },
                  ]
                : []
            }
            actions={[
              {
                href: "/missions/nouvelle",
                titre: "Publier une fiche de poste",
                texte: "Le formulaire se préremplit depuis les offres publiques du métier choisi.",
              },
              {
                href: "/missions",
                titre: "Mes fiches de poste",
                texte: "Candidats classés par compatibilité, et profils écartés avec leur motif.",
                aFaire: c!.publiees === 0,
                etat: c!.publiees === 0 ? "Aucune" : `${c!.publiees} publiée${c!.publiees > 1 ? "s" : ""}`,
              },
              {
                href: "/espace/entreprise/profil",
                titre: "Mon entreprise",
                texte: "Raison sociale, SIRET, adresse de référence servant au calcul des distances.",
                aFaire: !profil,
                etat: profil ? "Renseignée" : "À compléter",
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
