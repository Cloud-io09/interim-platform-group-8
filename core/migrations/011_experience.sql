-- ---------------------------------------------------------------------------
-- Expérience déclarée, par métier
--
-- Le sujet énumère le profil intérimaire : « compétences, disponibilités, zone
-- géographique, expérience ». Les trois premières existaient ; l'expérience
-- n'apparaissait que dans le texte du CV, qui ne décide de rien.
--
-- Déclarée **par métier** et non globalement : c'est ainsi qu'elle s'énonce sur un
-- chantier — « huit ans en maçonnerie, deux en conduite d'engins » — et un seul
-- nombre global mélangerait des métiers qui n'ont rien à voir.
--
-- Elle n'entre PAS dans le score. Le sujet nomme lui-même les trois critères de
-- scoring — compétences, zone, disponibilité — et l'éligibilité vient des
-- habilitations datées, jamais de l'ancienneté déclarée. L'expérience est montrée à
-- l'entreprise qui décide ; elle ne décide pas à sa place.
-- ---------------------------------------------------------------------------

alter table interimaire_metier
  add column annees_experience int
    check (annees_experience is null or (annees_experience >= 0 and annees_experience <= 60));

comment on column interimaire_metier.annees_experience is
  'Années déclarées sur ce métier. Informative : n''entre pas dans le calcul de matching.';
