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
select 1 / case when (
  select m.role
  from public.memberships m
  join public.vineyards v on v.id = m.vineyard_id
  where v.name = 'Other Ranch' and m.user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
) = 'manager' then 1 else 0 end;
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

-- A manager invite does not grant manager. The person is an employee until
-- the developer approves the request. The starting wage stays manager-only.
begin;
insert into public.invites (id, vineyard_id, email, display_name, role, invited_by)
select 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', vineyard, 'lead@da.test', 'Lead', 'manager',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
from fix;
insert into public.invite_wages (invite_id, vineyard_id, hourly_rate)
select 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', vineyard, 22 from fix;
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'lead@da.test', '{"display_name":"Lead"}');
select 1 / case when (
  select role from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
) = 'employee' then 1 else 0 end;
select 1 / case when (
  select count(*) from public.manager_requests
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6' and status = 'pending'
) = 1 then 1 else 0 end;
select 1 / case when (
  select hourly_rate from public.wage_rates where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
) = 22 then 1 else 0 end;
commit;

-- An employee cannot see or file a manager request.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select 1 / case when (select count(*) from public.manager_requests) = 0 then 1 else 0 end;
do $$
begin
  insert into public.manager_requests (vineyard_id, user_id, requested_by, status)
  select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'pending' from fix;
  raise exception 'FAIL employee filed a manager request';
exception
  when insufficient_privilege then
    null;
end $$;
commit;

-- A manager cannot promote someone, approve a request, or write an approved row.
-- Filing a pending request is allowed. A second pending row for the same person is not.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
select 1 / case when (
  select count(*) from public.manager_requests where status = 'pending'
) = 1 then 1 else 0 end;
do $$
begin
  update public.memberships
    set role = 'manager', client_updated_at = clock_timestamp()
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
  raise exception 'FAIL manager promoted without approval';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  perform set_config('daranch.manager_gate', 'approve', true);
  perform set_config('daranch.manager_gate', 'bootstrap', true);
  update public.memberships
    set role = 'manager', client_updated_at = clock_timestamp()
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
  raise exception 'FAIL manager bypassed approval with a setting';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  perform public.decide_manager_request(
    (select id from public.manager_requests where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6' and status = 'pending'),
    true
  );
  raise exception 'FAIL manager approved a manager';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  update public.manager_requests
    set status = 'approved', client_updated_at = clock_timestamp()
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
  raise exception 'FAIL manager wrote a request status';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  insert into public.manager_requests (vineyard_id, user_id, requested_by, status)
  select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'approved' from fix;
  raise exception 'FAIL request inserted already approved';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  insert into public.manager_requests (vineyard_id, user_id, requested_by, status)
  select vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'pending' from fix;
  raise exception 'FAIL second pending request';
exception
  when unique_violation then
    null;
end $$;
insert into public.manager_requests (id, vineyard_id, user_id, requested_by, status)
select 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'pending'
from fix;
select 1 / case when (
  select role from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
) = 'employee' then 1 else 0 end;
select 1 / case when (
  select hourly_rate from public.wage_rates where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
) = 22 then 1 else 0 end;
commit;

-- The developer cannot promote by editing the membership. Turning a request
-- down leaves the person an employee. Approving the other request makes that
-- person a manager. Wages and cost stay hidden.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
set local role authenticated;
do $$
begin
  update public.memberships
    set role = 'manager', client_updated_at = clock_timestamp()
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  raise exception 'FAIL developer promoted without the approval function';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  perform set_config('daranch.manager_gate', 'approve', true);
  update public.memberships
    set role = 'manager', client_updated_at = clock_timestamp()
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  raise exception 'FAIL developer bypassed approval with a setting';
exception
  when insufficient_privilege then
    null;
end $$;
select public.decide_manager_request('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', false);
select 1 / case when (
  select role from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
) = 'employee' then 1 else 0 end;
select 1 / case when (
  select status from public.manager_requests where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
) = 'rejected' then 1 else 0 end;
select public.decide_manager_request(
  (select id from public.manager_requests where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6' and status = 'pending'),
  true
);
select 1 / case when (
  select role from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
) = 'manager' then 1 else 0 end;
select 1 / case when (
  select status from public.manager_requests where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
) = 'approved' then 1 else 0 end;
select 1 / case when (select count(*) from public.wage_rates) = 0 then 1 else 0 end;
select 1 / case when (select count(*) from public.invite_wages) = 0 then 1 else 0 end;
do $$
begin
  perform * from public.labor_cost_summary((select vineyard from fix), 2026);
  raise exception 'FAIL developer read labor cost after approving a manager';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  perform public.decide_manager_request('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', true);
  raise exception 'FAIL decided a request twice';
exception
  when insufficient_privilege then
    null;
end $$;
commit;

-- Making a manager back into an employee does not need another approval.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
update public.memberships
  set role = 'employee', client_updated_at = clock_timestamp()
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
select 1 / case when (
  select role from public.memberships where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
) = 'employee' then 1 else 0 end;
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

-- A shared job gives each person their own clock. The earlier leave wins,
-- a second insert does not copy the time, and any crew member can stop an open clock.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, source
)
select '11111111-1111-4111-8111-111111111111', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       '11111111-1111-4111-8111-111111111111', 'open', 2,
       (today::timestamp + time '08:00') at time zone 'America/Phoenix', 'taps'
from fix;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, pause_seconds, source
)
select '22222222-2222-4222-8222-222222222222', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       '11111111-1111-4111-8111-111111111111', 'open', 2,
       (today::timestamp + time '09:00') at time zone 'America/Phoenix', 600, 'crew'
