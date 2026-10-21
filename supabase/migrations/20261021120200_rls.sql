-- DA Ranch Vineyard App
-- 3 of 5. Row Level Security. One vineyard cannot read another.
-- Wages, invite wages, and contractor dollars are readable by managers only.
-- The developer role can rename and delete tasks and read problem reports,
-- and cannot read those money tables (there is no select policy for them).

do $$
declare
  t text;
begin
  foreach t in array array[
    'vineyards', 'profiles', 'memberships', 'invites', 'invite_wages',
    'areas', 'blocks', 'tasks', 'passes', 'pass_tasks', 'chemicals',
    'labor_entries', 'row_progress', 'spray_logs', 'watering_logs', 'weed_logs',
    'harvest_samples', 'equipment', 'service_types', 'service_logs',
    'contractors', 'contractor_costs', 'wage_rates', 'bug_reports', 'season_notes'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Vineyard
drop policy if exists vineyards_select on public.vineyards;
create policy vineyards_select on public.vineyards
  for select to authenticated
  using ((select private.is_member(id)));

drop policy if exists vineyards_update on public.vineyards;
create policy vineyards_update on public.vineyards
  for update to authenticated
  using ((select private.is_manager(id)))
  with check ((select private.is_manager(id)));

-- Profiles: a person, and the crew they share a vineyard with. No wages here.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select private.shares_vineyard(id)));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Memberships
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
  for update to authenticated
  using (
    (select private.is_manager(vineyard_id))
    or (select private.is_developer(vineyard_id))
  )
  with check (
    role in ('employee', 'manager', 'developer')
    and (
      (select private.is_manager(vineyard_id))
      or (select private.is_developer(vineyard_id))
    )
  );

-- Invites. Developers can add people. They cannot write invite_wages.
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select to authenticated
  using (
    (select private.is_manager(vineyard_id))
    or (select private.is_developer(vineyard_id))
  );

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert to authenticated
  with check (
    role in ('employee', 'manager')
    and invited_by = (select auth.uid())
    and (
      (select private.is_manager(vineyard_id))
      or (select private.is_developer(vineyard_id))
    )
  );

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update to authenticated
  using (
    (select private.is_manager(vineyard_id))
    or (select private.is_developer(vineyard_id))
  )
  with check (
    role in ('employee', 'manager')
    and (
      (select private.is_manager(vineyard_id))
      or (select private.is_developer(vineyard_id))
    )
  );

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete to authenticated
  using (
    (select private.is_manager(vineyard_id))
    or (select private.is_developer(vineyard_id))
  );

drop policy if exists invite_wages_manager on public.invite_wages;
create policy invite_wages_manager on public.invite_wages
  for all to authenticated
  using ((select private.is_manager(vineyard_id)))
  with check ((select private.is_manager(vineyard_id)));

-- Catalog: blocks, areas, passes, chemicals. Tasks are looser on insert.
drop policy if exists areas_select on public.areas;
create policy areas_select on public.areas
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists areas_write on public.areas;
create policy areas_write on public.areas
  for insert to authenticated
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists areas_update on public.areas;
create policy areas_update on public.areas
  for update to authenticated
  using ((select private.can_edit_catalog(vineyard_id)))
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks
  for insert to authenticated
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists blocks_update on public.blocks;
create policy blocks_update on public.blocks
  for update to authenticated
  using ((select private.can_edit_catalog(vineyard_id)))
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    (select private.is_member(vineyard_id))
    and archived = false
    and deleted_at is null
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using ((select private.can_edit_catalog(vineyard_id)))
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists passes_select on public.passes;
create policy passes_select on public.passes
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists passes_insert on public.passes;
create policy passes_insert on public.passes
  for insert to authenticated
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists passes_update on public.passes;
create policy passes_update on public.passes
  for update to authenticated
  using ((select private.can_edit_catalog(vineyard_id)))
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists pass_tasks_select on public.pass_tasks;
create policy pass_tasks_select on public.pass_tasks
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists pass_tasks_insert on public.pass_tasks;
create policy pass_tasks_insert on public.pass_tasks
  for insert to authenticated
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists pass_tasks_update on public.pass_tasks;
create policy pass_tasks_update on public.pass_tasks
  for update to authenticated
  using ((select private.can_edit_catalog(vineyard_id)))
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists pass_tasks_delete on public.pass_tasks;
create policy pass_tasks_delete on public.pass_tasks
  for delete to authenticated
  using ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists chemicals_select on public.chemicals;
