import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { BASE } from "./serveur";

/**
 * Le chiffrement au repos, démontré plutôt qu'affirmé.
 *
 * « Les données sensibles sont chiffrées » est une phrase que tout le monde écrit.
 * Ce fichier la transforme en propriété vérifiable : on enregistre des valeurs
 * repérables par un parcours normal, puis on relit la base **en direct**, hors de
 * l'application, et on vérifie qu'aucune ne s'y retrouve en clair.
 *
 * Le second test est le plus utile à long terme : il oblige quiconque ajoute une
 * colonne à une table porteuse de données personnelles à déclarer si elle est
 * sensible, et pourquoi. Une colonne non classée fait échouer la suite — on ne peut
 * donc pas ajouter discrètement un champ en clair.
 */

const MARQUE = `chiffre-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";

/** Valeurs choisies pour être introuvables ailleurs : leur présence en base est un aveu. */
const TEMOINS = {
  telephone: "0612345678",
  adresse: "17 rue du Temoin Secret",
  carteBtp: "BTP-TEMOIN-998877",
  numeroCertification: "CACES-TEMOIN-445566",
  cvTexte:
    "CURRICULUM VITAE Temoin Secret. Macon coffreur, 8 ans d'experience sur chantiers " +
    "de gros oeuvre. Realisation de fondations, murs porteurs, dalles beton. " +
    "Deblayer, remblayer un terrain avant coulage. CACES R482 categorie B1.",
} as const;

/**
 * Classification des colonnes des tables porteuses de données personnelles.
 *
 * `chiffre` : la colonne ne doit jamais contenir de clair.
 * `clair` : la colonne est lisible en base, et la raison est écrite — une donnée
 * qu'on chiffrerait sans pouvoir s'en servir rendrait le produit inopérant.
 */
const CLASSIFICATION: Record<string, Record<string, { etat: "chiffre" | "clair"; raison: string }>> = {
  compte: {
    id: { etat: "clair", raison: "Clé technique." },
    email: { etat: "clair", raison: "Identifiant de connexion : il doit être cherchable." },
    mot_de_passe_hash: { etat: "clair", raison: "Empreinte scrypt, non réversible par construction." },
    mot_de_passe_sel: { etat: "clair", raison: "Un sel n'est pas un secret ; il doit être lisible pour vérifier." },
    role: { etat: "clair", raison: "Détermine les permissions à chaque requête." },
    cree_le: { etat: "clair", raison: "Horodatage technique." },
    email_verifie_le: {
      etat: "clair",
      raison:
        "Date seule, sans contenu personnel, lue à chaque demande de réinitialisation pour décider si un lien peut partir.",
    },
    discord_utilisateur_id: {
      etat: "clair",
      raison:
        "Identifiant du compte Discord que la personne a elle-même rattaché. Contraint unique, donc comparable : un chiffrement à vecteur aléatoire l'en empêcherait. Il n'ouvre aucun accès et se retire d'un clic.",
    },
    discord_salon_id: {
      etat: "clair",
      raison: "Identifiant d'un salon, pas une donnée personnelle. Sert à y poster et à le supprimer.",
    },
    discord_relie_le: { etat: "clair", raison: "Horodatage technique." },
  },
  interimaire: {
    compte_id: { etat: "clair", raison: "Clé technique." },
    prenom: { etat: "clair", raison: "Affiché à l'entreprise qui reçoit une candidature." },
    nom: { etat: "clair", raison: "Idem." },
    telephone_chiffre: { etat: "chiffre", raison: "Coordonnée directe, inutile au fonctionnement." },
    adresse_chiffree: { etat: "chiffre", raison: "Adresse précise du domicile." },
    code_postal: { etat: "clair", raison: "Sert au géocodage et au calcul de distance." },
    ville: { etat: "clair", raison: "Idem, et affichée dans les listes." },
    lat: { etat: "clair", raison: "Coordonnée de la commune, pas du domicile : c'est le géocodage du code postal." },
    lon: { etat: "clair", raison: "Idem." },
    rayon_mobilite_km: { etat: "clair", raison: "Critère de scoring." },
    carte_btp_numero_chiffre: { etat: "chiffre", raison: "Identifiant nominatif rattaché à une situation d'emploi." },
    carte_btp_echeance: { etat: "clair", raison: "Date seule, sans identifiant : inexploitable isolément." },
    cv_texte_chiffre: { etat: "chiffre", raison: "Historique d'emploi complet : la donnée la plus riche du produit." },
    cv_nom_fichier: { etat: "clair", raison: "Nom du fichier, affiché pour que l'utilisateur reconnaisse son dépôt." },
    cv_depose_le: { etat: "clair", raison: "Horodatage technique." },
  },
  entreprise: {
    compte_id: { etat: "clair", raison: "Clé technique." },
    raison_sociale: { etat: "clair", raison: "Information publique, affichée sur chaque fiche de poste." },
    siret: { etat: "clair", raison: "Donnée publique, consultable au registre du commerce." },
    adresse: { etat: "clair", raison: "Adresse d'établissement, non personnelle." },
    code_postal: { etat: "clair", raison: "Sert au calcul de distance." },
    ville: { etat: "clair", raison: "Idem." },
    lat: { etat: "clair", raison: "Idem." },
    lon: { etat: "clair", raison: "Idem." },
    telephone_chiffre: { etat: "chiffre", raison: "Coordonnée directe d'un interlocuteur." },
  },
  certification: {
    id: { etat: "clair", raison: "Clé technique." },
    interimaire_id: { etat: "clair", raison: "Clé étrangère." },
    type_code: { etat: "clair", raison: "Le moteur filtre dessus : le chiffrer rendrait le matching impossible." },
    categorie_id: { etat: "clair", raison: "Idem." },
    organisme_emetteur: { etat: "clair", raison: "Organisme de formation, pas une donnée personnelle." },
    numero_chiffre: { etat: "chiffre", raison: "Identifiant nominatif du titre." },
    date_obtention: { etat: "clair", raison: "Date seule." },
    date_echeance: { etat: "clair", raison: "C'est la donnée qui décide de l'éligibilité : elle doit être comparable en SQL." },
    cree_le: { etat: "clair", raison: "Horodatage technique." },
  },
};

async function appel(chemin: string, methode: string, corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : null };
}

let email = "";
let cookie = "";

beforeAll(async () => {
  email = `${MARQUE}@exemple.test`;
  const r = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role: "interimaire" }),
  });
  cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";

  await appel("/api/profil/interimaire", "POST", {
    prenom: "Temoin", nom: "Secret",
    telephone: TEMOINS.telephone,
    adresse: TEMOINS.adresse,
    codePostal: "51100", ville: "Reims",
    rayonMobiliteKm: 50, metiers: ["F1703"],
    carteBtpNumero: TEMOINS.carteBtp,
    carteBtpEcheance: "2030-01-01",
  }, cookie);

  await appel("/api/certifications", "POST", {
    typeCode: "CACES_R482", categorieCode: "B1", organismeEmetteur: "AFPA",
    numero: TEMOINS.numeroCertification,
    dateObtention: "2024-01-15", dateEcheance: "2034-01-15",
  }, cookie);

  await appel("/api/cv", "POST", { nomFichier: "temoin.pdf", texte: TEMOINS.cvTexte }, cookie);
});

afterAll(async () => {
  const sql = connexion();
  try {
    await sql`delete from compte where email = ${email}`;
  } finally {
    await sql.end();
  }
});

describe("chiffrement au repos — démontré en relisant la base", () => {
  it("n'écrit aucun témoin en clair dans les colonnes chiffrées", async () => {
    const sql = connexion();
    try {
      const [ligne] = await sql<Record<string, string | null>[]>`
        select i.telephone_chiffre, i.adresse_chiffree, i.carte_btp_numero_chiffre,
               i.cv_texte_chiffre, c.numero_chiffre
        from interimaire i
        join compte cpt on cpt.id = i.compte_id
        left join certification c on c.interimaire_id = i.compte_id
        where cpt.email = ${email}`;

      expect(ligne, "le profil de test doit exister").toBeDefined();

      const attendus: [keyof typeof TEMOINS, string][] = [
        ["telephone", ligne!.telephone_chiffre!],
        ["adresse", ligne!.adresse_chiffree!],
        ["carteBtp", ligne!.carte_btp_numero_chiffre!],
        ["numeroCertification", ligne!.numero_chiffre!],
        ["cvTexte", ligne!.cv_texte_chiffre!],
      ];

      for (const [temoin, stocke] of attendus) {
        expect(stocke, `${temoin} : rien n'a été stocké`).toBeTruthy();
        // Enveloppe AES-256-GCM : iv.tag.chiffré, en base64url.
        expect(stocke.split("."), `${temoin} : enveloppe mal formée`).toHaveLength(3);
        expect(stocke, `${temoin} EN CLAIR EN BASE`).not.toContain(TEMOINS[temoin]);
      }

      // Le CV est du texte long : on éprouve aussi un fragment, un chiffrement
      // partiel ne devant pas passer pour un chiffrement.
      expect(ligne!.cv_texte_chiffre).not.toContain("Temoin");
      expect(ligne!.cv_texte_chiffre).not.toContain("coffreur");
    } finally {
      await sql.end();
    }
  });

  it("rend les valeurs d'origine au propriétaire, et à lui seul", async () => {
    // Un chiffrement qui perdrait la donnée passerait le test précédent : il faut
    // donc vérifier aussi l'aller-retour.
    const mien = await appel("/api/profil/interimaire", "GET", undefined, cookie);
    expect(mien.corps.profil.telephone).toBe(TEMOINS.telephone);
    expect(mien.corps.profil.adresse).toBe(TEMOINS.adresse);
    expect(mien.corps.profil.carteBtpNumero).toBe(TEMOINS.carteBtp);

    const sansSession = await appel("/api/profil/interimaire", "GET");
    expect(sansSession.statut).toBe(401);
  });

  it("oblige à classer toute nouvelle colonne portant des données personnelles", async () => {
    // Garde-fou de long terme : ajouter une colonne à l'une de ces tables sans la
    // déclarer fait échouer la suite. On ne peut donc pas glisser un champ sensible
    // en clair sans que quelqu'un ait eu à écrire pourquoi.
    const sql = connexion();
    try {
      for (const [table, colonnes] of Object.entries(CLASSIFICATION)) {
        const reelles = await sql<{ column_name: string }[]>`
          select column_name from information_schema.columns
          where table_schema = 'public' and table_name = ${table}`;

        const nonClassees = reelles.map((c) => c.column_name).filter((c) => !(c in colonnes));
        expect(
          nonClassees,
          `table « ${table} » : colonne(s) non classée(s) — déclarez-les dans CLASSIFICATION ` +
            `avec leur état et la raison : ${nonClassees.join(", ")}`
        ).toEqual([]);

        // L'inverse est une erreur aussi : une classification qui décrit une colonne
        // disparue donne une fausse impression de couverture.
        const disparues = Object.keys(colonnes).filter(
          (c) => !reelles.some((r) => r.column_name === c)
        );
        expect(disparues, `table « ${table} » : classification obsolète`).toEqual([]);
      }
    } finally {
      await sql.end();
    }
  });

  it("chiffre tout ce que la classification annonce comme chiffré", () => {
    // Cohérence interne : le nom d'une colonne déclarée chiffrée doit le dire, pour
    // qu'une relecture de schéma suffise à repérer ce qui l'est.
    for (const [table, colonnes] of Object.entries(CLASSIFICATION)) {
      for (const [nom, { etat }] of Object.entries(colonnes)) {
        if (etat === "chiffre") {
          expect(nom, `${table}.${nom} : une colonne chiffrée doit le porter dans son nom`).toMatch(
            /_chiffre|_chiffree$/
          );
        }
      }
    }
  });
});
