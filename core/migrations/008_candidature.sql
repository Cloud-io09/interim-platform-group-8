-- ---------------------------------------------------------------------------
-- Candidature : le verbe qui manquait à l'intérimaire
--
-- Le modèle initial ne connaissait que trois états, tous décidés par l'entreprise :
-- elle proposait, elle acceptait, elle refusait. L'intérimaire consultait. Un
-- rapprochement bilatéral suppose que les deux côtés puissent agir, et que l'on
-- sache lequel a agi — le motif d'un refus n'a pas le même sens selon son auteur.
--
-- Les états de l'ancien modèle sont conservés par migration des lignes existantes :
-- « acceptee » reste « acceptee », « refusee » devient « declinee ».
-- ---------------------------------------------------------------------------

alter table candidature drop constraint candidature_statut_check;

update candidature set statut = 'declinee' where statut = 'refusee';

alter table candidature
  add constraint candidature_statut_check check (statut in (
    'proposee',    -- le moteur a rapproché : ni l'un ni l'autre n'a encore agi
    'candidatee',  -- l'intérimaire a postulé, l'entreprise doit répondre
    'sollicitee',  -- l'entreprise a sollicité, l'intérimaire doit répondre
    'acceptee',    -- accord des deux côtés : devient une affectation
    'declinee',    -- refus, terminal
    'expiree'      -- la mission a démarré ou a été pourvue entre-temps
  ));

-- Qui a agi en dernier. Sans cette colonne, « declinee » ne dit pas si c'est
-- l'entreprise qui a écarté le profil ou l'intérimaire qui a refusé le chantier —
-- deux faits que ni l'une ni l'autre ne doit confondre.
alter table candidature
  add column decide_par text check (decide_par in ('interimaire', 'entreprise')),
  add column motif      text,
  add column decide_le  timestamptz;

-- Une mission pourvue porte l'intérimaire affecté : sans cette référence, « pourvue »
-- est un statut sans contenu, et l'on ne peut pas afficher qui travaille sur le
-- chantier.
alter table mission
  add column interimaire_affecte_id int references interimaire(compte_id) on delete set null;

create index candidature_a_traiter_idx on candidature (interimaire_id, statut);
