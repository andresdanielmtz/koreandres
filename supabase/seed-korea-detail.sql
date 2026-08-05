-- Seed — the detail, plus a 19:00 arrival and a house in Gangbuk-gu
--
-- Run this *after* seed-korea.sql, in the Supabase SQL editor. It does three
-- things:
--
-- 1. Rebuilds day 0 around landing at 19:00 and going straight home, which
--    takes the Myeongdong check-in and evening with it. **Every block on day 0
--    is deleted and re-inserted** — anything you added there yourself goes too.
-- 2. Points the trips that start or end at home at the house, so the commutes
--    route to the right end of the city instead of guessing from the rail.
-- 3. Adds seventeen data cards — the things you look up once — each linked to
--    the block it belongs to.
--
-- Same rule as before: it picks the oldest board in the project. Replace the
-- `order by created_at limit 1` lines if that isn't the one you want. Running
-- it twice duplicates the cards; the day 0 rebuild is safe to repeat.

begin;

-- ---------------------------------------------------------------- day 0 ----
-- Landing at 19:00 means immigration and bags until about 20:45, the last
-- AREX into town, and home some time after 22:00. Nothing else fits.

delete from public.timeline_blocks
 where board_id = (select id from public.boards order by created_at limit 1)
   and day_index = 0;

insert into public.timeline_blocks
  (board_id, kind, day_index, start_min, end_min, title, place, color)
select b.id, 'event', v.*
  from (select id from public.boards order by created_at limit 1) b,
  (values
    (0, 1140, 1245, 'Land at Incheon',      'Incheon International Airport Terminal 1',  'blue'),
    (0, 1350, 1395, 'Home — Hancheon-ro',   'Hancheon-ro 139ga-gil, Gangbuk-gu, Seoul',  'teal')
  ) as v(day_index, start_min, end_min, title, place, color);

insert into public.timeline_blocks
  (board_id, kind, day_index, start_min, end_min, travel_mode, color)
select b.id, 'commute', 0, 1245, 1350, 'transit', 'slate'
  from (select id from public.boards order by created_at limit 1) b;

insert into public.timeline_blocks
  (board_id, kind, day_index, start_min, end_min, title, color)
select b.id, 'trivia', 0, 1395, 1440, 'Convenience store run, then sleep', 'amber'
  from (select id from public.boards order by created_at limit 1) b;

-- ------------------------------------------------------------ home base ----
-- A commute works out its own ends from the located blocks either side of it,
-- and the first trip of the day has nothing before it to read. These say so
-- outright. The rest of the board still infers.

update public.timeline_blocks
   set from_place = 'Hancheon-ro 139ga-gil, Gangbuk-gu, Seoul'
 where board_id = (select id from public.boards order by created_at limit 1)
   and kind = 'commute'
   and (day_index, start_min) in ((1, 555), (3, 585), (4, 480), (5, 495));

update public.timeline_blocks
   set to_place = 'Hancheon-ro 139ga-gil, Gangbuk-gu, Seoul'
 where board_id = (select id from public.boards order by created_at limit 1)
   and kind = 'commute'
   and (day_index, start_min) in ((4, 1020));

-- Day 2 and day 9 leave the house with no commute block at all — the morning
-- was a slow start and a suitcase. Room is made for one first.

update public.timeline_blocks
   set end_min = 590
 where board_id = (select id from public.boards order by created_at limit 1)
   and kind = 'trivia' and day_index = 2 and start_min = 540;

update public.timeline_blocks
   set end_min = 600
 where board_id = (select id from public.boards order by created_at limit 1)
   and kind = 'trivia' and day_index = 9 and start_min = 540;

insert into public.timeline_blocks
  (board_id, kind, day_index, start_min, end_min, travel_mode, from_place, color)
select b.id, 'commute', v.*
  from (select id from public.boards order by created_at limit 1) b,
  (values
    (2, 590, 630, 'transit', 'Hancheon-ro 139ga-gil, Gangbuk-gu, Seoul', 'slate'),
    (9, 600, 630, 'transit', 'Hancheon-ro 139ga-gil, Gangbuk-gu, Seoul', 'slate'),
    -- and the way back from Itaewon on the last night in Seoul
    (8, 1290, 1360, 'transit', 'Itaewon, Yongsan-gu, Seoul', 'slate')
  ) as v(day_index, start_min, end_min, travel_mode, from_place, color);

update public.timeline_blocks
   set to_place = 'Hancheon-ro 139ga-gil, Gangbuk-gu, Seoul'
 where board_id = (select id from public.boards order by created_at limit 1)
   and kind = 'commute' and day_index = 8 and start_min = 1290;

-- ----------------------------------------------------------- data cards ----
-- A second column at x = 800, level with the block each one is about. The
-- cards from the first file are at x = 500, so nothing lands on top.

insert into public.canvas_blocks
  (board_id, kind, title, body, url, x, y, width, height, color)
