-- Texte extrait du CV déposé par l'intérimaire.
--
-- Le fichier lui-même n'est jamais conservé : seul son texte l'est, pour pouvoir
-- relancer l'extraction sans redemander le document. C'est une donnée personnelle
-- à part entière — elle est donc chiffrée au repos, comme l'adresse et le téléphone,
-- et emportée par la suppression du compte via la cascade sur interimaire.

alter table interimaire
  add column cv_texte_chiffre text,
  add column cv_nom_fichier   text,
  add column cv_depose_le     timestamptz;
