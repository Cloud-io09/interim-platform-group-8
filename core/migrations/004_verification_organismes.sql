-- Où vérifier un titre, par type.
--
-- Aucun registre national ne permet d'interroger un numéro de certification : chaque
-- organisme testeur gère le sien. Ces URL pointent donc vers l'organisme émetteur ou
-- l'organisme accréditeur, pas vers un formulaire de vérification. L'interface le dit
-- explicitement plutôt que de laisser croire à un contrôle automatique.
--
-- L'habilitation électrique n'a volontairement pas d'URL : elle est délivrée par
-- l'employeur lui-même, il n'existe aucun tiers auprès de qui la vérifier.

update type_certification set url_verification = 'https://tools.cofrac.fr/fr/easysearch/'
  where code in ('CACES_R482', 'CACES_R483', 'CACES_R486', 'CACES_R487', 'CACES_R490');

update type_certification set url_verification = 'https://www.aipr.fr'
  where code = 'AIPR';

update type_certification set url_verification = 'https://www.forprev.fr'
  where code = 'SST';

update type_certification set url_verification = 'https://www.inrs.fr'
  where code = 'AMIANTE_SS4';
