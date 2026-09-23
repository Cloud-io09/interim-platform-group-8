-- ---------------------------------------------------------------------------
-- Agences d'emploi où l'intérimaire est inscrit
--
-- **Le maillon qui manquait.** L'intérim n'existe pas sans employeur : le contrat
-- de mission lie l'agence et le salarié, jamais l'entreprise utilisatrice. Notre
-- plateforme se place en amont — elle prouve qu'un profil est affectable avant que
-- quiconque rédige un contrat — mais elle ne disait nulle part par qui ce contrat
-- passerait. L'entreprise débloquait un téléphone et découvrait ensuite qu'il fallait
-- un second appel.
--
-- Déclaratif, comme le reste du profil : un intérimaire sait où il est inscrit, et
-- aucun registre ne permettrait de le vérifier.
--
-- Pas de référentiel des agences : il y en a des milliers en France, il changerait
-- chaque semaine, et le maintenir n'apprendrait rien de plus que le nom saisi.
-- ---------------------------------------------------------------------------

create table interimaire_agence (
  id             serial primary key,
  interimaire_id int  not null references interimaire(compte_id) on delete cascade,
  nom            text not null check (length(btrim(nom)) between 2 and 120),
  ville          text,
  cree_le        timestamptz not null default now(),
  -- Deux fois la même agence dans la même ville n'a pas de sens.
  unique (interimaire_id, nom, ville)
);

create index on interimaire_agence (interimaire_id);

comment on table interimaire_agence is
  'Agences d''emploi déclarées par l''intérimaire. Leur nombre est visible de l''entreprise avant tout déblocage — c''est une information de décision ; leur identité ne l''est qu''après, car c''est une information d''action.';