from fix;
select 1 / case when (
  select count(*) from public.labor_entries
  where crew_job_id = '11111111-1111-4111-8111-111111111111' and entry_kind = 'open'
) = 2 then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
set local role authenticated;
update public.labor_entries
  set ended_at = (select (today::timestamp + time '10:00') at time zone 'America/Phoenix' from fix),
      close_reason = 'leave',
      client_updated_at = clock_timestamp()
  where id = '22222222-2222-4222-8222-222222222222';
select 1 / case when (
  select hours from public.labor_entries where id = '22222222-2222-4222-8222-222222222222'
) = 0.833 then 1 else 0 end;
select 1 / case when (
  select entry_kind from public.labor_entries where id = '11111111-1111-4111-8111-111111111111'
) = 'open' then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
update public.labor_entries
  set ended_at = (select (today::timestamp + time '12:00') at time zone 'America/Phoenix' from fix),
      client_updated_at = clock_timestamp()
  where id = '22222222-2222-4222-8222-222222222222';
update public.labor_entries
  set ended_at = null,
      entry_kind = 'open',
      client_updated_at = clock_timestamp()
  where id = '22222222-2222-4222-8222-222222222222';
select 1 / case when (
  select ended_at = (today::timestamp + time '10:00') at time zone 'America/Phoenix'
  from public.labor_entries le, fix
  where le.id = '22222222-2222-4222-8222-222222222222'
) then 1 else 0 end;
select 1 / case when (
  select hours from public.labor_entries where id = '22222222-2222-4222-8222-222222222222'
) = 0.833 then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, pause_seconds, source
)
select '33333333-3333-4333-8333-333333333333', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       '11111111-1111-4111-8111-111111111111', 'open', 2,
       (today::timestamp + time '08:30') at time zone 'America/Phoenix', 0, 'crew'
from fix;
select 1 / case when (
  select count(*) from public.labor_entries
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    and crew_job_id = '11111111-1111-4111-8111-111111111111'
    and entry_kind <> 'pass_slice'
) = 1 then 1 else 0 end;
select 1 / case when (
  select started_at = (today::timestamp + time '08:30') at time zone 'America/Phoenix'
     and hours = 1.333
  from public.labor_entries le, fix
  where le.id = '22222222-2222-4222-8222-222222222222'
) then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', true);
set local role authenticated;
update public.labor_entries
  set ended_at = (select (today::timestamp + time '11:00') at time zone 'America/Phoenix' from fix),
      row_end = 4,
      row_status = 'complete',
      close_reason = 'tap',
      client_updated_at = clock_timestamp()
  where id = '11111111-1111-4111-8111-111111111111';
select 1 / case when (
  select entry_kind = 'task' and row_status = 'complete'
  from public.labor_entries where id = '11111111-1111-4111-8111-111111111111'
) then 1 else 0 end;
select 1 / case when (
  select ended_at = (today::timestamp + time '10:00') at time zone 'America/Phoenix'
  from public.labor_entries le, fix
  where le.id = '22222222-2222-4222-8222-222222222222'
) then 1 else 0 end;
commit;

