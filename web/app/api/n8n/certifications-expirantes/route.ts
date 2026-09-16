import { connexion } from "@interimatch/core/db";
import { typeCertification } from "@interimatch/core";
import { n8nAutorise, refusN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

/** Fenêtre d'alerte par défaut. Un CACES se repasse en quelques semaines. */
const JOURS_PAR_DEFAUT = 60;

/**
 * Scénario n8n n° 1 — alerte avant expiration.
 *
 * L'information doit être actionnable, pas administrative : on ne dit pas seulement
 * « votre CACES expire », on dit combien de missions ouvertes un renouvellement
 * rouvrirait. Sans ce chiffre, l'alerte est une contrainte ; avec, c'est un
 * argument.
 */
export async function GET(requete: Request) {
  if (!n8nAutorise(requete)) return refusN8n();

  const jours = Number(new URL(requete.url).searchParams.get("jours") ?? JOURS_PAR_DEFAUT);
  if (!Number.isFinite(jours) || jours <= 0 || jours > 365) {
    return Response.json({ ok: false, message: "Paramètre « jours » invalide." }, { status: 400 });
  }

  const sql = connexion();
  try {
    const lignes = await sql<
      {
        compte_id: number; prenom: string; nom: string; email: string;
        webhook_discord: string | null; type_code: string; categorie_code: string | null;
        date_echeance: string; jours_restants: number; missions_debloquees: number;
      }[]
    >`
      select
        i.compte_id, i.prenom, i.nom, c.email, i.webhook_discord,
        cert.type_code, cat.code as categorie_code,
        cert.date_echeance::text,
        (cert.date_echeance - current_date)::int as jours_restants,
        -- Missions ouvertes que le renouvellement rendrait accessibles : celles qui
        -- exigent ce titre et dont la fin tombe après l'échéance actuelle.
        (
          select count(*)::int from mission m
          join mission_certification_requise r on r.mission_id = m.id
          left join categorie_certification rc on rc.id = r.categorie_id
          where m.statut = 'publiee'
            and m.date_fin >= current_date
            and r.type_code = cert.type_code
            and (rc.code is null or rc.code = cat.code)
            and m.date_fin > cert.date_echeance
        ) as missions_debloquees
      from certification cert
      join interimaire i on i.compte_id = cert.interimaire_id
      join compte c on c.id = i.compte_id
      left join categorie_certification cat on cat.id = cert.categorie_id
      where cert.date_echeance between current_date and current_date + ${jours}::int
      order by cert.date_echeance`;

    return Response.json({
      ok: true,
      genereLe: new Date().toISOString(),
      fenetreJours: jours,
      alertes: lignes.map((l) => {
        const type = typeCertification(l.type_code);
        const titre = `${type?.libelle ?? l.type_code}${l.categorie_code ? ` catégorie ${l.categorie_code}` : ""}`;
        return {
          interimaireId: l.compte_id,
          nomComplet: `${l.prenom} ${l.nom}`,
          email: l.email,
          webhookDiscord: l.webhook_discord,
          certification: titre,
          dateEcheance: l.date_echeance,
          joursRestants: l.jours_restants,
          missionsDebloquees: l.missions_debloquees,
          // Message prêt à poster : n8n n'a pas à connaître nos règles métier.
          message:
            `**${l.prenom}**, votre ${titre} expire dans ${l.jours_restants} jours ` +
            `(le ${new Date(`${l.date_echeance}T00:00:00Z`).toLocaleDateString("fr-FR")}).` +
            (l.missions_debloquees > 0
              ? ` Le renouveler vous rouvrirait **${l.missions_debloquees} mission${l.missions_debloquees > 1 ? "s" : ""}** actuellement ouverte${l.missions_debloquees > 1 ? "s" : ""}.`
              : ` Aucune mission ouverte n'en dépend pour l'instant, mais sans lui vous serez écarté des prochaines.`),
        };
      }),
    });
  } finally {
    await sql.end();
  }
}
