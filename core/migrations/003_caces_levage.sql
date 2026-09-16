-- Élargissement du référentiel CACES aux recommandations réellement citées dans les
-- offres BTP. Mesuré sur 1 800 offres d'intérim : un grutier relève du R487 (grues à
-- tour, 25 % de ses offres) ou du R490 (grues auxiliaires, 25 %), presque jamais du
-- R482. Sans ces types, le produit ignorait le métier de grutier.
--
-- Durées de validité : 10 ans pour le R482, 5 ans pour les autres recommandations
-- (recommandations CNAM en vigueur).

insert into type_certification (code, libelle, validite_mois, exige_categorie, ordre) values
  ('CACES_R483', 'CACES R483 — grues mobiles',              60, true,  6),
  ('CACES_R486', 'CACES R486 — plates-formes élévatrices',  60, true,  7),
  ('CACES_R487', 'CACES R487 — grues à tour',               60, true,  8),
  ('CACES_R490', 'CACES R490 — grues de chargement',        60, false, 9);

insert into categorie_certification (type_code, code, libelle, ordre) values
  ('CACES_R483', 'A', 'Grues à flèche treillis',                    1),
  ('CACES_R483', 'B', 'Grues à flèche télescopique',                2),
  ('CACES_R486', 'A', 'PEMP de type A — élévation verticale',       1),
  ('CACES_R486', 'B', 'PEMP de type B — élévation multidirectionnelle', 2),
  ('CACES_R486', 'C', 'Conduite hors production',                   3),
  ('CACES_R487', '1', 'Grues à montage par éléments (GME)',         1),
  ('CACES_R487', '2', 'Grues à montage automatisé (GMA)',           2),
  ('CACES_R487', '3', 'Grues à montage automatisé avec translation', 3);
