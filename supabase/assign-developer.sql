-- Run this once AFTER Aaron has created his account in the app.
-- Replace the email with the exact email he signed up with.
--
-- Developer can rename and delete tasks, fix lists, add people, and read
-- problem reports. Developer cannot read wages or labor cost.
-- Make a crew lead a manager (in the app, or with the second statement)
-- so someone can set wages and the end-of-day time.

insert into public.memberships (vineyard_id, user_id, role)
select v.id, u.id, 'developer'
from public.vineyards v
join auth.users u on lower(u.email) = lower('aaron@example.com')
where v.name = 'DA Ranch'
on conflict (vineyard_id, user_id) do update
  set role = 'developer',
      active = true,
      client_updated_at = now();

-- Optional: promote a crew lead who already has an account.
-- insert into public.memberships (vineyard_id, user_id, role)
-- select v.id, u.id, 'manager'
-- from public.vineyards v
-- join auth.users u on lower(u.email) = lower('crew-lead@example.com')
-- where v.name = 'DA Ranch'
-- on conflict (vineyard_id, user_id) do update
--   set role = 'manager', active = true, client_updated_at = now();
