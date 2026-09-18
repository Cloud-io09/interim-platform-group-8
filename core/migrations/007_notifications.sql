-- ---------------------------------------------------------------------------
-- Notifications
--
-- Jusqu'ici, les deux automatisations poussaient vers Discord et rien ne revenait
-- dans l'application : un intérimaire qui se connectait ne pouvait pas savoir qu'une
-- mission lui correspondant avait été publiée la veille. Le tableau de bord montrait
-- des compteurs, jamais des événements.
--
-- Les notifications sont créées par l'application au moment où l'événement se produit,
-- pas par le scénario n8n : la fonctionnalité reste visible même si l'automatisation
-- ne tourne pas. n8n lit la même source pour ses envois Discord.
-- ---------------------------------------------------------------------------

create table notification (
  id             serial primary key,
  compte_id      int  not null references compte(id) on delete cascade,
  type           text not null
                 check (type in (
                   'mission_correspondante',   -- une fiche publiée correspond au profil
                   'certification_expire',     -- une habilitation arrive à échéance
                   'candidature_proposee',     -- une entreprise a retenu l'intérimaire
                   'candidature_repondue'      -- l'intérimaire a accepté ou refusé
                 )),
  titre          text not null,
  corps          text,
  -- Chemin interne vers ce dont parle la notification. Une notification sans
  -- destination est une information qu'on ne peut pas traiter.
  lien           text not null,
  mission_id     int references mission(id) on delete cascade,
  certification_id int references certification(id) on delete cascade,
  cree_le        timestamptz not null default now(),
  lue_le         timestamptz
);

create index on notification (compte_id, cree_le desc);

-- Une mission publiée deux fois, un scénario rejoué, un tableau de bord rouvert :
-- rien de tout cela ne doit produire de doublon dans la liste.
create unique index notification_unicite_mission
  on notification (compte_id, type, mission_id) where mission_id is not null;

create unique index notification_unicite_certification
  on notification (compte_id, type, certification_id) where certification_id is not null;
