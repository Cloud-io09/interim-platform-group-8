-- ---------------------------------------------------------------------------
-- Vérification de l'adresse e-mail
--
-- Depuis que le lien de réinitialisation est devenu le chemin principal de
-- récupération, une adresse mal saisie est une prise sur le compte : celui qui
-- s'inscrit avec « karim@gmial.com » offre au propriétaire réel de cette boîte le
-- moyen de réinitialiser son mot de passe.
--
-- La vérification ne bloque PAS l'inscription — le public visé abandonnerait au
-- premier obstacle. Elle conditionne une seule chose : l'envoi d'un lien de
-- réinitialisation. Les codes de récupération restent disponibles pour tous, donc
-- personne n'est enfermé dehors.
-- ---------------------------------------------------------------------------

alter table compte add column email_verifie_le timestamptz;

comment on column compte.email_verifie_le is
  'Date à laquelle le titulaire a prouvé qu''il relève cette boîte. Null = non vérifiée : aucun lien de réinitialisation n''y sera envoyé.';

-- Les comptes de démonstration sont des fixtures dont l'adresse est fictive mais
-- maîtrisée : les marquer vérifiés évite que la fonctionnalité paraisse cassée en
-- soutenance. Aucun compte réel n'est concerné.
update compte set email_verifie_le = now() where email like '%@demo.interimatch.test';
