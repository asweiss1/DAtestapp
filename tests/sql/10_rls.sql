-- Role and wage checks against the local database. Fails the script on a bad result.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'joe@da.test', '{"display_name":"Joe"}'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'maria@da.test', '{"display_name":"Maria"}'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaron@da.test', '{"display_name":"Aaron"}'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'sam@da.test', '{"display_name":"Sam"}');

insert into public.memberships (vineyard_id, user_id, role)
select v.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'employee' from public.vineyards v where v.name = 'DA Ranch';
insert into public.memberships (vineyard_id, user_id, role)
select v.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'manager' from public.vineyards v where v.name = 'DA Ranch';
insert into public.memberships (vineyard_id, user_id, role)
select v.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'developer' from public.vineyards v where v.name = 'DA Ranch';

create temp table fix as
select
  v.id as vineyard,
  (select id from public.tasks t where t.vineyard_id = v.id and t.slug = 'long-pruning') as task,
  (select id from public.tasks t where t.vineyard_id = v.id and t.slug = 'short-pruning') as task2,
  (select id from public.blocks b where b.vineyard_id = v.id and b.name = 'DA Cabernet') as block,
  (timezone('America/Phoenix', now()))::date as today
from public.vineyards v
where v.name = 'DA Ranch';

grant select on fix to authenticated;

commit;

-- Employee cannot see wages.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select 1 / case when (select count(*) from public.wage_rates) = 0 then 1 else 0 end;
select 1 / case when (select count(*) from public.contractor_costs) = 0 then 1 else 0 end;
select 1 / case when (select count(*) from public.invite_wages) = 0 then 1 else 0 end;
commit;

-- Developer cannot see wages or cost.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
set local role authenticated;
select 1 / case when (select count(*) from public.wage_rates) = 0 then 1 else 0 end;
select 1 / case when (select count(*) from public.contractor_costs) = 0 then 1 else 0 end;
do $$
begin
  perform * from public.labor_cost_summary((select vineyard from fix), 2026);
  raise exception 'FAIL developer read labor cost';
exception
  when insufficient_privilege then
    null;
end $$;
commit;

-- Employee cannot read labor cost.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
do $$
begin
  perform * from public.labor_cost_summary((select vineyard from fix), 2026);
  raise exception 'FAIL employee read labor cost';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  insert into public.wage_rates (vineyard_id, user_id, hourly_rate, effective_from)
  select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 99, today from fix;
  raise exception 'FAIL employee inserted a wage';
exception
  when insufficient_privilege then
    null;
end $$;
commit;

-- Developer cannot insert a wage.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
set local role authenticated;
do $$
begin
  insert into public.wage_rates (vineyard_id, user_id, hourly_rate, effective_from)
  select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 15, today from fix;
  raise exception 'FAIL developer inserted a wage';
exception
  when insufficient_privilege then
    null;
end $$;
commit;

-- Manager can store a wage and read it back. History keeps the older rate.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
insert into public.wage_rates (vineyard_id, user_id, hourly_rate, effective_from, created_by)
select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 10, date '2025-01-01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' from fix;
insert into public.wage_rates (vineyard_id, user_id, hourly_rate, effective_from, created_by)
select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 20, date '2026-01-01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' from fix;
insert into public.wage_rates (vineyard_id, user_id, hourly_rate, effective_from, created_by)
select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 30, date '2026-01-01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' from fix;
select 1 / case when (select count(*) from public.wage_rates) = 3 then 1 else 0 end;
commit;

-- Hours and cost roll up by task, not by person.
begin;
insert into public.labor_entries (
  vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  entry_kind, started_at, ended_at, source, close_reason
)
select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       2026, date '2026-06-01', block, task, 'task',
       '2026-06-01 15:00:00+00', '2026-06-01 17:00:00+00', 'manual', 'manual'
from fix;
insert into public.labor_entries (
  vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  entry_kind, started_at, ended_at, source, close_reason
)
select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
       2026, date '2026-06-01', block, task, 'task',
       '2026-06-01 15:00:00+00', '2026-06-01 16:00:00+00', 'manual', 'manual'
