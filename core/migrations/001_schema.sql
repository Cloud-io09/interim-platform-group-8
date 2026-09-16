-- Schéma initial InterimMatch BTP.
-- Principe directeur : une certification est une ligne typée, contrainte au niveau du
-- schéma. Aucune colonne texte ne peut recevoir un intitulé de certification.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Référentiels (données de seed, jamais saisies par un utilisateur)
-- ---------------------------------------------------------------------------

create table type_certification (
  code            text primary key,
  libelle         text    not null,
  validite_mois   int     not null check (validite_mois > 0),
  exige_categorie boolean not null,
  url_verification text,                 -- outil de l'organisme émetteur (on ne vérifie pas nous-mêmes)
  ordre           int     not null default 0
);

create table categorie_certification (
  id        serial primary key,
  type_code text not null references type_certification(code) on delete cascade,
  code      text not null,
  libelle   text not null,
  ordre     int  not null default 0,
  unique (type_code, code)
);

-- Métiers de terrain uniquement : domaines ROME F13, F15, F16, F17.
-- F11 (conception) et F12 (encadrement) n'entrent pas en base — ce n'est pas un
-- filtre d'affichage, c'est le périmètre produit.
create table metier (
  code      text primary key,            -- code appellation ROME
  libelle   text not null,               -- libellé normalisé du référentiel France Travail
  rome_code text not null,
  domaine   char(3) not null check (domaine in ('F13', 'F15', 'F16', 'F17')),
  actif     boolean not null default true
);
create index metier_domaine_idx on metier (domaine) where actif;

create table competence (
  code    text primary key,
  libelle text not null
);

-- ---------------------------------------------------------------------------
-- Comptes — deux types distincts, parcours et permissions différents
-- ---------------------------------------------------------------------------

create table compte (
  id                serial primary key,
  email             citext unique not null,
  mot_de_passe_hash text not null,
  mot_de_passe_sel  text not null,
  role              text not null check (role in ('entreprise', 'interimaire')),
  cree_le           timestamptz not null default now()
);

create table entreprise (
  compte_id         int primary key references compte(id) on delete cascade,
  raison_sociale    text not null,
  siret             text,
  adresse           text,
  code_postal       text not null,
  ville             text not null,
  lat               double precision not null,
  lon               double precision not null,
  telephone_chiffre text,
  webhook_discord   text
);

create table interimaire (
  compte_id                int primary key references compte(id) on delete cascade,
  prenom                   text not null,
  nom                      text not null,
  telephone_chiffre        text,
  adresse_chiffree         text,
  code_postal              text not null,
  ville                    text not null,
  lat                      double precision not null,
  lon                      double precision not null,
  rayon_mobilite_km        int  not null default 40 check (rayon_mobilite_km between 5 and 200),
  -- La carte BTP n'atteste d'aucune compétence : champ séparé, jamais dans le matching.
  carte_btp_numero_chiffre text,
  carte_btp_echeance       date,
  webhook_discord          text
);

create table interimaire_metier (
  interimaire_id int  not null references interimaire(compte_id) on delete cascade,
  metier_code    text not null references metier(code),
  primary key (interimaire_id, metier_code)
);

create table interimaire_competence (
  interimaire_id  int  not null references interimaire(compte_id) on delete cascade,
  competence_code text not null references competence(code),
  primary key (interimaire_id, competence_code)
);

-- ---------------------------------------------------------------------------
-- Certifications — le cœur du produit
-- ---------------------------------------------------------------------------

create table certification (
  id                 serial primary key,
  interimaire_id     int  not null references interimaire(compte_id) on delete cascade,
  type_code          text not null references type_certification(code),
  categorie_id       int  references categorie_certification(id),
  organisme_emetteur text not null,
  numero_chiffre     text not null,
  date_obtention     date not null,
  date_echeance      date not null,
  cree_le            timestamptz not null default now(),
  check (date_echeance > date_obtention)
);

-- Sert directement l'étape 1 du matching (filtre éliminatoire).
create index certification_filtre_idx
  on certification (interimaire_id, type_code, date_echeance);

-- Deux règles qu'un CHECK ne peut pas exprimer (elles nécessitent une sous-requête).
create or replace function verifier_coherence_certification() returns trigger as $fn$
declare
  v_exige_categorie boolean;
  v_type_de_la_categorie text;
