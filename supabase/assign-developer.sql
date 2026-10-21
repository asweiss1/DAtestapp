-- Run this once AFTER Aaron has created his account in the app.
-- Replace the email with the exact email he signed up with.
--
-- Developer can rename and delete tasks, fix lists, add people, and read
-- problem reports. Developer cannot read wages or labor cost.
-- After this, open the app as Aaron and approve a crew lead under
-- More → Manager requests. Until then that person stays an employee.
-- Do not assign the manager role from this file.

insert into public.memberships (vineyard_id, user_id, role)
select v.id, u.id, 'developer'
from public.vineyards v
join auth.users u on lower(u.email) = lower('aaron@example.com')
where v.name = 'DA Ranch'
on conflict (vineyard_id, user_id) do update
  set role = 'developer',
      active = true,
      client_updated_at = now();
