import type { Metadata } from "next";
import { connexion } from "@interimatch/core/db";
import { exigerSession } from "@/lib/garde";
import { aujourdhuiParis } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Mes fiches de poste",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAR_PAGE = 25;

const enJourMois = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

const LIBELLE_STATUT: Record<string, string> = {
  brouillon: "Brouillon",
  publiee: "Publiée",
  pourvue: "Attribuée",
  close: "Close",
};

const PASTILLE_STATUT: Record<string, string> = {
  brouillon: "pastille--attention",
  publiee: "pastille--info",
  pourvue: "pastille--ok",
  close: "pastille--info",
};

/**
 * Les vues de la console. « À traiter » passe devant tout : c'est la seule qui
 * appelle un geste. Chaque vue est un filtre SQL, jamais un tri côté navigateur —
 * sans quoi une entreprise à cent fiches téléchargerait les cent pour en voir dix.
 */
const VUES = {
  "a-traiter": { libelle: "À traiter", filtre: "a_traiter" },
  ouvertes: { libelle: "Ouvertes", filtre: "publiee" },
  brouillons: { libelle: "Brouillons", filtre: "brouillon" },
  attribuees: { libelle: "Attribuées", filtre: "pourvue" },
  closes: { libelle: "Closes", filtre: "close" },
  toutes: { libelle: "Toutes", filtre: "toutes" },
} as const;
type Vue = keyof typeof VUES;

interface Ligne {
  id: number;
  titre: string;
  ville: string;
  statut: string;
  date_debut: string;
  date_fin: string;
  metier: string;
  a_traiter: number;
  sollicitees: number;
  total: number;
  affecte: string | null;
}