-- Offline phones. Same row and task become one job. Earliest stop wins.
-- Complete beats Partial. One person is not counted twice.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, source
)
select 'a1111111-1111-4111-8111-111111111111', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       'a1111111-1111-4111-8111-111111111111', 'open', 5,
       (today::timestamp + time '13:00') at time zone 'America/Phoenix', 'taps'
from fix;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, source
)
select 'a2222222-2222-4222-8222-222222222222', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       'a2222222-2222-4222-8222-222222222222', 'open', 5,
       (today::timestamp + time '13:10') at time zone 'America/Phoenix', 'taps'
from fix;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, source
)
select 'a3333333-3333-4333-8333-333333333333', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       'a3333333-3333-4333-8333-333333333333', 'open', 5,
       (today::timestamp + time '13:30') at time zone 'America/Phoenix', 'taps'
from fix;
select 1 / case when (
  select count(*) from public.labor_entries
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and row_start = 5 and deleted_at is null and entry_kind <> 'pass_slice'
) = 1 then 1 else 0 end;
select 1 / case when (
  select count(distinct crew_job_id) from public.labor_entries
  where row_start = 5 and deleted_at is null and entry_kind <> 'pass_slice'
) = 1 then 1 else 0 end;
select 1 / case when (
  select started_at = (today::timestamp + time '13:00') at time zone 'America/Phoenix'
  from public.labor_entries le, fix
  where le.id = 'a1111111-1111-4111-8111-111111111111'
) then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
update public.labor_entries
  set ended_at = (select (today::timestamp + time '14:30') at time zone 'America/Phoenix' from fix),
      row_end = 5, row_status = 'partial', close_reason = 'tap',
      client_updated_at = clock_timestamp()
  where id in ('a1111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333');
update public.labor_entries
  set ended_at = (select (today::timestamp + time '15:00') at time zone 'America/Phoenix' from fix),
      row_end = 6, row_status = 'complete', close_reason = 'tap',
      client_updated_at = clock_timestamp()
  where id in ('a1111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333');
select 1 / case when (
  select ended_at = (today::timestamp + time '14:30') at time zone 'America/Phoenix'
     and row_status = 'complete' and hours = 1.5
  from public.labor_entries le, fix
  where le.id = 'a1111111-1111-4111-8111-111111111111'
) then 1 else 0 end;
select 1 / case when (
  select ended_at = (today::timestamp + time '14:30') at time zone 'America/Phoenix'
     and row_status = 'complete' and hours = 1.0
  from public.labor_entries le, fix
  where le.id = 'a3333333-3333-4333-8333-333333333333'
) then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, source
)
select 'b1111111-1111-4111-8111-111111111111', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       'b1111111-1111-4111-8111-111111111111', 'open', 6,
       (today::timestamp + time '16:00') at time zone 'America/Phoenix', 'taps'
from fix;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, source
)
select 'b3333333-3333-4333-8333-333333333333', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       'b3333333-3333-4333-8333-333333333333', 'open', 6,
       (today::timestamp + time '16:20') at time zone 'America/Phoenix', 'taps'
from fix;
update public.labor_entries
  set ended_at = (select (today::timestamp + time '17:00') at time zone 'America/Phoenix' from fix),
      close_reason = 'leave', client_updated_at = clock_timestamp()
  where id = 'b3333333-3333-4333-8333-333333333333';
update public.labor_entries
  set ended_at = (select (today::timestamp + time '18:00') at time zone 'America/Phoenix' from fix),
      row_end = 6, row_status = 'complete', close_reason = 'tap',
      client_updated_at = clock_timestamp()
  where id in ('b1111111-1111-4111-8111-111111111111', 'b3333333-3333-4333-8333-333333333333');
select 1 / case when (
  select ended_at = (today::timestamp + time '17:00') at time zone 'America/Phoenix'
     and hours = 0.667
  from public.labor_entries le, fix
  where le.id = 'b3333333-3333-4333-8333-333333333333' and le.deleted_at is null
) then 1 else 0 end;
select 1 / case when (
  select ended_at = (today::timestamp + time '18:00') at time zone 'America/Phoenix'
     and hours = 2 and row_status = 'complete'
  from public.labor_entries le, fix
  where le.id = 'b1111111-1111-4111-8111-111111111111' and le.deleted_at is null
) then 1 else 0 end;
select 1 / case when (
  select count(*) from public.labor_entries
  where row_start = 6 and deleted_at is null and entry_kind <> 'pass_slice'
) = 2 then 1 else 0 end;
commit;

