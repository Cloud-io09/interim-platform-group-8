import { cache } from "react";
import { connexion } from "@interimatch/core/db";
import { dechiffrerOptionnel } from "@interimatch/core";

export interface ProfilInterimaireLu {
  prenom: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  codePostal: string;
  ville: string;
  rayonMobiliteKm: number;
  carteBtpNumero: string | null;
  carteBtpEcheance: string | null;
  metiers: string[];
  /** Années déclarées par métier. Informative : elle n'entre pas dans le score. */
  experienceParMetier: Record<string, number | null>;
  competences: string[];
  /** Agences déclarées. Leur nombre se montre avant déblocage, leur identité après. */
  agences: { nom: string; ville: string | null }[];
}

/**
 * Relit un profil intérimaire, en déchiffrant les champs sensibles.
 *
 * Partagé entre la route d'API et le rendu serveur du formulaire : sans relecture,
 * revenir sur son profil affichait des champs vides et un enregistrement écrasait
 * silencieusement les données déjà saisies.
 */
export const lireProfilInterimaire = cache(async function lireProfilInterimaire(
  sql: ReturnType<typeof connexion>,
  compteId: number
): Promise<ProfilInterimaireLu | null> {
  const [ligne] = await sql<
    {
      prenom: string; nom: string; telephone_chiffre: string | null;
      adresse_chiffree: string | null; code_postal: string; ville: string;
      rayon_mobilite_km: number; carte_btp_numero_chiffre: string | null;
      carte_btp_echeance: string | null;
    }[]
  >`
    select prenom, nom, telephone_chiffre, adresse_chiffree, code_postal, ville,
           rayon_mobilite_km, carte_btp_numero_chiffre, carte_btp_echeance::text
    from interimaire where compte_id = ${compteId}`;
  if (!ligne) return null;

  const [metiers, competences, agences] = await Promise.all([
    sql<{ metier_code: string; annees_experience: number | null }[]>`
      select metier_code, annees_experience from interimaire_metier
      where interimaire_id = ${compteId}`,
    sql<{ competence_code: string }[]>`
      select competence_code from interimaire_competence where interimaire_id = ${compteId}`,
    sql<{ nom: string; ville: string | null }[]>`
      select nom, ville from interimaire_agence
      where interimaire_id = ${compteId} order by nom`,
  ]);

  return {
    prenom: ligne.prenom,
    nom: ligne.nom,
    telephone: dechiffrerOptionnel(ligne.telephone_chiffre),
    adresse: dechiffrerOptionnel(ligne.adresse_chiffree),
    codePostal: ligne.code_postal,
    ville: ligne.ville,
    rayonMobiliteKm: ligne.rayon_mobilite_km,
    carteBtpNumero: dechiffrerOptionnel(ligne.carte_btp_numero_chiffre),
    carteBtpEcheance: ligne.carte_btp_echeance,
    metiers: metiers.map((m) => m.metier_code),
    experienceParMetier: Object.fromEntries(
      metiers.map((m) => [m.metier_code, m.annees_experience])
    ),
    competences: competences.map((c) => c.competence_code),
    agences: agences.map((a) => ({ nom: a.nom, ville: a.ville })),
  };
});

export interface ProfilEntrepriseLu {
  raisonSociale: string;
  siret: string | null;
  adresse: string | null;
  codePostal: string;
  ville: string;
  telephone: string | null;
}

export const lireProfilEntreprise = cache(async function lireProfilEntreprise(
  sql: ReturnType<typeof connexion>,
  compteId: number
): Promise<ProfilEntrepriseLu | null> {
  const [ligne] = await sql<
    {
      raison_sociale: string; siret: string | null; adresse: string | null;
      code_postal: string; ville: string; telephone_chiffre: string | null;
    }[]
  >`
    select raison_sociale, siret, adresse, code_postal, ville, telephone_chiffre
    from entreprise where compte_id = ${compteId}`;
  if (!ligne) return null;

  return {
    raisonSociale: ligne.raison_sociale,
    siret: ligne.siret,
    adresse: ligne.adresse,
    codePostal: ligne.code_postal,
    ville: ligne.ville,
    telephone: dechiffrerOptionnel(ligne.telephone_chiffre),
  };
});
