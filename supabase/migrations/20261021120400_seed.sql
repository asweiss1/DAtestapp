-- DA Ranch Vineyard App
-- 5 of 5. First vineyard, the 10 tasks, blocks, chemicals, and Non-field work.
-- Does not create a login. After Aaron signs up, run supabase/assign-developer.sql.

insert into public.vineyards (name, timezone, eod_time, edit_window_days, latitude, longitude, weather_url)
values (
  'DA Ranch', 'America/Phoenix', '14:25:00', 3,
  34.7183, -111.9086, 'https://www.wunderground.com/weather/us/az/cornville'
)
on conflict (name) do update
  set latitude = coalesce(public.vineyards.latitude, excluded.latitude),
      longitude = coalesce(public.vineyards.longitude, excluded.longitude),
      weather_url = coalesce(public.vineyards.weather_url, excluded.weather_url);

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.vineyards where name = 'DA Ranch';
  perform private.seed_vineyard_defaults(v_id);

  insert into public.blocks (vineyard_id, name, variety, row_count, sort_order)
  values
    (v_id, 'DA Tannat', 'Tannat', 40, 1),
    (v_id, 'DA Cabernet', 'Cabernet', 40, 2),
    (v_id, 'DA Tempranillo', 'Tempranillo', 40, 3),
    (v_id, 'DA Malvasia', 'Malvasia', 40, 4),
    (v_id, 'DA Grecco De Tuffo', 'Grecco De Tuffo', 40, 5),
    (v_id, 'DA Syrah', 'Syrah', 40, 6),
    (v_id, 'DA Vermentino', 'Vermentino', 40, 7),
    (v_id, 'DA Counois', 'Counois', 40, 8),
    (v_id, 'DA Seyval Blanc', 'Seyval Blanc', 40, 9),
    (v_id, 'HM Petit Sirah', 'Petit Sirah', 40, 10),
    (v_id, 'HM Toraldego', 'Toraldego', 40, 11),
    (v_id, 'HM Syrah 525', 'Syrah 525', 40, 12),
    (v_id, 'HM Syrah 471', 'Syrah 471', 40, 13),
    (v_id, 'HM Grenach', 'Grenach', 40, 14)
  on conflict (vineyard_id, name) do nothing;

  insert into public.service_types (vineyard_id, name, sort_order)
  values
    (v_id, 'Greasing', 1),
    (v_id, 'Oil change', 2),
    (v_id, 'Oil filter', 3),
    (v_id, 'Air filter', 4),
    (v_id, 'Fuel filter', 5),
    (v_id, 'Coolant', 6),
    (v_id, 'Hydraulic fluid', 7),
    (v_id, 'Tire check', 8),
    (v_id, 'Belt / chain', 9),
    (v_id, 'Inspection', 10)
  on conflict (vineyard_id, name) do nothing;
end $$;