-- Complete can sync before Partial. The older Partial still moves the stop
-- earlier, and the row stays Complete. A second phone's copy is not stored.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, started_at, source
)
select 'c1111111-1111-4111-8111-111111111111', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       'c1111111-1111-4111-8111-111111111111', 'open', 7,
       (today::timestamp + time '13:00') at time zone 'America/Phoenix', 'taps'
from fix;
update public.labor_entries
  set ended_at = (select (today::timestamp + time '15:00') at time zone 'America/Phoenix' from fix),
      row_end = 8, row_status = 'complete', close_reason = 'tap',
      client_updated_at = (select (today::timestamp + time '15:00') at time zone 'America/Phoenix' from fix)
  where id = 'c1111111-1111-4111-8111-111111111111';
update public.labor_entries
  set ended_at = (select (today::timestamp + time '14:30') at time zone 'America/Phoenix' from fix),
      row_end = 4, row_status = 'partial', close_reason = 'tap',
      client_updated_at = (select (today::timestamp + time '14:30') at time zone 'America/Phoenix' from fix)
  where id = 'c1111111-1111-4111-8111-111111111111';
select 1 / case when (
  select ended_at = (today::timestamp + time '14:30') at time zone 'America/Phoenix'
     and row_status = 'complete' and row_end = 8 and hours = 1.5
  from public.labor_entries le, fix
  where le.id = 'c1111111-1111-4111-8111-111111111111' and le.deleted_at is null
) then 1 else 0 end;
insert into public.labor_entries (
  id, vineyard_id, user_id, logged_by, season_year, work_date, block_id, task_id,
  crew_job_id, entry_kind, row_start, row_end, row_status,
  started_at, ended_at, close_reason, source, client_updated_at
)
select 'c2222222-2222-4222-8222-222222222222', vineyard, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2026, today, block, task,
       'c2222222-2222-4222-8222-222222222222', 'task', 7, 4, 'partial',
       (today::timestamp + time '13:05') at time zone 'America/Phoenix',
       (today::timestamp + time '14:00') at time zone 'America/Phoenix',
       'tap', 'taps',
       (today::timestamp + time '14:00') at time zone 'America/Phoenix'
from fix;
select 1 / case when (
  select count(*) from public.labor_entries
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and row_start = 7 and deleted_at is null and entry_kind <> 'pass_slice'
) = 1 then 1 else 0 end;
select 1 / case when (
  select started_at = (today::timestamp + time '13:00') at time zone 'America/Phoenix'
     and ended_at = (today::timestamp + time '14:00') at time zone 'America/Phoenix'
     and row_status = 'complete' and hours = 1
  from public.labor_entries le, fix
  where le.id = 'c1111111-1111-4111-8111-111111111111' and le.deleted_at is null
) then 1 else 0 end;
commit;

-- The tour flag is on the person's own profile. Another person cannot clear it.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
update public.profiles
  set tour_seen = true
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
select 1 / case when (
  select tour_seen from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
) then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
update public.profiles
  set tour_seen = false
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
select 1 / case when (
  select tour_seen from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
) then 1 else 0 end;
commit;

-- Weather location is seeded for Cornville and only a manager can change it.
select 1 / case when (
  select latitude = 34.7183
     and longitude = -111.9086
     and weather_url = 'https://www.wunderground.com/weather/us/az/cornville'
  from public.vineyards where name = 'DA Ranch'
) then 1 else 0 end;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
update public.vineyards
  set latitude = 34.7200,
      longitude = -111.9100,
      weather_url = 'https://www.wunderground.com/weather/us/az/cornville',
      client_updated_at = clock_timestamp()
  where name = 'DA Ranch';
select 1 / case when (
  select latitude = 34.7200 and longitude = -111.9100
  from public.vineyards where name = 'DA Ranch'
) then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
update public.vineyards
  set latitude = 1, client_updated_at = clock_timestamp()
  where name = 'DA Ranch';
select 1 / case when (
  select latitude = 34.7200 from public.vineyards where name = 'DA Ranch'
) then 1 else 0 end;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true);
set local role authenticated;
update public.vineyards
  set latitude = 2, client_updated_at = clock_timestamp()
  where name = 'DA Ranch';
