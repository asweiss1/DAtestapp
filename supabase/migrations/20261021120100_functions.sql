-- DA Ranch Vineyard App
-- 2 of 5. Helpers, triggers, invites, end-of-day close, and labor cost.
-- Checker functions live in the private schema so the API cannot call them.
-- They are security definer so Row Level Security can ask "is this person a
-- manager?" without recursively reading memberships under the caller's own policy.

create or replace function private.role_for(p_vineyard uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.vineyard_id = p_vineyard
    and m.user_id = (select auth.uid())
    and m.active
  limit 1;
$$;

create or replace function private.is_member(p_vineyard uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_for(p_vineyard) is not null;
$$;

create or replace function private.is_manager(p_vineyard uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_for(p_vineyard) = 'manager';
$$;

create or replace function private.is_developer(p_vineyard uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_for(p_vineyard) = 'developer';
$$;

create or replace function private.can_edit_catalog(p_vineyard uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_for(p_vineyard) in ('manager', 'developer');
$$;

create or replace function private.is_active_member(p_vineyard uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.vineyard_id = p_vineyard
      and m.user_id = p_user
      and m.active
  );
$$;

create or replace function private.edit_cutoff(p_vineyard uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (timezone(v.timezone, pg_catalog.now()))::date - v.edit_window_days
  from public.vineyards v
  where v.id = p_vineyard;
$$;

create or replace function private.shares_vineyard(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_other = (select auth.uid())
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.vineyard_id = mine.vineyard_id
      where mine.user_id = (select auth.uid())
        and mine.active
        and theirs.user_id = p_other
        and theirs.active
    );
$$;

create or replace function private.eod_close_at(p_started timestamptz, p_tz text, p_eod time)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  local_start timestamp;
  eod_local timestamp;
  close_local timestamp;
begin
  local_start := p_started at time zone p_tz;
  eod_local := date_trunc('day', local_start) + p_eod;
  if local_start < eod_local then
    close_local := eod_local;
  else
    close_local := eod_local + interval '1 day';
  end if;
  return close_local at time zone p_tz;
end;
$$;

create or replace function private.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(old) ? 'vineyard_id' and to_jsonb(new) ? 'vineyard_id' then
      if (new.vineyard_id is distinct from old.vineyard_id) then
        new.vineyard_id := old.vineyard_id;
      end if;
    end if;
    if to_jsonb(old) ? 'client_updated_at'
       and new.client_updated_at is not null
       and old.client_updated_at is not null
       and new.client_updated_at < old.client_updated_at then
      return null;
    end if;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  if new.client_updated_at is null then
    new.client_updated_at := new.updated_at;
  end if;
  return new;
end;
$$;

create or replace function private.labor_set_hours()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  secs numeric;
begin
  if new.entry_kind = 'pass_slice' then
    if new.hours is null then
      new.hours := 0;
    end if;
    return new;
  end if;
  if new.ended_at is null then
    new.hours := null;
    new.entry_kind := 'open';
    return new;
  end if;
  secs := extract(epoch from (new.ended_at - new.started_at)) - coalesce(new.pause_seconds, 0);
  if secs < 0 then
    secs := 0;
  end if;
  new.hours := round(secs / 3600.0, 3);
  if new.entry_kind = 'open' then
    new.entry_kind := case when new.pass_id is not null then 'pass_total' else 'task' end;
  end if;
  return new;
end;
$$;

create or replace function private.guard_labor_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.ended_at is not null and new.ended_at is null and not private.is_manager(old.vineyard_id) then
      return null;
    end if;
    if not private.is_manager(old.vineyard_id) then
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.guard_row_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'complete'
       and new.status is distinct from 'complete'
       and not private.is_manager(old.vineyard_id)
       and not private.is_developer(old.vineyard_id) then
      new.status := 'complete';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.guard_area()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'The built-in Non-field work area stays in the app';
    end if;
    return old;
  end if;
  if old.is_system and coalesce(new.archived, false) then
    raise exception 'The built-in Non-field work area stays in the app';
  end if;
  return new;
end;
$$;

create or replace function private.guard_pass_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass uuid;
  v_task uuid;
begin
  select p.vineyard_id into v_pass from public.passes p where p.id = new.pass_id;
  select t.vineyard_id into v_task from public.tasks t where t.id = new.task_id;
  if v_pass is null or v_task is null or v_pass <> v_task or v_pass is distinct from new.vineyard_id then
    raise exception 'Pass and task must belong to the same vineyard';
  end if;
  return new;
end;
$$;

-- Transaction-local permission to write role = manager. Rows are invisible
-- to other transactions until commit, and both callers delete them before
-- they return. Authenticated has no privilege on the table.
-- The stored role, read without Row Level Security. Policies must not
-- select memberships themselves or the check recurses.
create or replace function private.membership_role(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.id = p_id;
$$;

create or replace function private.manager_gate_open(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.manager_gate g
    where g.txid = pg_catalog.txid_current()
      and g.kind = p_kind
  );
$$;

create or replace function private.manager_gate_begin(p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.manager_gate (txid, kind)
  values (pg_catalog.txid_current(), p_kind);
end;
$$;

create or replace function private.manager_gate_end()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.manager_gate
  where txid = pg_catalog.txid_current();
end;
$$;

create or replace function private.guard_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is null in the SQL editor. That is the supported way to
  -- assign the developer role (see supabase/assign-developer.sql).
  -- Signed-in people cannot grant it, and cannot edit the developer row.
  if tg_op = 'UPDATE'
     and old.role = 'developer'
     and auth.uid() is not null
     and not private.is_developer(old.vineyard_id) then
    raise exception 'The developer login can only be changed from the setup SQL';
  end if;
  if new.role = 'developer' and (tg_op = 'INSERT' or old.role is distinct from 'developer') then
    if auth.uid() is not null and not private.is_developer(new.vineyard_id) then
      raise exception 'Only the setup SQL can assign the developer role';
    end if;
  end if;
  -- Becoming a manager requires the developer's approval, except the SQL
  -- editor (auth.uid() is null) and the two gates opened inside this database:
  -- bootstrap for the person who creates a brand-new vineyard, and approve
  -- inside public.decide_manager_request. A signed-in person cannot open
  -- either gate.
  if new.role = 'manager' and (tg_op = 'INSERT' or old.role is distinct from 'manager') then
    if auth.uid() is null
       or private.manager_gate_open('bootstrap')
       or (private.manager_gate_open('approve') and private.is_developer(new.vineyard_id)) then
      null;
    else
      raise exception 'Aaron has to approve a manager' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.guard_manager_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status is distinct from 'pending' then
    raise exception 'A manager request starts as pending' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and not private.manager_gate_open('approve')
     and auth.uid() is not null then
    raise exception 'Aaron approves managers in the app' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.mark_rows(
  p_vineyard uuid,
  p_season integer,
  p_block uuid,
  p_task uuid,
  p_lo integer,
  p_hi integer,
  p_status text,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_lo is null or p_hi is null or p_task is null or p_block is null then
    return;
  end if;
  for n in least(p_lo, p_hi)..greatest(p_lo, p_hi) loop
    insert into public.row_progress (
      vineyard_id, season_year, block_id, task_id, row_number, status, updated_by, client_updated_at
    ) values (
      p_vineyard, p_season, p_block, p_task, n, p_status, p_user, pg_catalog.clock_timestamp()
    )
    on conflict (vineyard_id, season_year, block_id, task_id, row_number)
    do update set
      status = excluded.status,
      updated_by = excluded.updated_by,
      client_updated_at = excluded.client_updated_at
    where public.row_progress.status is distinct from 'complete'
       or excluded.status = 'complete';
  end loop;
end;
$$;

create or replace function private.claim_invites_for(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r record;
  v_email text;
  v_day date;
begin
  select u.email into v_email from auth.users u where u.id = p_user;
  if v_email is null then
    return 0;
  end if;

  for r in
    select i.*
    from public.invites i
    where lower(i.email) = lower(v_email)
      and i.accepted_at is null
      and i.deleted_at is null
  loop
    -- An invite marked manager does not grant that role. The person joins
    -- as an employee and a request waits for the developer.
    insert into public.memberships (vineyard_id, user_id, role)
    values (r.vineyard_id, p_user, 'employee')
    on conflict (vineyard_id, user_id) do update
      set active = true,
          client_updated_at = pg_catalog.clock_timestamp();

    if r.role = 'manager' then
      insert into public.manager_requests (vineyard_id, user_id, requested_by, status)
      select r.vineyard_id, p_user, r.invited_by, 'pending'
      where exists (
        select 1
        from public.memberships m
        where m.vineyard_id = r.vineyard_id
          and m.user_id = p_user
          and m.role = 'employee'
      )
      on conflict (vineyard_id, user_id) where status = 'pending' do nothing;
    end if;

    select (timezone(v.timezone, pg_catalog.now()))::date
      into v_day
    from public.vineyards v
    where v.id = r.vineyard_id;

    insert into public.wage_rates (vineyard_id, user_id, hourly_rate, effective_from, created_by)
    select r.vineyard_id, p_user, iw.hourly_rate, coalesce(v_day, (pg_catalog.now())::date), r.invited_by
    from public.invite_wages iw
    where iw.invite_id = r.id
    on conflict (vineyard_id, user_id, effective_from) do nothing;

    update public.invites
      set accepted_at = pg_catalog.now(),
          accepted_user_id = p_user,
          client_updated_at = pg_catalog.clock_timestamp()
      where id = r.id;

    if r.display_name is not null and length(btrim(r.display_name)) > 0 then
      update public.profiles
        set display_name = btrim(r.display_name),
            client_updated_at = pg_catalog.clock_timestamp()
        where id = p_user;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_name is null or length(v_name) = 0 then
    v_name := split_part(coalesce(new.email, 'crew'), '@', 1);
  end if;
  if v_name is null or length(v_name) = 0 then
    v_name := 'Crew';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 80))
  on conflict (id) do nothing;

  perform private.claim_invites_for(new.id);
  return new;
end;
$$;

create or replace function public.claim_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  return private.claim_invites_for(auth.uid());
end;
$$;

create or replace function private.seed_vineyard_defaults(p_vineyard uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.areas (vineyard_id, name, kind, is_system, sort_order)
  values (p_vineyard, 'Non-field work', 'non_field', true, 0)
  on conflict (vineyard_id, name) do nothing;

  insert into public.tasks (vineyard_id, slug, label, sort_order)
  values
    (p_vineyard, 'long-pruning', 'Long pruning', 1),
    (p_vineyard, 'short-pruning', 'Short pruning', 2),
    (p_vineyard, 'shoot-thinning', 'Shoot thinning', 3),
    (p_vineyard, 'lateral-pulling', 'Lateral pulling', 4),
    (p_vineyard, 'leaf-pulling', 'Leaf pulling', 5),
    (p_vineyard, 'fruit-drop', 'Fruit drop', 6),
    (p_vineyard, 'rot-removal', 'Rot removal', 7),
    (p_vineyard, 'bird-nets-up', 'Bird nets up', 8),
    (p_vineyard, 'bird-nets-removed', 'Bird nets removed', 9),
    (p_vineyard, 'harvest', 'Harvest', 10)
  on conflict (vineyard_id, slug) do nothing;

  insert into public.chemicals (vineyard_id, name, category, sds_url, is_system, sort_order)
  select p_vineyard, c.name, c.category, c.sds_url, true, c.sort_order
  from (
    values
      ('Sulfur (wettable / dust)', 'fungicide', 'https://www.greenbook.net/search?q=Sulfur%20fungicide', 10),
      ('Mancozeb (Dithane)', 'fungicide', 'https://www.greenbook.net/search?q=Dithane', 20),
      ('Copper hydroxide (Kocide 3000)', 'fungicide', 'https://www.greenbook.net/search?q=Kocide%203000', 30),
      ('Myclobutanil (Rally 40WSP)', 'fungicide', 'https://www.greenbook.net/search?q=Rally%2040WSP', 40),
      ('Tebuconazole (Elite / Orius)', 'fungicide', 'https://www.greenbook.net/search?q=Tebuconazole%20fungicide', 50),
      ('Trifloxystrobin (Flint)', 'fungicide', 'https://www.greenbook.net/search?q=Flint%20fungicide', 60),
      ('Quinoxyfen (Quintec)', 'fungicide', 'https://www.greenbook.net/search?q=Quintec', 70),
      ('Potassium bicarbonate (Kaligreen)', 'fungicide', 'https://www.greenbook.net/search?q=Kaligreen', 80),
      ('Horticultural oil (JMS Stylet-Oil)', 'fungicide', 'https://www.greenbook.net/search?q=JMS%20Stylet-Oil', 90),
      ('Boscalid + pyraclostrobin (Pristine)', 'fungicide', 'https://www.greenbook.net/search?q=Pristine%20fungicide', 100),
      ('Fluopyram + tebuconazole (Luna Experience)', 'fungicide', 'https://www.greenbook.net/search?q=Luna%20Experience', 110),
      ('Mandipropamid (Revus)', 'fungicide', 'https://www.greenbook.net/search?q=Revus%20fungicide', 120),
      ('Phosphorous acid (Phostrol)', 'fungicide', 'https://www.greenbook.net/search?q=Phostrol', 130),
      ('Captan', 'fungicide', 'https://www.greenbook.net/search?q=Captan%20fungicide', 140),
      ('Spinosad (Entrust)', 'insecticide', 'https://www.greenbook.net/search?q=Entrust%20spinosad', 150),
      ('Bacillus thuringiensis (DiPel)', 'insecticide', 'https://www.greenbook.net/search?q=DiPel', 160),
      ('Imidacloprid (Admire Pro)', 'insecticide', 'https://www.greenbook.net/search?q=Admire%20Pro', 170),
      ('Abamectin (Agri-Mek)', 'insecticide', 'https://www.greenbook.net/search?q=Agri-Mek', 180),
      ('Bifenthrin (Brigade)', 'insecticide', 'https://www.greenbook.net/search?q=Brigade%20bifenthrin', 190),
      ('Pyrethrins (PyGanic)', 'insecticide', 'https://www.greenbook.net/search?q=PyGanic', 200),
      ('Insecticidal soap (M-Pede)', 'insecticide', 'https://www.greenbook.net/search?q=M-Pede', 210),
      ('Kaolin (Surround)', 'insecticide', 'https://www.greenbook.net/search?q=Surround%20kaolin', 220),
      ('Glyphosate (Roundup PowerMAX)', 'herbicide', 'https://www.greenbook.net/search?q=Roundup%20PowerMAX', 230),
      ('Glufosinate (Rely 280)', 'herbicide', 'https://www.greenbook.net/search?q=Rely%20280', 240),
      ('Pendimethalin (Prowl H2O)', 'herbicide', 'https://www.greenbook.net/search?q=Prowl%20H2O', 250),
      ('Flumioxazin (Chateau)', 'herbicide', 'https://www.greenbook.net/search?q=Chateau%20herbicide', 260),
      ('Indaziflam (Alion)', 'herbicide', 'https://www.greenbook.net/search?q=Alion%20herbicide', 270),
      ('Clethodim (Select Max)', 'herbicide', 'https://www.greenbook.net/search?q=Select%20Max%20herbicide', 280),
      ('Carfentrazone (Aim EC)', 'herbicide', 'https://www.greenbook.net/search?q=Aim%20EC', 290),
      ('Oryzalin (Surflan)', 'herbicide', 'https://www.greenbook.net/search?q=Surflan', 300),
      ('Zinc sulfate', 'foliar', 'https://www.greenbook.net/search?q=Zinc%20sulfate', 310),
      ('Boron (Solubor)', 'foliar', 'https://www.greenbook.net/search?q=Solubor', 320),
      ('Magnesium sulfate (Epsom salt)', 'foliar', 'https://www.greenbook.net/search?q=Magnesium%20sulfate', 330),
      ('Calcium nitrate', 'foliar', 'https://www.greenbook.net/search?q=Calcium%20nitrate', 340),
      ('Potassium nitrate', 'foliar', 'https://www.greenbook.net/search?q=Potassium%20nitrate', 350),
      ('Iron chelate (EDDHA)', 'foliar', 'https://www.greenbook.net/search?q=Iron%20EDDHA', 360),
      ('Low-biuret urea', 'foliar', 'https://www.greenbook.net/search?q=Low%20biuret%20urea', 370),
      ('Seaweed extract', 'foliar', 'https://www.greenbook.net/search?q=Seaweed%20extract%20foliar', 380),
      ('Fish emulsion', 'foliar', 'https://www.greenbook.net/search?q=Fish%20emulsion', 390)
  ) as c(name, category, sds_url, sort_order)
  on conflict (vineyard_id, name) do nothing;
end;
$$;

create or replace function public.create_vineyard(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Name the vineyard';
  end if;
  insert into public.vineyards (name)
  values (left(v_name, 80))
  returning id into v_id;

  -- The founder of a brand-new vineyard is its first manager. This does not
  -- promote anyone on a vineyard that already exists.
  perform private.manager_gate_begin('bootstrap');
  insert into public.memberships (vineyard_id, user_id, role)
  values (v_id, auth.uid(), 'manager');
  perform private.manager_gate_end();

  perform private.seed_vineyard_defaults(v_id);
  return v_id;
end;
$$;

create or replace function public.close_stale_jobs(p_vineyard uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_close timestamptz;
  v_pause integer;
  v_hours numeric;
  v_task uuid;
  v_count integer := 0;
  v_n integer;
  v_i integer;
  v_slice numeric;
  v_sum numeric;
  v_end_row integer;
begin
  if not private.is_member(p_vineyard) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for r in
    select le.*, v.timezone, v.eod_time
    from public.labor_entries le
    join public.vineyards v on v.id = le.vineyard_id
    where le.vineyard_id = p_vineyard
      and le.entry_kind = 'open'
      and le.deleted_at is null
    for update of le
  loop
    v_close := private.eod_close_at(r.started_at, r.timezone, r.eod_time);
    if pg_catalog.now() < v_close then
      continue;
    end if;

    v_pause := coalesce(r.pause_seconds, 0);
    if r.paused_at is not null and r.paused_at < v_close then
      v_pause := v_pause + floor(extract(epoch from (v_close - r.paused_at)))::integer;
    end if;
    v_end_row := coalesce(r.row_end, r.row_start);

    update public.labor_entries
      set ended_at = v_close,
          paused_at = null,
          pause_seconds = v_pause,
          close_reason = 'eod',
          source = case when source = 'manual' then source else 'eod' end,
          entry_kind = case when pass_id is not null then 'pass_total' else 'task' end,
          row_end = v_end_row,
          row_status = case when row_start is not null then coalesce(row_status, 'partial') else row_status end,
          pass_group_id = case when pass_id is not null then id else null end,
          client_updated_at = pg_catalog.clock_timestamp()
      where id = r.id;

    if r.pass_id is not null then
      select count(*) into v_n from public.pass_tasks pt where pt.pass_id = r.pass_id;
      select hours into v_hours from public.labor_entries where id = r.id;
      v_i := 0;
      v_sum := 0;
      if v_n > 0 then
        for v_task in
          select pt.task_id
          from public.pass_tasks pt
          where pt.pass_id = r.pass_id
          order by pt.sort_order, pt.task_id
        loop
          v_i := v_i + 1;
          if v_i < v_n then
            v_slice := round(coalesce(v_hours, 0) / v_n, 3);
            v_sum := v_sum + v_slice;
          else
            v_slice := round(coalesce(v_hours, 0) - v_sum, 3);
          end if;
          insert into public.labor_entries (
            vineyard_id, user_id, logged_by, season_year, work_date,
            block_id, area_id, task_id, pass_id, pass_group_id,
            entry_kind, row_start, row_end, row_status,
            started_at, ended_at, pause_seconds, hours,
            close_reason, source, notes, client_updated_at
          ) values (
            r.vineyard_id, r.user_id, r.logged_by, r.season_year, r.work_date,
            r.block_id, r.area_id, v_task, r.pass_id, r.id,
            'pass_slice', r.row_start, v_end_row,
            case when r.row_start is not null then 'partial' else null end,
            r.started_at, v_close, v_pause, v_slice,
            'eod', 'eod', r.notes, pg_catalog.clock_timestamp()
          );
          if r.block_id is not null and r.row_start is not null then
            perform private.mark_rows(
              r.vineyard_id, r.season_year, r.block_id, v_task,
              r.row_start, coalesce(v_end_row, r.row_start), 'partial', r.user_id
            );
          end if;
        end loop;
      end if;
    elsif r.block_id is not null and r.row_start is not null and r.task_id is not null then
      perform private.mark_rows(
        r.vineyard_id, r.season_year, r.block_id, r.task_id,
        r.row_start, coalesce(v_end_row, r.row_start), 'partial', r.user_id
      );
    end if;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Totals only. There is no per-person cost in the result.
create or replace function public.labor_cost_summary(p_vineyard uuid, p_season integer)
returns table (
  group_kind text,
  group_id uuid,
  group_label text,
  hours numeric,
  cost numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_manager(p_vineyard) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  with labor_rate as (
    select
      le.id,
      le.task_id,
      le.pass_id,
      le.entry_kind,
      le.hours,
      (
        select w.hourly_rate
        from public.wage_rates w
        where w.vineyard_id = le.vineyard_id
          and w.user_id = le.user_id
          and w.effective_from <= le.work_date
        order by w.effective_from desc
        limit 1
      ) as rate
    from public.labor_entries le
    where le.vineyard_id = p_vineyard
      and le.season_year = p_season
      and le.deleted_at is null
      and le.ended_at is not null
  ),
  labor_by_task as (
    select lr.task_id,
           sum(lr.hours) as hours,
           sum(lr.hours * coalesce(lr.rate, 0)) as cost
    from labor_rate lr
    where lr.entry_kind in ('task', 'pass_slice')
      and lr.task_id is not null
    group by lr.task_id
  ),
  contractor_by_task as (
    select c.task_id,
           sum(coalesce(c.hours, 0)) as hours,
           sum(coalesce(cc.amount, 0)) as cost
    from public.contractors c
    left join public.contractor_costs cc on cc.entry_id = c.id
    where c.vineyard_id = p_vineyard
      and c.season_year = p_season
      and c.deleted_at is null
      and c.task_id is not null
    group by c.task_id
  ),
  labor_by_pass as (
    select lr.pass_id,
           sum(lr.hours) as hours,
           sum(lr.hours * coalesce(lr.rate, 0)) as cost
    from labor_rate lr
    where lr.entry_kind = 'pass_total'
      and lr.pass_id is not null
    group by lr.pass_id
  ),
  loose_contractor as (
    select sum(coalesce(c.hours, 0)) as hours,
           sum(coalesce(cc.amount, 0)) as cost
    from public.contractors c
    left join public.contractor_costs cc on cc.entry_id = c.id
    where c.vineyard_id = p_vineyard
      and c.season_year = p_season
      and c.deleted_at is null
      and c.task_id is null
  )
  select 'task'::text,
         t.id,
         t.label,
         round(coalesce(l.hours, 0) + coalesce(c.hours, 0), 3),
         round(coalesce(l.cost, 0) + coalesce(c.cost, 0), 2)
  from public.tasks t
  left join labor_by_task l on l.task_id = t.id
  left join contractor_by_task c on c.task_id = t.id
  where t.vineyard_id = p_vineyard
    and (coalesce(l.hours, 0) + coalesce(c.hours, 0) > 0 or coalesce(l.cost, 0) + coalesce(c.cost, 0) > 0)
  union all
  select 'pass'::text,
         p.id,
         p.name,
         round(coalesce(lp.hours, 0), 3),
         round(coalesce(lp.cost, 0), 2)
  from public.passes p
  join labor_by_pass lp on lp.pass_id = p.id
  where p.vineyard_id = p_vineyard
  union all
  select 'contractor'::text,
         null::uuid,
         'Contractors with no task'::text,
         round(coalesce(lc.hours, 0), 3),
         round(coalesce(lc.cost, 0), 2)
  from loose_contractor lc
  where coalesce(lc.hours, 0) > 0 or coalesce(lc.cost, 0) > 0;
end;
$$;

-- Triggers. Touch runs first (name sorts before the others) so a stale
-- offline write is ignored before hours are rewritten.
drop trigger if exists areas_a_touch on public.areas;
create trigger areas_a_touch before insert or update on public.areas
  for each row execute function private.touch_row();
drop trigger if exists areas_guard on public.areas;
create trigger areas_guard before update or delete on public.areas
  for each row execute function private.guard_area();

do $$
declare
  t text;
begin
  foreach t in array array[
    'vineyards', 'profiles', 'memberships', 'invites', 'invite_wages', 'manager_requests',
    'blocks', 'tasks', 'passes', 'pass_tasks', 'chemicals',
    'labor_entries', 'row_progress', 'spray_logs', 'watering_logs', 'weed_logs',
    'harvest_samples', 'equipment', 'service_types', 'service_logs',
    'contractors', 'contractor_costs', 'wage_rates', 'season_notes'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_a_touch', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function private.touch_row()',
      t || '_a_touch', t
    );
  end loop;
end $$;

-- Shared job: one interval per person. Earliest join and earliest leave win,
-- so a phone that still shows the clock running cannot erase a stop, and a
-- later stop cannot stretch the hours. A second insert for the same person
-- is folded into the first row.
create or replace function private.merge_crew_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.labor_entries;
  v_start timestamptz;
  v_end timestamptz;
  v_pause integer;
  v_status text;
  v_end_row integer;
  v_reason text;
  v_kind text;
begin
  if new.crew_job_id is null or new.entry_kind = 'pass_slice' then
    return new;
  end if;
  if new.deleted_at is not null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into existing
    from public.labor_entries
    where crew_job_id = new.crew_job_id
      and user_id = new.user_id
      and deleted_at is null
      and entry_kind in ('open', 'task', 'pass_total')
      and id is distinct from new.id
    limit 1;
    if existing.id is null then
      return new;
    end if;
    v_start := least(existing.started_at, new.started_at);
    v_end := least(existing.ended_at, new.ended_at);
    v_pause := greatest(coalesce(existing.pause_seconds, 0), coalesce(new.pause_seconds, 0));
    if v_end is not null and existing.ended_at is not distinct from v_end then
      v_status := existing.row_status;
      v_end_row := existing.row_end;
      v_reason := existing.close_reason;
      v_kind := existing.entry_kind;
    else
      v_status := new.row_status;
      v_end_row := new.row_end;
      v_reason := new.close_reason;
      v_kind := new.entry_kind;
    end if;
    if existing.ended_at is not null
       and new.ended_at is not null
       and existing.ended_at = new.ended_at
       and (existing.row_status = 'complete' or new.row_status = 'complete') then
      v_status := 'complete';
    end if;
    update public.labor_entries
      set started_at = v_start,
          ended_at = v_end,
          pause_seconds = v_pause,
          paused_at = case when v_end is null then least(existing.paused_at, new.paused_at) else null end,
          row_status = v_status,
          row_end = v_end_row,
          close_reason = v_reason,
          entry_kind = case when v_end is null then 'open' else v_kind end,
          client_updated_at = greatest(existing.client_updated_at, coalesce(new.client_updated_at, existing.client_updated_at))
      where id = existing.id;
    return null;
  end if;

  v_start := least(old.started_at, new.started_at);
  v_end := least(old.ended_at, new.ended_at);
  v_pause := greatest(coalesce(old.pause_seconds, 0), coalesce(new.pause_seconds, 0));
  if v_end is not null and old.ended_at is not distinct from v_end and (new.ended_at is null or old.ended_at <= new.ended_at) then
    new.row_status := old.row_status;
    new.row_end := old.row_end;
    new.close_reason := old.close_reason;
    if old.entry_kind <> 'open' then
      new.entry_kind := old.entry_kind;
    end if;
  end if;
  if old.ended_at is not null
     and new.ended_at is not null
     and old.ended_at = new.ended_at
     and (old.row_status = 'complete' or new.row_status = 'complete') then
    new.row_status := 'complete';
  end if;
  new.started_at := v_start;
  new.ended_at := v_end;
  new.pause_seconds := v_pause;
  new.paused_at := case when v_end is null then least(old.paused_at, new.paused_at) else null end;
  if v_end is null then
    new.entry_kind := 'open';
  end if;

  if old.client_updated_at is not null
     and (new.client_updated_at is null or new.client_updated_at < old.client_updated_at) then
    if v_end is not distinct from old.ended_at
       and v_start is not distinct from old.started_at
       and v_pause = coalesce(old.pause_seconds, 0)
       and new.paused_at is not distinct from old.paused_at then
      return null;
    end if;
    new.client_updated_at := old.client_updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists labor_entries_0_merge on public.labor_entries;
create trigger labor_entries_0_merge before insert or update on public.labor_entries
  for each row execute function private.merge_crew_time();

drop trigger if exists labor_entries_b_guard on public.labor_entries;
create trigger labor_entries_b_guard before update on public.labor_entries
  for each row execute function private.guard_labor_update();

drop trigger if exists labor_entries_c_hours on public.labor_entries;
create trigger labor_entries_c_hours before insert or update on public.labor_entries
  for each row execute function private.labor_set_hours();

drop trigger if exists row_progress_b_guard on public.row_progress;
create trigger row_progress_b_guard before update on public.row_progress
  for each row execute function private.guard_row_status();

drop trigger if exists pass_tasks_b_guard on public.pass_tasks;
create trigger pass_tasks_b_guard before insert or update on public.pass_tasks
  for each row execute function private.guard_pass_task();

drop trigger if exists memberships_b_guard on public.memberships;
create trigger memberships_b_guard before insert or update on public.memberships
  for each row execute function private.guard_membership();

drop trigger if exists manager_requests_b_guard on public.manager_requests;
create trigger manager_requests_b_guard before insert or update on public.manager_requests
  for each row execute function private.guard_manager_request();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.role_for(uuid) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_manager(uuid) to authenticated;
grant execute on function private.is_developer(uuid) to authenticated;
grant execute on function private.can_edit_catalog(uuid) to authenticated;
grant execute on function private.is_active_member(uuid, uuid) to authenticated;
grant execute on function private.edit_cutoff(uuid) to authenticated;
grant execute on function private.shares_vineyard(uuid) to authenticated;
grant execute on function private.touch_row() to authenticated;
grant execute on function private.labor_set_hours() to authenticated;
grant execute on function private.merge_crew_time() to authenticated;
grant execute on function private.guard_labor_update() to authenticated;
grant execute on function private.guard_row_status() to authenticated;
grant execute on function private.guard_area() to authenticated;
grant execute on function private.membership_role(uuid) to authenticated;
grant execute on function private.guard_membership() to authenticated;
grant execute on function private.guard_manager_request() to authenticated;
grant execute on function private.guard_pass_task() to authenticated;

-- Developer only. Sets the membership to manager and closes the request.
-- Does not read or write wages.
create or replace function public.decide_manager_request(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.manager_requests;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select * into r from public.manager_requests where id = p_id;
  if r.id is null or r.status is distinct from 'pending' then
    raise exception 'That request is not waiting' using errcode = '42501';
  end if;
  if not private.is_developer(r.vineyard_id) then
    raise exception 'Only the developer can approve a manager' using errcode = '42501';
  end if;

  perform private.manager_gate_begin('approve');
  if p_approve then
    update public.memberships
      set role = 'manager',
          active = true,
          client_updated_at = pg_catalog.clock_timestamp()
      where vineyard_id = r.vineyard_id
        and user_id = r.user_id
        and role = 'employee';
    if not found then
      raise exception 'That person is not an employee on this vineyard' using errcode = '42501';
    end if;
  end if;

  update public.manager_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_at = pg_catalog.clock_timestamp(),
        decided_by = auth.uid(),
        client_updated_at = pg_catalog.clock_timestamp()
    where id = r.id;

  perform private.manager_gate_end();
end;
$$;

revoke all on function public.claim_invites() from public, anon;
revoke all on function public.create_vineyard(text) from public, anon;
revoke all on function public.close_stale_jobs(uuid) from public, anon;
revoke all on function public.labor_cost_summary(uuid, integer) from public, anon;
grant execute on function public.claim_invites() to authenticated;
grant execute on function public.create_vineyard(text) to authenticated;
grant execute on function public.close_stale_jobs(uuid) to authenticated;
grant execute on function public.labor_cost_summary(uuid, integer) to authenticated;
revoke all on function public.decide_manager_request(uuid, boolean) from public, anon;
grant execute on function public.decide_manager_request(uuid, boolean) to authenticated;