from fix;

insert into public.contractors (
  vineyard_id, season_year, person_name, company, description, work_date, hours, task_id, created_by
)
select vineyard, 2026, 'Pat', 'Fence Co', 'Fence repair', date '2026-06-02', 4, task,
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
from fix;
insert into public.contractor_costs (entry_id, vineyard_id, amount)
select c.id, c.vineyard_id, 50
from public.contractors c
where c.person_name = 'Pat';

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
select 1 / case
  when (select hours from public.labor_cost_summary((select vineyard from fix), 2026) where group_kind = 'task' and group_label = 'Long pruning') = 7
   and (select cost from public.labor_cost_summary((select vineyard from fix), 2026) where group_kind = 'task' and group_label = 'Long pruning') = 120
  then 1 else 0 end;
commit;

-- Employee sees every block in DA Ranch and no other vineyard. Developer can rename a task. Employee cannot.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', true);
set local role authenticated;
select public.create_vineyard('Other Ranch');
select 1 / case when (select count(*) from public.blocks) = 0 then 1 else 0 end;
select 1 / case when (select count(*) from public.vineyards where name = 'DA Ranch') = 0 then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select 1 / case when (select count(*) from public.blocks) = 14 then 1 else 0 end;
select 1 / case when (select count(*) from public.profiles) = 3 then 1 else 0 end;
do $$
begin
  update public.tasks set label = 'Nope', client_updated_at = clock_timestamp()
  where id = (select task from fix);
  if found then
    raise exception 'FAIL employee renamed a task';
  end if;
exception
  when insufficient_privilege then
    null;
end $$;
insert into public.tasks (vineyard_id, slug, label, sort_order)
select vineyard, 'extra-job', 'Extra job', 50 from fix;
select 1 / case when exists (
  select 1 from public.tasks where slug = 'extra-job'
) then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
set local role authenticated;
update public.tasks
  set label = 'Long pruning renamed', client_updated_at = clock_timestamp()
  where id = (select task from fix);
select 1 / case when (select label from public.tasks where id = (select task from fix)) = 'Long pruning renamed' then 1 else 0 end;
update public.tasks set label = 'Long pruning', archived = true, client_updated_at = clock_timestamp()
  where id = (select task from fix);
select 1 / case when (select archived from public.tasks where id = (select task from fix)) then 1 else 0 end;
update public.tasks set archived = false, client_updated_at = clock_timestamp()
  where id = (select task from fix);
commit;

-- Own recent hours can be fixed. Old hours and other people's hours cannot, unless you are the manager.
begin;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, task_id,
  entry_kind, started_at, ended_at, source, close_reason, notes
)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, task2, 'task',
       now() - interval '2 hours', now() - interval '1 hour', 'manual', 'manual', 'recent'
from fix;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, task_id,
  entry_kind, started_at, ended_at, source, close_reason, notes
)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today - 20, task2, 'task',
       now() - interval '30 days', now() - interval '30 days' + interval '1 hour', 'manual', 'manual', 'old'
from fix;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
update public.labor_entries
  set notes = 'fixed', client_updated_at = clock_timestamp()
  where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
