-- Esquema de la Picadita del Viernes (Postgres)
-- Ejecútalo una vez en tu base de datos (SQL Editor o `psql`).

create extension if not exists "pgcrypto";  -- para gen_random_uuid()

create table if not exists members (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  active          boolean default true,
  -- Autenticación por PIN. pin_hash NULL = cuenta sin reclamar (aún sin PIN).
  pin_hash        text,
  failed_attempts int not null default 0,      -- intentos de PIN fallidos seguidos
  locked_until    timestamptz,                 -- bloqueo temporal tras varios fallos
  created_at      timestamptz default now()
);

create table if not exists turns (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references members(id),
  date       date not null,
  status     text not null check (status in ('completado', 'declinado')),
  created_at timestamptz default now()
);

create index if not exists turns_completado_idx
  on turns (member_id) where status = 'completado';

create table if not exists current_state (
  id                  int primary key default 1,
  assigned_member_id  uuid references members(id),
  declined_this_round uuid[] default '{}'
);

-- Fila única de estado. Siempre id = 1.
insert into current_state (id) values (1)
  on conflict (id) do nothing;

-- ------------------------------------------------------------------ --
-- Semilla del equipo (NECESARIA para arrancar): pon aquí los nombres.
-- Cada persona reclamará su cuenta poniendo su PIN la primera vez que entre.
-- (Con login por PIN, añadir gente nueva desde la app requiere estar dentro,
--  así que el primer roster se siembra aquí.)
-- ------------------------------------------------------------------ --
-- insert into members (name) values
--   ('Javi'), ('Marta'), ('Luis'), ('Ana'),
--   ('Pablo'), ('Sara'), ('Nico');

-- ------------------------------------------------------------------ --
-- Migración si ya habías creado la tabla members sin las columnas de PIN:
-- ------------------------------------------------------------------ --
-- alter table members add column if not exists pin_hash text;
-- alter table members add column if not exists failed_attempts int not null default 0;
-- alter table members add column if not exists locked_until timestamptz;
