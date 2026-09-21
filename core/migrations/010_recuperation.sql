-- ---------------------------------------------------------------------------
-- Codes de récupération
--
-- Sans eux, un intérimaire qui oublie son mot de passe perd définitivement son
-- compte : ses habilitations, ses disponibilités, ses candidatures. C'était le
-- manque le plus grave des parcours d'authentification.
--
-- Seules les empreintes sont conservées, comme pour un mot de passe : la base ne
-- permet pas de reconstituer les codes. Un code consommé est conservé avec sa date
-- d'usage plutôt que supprimé — savoir qu'un code a servi le 14 mars fait partie de
-- ce qu'on doit pouvoir dire à quelqu'un qui conteste un accès.
-- ---------------------------------------------------------------------------

create table code_recuperation (
  compte_id  int  not null references compte(id) on delete cascade,
  empreinte  text not null,
  utilise_le timestamptz,
  cree_le    timestamptz not null default now(),
  primary key (compte_id, empreinte)
);

create index code_recuperation_disponibles_idx
  on code_recuperation (compte_id) where utilise_le is null;
