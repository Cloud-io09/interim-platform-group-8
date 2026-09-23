-- ---------------------------------------------------------------------------
-- Paliers, crédits et déblocages
--
-- Le produit se rémunère sur l'accès aux coordonnées d'un profil rapproché, jamais
-- sur le rapprochement lui-même : score, conformité habilitation par habilitation,
-- distance et disponibilités restent gratuits. Mettre le verdict de conformité
-- derrière un paiement reviendrait à vendre le risque que ce produit existe pour
-- supprimer.
--
-- Un déblocage porte sur un couple profil × mission. Une entreprise qui recrute deux
-- fois débloque deux fois. Sans cette borne, on vendrait l'accès à une base de
-- candidats — ce que le RGPD ne traite pas comme une place de marché.
-- ---------------------------------------------------------------------------

alter table compte add column plan_code text not null default 'decouverte';
alter table compte add column plan_depuis timestamptz;
-- Crédits achetés ou offerts. Ils ne périment pas : le bâtiment recrute par à-coups,
-- et faire expirer ce qui a été payé serait une confiscation.
alter table compte add column credits int not null default 0;

comment on column compte.plan_code is 'Palier commercial. Sans objet pour un compte intérimaire, qui ne débloque rien.';
comment on column compte.credits is 'Déblocages à l''acte restants. Consommés seulement après le quota mensuel du palier.';

create table deblocage (
  id             serial primary key,
  entreprise_id  int not null references compte(id) on delete cascade,
  interimaire_id int not null references compte(id) on delete cascade,
  mission_id     int not null references mission(id) on delete cascade,
  -- Sur quoi il a été imputé, pour pouvoir l'expliquer à qui conteste sa facture.
  source         text not null check (source in ('abonnement', 'credit')),
  cree_le        timestamptz not null default now(),
  -- **L'idempotence tient à cet index**, pas à une vérification applicative : deux
  -- clics sur le même bouton, ou deux onglets, ne doivent pas débiter deux fois.
  unique (entreprise_id, interimaire_id, mission_id)
);

-- Le quota mensuel se compte par entreprise et par mois.
create index on deblocage (entreprise_id, cree_le desc);
-- L'intérimaire doit pouvoir savoir qui a consulté ses coordonnées : sans cet index,
-- la question coûterait un parcours complet de la table.
create index on deblocage (interimaire_id, cree_le desc);

-- Les comptes entreprise déjà ouverts reçoivent les trois déblocages du palier
-- Découverte : ils n'ont pas à être punis d'être arrivés avant la tarification.
update compte set credits = 3 where role = 'entreprise';
