-- Esquema de la Picadita del Viernes (Postgres)
-- Ejecútalo una vez en tu base de datos (SQL Editor o `psql`).

create extension if not exists "pgcrypto";  -- para gen_random_uuid()

create table if not exists members (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  active          boolean default true,
  -- Vacaciones con FECHA DE VUELTA: mientras away_until >= hoy, no se le
  -- asignan turnos; al pasar esa fecha vuelve solo (no hay que acordarse).
  -- NULL = disponible.
  away_until      date,
  -- Autenticación por PIN. pin_hash NULL = cuenta sin reclamar (aún sin PIN).
  pin_hash        text,
  failed_attempts int not null default 0,      -- intentos de PIN fallidos seguidos
  locked_until    timestamptz,                 -- bloqueo temporal tras varios fallos
  created_at      timestamptz default now()
);

-- Suscripciones de notificaciones push (Web Push) por dispositivo/navegador.
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references members(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz default now()
);

create index if not exists push_subs_member_idx on push_subscriptions (member_id);

create table if not exists turns (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references members(id),
  date       date not null,
  status     text not null check (status in ('completado', 'declinado')),
  created_at timestamptz default now()
);

create index if not exists turns_completado_idx
  on turns (member_id) where status = 'completado';

-- Assistència a la picaeta d'un divendres concret: cada u diu si eixe dia ve
-- o no (Vinc / No vinc). És NOMÉS informatiu (compta caps), no canvia qui
-- compra. Una fila per persona i divendres; en canviar de setmana, el divendres
-- nou no té files fins que la gent respon (es "reinicia" sol).
create table if not exists attendance (
  member_id  uuid references members(id) on delete cascade,
  friday     date not null,
  coming     boolean not null,
  updated_at timestamptz default now(),
  primary key (member_id, friday)
);

create table if not exists current_state (
  id                  int primary key default 1,
  assigned_member_id  uuid references members(id),
  declined_this_round uuid[] default '{}',
  -- Para no enviar dos veces el aviso semanal a la misma persona/semana.
  last_notified_member uuid references members(id),
  last_notified_friday date
);

-- Fila única de estado. Siempre id = 1.
insert into current_state (id) values (1)
  on conflict (id) do nothing;

-- ------------------------------------------------------------------ --
-- Semilla real del equipo de la Picaeta (12 personas).
-- Cada persona reclamará su cuenta poniendo su PIN la primera vez que entre.
--
-- Se siembra el histórico reciente: las picaetas ya COMPLETADAS de cada quien
-- (columnas E y F del Excel de Teresa, solo fechas pasadas) como turnos
-- 'completado'. Con esto, al arrancar, la app calcula sola el reparto justo:
-- el siguiente en comprar sale JUAN IVARS (el que lleva más tiempo sin comprar)
-- y detrás JORDI.
--
-- OJO: la fecha 10/07/2026 de Juan Ivars NO se siembra: es su turno de ESTE
-- viernes (aún no comprada). Al pasar el viernes se da por hecho.
-- Juanvi queda FUERA a propósito (ya no participa).
-- Corre SOLO con la BD vacía (primer arranque de Postgres).
-- ------------------------------------------------------------------ --
with nuevos as (
  insert into members (name) values
    ('Marta'), ('Teresa'), ('Jordi'), ('Santi'), ('Jose María'), ('Mari Cruz'),
    ('Joan Pastor'), ('Amparo'), ('Aaron'), ('Juan Ivars'), ('Bernardino'), ('Demetrio')
  returning id, name
)
insert into turns (member_id, date, status)
select n.id, v.dia, 'completado'
from nuevos n
join (values
  ('Marta',      date '2026-02-06'),  -- E
  ('Marta',      date '2026-04-17'),  -- F
  ('Teresa',     date '2026-02-27'),
  ('Teresa',     date '2026-05-29'),
  ('Jordi',       date '2026-04-10'),  -- 2º en la cola (después de Juan Ivars)
  ('Santi',       date '2026-06-19'),
  ('Jose María',  date '2026-03-13'),
  ('Jose María',  date '2026-06-12'),
  ('Mari Cruz',   date '2026-05-15'),
  ('Joan Pastor', date '2026-06-26'),
  ('Amparo',      date '2026-02-20'),
  ('Amparo',      date '2026-07-03'),
  ('Aaron',       date '2026-06-05'),
  ('Juan Ivars',  date '2026-03-20'),  -- última COMPLETADA -> le toca ESTA semana
  -- ('Juan Ivars', date '2026-07-10'), -- ESTE viernes, aún pendiente: NO se siembra
  ('Bernardino', date '2026-03-06'),
  ('Bernardino', date '2026-05-08'),
  ('Demetrio',   date '2026-04-24')
) as v(nom, dia) on v.nom = n.name;

-- ------------------------------------------------------------------ --
-- Migración si ya habías creado la tabla members sin las columnas nuevas:
-- ------------------------------------------------------------------ --
-- alter table members add column if not exists pin_hash text;
-- alter table members add column if not exists failed_attempts int not null default 0;
-- alter table members add column if not exists locked_until timestamptz;
-- alter table members add column if not exists away_until date;
-- Si venías del boolean on_vacation:
--   alter table members add column if not exists away_until date;
--   update members set away_until = date '2999-01-01' where on_vacation = true;
--   alter table members drop column if exists on_vacation;
-- alter table current_state add column if not exists last_notified_member uuid references members(id);
-- alter table current_state add column if not exists last_notified_friday date;
-- Assistència (la API també la crea sola a l'arrancar, així que en producció no
-- cal fer res a mà; açò és només per si vols aplicar-la per psql):
-- create table if not exists attendance (
--   member_id uuid references members(id) on delete cascade,
--   friday date not null, coming boolean not null,
--   updated_at timestamptz default now(), primary key (member_id, friday));
