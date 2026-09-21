import type { Sql } from "postgres";
import { empreinteCode, genererCodes, trouverEmpreinte } from "@interimatch/core";

/**
 * Codes de récupération, côté base.
 *
 * Les codes en clair ne traversent cette couche qu'une fois : au moment où on les
 * remet à l'utilisateur. Ensuite, seules les empreintes existent.
 */

/**
 * Remplace les codes d'un compte et rend les nouveaux, en clair, une seule fois.
 *
 * Remplacement en bloc, jamais ajout : régénérer doit invalider les anciens, sinon
 * quelqu'un qui aurait recopié un code il y a six mois le garderait valable.
 */
export async function remettreCodes(sql: Sql, compteId: number): Promise<string[]> {
  const codes = genererCodes();
  await sql`delete from code_recuperation where compte_id = ${compteId}`;
  await sql`
    insert into code_recuperation ${sql(
      codes.map((c) => ({ compte_id: compteId, empreinte: empreinteCode(c) }))
    )}`;
  return codes;
}

/** Combien de codes restent utilisables. */
export async function codesRestants(sql: Sql, compteId: number): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from code_recuperation
    where compte_id = ${compteId} and utilise_le is null`;
  return r?.n ?? 0;
}

/**
 * Consomme un code, s'il est valable.
 *
 * La consommation précède l'usage : si la suite échoue, le code est perdu et
 * l'utilisateur en présente un autre. Un code rejouable vaudrait un second mot de
 * passe permanent.
 *
 * Le marquage est conditionné à `utilise_le is null` dans la requête elle-même :
 * deux tentatives simultanées avec le même code ne peuvent donc pas réussir toutes
 * les deux, quelle que soit la course entre elles.
 */
export async function consommerCode(
  sql: Sql,
  compteId: number,
  codeSaisi: string
): Promise<boolean> {
  const empreintes = await sql<{ empreinte: string }[]>`
    select empreinte from code_recuperation
    where compte_id = ${compteId} and utilise_le is null`;

  const trouvee = trouverEmpreinte(codeSaisi, empreintes.map((e) => e.empreinte));
  if (!trouvee) return false;

  const consommes = await sql<{ empreinte: string }[]>`
    update code_recuperation set utilise_le = now()
    where compte_id = ${compteId} and empreinte = ${trouvee} and utilise_le is null
    returning empreinte`;
  return consommes.length > 0;
}
