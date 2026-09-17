import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import Espace from "@/components/Espace";
import { exigerSession } from "@/lib/garde";
import { lireProfilInterimaire } from "@/lib/profils";

export const metadata: Metadata = { title: "Mon espace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

export default async function EspaceInterimaire() {
  const session = await exigerSession("interimaire");

  const sql = connexion();
  try {
    const profil = await lireProfilInterimaire(sql, session.compteId);
    const [c] = await sql<
      {
        certifications: number; perimees: number; expirent_bientot: number;
        prochaine_echeance: string | null; periodes: number; cv: number; missions_metier: number;
      }[]
    >`
      select
        (select count(*)::int from certification where interimaire_id = ${session.compteId}) as certifications,
        (select count(*)::int from certification
           where interimaire_id = ${session.compteId} and date_echeance < current_date) as perimees,
        (select count(*)::int from certification
           where interimaire_id = ${session.compteId}
             and date_echeance between current_date and current_date + 90) as expirent_bientot,
        (select min(date_echeance)::text from certification
           where interimaire_id = ${session.compteId} and date_echeance >= current_date) as prochaine_echeance,
        (select count(*)::int from disponibilite
           where interimaire_id = ${session.compteId} and date_fin >= current_date) as periodes,
        (select count(*)::int from interimaire
           where compte_id = ${session.compteId} and cv_texte_chiffre is not null) as cv,
        (select count(distinct m.id)::int from mission m
           join interimaire_metier im on im.metier_code = m.metier_code
           where im.interimaire_id = ${session.compteId}
             and m.statut = 'publiee' and m.date_fin >= current_date) as missions_metier`;

    // Une seule urgence affichée, la plus bloquante : empiler les avertissements
    // revient à n'en signaler aucun.
    const urgence = !profil
      ? { texte: "Votre profil n'est pas renseigné : aucune mission ne peut vous être proposée.", lienTexte: "Renseigner mon profil", href: "/espace/interimaire/profil" }
      : c!.certifications === 0
        ? { texte: "Vous n'avez déclaré aucune certification. Ce sont elles qui ouvrent l'accès aux chantiers.", lienTexte: "Ajouter une certification", href: "/espace/interimaire/certifications" }
        : c!.perimees > 0
          ? { texte: `${c!.perimees} de vos certifications ${c!.perimees > 1 ? "sont périmées" : "est périmée"}. Vous êtes écarté de toute mission qui l'exige.`, lienTexte: "Mettre à jour", href: "/espace/interimaire/certifications" }
          : c!.periodes === 0
            ? { texte: "Vous n'avez déclaré aucune disponibilité : votre classement en pâtit.", lienTexte: "Déclarer une période", href: "/espace/interimaire/disponibilites" }
            : c!.expirent_bientot > 0
              ? { texte: `${c!.expirent_bientot} certification${c!.expirent_bientot > 1 ? "s expirent" : " expire"} dans moins de trois mois.`, lienTexte: "Vérifier", href: "/espace/interimaire/certifications" }
              : null;

    return (
      <section className="section">
        <div className="colonne">
          <Espace
            salutation={profil ? `Bonjour ${profil.prenom}` : "Bienvenue"}
            sousTitre={
              profil
                ? `${profil.ville} · jusqu'à ${profil.rayonMobiliteKm} km · ${profil.metiers.length} métier${profil.metiers.length > 1 ? "s" : ""} déclaré${profil.metiers.length > 1 ? "s" : ""}`
                : "Trois étapes : votre profil, vos certifications, vos disponibilités."
            }
            urgence={urgence}
            chiffres={
              profil
                ? [
                    { valeur: String(c!.missions_metier), legende: "missions ouvertes dans vos métiers", href: "/mes-missions" },
                    { valeur: String(c!.certifications - c!.perimees), legende: "certifications valides", href: "/espace/interimaire/certifications" },
                    {
                      valeur: c!.prochaine_echeance ? enDateFr(c!.prochaine_echeance) : "—",
                      legende: "prochaine échéance",
                      href: "/espace/interimaire/certifications",
                    },
                  ]
                : []
            }
            actions={[
              {
                href: "/mes-missions",
                titre: "Voir les missions",
                texte: "Celles de vos métiers, et toutes les autres si vous voulez élargir.",
              },
              {
                href: "/espace/interimaire/certifications",
                titre: "Mes certifications",
                texte: "CACES, AIPR, habilitations. Elles décident de votre accès aux chantiers.",
                aFaire: c!.certifications === 0 || c!.perimees > 0,
                etat:
                  c!.certifications === 0
                    ? "Aucune"
                    : c!.perimees > 0
                      ? `${c!.perimees} périmée${c!.perimees > 1 ? "s" : ""}`
                      : `${c!.certifications} à jour`,
              },
              {
                href: "/espace/interimaire/disponibilites",
                titre: "Mes disponibilités",
                texte: "Les périodes où vous pouvez travailler. Elles pèsent dans le classement.",
                aFaire: c!.periodes === 0,
                etat: c!.periodes === 0 ? "Aucune" : `${c!.periodes} période${c!.periodes > 1 ? "s" : ""}`,
              },
              {
                href: "/espace/interimaire/cv",
                titre: "Mon CV",
                texte: "Déposez-le pour préremplir vos métiers et vos compétences, et repérer des missions proches.",
                etat: c!.cv > 0 ? "Déposé" : "Aucun",
                aFaire: false,
              },
              {
                href: "/espace/interimaire/profil",
                titre: "Mon profil",
                texte: "Identité, commune, zone de déplacement, métiers et carte BTP.",
                aFaire: !profil,
                etat: profil ? "Renseigné" : "À compléter",
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
