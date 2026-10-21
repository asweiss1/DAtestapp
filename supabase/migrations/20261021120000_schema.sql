-- DA Ranch Vineyard App
-- 1 of 5. Tables. Run the files in this folder in filename order
-- in the Supabase SQL editor (as postgres) on a fresh project.
-- Safe to run again: new objects are skipped, policies are rebuilt in later files.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema public to authenticated;

create table if not exists public.vineyards (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  timezone text not null default 'America/Phoenix',
  eod_time time not null default '14:25:00',
  edit_window_days integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  constraint vineyards_window_chk check (edit_window_days between 0 and 30),
  constraint vineyards_name_chk check (char_length(btrim(name)) between 2 and 80)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  theme text not null default 'sage',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  constraint profiles_theme_chk check (theme in ('sage', 'sand', 'night', 'grape')),
  constraint profiles_name_chk check (char_length(btrim(display_name)) between 1 and 80)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  constraint memberships_role_chk check (role in ('employee', 'manager', 'developer')),
  constraint memberships_user_vineyard_uq unique (vineyard_id, user_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id uuid references public.profiles (id),
  deleted_at timestamptz,
  constraint invites_role_chk check (role in ('employee', 'manager')),
  constraint invites_email_chk check (position('@' in email) > 1)
);

alter table public.invites add column if not exists deleted_at timestamptz;

drop index if exists invites_pending_email_idx;
create unique index invites_pending_email_idx
  on public.invites (vineyard_id, lower(email))
  where accepted_at is null and deleted_at is null;

-- Starting wage for an invite. Managers only. Not a column on invites,
-- so a developer who can add people still cannot read a wage.
create table if not exists public.invite_wages (
  invite_id uuid primary key references public.invites (id) on delete cascade,
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  hourly_rate numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  constraint invite_wages_rate_chk check (hourly_rate >= 0)
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  name text not null,
  kind text not null default 'non_field',
  is_system boolean not null default false,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint areas_kind_chk check (kind in ('field', 'non_field')),
  constraint areas_name_chk check (char_length(btrim(name)) between 1 and 80),
  constraint areas_vineyard_name_uq unique (vineyard_id, name)
);

create unique index if not exists areas_one_system_idx
  on public.areas (vineyard_id)
  where is_system;

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  name text not null,
  variety text not null default '',
  row_count integer not null default 40,
  plant_count numeric,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint blocks_rows_chk check (row_count between 1 and 500),
  constraint blocks_plants_chk check (plant_count is null or plant_count >= 0),
  constraint blocks_name_chk check (char_length(btrim(name)) between 1 and 80),
  constraint blocks_vineyard_name_uq unique (vineyard_id, name)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  slug text not null,
  label text not null,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tasks_label_chk check (char_length(btrim(label)) between 1 and 80),
  constraint tasks_vineyard_slug_uq unique (vineyard_id, slug)
);

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint passes_name_chk check (char_length(btrim(name)) between 1 and 80)
);