select 1 / case when (
  select latitude = 34.7200 from public.vineyards where name = 'DA Ranch'
) then 1 else 0 end;
commit;

do $$
begin
  update public.vineyards set latitude = 999 where name = 'DA Ranch';
  raise exception 'FAIL latitude out of range';
exception
  when check_violation then
    null;
end $$;

select 1 / case when (
  select count(*) from information_schema.columns
  where table_schema = 'public' and table_name = 'equipment'
    and column_name in ('make', 'model', 'serial', 'year')
) = 4 then 1 else 0 end;

select 1 / case when (select count(*) from public.variety_quotes) = 24 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where variety = '') = 9 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where variety = 'Cabernet Sauvignon') = 3 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where variety = 'Syrah') = 2 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where author = 'Jancis Robinson') = 3 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where source like '%Pocket Wine Book 2023%') = 12 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where author = 'Robert Louis Stevenson') = 2 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where author = 'Thomas Jefferson') = 1 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where author = 'Pliny the Elder') = 1 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where author = 'Kevin Zraly') = 5 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_quotes where author = 'Kevin Zraly' and variety <> '') = 0 then 1 else 0 end;

select 1 / case when (select count(*) from public.wine_facts) = 12 then 1 else 0 end;
select 1 / case when (select count(*) from public.wine_facts where source like '%bpg.bcwgc.org%') = 10 then 1 else 0 end;
select 1 / case when (select count(*) from public.wine_facts where source like '%390126.pdf%') = 1 then 1 else 0 end;
select 1 / case when (select count(*) from public.wine_facts where source like '%35488.pdf%') = 1 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_notes) = 20 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_notes where needs_research) = 3 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_notes where variety in ('Malvasia', 'Greco', 'Teroldego') and needs_research) = 3 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_notes where variety = 'Syrah 525' and vigor like '%not on the certified-clone list%') = 1 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_notes where variety = 'Syrah 471' and vigor like '%very few symptoms of decline%') = 1 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_notes where needs_research = false and harvest not like '%does not publish a target Brix%') = 0 then 1 else 0 end;

do $$
begin
  insert into public.equipment (vineyard_id, name, year)
  select id, 'Too old', 1800 from public.vineyards where name = 'DA Ranch';
  raise exception 'FAIL equipment year';
exception
  when check_violation then
    null;
end $$;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
set local role authenticated;
select 1 / case when (select count(*) from public.variety_quotes) = 24 then 1 else 0 end;
do $$
begin
  insert into public.variety_quotes (vineyard_id, variety, text, author, source)
  select id, 'Tannat', 'An employee quote that should not save.', 'Crew', 'Not a published source.'
  from public.vineyards where name = 'DA Ranch';
  raise exception 'FAIL employee inserted a quote';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  insert into public.wine_facts (vineyard_id, text, source)
  select id, 'An employee fact that should not save at all.', 'Not a published source.'
  from public.vineyards where name = 'DA Ranch';
  raise exception 'FAIL employee inserted a fact';
exception
  when insufficient_privilege then
    null;
end $$;
do $$
begin
  insert into public.variety_notes (vineyard_id, variety, vigor)
  select id, 'Employee grape', 'Should not save.'
  from public.vineyards where name = 'DA Ranch';
  raise exception 'FAIL employee inserted a note';
exception
  when insufficient_privilege then
    null;
end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
set local role authenticated;
insert into public.variety_quotes (vineyard_id, variety, text, author, source)
select id, 'Tannat', 'A manager line kept for the test.', 'Maria', 'Typed on the lists screen.'
from public.vineyards where name = 'DA Ranch';
select 1 / case when (select count(*) from public.variety_quotes where author = 'Maria') = 1 then 1 else 0 end;
insert into public.wine_facts (vineyard_id, text, source)
select id, 'A manager fact kept for the test.', 'Typed on the lists screen.'
from public.vineyards where name = 'DA Ranch';
insert into public.variety_notes (vineyard_id, variety, needs_research, harvest)
select id, 'Manager grape', true, 'Filled in later.'
from public.vineyards where name = 'DA Ranch';
select 1 / case when (select count(*) from public.wine_facts) = 13 then 1 else 0 end;
select 1 / case when (select count(*) from public.variety_notes where variety = 'Manager grape' and needs_research) = 1 then 1 else 0 end;
commit;

select 'RLS_OK';
