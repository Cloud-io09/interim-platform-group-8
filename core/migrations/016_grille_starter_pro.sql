-- ---------------------------------------------------------------------------
-- Nouvelle grille : Découverte / Starter / Pro
--
-- Les paliers Chantier (89 €, 10 contacts) et Régie (249 €, illimité) deviennent
-- Starter (39 €, 40 contacts, 4 fiches en ligne) et Pro (129 €, illimité). Les
-- montants vivent dans `core/src/offre.ts` ; la base ne stocke que le code du palier,
-- qu'il faut donc renommer ici pour que les abonnés gardent leurs droits.
--
-- Chaque abonné passe au palier de rang équivalent. Aucun n'y perd : Starter donne
-- quatre fois plus de contacts que Chantier, pour moins cher.
-- ---------------------------------------------------------------------------

update compte set plan_code = 'starter' where plan_code = 'chantier';
update compte set plan_code = 'pro'     where plan_code = 'regie';

-- Le nombre de fiches publiées par entreprise devient une limite de palier : le
-- compter à chaque publication ne doit pas parcourir toute la table.
create index if not exists mission_entreprise_statut_idx on mission (entreprise_id, statut);