function delai(debut: string, aujourdhui: string): string {
  const jours = Math.round((Date.parse(`${debut}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / 86_400_000);
  if (jours < 0) return "en cours";
  if (jours === 0) return "démarre aujourd'hui";
  if (jours === 1) return "démarre demain";
  return `démarre dans ${jours} j`;
}

/** Reconstruit l'adresse de la page en ne changeant que les paramètres donnés. */
function lien(actuels: Record<string, string>, change: Record<string, string | null>): string {
  const p = new URLSearchParams(actuels);
  for (const [k, v] of Object.entries(change)) {
    if (v === null || v === "") p.delete(k);
    else p.set(k, v);
  }
  const q = p.toString();
  return q ? `/missions?${q}` : "/missions";
}

/**
 * Console des fiches de poste.
 *
 * **Pensée pour cent fiches et mille candidats, pas pour trois.** La page empilait
 * une carte par fiche, sans un seul chiffre de candidature : à cent fiches, on
 * faisait défiler un mur pour trouver celle qui attendait une réponse. Elle répond
 * maintenant d'abord à « où dois-je agir ? » — bandeau de chiffres cliquables, vue
 * « À traiter » —, puis laisse chercher, filtrer et paginer.
 *
 * Tout se calcule en deux requêtes agrégées, quel que soit le volume : les compteurs
 * de l'entreprise, puis la page de fiches demandée avec ses compteurs de candidatures.
 * Le nombre de profils conformes n'y figure pas : il suppose de rejouer le moteur pour
 * chaque fiche, ce qui ne tiendrait pas à cette échelle. Il est sur la fiche.
 */
export default async function MesMissions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await exigerSession("entreprise");
  const brut = await searchParams;
  const param = (k: string) => (typeof brut[k] === "string" ? (brut[k] as string) : "");

  const aujourdhui = aujourdhuiParis();
  const recherche = param("q").trim().slice(0, 80);
  const pageDemandee = Math.max(1, Number.parseInt(param("page"), 10) || 1);

  const sql = connexion();
  try {
    const [c] = await sql<
      {
        total: number; ouvertes: number; brouillons: number; attribuees: number; closes: number;
        fiches_a_traiter: number; candidatures_a_traiter: number; imminentes: number; sans_candidature: number;
      }[]
    >`
      with f as (
        select m.id, m.statut, m.date_debut, m.interimaire_affecte_id,
               count(c.id) filter (where c.statut = 'candidatee')::int as a_traiter,
               count(c.id)::int as total
        from mission m
        left join candidature c on c.mission_id = m.id
        where m.entreprise_id = ${session.compteId}
        group by m.id
      )
      select
        count(*)::int as total,
        count(*) filter (where statut = 'publiee')::int as ouvertes,
        count(*) filter (where statut = 'brouillon')::int as brouillons,
        count(*) filter (where statut = 'pourvue')::int as attribuees,
        count(*) filter (where statut = 'close')::int as closes,
        count(*) filter (where statut = 'publiee' and a_traiter > 0)::int as fiches_a_traiter,
        coalesce(sum(a_traiter) filter (where statut = 'publiee'), 0)::int as candidatures_a_traiter,
        count(*) filter (where statut = 'publiee' and interimaire_affecte_id is null
                           and date_debut between ${aujourdhui}::date and ${aujourdhui}::date + 7)::int as imminentes,
        count(*) filter (where statut = 'publiee' and total = 0)::int as sans_candidature
      from f`;

    // La vue par défaut est celle qui appelle un geste, quand il y en a un.
    const vueParam = param("vue") as Vue;
    const vue: Vue = vueParam in VUES ? vueParam : c!.fiches_a_traiter > 0 ? "a-traiter" : "ouvertes";
    const compte: Record<Vue, number> = {
      "a-traiter": c!.fiches_a_traiter,
      ouvertes: c!.ouvertes,
      brouillons: c!.brouillons,
      attribuees: c!.attribuees,
      closes: c!.closes,
      toutes: c!.total,
    };
    const filtre = VUES[vue].filtre;
    const special = param("filtre"); // « imminentes » ou « sans-candidature », depuis le bandeau

    const lignes = await sql<(Ligne & { n: number })[]>`
      select m.id, m.titre, m.ville, m.statut, m.date_debut::text, m.date_fin::text,
             me.libelle as metier,
             count(c.id) filter (where c.statut = 'candidatee')::int as a_traiter,
             count(c.id) filter (where c.statut = 'sollicitee')::int as sollicitees,
             count(c.id)::int as total,
             (select i.prenom || ' ' || left(i.nom, 1) || '.' from interimaire i
               where i.compte_id = m.interimaire_affecte_id) as affecte,
             count(*) over ()::int as n
      from mission m
      join metier me on me.code = m.metier_code
      left join candidature c on c.mission_id = m.id
      where m.entreprise_id = ${session.compteId}
        ${filtre === "a_traiter" || filtre === "toutes" ? sql`` : sql`and m.statut = ${filtre}`}
        ${filtre === "a_traiter" ? sql`and m.statut = 'publiee'` : sql``}
        ${recherche ? sql`and (m.titre ilike ${"%" + recherche + "%"} or m.ville ilike ${"%" + recherche + "%"})` : sql``}
        ${special === "imminentes"
          ? sql`and m.statut = 'publiee' and m.interimaire_affecte_id is null
                and m.date_debut between ${aujourdhui}::date and ${aujourdhui}::date + 7`
          : sql``}
      group by m.id, me.libelle
      having true
        ${filtre === "a_traiter" ? sql`and count(c.id) filter (where c.statut = 'candidatee') > 0` : sql``}
        ${special === "sans-candidature" ? sql`and count(c.id) = 0` : sql``}
      order by
        ${filtre === "a_traiter"
          ? sql`count(c.id) filter (where c.statut = 'candidatee') desc, m.date_debut`
          : filtre === "pourvue" || filtre === "close"
            ? sql`m.date_debut desc`
            : sql`m.date_debut`}
      limit ${PAR_PAGE} offset ${(pageDemandee - 1) * PAR_PAGE}`;

    const trouvees = lignes[0]?.n ?? 0;
    const pages = Math.max(1, Math.ceil(trouvees / PAR_PAGE));
    const actuels: Record<string, string> = Object.fromEntries(
      Object.entries({ vue, q: recherche, filtre: special }).filter(([, v]) => v)
    );

    return (
      <section className="section">
        <div className="colonne">
          <div className="tete-page">
            <div>
              <h1 className="titre-page">Mes fiches de poste</h1>
              <p className="secondaire" style={{ margin: 0 }}>
                {c!.total === 0
                  ? "Vous n'avez pas encore publié de fiche."
                  : `${c!.total} fiche${c!.total > 1 ? "s" : ""} au total.`}
              </p>
            </div>
            <a className="bouton" href="/missions/nouvelle">Publier une fiche de poste</a>
          </div>

          {c!.total === 0 ? (
            <div className="carte">
              <h2 className="titre-carte">Comment ça marche</h2>
              <p className="secondaire" style={{ margin: 0 }}>
                Vous décrivez le besoin : métier, dates, habilitations exigées. Intérimatch
                écarte les profils non conformes, puis classe les autres. Vous ne voyez que
                des candidats dont les titres sont valides à la date de fin de votre chantier.
              </p>
            </div>
          ) : (
            <>
              {/* Chaque chiffre mène à la liste qu'il résume. */}
              <ul className="liste-nue bandeau-chiffres bandeau-chiffres--4">
                <li>
                  <a className="chiffre-lien" href={lien({}, { vue: "a-traiter" })}>
                    <strong className="chiffre">{c!.candidatures_a_traiter}</strong>
                    <span className="petit secondaire">
                      candidature{c!.candidatures_a_traiter > 1 ? "s" : ""} à traiter
                    </span>
                  </a>
                </li>
                <li>
                  <a className="chiffre-lien" href={lien({}, { vue: "ouvertes" })}>
                    <strong className="chiffre">{c!.ouvertes}</strong>
                    <span className="petit secondaire">fiche{c!.ouvertes > 1 ? "s" : ""} ouverte{c!.ouvertes > 1 ? "s" : ""}</span>
                  </a>
                </li>
                <li>
                  <a className="chiffre-lien" href={lien({}, { vue: "ouvertes", filtre: "imminentes" })}>
                    <strong className="chiffre">{c!.imminentes}</strong>
                    <span className="petit secondaire">démarrent sous 7 jours sans intérimaire</span>
                  </a>
                </li>
                <li>
                  <a className="chiffre-lien" href={lien({}, { vue: "ouvertes", filtre: "sans-candidature" })}>
                    <strong className="chiffre">{c!.sans_candidature}</strong>
                    <span className="petit secondaire">sans aucune candidature</span>
                  </a>
                </li>
              </ul>

              <div className="barre-fiches">
                <nav aria-label="Filtrer les fiches" className="filtres">
                  <ul className="liste-nue">
                    {(Object.keys(VUES) as Vue[]).map((v) => (
                      <li key={v}>
                        <a
                          className={`filtre${v === vue ? " filtre--actif" : ""}`}
                          href={lien({ q: recherche }, { vue: v })}
                          aria-current={v === vue ? "page" : undefined}
                        >
                          {VUES[v].libelle} <span className="filtre-compte">{compte[v]}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>

                <form method="get" action="/missions" className="recherche-fiches" role="search">
                  <input type="hidden" name="vue" value={vue} />
                  <label htmlFor="q" className="visuellement-cache">Rechercher une fiche</label>
                  <input id="q" name="q" type="search" defaultValue={recherche} placeholder="Intitulé ou commune" />
                  <button className="bouton bouton--secondaire" type="submit">Rechercher</button>
                </form>
              </div>

              {special && (
                <p className="petit secondaire">
                  Filtre :{" "}
                  {special === "imminentes" ? "démarrent sous 7 jours sans intérimaire" : "sans aucune candidature"}{" "}
                  · <a href={lien(actuels, { filtre: null, page: null })}>retirer</a>
                </p>
              )}

              {lignes.length === 0 ? (
                <div className="carte">
                  <p className="secondaire" style={{ margin: 0 }}>
                    {recherche
                      ? `Aucune fiche ne correspond à « ${recherche} » dans cette vue.`
                      : vue === "a-traiter"
                        ? "Aucune candidature n'attend votre réponse."
                        : "Aucune fiche dans cette vue."}
                  </p>
                </div>
              ) : (
                <div className="carte tableau-conteneur">
                  <table className="tableau-fiches">
                    <caption className="visuellement-cache">
                      {VUES[vue].libelle} : {trouvees} fiche{trouvees > 1 ? "s" : ""}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Fiche</th>
                        <th scope="col">Dates</th>
                        <th scope="col">État</th>
                        <th scope="col" className="nombre">À traiter</th>
                        <th scope="col" className="nombre">Candidatures</th>
                        <th scope="col"><span className="visuellement-cache">Action</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((m) => (
                        <tr key={m.id}>
                          <td data-libelle="Fiche">
                            <a className="tableau-titre" href={`/missions/${m.id}`}>{m.titre}</a>
                            <span className="petit secondaire">{m.metier} · {m.ville}</span>
                          </td>
                          <td data-libelle="Dates">
                            <span>{enJourMois(m.date_debut)} → {enJourMois(m.date_fin)}</span>
                            {m.statut === "publiee" && (
                              <span className="petit secondaire">{delai(m.date_debut, aujourdhui)}</span>
                            )}
                          </td>
                          <td data-libelle="État">
                            <span className={`pastille ${PASTILLE_STATUT[m.statut] ?? "pastille--info"}`}>
                              {LIBELLE_STATUT[m.statut] ?? m.statut}
                            </span>
                            {m.affecte && <span className="petit secondaire">{m.affecte}</span>}
                          </td>
                          <td data-libelle="À traiter" className="nombre">
                            {m.a_traiter > 0 ? (
                              <span className="pastille pastille--attention">{m.a_traiter}</span>
                            ) : (
                              <span className="secondaire">0</span>
                            )}
                          </td>
                          <td data-libelle="Candidatures" className="nombre">
                            {m.total}
                            {m.sollicitees > 0 && (
                              <span className="petit secondaire">dont {m.sollicitees} sollicitée{m.sollicitees > 1 ? "s" : ""}</span>
                            )}
                          </td>
                          <td className="tableau-action">
                            <a
                              className={m.a_traiter > 0 ? "bouton" : "bouton bouton--secondaire"}
                              href={`/missions/${m.id}`}
                              aria-label={`${m.a_traiter > 0 ? "Répondre" : "Ouvrir"} : ${m.titre}`}
                            >
                              {m.a_traiter > 0 ? "Répondre" : "Ouvrir"}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {pages > 1 && (
                <nav aria-label="Pages" className="pagination">
                  {pageDemandee > 1 ? (
                    <a className="bouton bouton--secondaire" href={lien(actuels, { page: String(pageDemandee - 1) })}>
                      Précédente
                    </a>
                  ) : <span />}
                  <span className="petit secondaire">
                    Page {pageDemandee} sur {pages} · {trouvees} fiches
                  </span>
                  {pageDemandee < pages ? (
                    <a className="bouton bouton--secondaire" href={lien(actuels, { page: String(pageDemandee + 1) })}>
                      Suivante
                    </a>
                  ) : <span />}
                </nav>
              )}
            </>
          )}
        </div>
      </section>
    );
  } finally {
    await sql.end();
  }
}