select b.id, 'data', v.*
  from (select id from public.boards order by created_at limit 1) b,
  (values
    ('K-ETA and Q-CODE',
     'Both are filled in online before you fly, not on arrival. Print or screenshot them — the queue is not where you want to be looking for a confirmation email.',
     '', 800, 0 * 1512 + 1140, 260, 150, 'blue'),
    ('SIM or eSIM',
     'KT and SKT desks in the arrivals hall run past midnight. Ten days of data is around ₩27,000. An eSIM bought before you fly skips the desk entirely.',
     '', 1080, 0 * 1512 + 1140, 260, 150, 'blue'),
    ('Airport to Gangbuk-gu',
     'AREX to Seoul Station, then north on line 1 or 4. The last express leaves T1 around 22:20 and the all-stop train runs later. Past that it is a taxi: an hour, ₩70–90,000, and a 20% night surcharge after midnight.',
     '', 800, 0 * 1512 + 1300, 260, 170, 'slate'),
    ('The house',
     'Hancheon-ro 139ga-gil, Gangbuk-gu — north of the centre, so reckon on 30–50 minutes to anything else on this board. The green buses run later than the trains do.',
     '', 1080, 0 * 1512 + 1300, 260, 158, 'teal'),
    ('Bukchon is residential',
     'People live in these lanes. Visiting hours are 10:00–17:00, Sundays quiet, and stewards do enforce it. Photos yes, voices down.',
     '', 800, 1 * 1512 + 740, 260, 144, 'green'),
    ('Insadong',
     'Ssamziegil is the spiral of shops in the middle. The tea houses up the side alleys are the reason to come; the main street is souvenirs.',
     '', 800, 1 * 1512 + 920, 260, 144, 'violet'),
    ('Gwangjang Market',
     'Bindaetteok, mayak gimbap, raw beef. Cash moves faster than a card, the food alley thins out by 21:00, and the stalls with queues are the ones to join.',
     '', 800, 1 * 1512 + 1080, 260, 150, 'red'),
    ('Hongdae',
     'Shops open late morning and stay open late. The buskers on the playground strip start properly after 18:00.',
     '', 800, 2 * 1512 + 630, 260, 132, 'blue'),
    ('Chicken by the river',
     'Delivery to the park is the tradition — the apps ask which zone of the lawn you are sitting on, and the signs on the lamp posts tell you. Mats from any convenience store.',
     '', 800, 2 * 1512 + 1025, 260, 158, 'teal'),
    ('COEX',
     'The Starfield Library atrium is free and is the bit people come for. Aquarium, cinema and the SM shop are all in the same basement.',
     '', 800, 3 * 1512 + 735, 260, 144, 'violet'),
    ('Nami and the Garden',
     'Ferry to Nami is about ₩16,000 return. The Gapyeong tour bus is a day ticket and loops the ferry pier, the Garden of Morning Calm and the station — worth it over taxis.',
     '', 800, 4 * 1512 + 760, 260, 158, 'green'),
    ('Haeundae',
     'Blueline Park is timed-entry: the beach train is easy, the sky capsules sell out days ahead. Book the run that lands at sunset.',
     '', 800, 5 * 1512 + 885, 260, 144, 'teal'),
    ('Jagalchi',
     'Pick downstairs, they cook it upstairs for a per-plate fee. Closed the first and third Tuesday of the month.',
     '', 800, 6 * 1512 + 900, 260, 132, 'red'),
    ('Busan to Gyeongju',
     'KTX to Singyeongju is about 30 minutes, then bus 700 to Bulguksa. Buses 10 and 11 loop the tomb park, Cheomseongdae and Wolji all afternoon.',
     '', 800, 7 * 1512 + 530, 260, 150, 'slate'),
    ('Wolji after dark',
     'Stay until the lights come on — the reflection in the pond is the whole photograph. Open until 22:00, and the last hour is the quietest.',
     '', 800, 7 * 1512 + 1005, 260, 144, 'blue'),
    ('Namsan',
     'Cable car from behind Myeongdong, or bus 01 up the hill. The terrace and the locks are free; only the observatory deck is ticketed.',
     '', 800, 8 * 1512 + 1055, 260, 144, 'blue'),
    ('Leaving',
     'Tax-refund kiosks are landside in T1, before immigration. Three hours at the airport in August is not over-cautious — it is the queue for those kiosks.',
     '', 800, 9 * 1512 + 1000, 260, 150, 'blue')
  ) as v(title, body, url, x, y, width, height, color);

-- ---------------------------------------------------------------- links ----
-- By title, since the ids were only just made. Commutes have no title, so
-- those two are matched on where they sit instead.

insert into public.block_links (board_id, source_kind, source_id, target_kind, target_id)
select t.board_id, 'timeline', t.id, 'canvas', c.id
  from public.timeline_blocks t
  join public.canvas_blocks c on c.board_id = t.board_id
 where t.board_id = (select id from public.boards order by created_at limit 1)
   and (t.title, c.title) in (
     ('Land at Incheon',                'K-ETA and Q-CODE'),
     ('Land at Incheon',                'SIM or eSIM'),
     ('Home — Hancheon-ro',             'The house'),
     ('Bukchon Hanok Village',          'Bukchon is residential'),
     ('Insadong',                       'Insadong'),
     ('Gwangjang Market',               'Gwangjang Market'),
     ('Hongdae',                        'Hongdae'),
     ('Yeouido Hangang Park',           'Chicken by the river'),
     ('Starfield COEX Mall',            'COEX'),
     ('The Garden of Morning Calm',     'Nami and the Garden'),
     ('Haeundae Beach',                 'Haeundae'),
     ('Jagalchi Fish Market',           'Jagalchi'),
     ('Bulguksa Temple',                'Busan to Gyeongju'),
     ('Donggung Palace and Wolji Pond', 'Wolji after dark'),
     ('N Seoul Tower',                  'Namsan'),
     ('Incheon — check in, duty free',  'Leaving')
   );

insert into public.block_links (board_id, source_kind, source_id, target_kind, target_id)
select t.board_id, 'timeline', t.id, 'canvas', c.id
  from public.timeline_blocks t
  join public.canvas_blocks c on c.board_id = t.board_id
 where t.board_id = (select id from public.boards order by created_at limit 1)
   and t.kind = 'commute'
   and (t.day_index, t.start_min, c.title) in (
     (0, 1245, 'Airport to Gangbuk-gu')
   );

commit;