begin
  select exige_categorie into v_exige_categorie
    from type_certification where code = new.type_code;

  if v_exige_categorie and new.categorie_id is null then
    raise exception 'Le type de certification % exige une catégorie', new.type_code
      using errcode = 'check_violation';
  end if;

  if not v_exige_categorie and new.categorie_id is not null then
    raise exception 'Le type de certification % n''accepte pas de catégorie', new.type_code
      using errcode = 'check_violation';
  end if;

  if new.categorie_id is not null then
    select type_code into v_type_de_la_categorie
      from categorie_certification where id = new.categorie_id;
    if v_type_de_la_categorie is distinct from new.type_code then
      raise exception 'La catégorie % n''appartient pas au type %',
        new.categorie_id, new.type_code using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$fn$ language plpgsql;

create trigger certification_coherence
  before insert or update on certification
  for each row execute function verifier_coherence_certification();

-- ---------------------------------------------------------------------------
-- Missions
-- ---------------------------------------------------------------------------

create table mission (
  id               serial primary key,
  entreprise_id    int  not null references entreprise(compte_id) on delete cascade,
  titre            text not null,
  metier_code      text not null references metier(code),
  description      text,
  adresse          text,
  code_postal      text not null,
  ville            text not null,
  lat              double precision not null,
  lon              double precision not null,
  date_debut       date not null,
  -- NOT NULL par décision : c'est la date contre laquelle le filtre éliminatoire
  -- compare les échéances de certification. Sans elle la règle centrale est inapplicable.
  date_fin         date not null,
  taux_horaire_min numeric(6, 2),
  taux_horaire_max numeric(6, 2),
  statut           text not null default 'brouillon'
                   check (statut in ('brouillon', 'publiee', 'pourvue', 'close')),
  cree_le          timestamptz not null default now(),
  publiee_le       timestamptz,
  check (date_fin >= date_debut),
  check (taux_horaire_max is null or taux_horaire_min is null or taux_horaire_max >= taux_horaire_min)
);
create index mission_publiees_idx on mission (statut, date_debut) where statut = 'publiee';

create table mission_certification_requise (
  mission_id   int  not null references mission(id) on delete cascade,
  type_code    text not null references type_certification(code),
  categorie_id int  references categorie_certification(id),
  primary key (mission_id, type_code)
);

create table mission_competence (
  mission_id      int  not null references mission(id) on delete cascade,
  competence_code text not null references competence(code),
  primary key (mission_id, competence_code)
);

create table disponibilite (
  id             serial primary key,
  interimaire_id int  not null references interimaire(compte_id) on delete cascade,
  date_debut     date not null,
  date_fin       date not null,
  check (date_fin >= date_debut)
);
create index disponibilite_interimaire_idx on disponibilite (interimaire_id, date_debut);

create table candidature (
  id             serial primary key,
  mission_id     int  not null references mission(id) on delete cascade,
  interimaire_id int  not null references interimaire(compte_id) on delete cascade,
  statut         text not null default 'proposee'
                 check (statut in ('proposee', 'acceptee', 'refusee')),
  cree_le        timestamptz not null default now(),
  unique (mission_id, interimaire_id)
);

-- ---------------------------------------------------------------------------
-- Ingestion France Travail (données nettoyées et normalisées)
-- ---------------------------------------------------------------------------

create table offre_ft (
  id_ft              text primary key,   -- identifiant API : dédoublonnage exact
  intitule_brut      text not null,
  intitule_normalise text not null,      -- libellé du référentiel appellations
  metier_code        text references metier(code),
  rome_code          text,
  code_postal        text,
  commune_code       text,
  departement        char(3),
  lat                double precision,
  lon                double precision,
  taux_horaire_min   numeric(6, 2),      -- toujours ramené à l'horaire
  taux_horaire_max   numeric(6, 2),
  date_creation_ft   timestamptz,
  ingere_le          timestamptz not null default now(),
  empreinte          text not null       -- dédoublonnage des quasi-doublons
);
create index offre_ft_enrichissement_idx on offre_ft (metier_code, departement);
create index offre_ft_empreinte_idx on offre_ft (empreinte);

create table offre_ft_certification (
  offre_id  text not null references offre_ft(id_ft) on delete cascade,
  type_code text not null references type_certification(code),
  primary key (offre_id, type_code)
);

create table offre_ft_competence (
  offre_id        text not null references offre_ft(id_ft) on delete cascade,
  competence_code text not null references competence(code),
  primary key (offre_id, competence_code)
);
