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

do $seed$
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

  insert into public.variety_quotes (vineyard_id, variety, text, author, source)
  values
    (v_id, $q$$q$, $q$a bottle of good wine, like a good act, shines ever in the retrospect$q$, $q$Robert Louis Stevenson$q$, $q$The Silverado Squatters (1883), chapter "Napa Wine". Public domain, Project Gutenberg ebook 516.$q$),
    (v_id, $q$$q$, $q$the soil has sublimated under sun and stars to something finer, and the wine is bottled poetry$q$, $q$Robert Louis Stevenson$q$, $q$The Silverado Squatters (1883), chapter "Napa Wine". Public domain, Project Gutenberg ebook 516.$q$),
    (v_id, $q$$q$, $q$No nation is drunken where wine is cheap; and none sober, where the dearness of wine substitutes ardent spirits as the common beverage.$q$, $q$Thomas Jefferson$q$, $q$Letter to Jean Guillaume, baron Hyde de Neuville, 13 December 1818, Monticello. Encyclopedia Virginia (modernized spelling).$q$),
    (v_id, $q$$q$, $q$in wine there is truth$q$, $q$Pliny the Elder$q$, $q$Natural History, book 14, chapter 28. John Bostock and H. T. Riley translation, 1855. Pliny gives this as a common proverb.$q$),
    (v_id, $q$$q$, $q$Wine should be an enjoyable experience.$q$, $q$Kevin Zraly$q$, $q$Windows on the World Complete Wine Course, twentieth-anniversary edition, Sterling Publishing, 2005, page 2.$q$),
    (v_id, $q$$q$, $q$For the purpose of this book, wine is the fermented juice of grapes.$q$, $q$Kevin Zraly$q$, $q$Windows on the World Complete Wine Course, twentieth-anniversary edition, Sterling Publishing, 2005, page 2.$q$),
    (v_id, $q$$q$, $q$The major wine grapes come from the species Vitis vinifera.$q$, $q$Kevin Zraly$q$, $q$Windows on the World Complete Wine Course, twentieth-anniversary edition, Sterling Publishing, 2005, page 3.$q$),
    (v_id, $q$$q$, $q$The main thing is to understand the major grape varieties and where they are grown in the world.$q$, $q$Kevin Zraly$q$, $q$Windows on the World Complete Wine Course, twentieth-anniversary edition, Sterling Publishing, 2005, page 15.$q$),
    (v_id, $q$$q$, $q$Most French wine is meant to be consumed as a simple beverage.$q$, $q$Kevin Zraly$q$, $q$Windows on the World Complete Wine Course, twentieth-anniversary edition, Sterling Publishing, 2005, page 20.$q$),
    (v_id, $q$Cabernet Sauvignon$q$, $q$Characterful: slow-ripening, spicy, herby, tannic, with blackcurrant aroma.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Cabernet Sauvignon$q$, $q$Cabernet is much more positively flavoured than Chardonnay, and ripens much later, so tends to be planted in rather warmer areas.$q$, $q$Jancis Robinson$q$, $q$Jancis Robinson, "Cabernet Sauvignon", jancisrobinson.com/learn/grape-varieties/red/cabernet-sauvignon.$q$),
    (v_id, $q$Cabernet Sauvignon$q$, $q$Cabernet Sauvignon is also notable for being deep purple in youth and, while it is not especially alcoholic, it can be extremely long-lived.$q$, $q$Jancis Robinson$q$, $q$Jancis Robinson, "Cabernet Sauvignon", jancisrobinson.com/learn/grape-varieties/red/cabernet-sauvignon.$q$),
    (v_id, $q$Grenache$q$, $q$Important pale, potent grape for warm climates, fashionable with terroiristes because it expresses its site.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Petite Sirah$q$, $q$Nothing to do with SYRAH; gives rustic, tannic, dark wine.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Syrah$q$, $q$The great Rhône red grape: tannic, purple, peppery, matures superbly.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Syrah$q$, $q$The trademark flavour of French Syrah is black pepper.$q$, $q$Jancis Robinson$q$, $q$Jancis Robinson, "Syrah", jancisrobinson.com/learn/grape-varieties/red/syrah.$q$),
    (v_id, $q$Tannat$q$, $q$Raspberry-perfumed, highly tannic force behind Madiran, Tursan and other firm reds from SW France.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Tempranillo$q$, $q$elegant in cool climates, beefy in warm.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Tempranillo$q$, $q$Early ripening, long maturing.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Teroldego$q$, $q$Trentino's best indigenous variety; serious, full-flavoured, esp on the flat Campo Rotaliano.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Greco$q$, $q$Brisk, peachy flavour, most famous as Greco di Tufo.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Malvasia$q$, $q$Not a single variety but a whole stable, not necessarily related or even alike.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Seyval Blanc$q$, $q$French hybrid of French and American vines; v. hardy, attractively fruity.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$),
    (v_id, $q$Vermentino$q$, $q$Italian, sprightly, satisfying texture; ageing capacity.$q$, $q$Hugh Johnson$q$, $q$Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.$q$)
  on conflict (vineyard_id, variety, text) do nothing;
end $seed$;