select 1 / case when (select notes from public.labor_entries where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1') = 'fixed' then 1 else 0 end;
update public.labor_entries
  set notes = 'should-not', client_updated_at = clock_timestamp()
  where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
select 1 / case when (select notes from public.labor_entries where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2') = 'old' then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
set local role authenticated;
update public.labor_entries
  set notes = 'dev-edit', client_updated_at = clock_timestamp()
  where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
select 1 / case when (select notes from public.labor_entries where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2') = 'old' then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
update public.labor_entries
  set notes = 'manager-fixed', client_updated_at = clock_timestamp()
  where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
select 1 / case when (select notes from public.labor_entries where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2') = 'manager-fixed' then 1 else 0 end;
commit;

-- Complete rows stay complete when an employee sends partial.
begin;
insert into public.row_progress (vineyard_id, season_year, block_id, task_id, row_number, status, updated_by)
select vineyard, 2026, block, task, 3, 'complete', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' from fix;
commit;
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
update public.row_progress
  set status = 'partial', client_updated_at = clock_timestamp()
  where row_number = 3 and task_id = (select task from fix);
select 1 / case when (
  select status from public.row_progress where row_number = 3 and task_id = (select task from fix)
) = 'complete' then 1 else 0 end;
commit;

-- Problem reports.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
insert into public.bug_reports (vineyard_id, user_id, note, client_id)
select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'The row button did nothing', gen_random_uuid() from fix;
select 1 / case when (select count(*) from public.bug_reports) = 0 then 1 else 0 end;
commit;
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
set local role authenticated;
select 1 / case when (select count(*) from public.bug_reports) = 1 then 1 else 0 end;
commit;

-- Invite claims a membership and, for a manager invite, a starting wage.
begin;
insert into public.invites (id, vineyard_id, email, display_name, role, invited_by)
select 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', vineyard, 'newhire@da.test', 'New Hire', 'employee',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
from fix;
insert into public.invite_wages (invite_id, vineyard_id, hourly_rate)
select 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', vineyard, 18 from fix;
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'newhire@da.test', '{"display_name":"Newbie"}');
select 1 / case when (
  select role from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
) = 'employee' then 1 else 0 end;
select 1 / case when (
  select hourly_rate from public.wage_rates where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
) = 18 then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', true);
set local role authenticated;
select 1 / case when (select count(*) from public.wage_rates) = 0 then 1 else 0 end;
commit;

-- End of day closes an open clock at 2:25pm Arizona, and splits a pass.
begin;
insert into public.passes (id, vineyard_id, name)
select 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', vineyard, 'Nets and clips' from fix;
insert into public.pass_tasks (vineyard_id, pass_id, task_id, sort_order)
select vineyard, 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', task, 1 from fix;
insert into public.pass_tasks (vineyard_id, pass_id, task_id, sort_order)
select vineyard, 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', task2, 2 from fix;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, pass_id,
  entry_kind, row_start, started_at, source
)
select 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, date '2026-06-15', block,
       'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'open', 4,
       '2026-06-15 15:00:00+00', 'taps'
from fix;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select 1 / case when public.close_stale_jobs((select vineyard from fix)) >= 1 then 1 else 0 end;
commit;

begin;
select 1 / case when (
  select ended_at from public.labor_entries where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
) = '2026-06-15 21:25:00+00' then 1 else 0 end;
select 1 / case when (
  select hours from public.labor_entries where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
) = 6.417 then 1 else 0 end;
select 1 / case when (
  select count(*) from public.labor_entries where pass_group_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2' and entry_kind = 'pass_slice'
) = 2 then 1 else 0 end;
select 1 / case when (
  select round(sum(hours), 3) from public.labor_entries
  where pass_group_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2' and entry_kind = 'pass_slice'
) = 6.417 then 1 else 0 end;
select 1 / case when (
  select status from public.row_progress
  where block_id = (select block from fix) and row_number = 4 and task_id = (select task from fix) and season_year = 2026
) = 'partial' then 1 else 0 end;
commit;

-- Photos stay inside the vineyard folder.
begin;
alter table fix add column if not exists other uuid;
update fix set other = (select id from public.vineyards where name = 'Other Ranch');
commit;
begin;
grant select on fix to authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
insert into storage.objects (bucket_id, name)
select 'spray-photos', vineyard::text || '/spray/pic.jpg' from fix;
do $$
declare
  other uuid;
begin
  select fix.other into other from fix;
  insert into storage.objects (bucket_id, name)
  values ('spray-photos', other::text || '/spray/nope.jpg');
  raise exception 'FAIL photo uploaded into another vineyard';
exception
  when insufficient_privilege then
    null;
end $$;
commit;

-- Anonymous role cannot read the tables.
begin;
set local role anon;
do $$
begin
  perform 1 from public.blocks;
  raise exception 'FAIL anon read blocks';
exception
  when insufficient_privilege then
    null;
end $$;
commit;