create policy chemicals_select on public.chemicals
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists chemicals_insert on public.chemicals;
create policy chemicals_insert on public.chemicals
  for insert to authenticated
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists chemicals_update on public.chemicals;
create policy chemicals_update on public.chemicals
  for update to authenticated
  using ((select private.can_edit_catalog(vineyard_id)))
  with check ((select private.can_edit_catalog(vineyard_id)));

-- Labor. Everyone in the vineyard can read hours. Money is not on this table.
drop policy if exists labor_select on public.labor_entries;
create policy labor_select on public.labor_entries
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists labor_insert on public.labor_entries;
create policy labor_insert on public.labor_entries
  for insert to authenticated
  with check (
    (select private.is_member(vineyard_id))
    and logged_by = (select auth.uid())
    and (select private.is_active_member(vineyard_id, user_id))
  );

drop policy if exists labor_update on public.labor_entries;
create policy labor_update on public.labor_entries
  for update to authenticated
  using (
    (select private.is_manager(vineyard_id))
    or (
      (user_id = (select auth.uid()) or logged_by = (select auth.uid()))
      and work_date >= (select private.edit_cutoff(vineyard_id))
    )
  )
  with check (
    (select private.is_member(vineyard_id))
    and (
      (select private.is_manager(vineyard_id))
      or (
        (user_id = (select auth.uid()) or logged_by = (select auth.uid()))
        and work_date >= (select private.edit_cutoff(vineyard_id))
      )
    )
  );

-- Row colors. A complete row is not turned back by an employee (see the trigger).
drop policy if exists row_progress_select on public.row_progress;
create policy row_progress_select on public.row_progress
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists row_progress_insert on public.row_progress;
create policy row_progress_insert on public.row_progress
  for insert to authenticated
  with check ((select private.is_member(vineyard_id)));

drop policy if exists row_progress_update on public.row_progress;
create policy row_progress_update on public.row_progress
  for update to authenticated
  using ((select private.is_member(vineyard_id)))
  with check ((select private.is_member(vineyard_id)));

-- Shared field logs. The crew taps the same spray.
do $$
declare
  t text;
begin
  foreach t in array array[
    'spray_logs', 'watering_logs', 'weed_logs', 'harvest_samples',
    'equipment', 'service_types', 'service_logs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_member(vineyard_id)))',
      t || '_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_member(vineyard_id)))',
      t || '_insert', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_member(vineyard_id))) with check ((select private.is_member(vineyard_id)))',
      t || '_update', t
    );
  end loop;
end $$;

-- Contractors. Hours and the story are visible to the crew.
-- The dollar amount is a separate table.
drop policy if exists contractors_select on public.contractors;
create policy contractors_select on public.contractors
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists contractors_insert on public.contractors;
create policy contractors_insert on public.contractors
  for insert to authenticated
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists contractors_update on public.contractors;
create policy contractors_update on public.contractors
  for update to authenticated
  using ((select private.can_edit_catalog(vineyard_id)))
  with check ((select private.can_edit_catalog(vineyard_id)));

drop policy if exists contractor_costs_manager on public.contractor_costs;
create policy contractor_costs_manager on public.contractor_costs
  for all to authenticated
  using ((select private.is_manager(vineyard_id)))
  with check ((select private.is_manager(vineyard_id)));

drop policy if exists wage_rates_manager on public.wage_rates;
create policy wage_rates_manager on public.wage_rates
  for all to authenticated
  using ((select private.is_manager(vineyard_id)))
  with check ((select private.is_manager(vineyard_id)));

-- Problem reports. Anyone can file one. Managers and the developer can read them.
drop policy if exists bug_reports_select on public.bug_reports;
create policy bug_reports_select on public.bug_reports
  for select to authenticated
  using (
    (select private.is_manager(vineyard_id))
    or (select private.is_developer(vineyard_id))
  );

drop policy if exists bug_reports_insert on public.bug_reports;
create policy bug_reports_insert on public.bug_reports
  for insert to authenticated
  with check (
    (select private.is_member(vineyard_id))
    and user_id = (select auth.uid())
  );

drop policy if exists season_notes_select on public.season_notes;
create policy season_notes_select on public.season_notes
  for select to authenticated
  using ((select private.is_member(vineyard_id)));

drop policy if exists season_notes_insert on public.season_notes;
create policy season_notes_insert on public.season_notes
  for insert to authenticated
  with check ((select private.is_member(vineyard_id)));

drop policy if exists season_notes_update on public.season_notes;
create policy season_notes_update on public.season_notes
  for update to authenticated
  using ((select private.is_member(vineyard_id)))
  with check ((select private.is_member(vineyard_id)));
