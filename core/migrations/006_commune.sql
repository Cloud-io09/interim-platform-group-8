-- Nom de commune normalisé.
--
-- L'API renvoie un libellé de la forme « 51 - Reims », parfois « 51 - REIMS » ou
-- « 973 - Saint-Laurent-du-Maroni ». Sans normalisation, le produit affichait des
-- lieux du type « Commune 51100 » — techniquement exacts, illisibles pour un
-- utilisateur. C'est la « conversion de formats de lieux » attendue à l'ingestion.

alter table offre_ft add column commune_libelle text;
create index offre_ft_commune_idx on offre_ft (commune_libelle);
