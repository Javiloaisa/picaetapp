-- Esquema de la Picadita del Viernes (Postgres / Neon)
-- Ejecútalo una vez en tu base de datos Neon (SQL Editor o `psql`).

create extension if not exists "pgcrypto";  -- para gen_random_uuid()

create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean default true,
  created_at timestamptz default now()
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
-- Semilla opcional: descomenta y ajusta los nombres de tu equipo.
-- ------------------------------------------------------------------ --
-- insert into members (name) values
--   ('Javi'), ('Marta'), ('Luis'), ('Ana'),
--   ('Pablo'), ('Sara'), ('Nico');
