import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import Sommaire from "@/components/Sommaire";
import { exigerSession } from "@/lib/garde";
import { lireProfilInterimaire } from "@/lib/profils";

export const metadata: Metadata = { title: "Mon espace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EspaceInterimaire() {
  const session = await exigerSession("interimaire");

  const sql = connexion();
  try {
    const profil = await lireProfilInterimaire(sql, session.compteId);
    const [compte] = await sql<{ certifications: number; perimees: number; periodes: number }[]>`
      select
        (select count(*)::int from certification where interimaire_id = ${session.compteId}) as certifications,
        (select count(*)::int from certification
           where interimaire_id = ${session.compteId} and date_echeance < current_date) as perimees,
        (select count(*)::int from disponibilite
           where interimaire_id = ${session.compteId} and date_fin >= current_date) as periodes`;

    const c = compte!;
    return (
      <section className="section">
        <div className="colonne">
          <h1>Mon espace</h1>
          <p className="secondaire">
            {profil
              ? `${profil.prenom} ${profil.nom} — ${profil.ville}, jusqu'à ${profil.rayonMobiliteKm} km`
              : "Commencez par votre profil : sans lui, aucune mission ne peut vous être proposée."}
          </p>

          <Sommaire
            entrees={[
              {
                href: "/espace/interimaire/profil",
                titre: "Mon profil",
                texte: "Identité, commune, zone de déplacement, métiers et carte BTP.",
                etat: profil
                  ? { libelle: "Renseigné", complet: true }
                  : { libelle: "À compléter", complet: false },
              },
              {
                href: "/espace/interimaire/certifications",
                titre: "Mes certifications",
                texte: "CACES, AIPR, habilitations. Ce sont elles qui décident de votre accès aux chantiers.",
                etat:
                  c.certifications === 0
                    ? { libelle: "Aucune déclarée", complet: false }
                    : c.perimees > 0
                      ? { libelle: `${c.perimees} périmée${c.perimees > 1 ? "s" : ""} sur ${c.certifications}`, complet: false }
                      : { libelle: `${c.certifications} à jour`, complet: true },
              },
              {
                href: "/espace/interimaire/disponibilites",
                titre: "Mes disponibilités",
                texte: "Les périodes où vous pouvez travailler. Elles pèsent dans le classement.",
                etat:
                  c.periodes === 0
                    ? { libelle: "Aucune période", complet: false }
                    : { libelle: `${c.periodes} période${c.periodes > 1 ? "s" : ""}`, complet: true },
              },
              {
                href: "/mes-missions",
                titre: "Les missions",
                texte: "Celles qui correspondent à votre profil, et toutes les autres.",
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
