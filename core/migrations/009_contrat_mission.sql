-- ---------------------------------------------------------------------------
-- Mentions obligatoires du contrat de mission
--
-- Le sujet impose de respecter les grandes règles de l'intérim. Cinq des six
-- mentions qu'un logiciel peut garantir existaient déjà — poste, qualification,
-- terme, lieu, rémunération. Les horaires manquaient, et sans eux le document de
-- mission ne peut pas être conforme.
--
-- Texte libre et non structuré : un chantier alterne des journées de 7 h et de 9 h,
-- des postes du matin et de l'après-midi. Imposer une grille horaire obligerait à
-- mentir dans la moitié des cas.
-- ---------------------------------------------------------------------------

alter table mission add column horaires text;

comment on column mission.horaires is
  'Mention obligatoire du contrat de mission : horaires de travail.';