create table if not exists public.pass_tasks (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  pass_id uuid not null references public.passes (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  constraint pass_tasks_pair_uq unique (pass_id, task_id)
);

create table if not exists public.chemicals (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  name text not null,
  category text not null,
  sds_url text not null default '',
  is_system boolean not null default false,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chemicals_category_chk check (category in ('fungicide', 'insecticide', 'herbicide', 'foliar', 'other')),
  constraint chemicals_name_chk check (char_length(btrim(name)) between 1 and 120),
  constraint chemicals_vineyard_name_uq unique (vineyard_id, name)
);

-- One row is one person's hours for one task, a pass total, or a still-open clock.
-- Pass time is stored twice on purpose: pass_total is the whole job,
-- pass_slice rows split that same time evenly across the tasks in the pass.
-- Reports must not add those two kinds together.
create table if not exists public.labor_entries (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  logged_by uuid not null references public.profiles (id),
  season_year integer not null,
  work_date date not null,
  block_id uuid references public.blocks (id),
  area_id uuid references public.areas (id),
  task_id uuid references public.tasks (id),
  pass_id uuid references public.passes (id),
  pass_group_id uuid,
  entry_kind text not null,
  row_start integer,
  row_end integer,
  row_status text,
  started_at timestamptz not null,
  ended_at timestamptz,
  pause_seconds integer not null default 0,
  paused_at timestamptz,
  hours numeric(8, 3),
  close_reason text,
  source text not null default 'taps',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint labor_kind_chk check (entry_kind in ('open', 'task', 'pass_slice', 'pass_total')),
  constraint labor_open_chk check (
    (entry_kind = 'open' and ended_at is null)
    or (entry_kind <> 'open' and ended_at is not null)
  ),
  constraint labor_row_status_chk check (row_status is null or row_status in ('partial', 'complete')),
  constraint labor_source_chk check (source in ('taps', 'manual', 'crew', 'eod')),
  constraint labor_reason_chk check (close_reason is null or close_reason in ('tap', 'manual', 'eod', 'switch')),
  constraint labor_season_chk check (season_year between 2000 and 2100),
  constraint labor_pause_chk check (pause_seconds >= 0),
  constraint labor_notes_chk check (char_length(notes) <= 2000)
);

create unique index if not exists labor_one_open_per_user_idx
  on public.labor_entries (vineyard_id, user_id)
  where entry_kind = 'open' and deleted_at is null;

create table if not exists public.row_progress (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  season_year integer not null,
  block_id uuid not null references public.blocks (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  row_number integer not null,
  status text not null,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  constraint row_progress_status_chk check (status in ('none', 'partial', 'complete')),
  constraint row_progress_row_chk check (row_number between 1 and 500),
  constraint row_progress_season_chk check (season_year between 2000 and 2100),
  constraint row_progress_natural_uq unique (vineyard_id, season_year, block_id, task_id, row_number)
);

create table if not exists public.spray_logs (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  season_year integer not null,
  block_id uuid not null references public.blocks (id) on delete cascade,
  kind text not null,
  spray_date date not null,
  chemical_id uuid references public.chemicals (id),
  chemical_name text not null,
  rate text not null default '',
  volume text not null default '',
  tank text not null default '',
  notes text not null default '',
  rec_number text not null default '',
  photo_path text,
  rows_done jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint spray_kind_chk check (kind in ('foliar', 'herbicide')),
  constraint spray_season_chk check (season_year between 2000 and 2100),
  constraint spray_name_chk check (char_length(btrim(chemical_name)) between 1 and 160)
);

create table if not exists public.watering_logs (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  season_year integer not null,
  block_id uuid not null references public.blocks (id) on delete cascade,
  log_date date not null,
  hours numeric(8, 2) not null,
  notes text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint watering_hours_chk check (hours >= 0 and hours < 1000),
  constraint watering_season_chk check (season_year between 2000 and 2100)
);

create table if not exists public.weed_logs (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  season_year integer not null,
  block_id uuid not null references public.blocks (id) on delete cascade,
  log_date date not null,
  hours numeric(8, 2) not null,
  notes text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint weed_hours_chk check (hours >= 0 and hours < 1000),
  constraint weed_season_chk check (season_year between 2000 and 2100)
);

create table if not exists public.harvest_samples (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  season_year integer not null,
  block_id uuid not null references public.blocks (id) on delete cascade,
  sample_date date not null,
  rows_sampled text not null default '',
  brix text not null default '',
  ph text not null default '',
  ta text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint samples_season_chk check (season_year between 2000 and 2100)
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  name text not null,
  notes text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint equipment_name_chk check (char_length(btrim(name)) between 1 and 80)
);

create table if not exists public.service_types (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint service_types_name_uq unique (vineyard_id, name)
);

create table if not exists public.service_logs (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  equipment_id uuid references public.equipment (id),
  service_type text not null default '',
  log_date date not null,
  hours text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  season_year integer not null,
  person_name text not null,
  company text not null default '',
  description text not null,
  work_date date not null,
  hours numeric(8, 2),
  task_id uuid references public.tasks (id),
  block_id uuid references public.blocks (id),
  area_id uuid references public.areas (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contractors_name_chk check (char_length(btrim(person_name)) between 1 and 80),
  constraint contractors_desc_chk check (char_length(btrim(description)) between 1 and 500),
  constraint contractors_hours_chk check (hours is null or (hours >= 0 and hours < 1000))
);

-- Dollar amount lives here, not on contractors, so only managers can read it.
create table if not exists public.contractor_costs (
  entry_id uuid primary key references public.contractors (id) on delete cascade,
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  constraint contractor_costs_amount_chk check (amount >= 0)
);

-- Wage history. The rate that applies to a day is the latest effective_from
-- on or before that work_date. Only managers have a policy on this table.
create table if not exists public.wage_rates (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hourly_rate numeric(10, 2) not null,
  effective_from date not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  constraint wage_rates_rate_chk check (hourly_rate >= 0),
  constraint wage_rates_effective_uq unique (vineyard_id, user_id, effective_from)
);

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  note text not null,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  client_id uuid not null unique,
  constraint bug_note_chk check (char_length(btrim(note)) between 1 and 4000),
  constraint bug_diag_chk check (octet_length(diagnostics::text) < 100000)
);

create table if not exists public.season_notes (
  vineyard_id uuid not null references public.vineyards (id) on delete cascade,
  season_year integer not null,
  archived_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  primary key (vineyard_id, season_year),
  constraint season_notes_year_chk check (season_year between 2000 and 2100)
);

-- Foreign keys and the columns Row Level Security filters on.
create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_vineyard_idx on public.memberships (vineyard_id, active);

create index if not exists invites_vineyard_idx on public.invites (vineyard_id, updated_at);
create index if not exists invite_wages_vineyard_idx on public.invite_wages (vineyard_id);

create index if not exists areas_sync_idx on public.areas (vineyard_id, updated_at);
create index if not exists blocks_sync_idx on public.blocks (vineyard_id, updated_at);
create index if not exists tasks_sync_idx on public.tasks (vineyard_id, updated_at);
create index if not exists passes_sync_idx on public.passes (vineyard_id, updated_at);
create index if not exists pass_tasks_sync_idx on public.pass_tasks (vineyard_id, updated_at);
create index if not exists pass_tasks_task_idx on public.pass_tasks (task_id);
create index if not exists chemicals_sync_idx on public.chemicals (vineyard_id, updated_at);

create index if not exists labor_sync_idx on public.labor_entries (vineyard_id, updated_at);
create index if not exists labor_user_idx on public.labor_entries (user_id);
create index if not exists labor_logged_by_idx on public.labor_entries (logged_by);
create index if not exists labor_task_idx on public.labor_entries (task_id);
create index if not exists labor_pass_idx on public.labor_entries (pass_id);
create index if not exists labor_block_idx on public.labor_entries (block_id);
create index if not exists labor_area_idx on public.labor_entries (area_id);
create index if not exists labor_season_idx on public.labor_entries (vineyard_id, season_year, work_date);

create index if not exists row_progress_sync_idx on public.row_progress (vineyard_id, updated_at);
create index if not exists row_progress_task_idx on public.row_progress (task_id);
create index if not exists row_progress_block_idx on public.row_progress (block_id);

create index if not exists spray_sync_idx on public.spray_logs (vineyard_id, updated_at);
create index if not exists spray_block_idx on public.spray_logs (block_id);
create index if not exists spray_chemical_idx on public.spray_logs (chemical_id);

create index if not exists watering_sync_idx on public.watering_logs (vineyard_id, updated_at);
create index if not exists watering_block_idx on public.watering_logs (block_id);
create index if not exists weed_sync_idx on public.weed_logs (vineyard_id, updated_at);
create index if not exists weed_block_idx on public.weed_logs (block_id);
create index if not exists samples_sync_idx on public.harvest_samples (vineyard_id, updated_at);
create index if not exists samples_block_idx on public.harvest_samples (block_id);

create index if not exists equipment_sync_idx on public.equipment (vineyard_id, updated_at);
create index if not exists service_types_sync_idx on public.service_types (vineyard_id, updated_at);
create index if not exists service_logs_sync_idx on public.service_logs (vineyard_id, updated_at);
create index if not exists service_logs_equipment_idx on public.service_logs (equipment_id);

create index if not exists contractors_sync_idx on public.contractors (vineyard_id, updated_at);
create index if not exists contractors_task_idx on public.contractors (task_id);
create index if not exists contractor_costs_vineyard_idx on public.contractor_costs (vineyard_id, updated_at);

create index if not exists wage_rates_lookup_idx
  on public.wage_rates (vineyard_id, user_id, effective_from desc);
create index if not exists bug_reports_vineyard_idx on public.bug_reports (vineyard_id, created_at desc);

comment on table public.wage_rates is
  'Hourly wages by person and effective date. Select is allowed only for managers of that vineyard.';
comment on table public.contractor_costs is
  'Flat contractor dollars. Select is allowed only for managers. Names and hours stay on contractors.';
comment on table public.invite_wages is
  'Optional starting wage typed when a manager adds a person. Managers only.';
