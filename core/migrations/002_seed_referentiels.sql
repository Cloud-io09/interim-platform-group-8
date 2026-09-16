-- Référentiel de certifications : liste fermée, durées de validité réelles.
-- Aucune de ces valeurs n'est saisissable par un utilisateur.

insert into type_certification (code, libelle, validite_mois, exige_categorie, ordre) values
  ('CACES_R482',  'CACES R482 — engins de chantier',            120, true,  1),
  ('AIPR',        'AIPR — intervention à proximité des réseaux',  60, false, 2),
  ('HAB_ELEC',    'Habilitation électrique',                      36, true,  3),
  ('AMIANTE_SS4', 'Amiante sous-section 4',                       36, false, 4),
  ('SST',         'SST — sauveteur secouriste du travail',        24, false, 5);

-- Catégories R482 (recommandation CNAM en vigueur).
insert into categorie_certification (type_code, code, libelle, ordre) values
  ('CACES_R482', 'A',  'Engins compacts',                                        1),
  ('CACES_R482', 'B1', 'Engins d''extraction à déplacement séquentiel',          2),
  ('CACES_R482', 'B2', 'Engins de sondage ou de forage',                         3),
  ('CACES_R482', 'C1', 'Engins de chargement à déplacement alternatif',          4),
  ('CACES_R482', 'C2', 'Engins de réglage à déplacement alternatif',             5),
  ('CACES_R482', 'C3', 'Engins de nivellement à commande automatisée',           6),
  ('CACES_R482', 'D',  'Engins de compactage',                                   7),
  ('CACES_R482', 'E',  'Engins de transport',                                    8),
  ('CACES_R482', 'F',  'Chariots de manutention tout-terrain',                   9),
  ('CACES_R482', 'G',  'Conduite hors production (déplacement, chargement)',     10);

-- Habilitations électriques (NF C 18-510).
insert into categorie_certification (type_code, code, libelle, ordre) values
  ('HAB_ELEC', 'B0',  'Non-électricien, travaux d''ordre non électrique (BT)',   1),
  ('HAB_ELEC', 'H0',  'Non-électricien, travaux d''ordre non électrique (HT)',   2),
  ('HAB_ELEC', 'H0V', 'Non-électricien, au voisinage (HT)',                      3),
  ('HAB_ELEC', 'B1',  'Exécutant, travaux d''ordre électrique (BT)',             4),
  ('HAB_ELEC', 'B1V', 'Exécutant, au voisinage (BT)',                            5),
  ('HAB_ELEC', 'B2',  'Chargé de travaux d''ordre électrique (BT)',              6),
  ('HAB_ELEC', 'B2V', 'Chargé de travaux, au voisinage (BT)',                    7),
  ('HAB_ELEC', 'BR',  'Chargé d''intervention générale (BT)',                    8),
  ('HAB_ELEC', 'BC',  'Chargé de consignation (BT)',                             9),
  ('HAB_ELEC', 'H1',  'Exécutant, travaux d''ordre électrique (HT)',            10),
  ('HAB_ELEC', 'H1V', 'Exécutant, au voisinage (HT)',                           11),
  ('HAB_ELEC', 'H2',  'Chargé de travaux d''ordre électrique (HT)',             12),
  ('HAB_ELEC', 'H2V', 'Chargé de travaux, au voisinage (HT)',                   13),
  ('HAB_ELEC', 'HC',  'Chargé de consignation (HT)',                            14);
