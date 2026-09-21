-- ---------------------------------------------------------------------------
-- Un salon Discord privé par personne
--
-- Jusqu'ici les deux automatisations postaient vers une URL de webhook unique :
-- chacun lisait les alertes des autres. Or une alerte d'échéance nomme la personne,
-- son habilitation et sa date d'expiration. Diffuser cela dans un salon commun est
-- un défaut de confidentialité, pas un détail de présentation.
--
-- Les trois colonnes vivent sur `compte` et non sur `interimaire` : une entreprise
-- reçoit elle aussi des notifications, et le rattachement à Discord est de l'ordre
-- du compte, pas du rôle.
-- ---------------------------------------------------------------------------

alter table compte add column discord_utilisateur_id text unique;
alter table compte add column discord_salon_id       text;
alter table compte add column discord_relie_le       timestamptz;

comment on column compte.discord_utilisateur_id is
  'Identifiant Discord du titulaire, obtenu par OAuth2. Unique : un même compte Discord ne peut pas recevoir les notifications de deux comptes Intérimatch.';
comment on column compte.discord_salon_id is
  'Salon privé créé pour ce compte. Supprimé avec le compte et au détachement.';

-- La colonne `webhook_discord` des deux tables de profil devient sans objet : elle
-- n'a jamais été alimentée — aucune interface ne la renseignait — et le relais passe
-- désormais par le bot. La retirer évite de laisser croire qu'un second chemin existe.
alter table interimaire drop column if exists webhook_discord;
alter table entreprise  drop column if exists webhook_discord;
