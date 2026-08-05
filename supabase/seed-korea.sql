-- Seed — ten days in Korea, 22–31 August 2026
--
-- Paste into the Supabase SQL editor (Dashboard → SQL → New query → Run). It
-- fills a board with events, the commutes between them and the trivia blocks
-- in between — the meals, the naps and the afternoons left clear.
--
-- Three things worth knowing before you run it:
--
-- 1. **Which board.** Every statement picks the same one: the oldest in the
--    project. If you have more than one, replace each of the six lines that
--    read `order by created_at limit 1` with `where id = '…uuid…'`.
--
-- 2. **It adds, it doesn't replace.** Running it twice gives you two of
--    everything. The two deletes at the top are commented out — uncomment them
--    to clear the board first, and note that they take *everything* on it.
--
-- 3. **Locations are left unresolved on purpose.** Only `place` is set, the
--    text you would have pasted yourself. The first time the board is opened
--    each one is geocoded and the answer saved, so the coordinates come from
--    Google rather than from this file guessing at them.
--
-- Requires the trivia migration (003) — without it every trivia row fails the
-- `kind` check and the whole transaction rolls back.

begin;

-- delete from public.timeline_blocks
--  where board_id = (select id from public.boards order by created_at limit 1);
-- delete from public.canvas_blocks
--  where board_id = (select id from public.boards order by created_at limit 1);

update public.boards
   set title = 'Korea — 22–31 August 2026',
       start_date = '2026-08-22',
       days = 10,
       updated_at = now()
 where id = (select id from public.boards order by created_at limit 1);

-- --------------------------------------------------------------- events ----
-- Day 0 is 22 August. Minutes run from midnight, so 840 is 14:00.

insert into public.timeline_blocks
  (board_id, kind, day_index, start_min, end_min, title, place, color)
select b.id, 'event', v.*
  from (select id from public.boards order by created_at limit 1) b,
  (values
    -- day 0 — arriving
    (0,  840,  930, 'Land at Incheon',              'Incheon International Airport Terminal 1', 'blue'),
    (0, 1005, 1050, 'Check in — Myeongdong',        'Myeongdong, Jung-gu, Seoul',               'teal'),
    (0, 1140, 1230, 'Dinner — Myeongdong stalls',   'Myeongdong Night Market, Seoul',           'red'),
    -- day 1 — the palaces
    (1,  585,  720, 'Gyeongbokgung Palace',         'Gyeongbokgung Palace, Seoul',              'green'),
    (1,  740,  810, 'Bukchon Hanok Village',        'Bukchon Hanok Village, Seoul',             'green'),
    (1,  920, 1050, 'Insadong',                     'Insadong, Jongno-gu, Seoul',               'violet'),
    (1, 1075, 1170, 'Gwangjang Market',             'Gwangjang Market, Seoul',                  'red'),
    -- day 2 — west of the centre
    (2,  630,  750, 'Hongdae',                      'Hongdae, Mapo-gu, Seoul',                  'blue'),
    (2,  890,  990, 'Gyeongui Line Forest Park',    'Gyeongui Line Forest Park, Seoul',         'green'),
    (2, 1025, 1140, 'Yeouido Hangang Park',         'Yeouido Hangang Park, Seoul',              'teal'),
    -- day 3 — south of the river
    (3,  620,  720, 'Bongeunsa Temple',             'Bongeunsa Temple, Seoul',                  'green'),
    (3,  735,  840, 'Starfield COEX Mall',          'Starfield COEX Mall, Seoul',               'violet'),
    (3,  960, 1080, 'Seoul Sky — Lotte World Tower','Lotte World Tower, Seoul',                 'blue'),
    -- day 4 — out to Gapyeong
    (4,  580,  780, 'Nami Island',                  'Nami Island, Chuncheon',                   'green'),
    (4,  900, 1020, 'The Garden of Morning Calm',   'The Garden of Morning Calm, Gapyeong',     'pink'),
    -- day 5 — down to Busan
    (5,  530,  560, 'Seoul Station — KTX out',      'Seoul Station, Seoul',                     'slate'),
    (5,  720,  765, 'Busan Station — check in',     'Busan Station, Busan',                     'slate'),
    (5,  885, 1050, 'Haeundae Beach',               'Haeundae Beach, Busan',                    'teal'),
    (5, 1050, 1140, 'Blueline Park beach train',    'Haeundae Blueline Park, Busan',            'blue'),
    -- day 6 — the west of Busan
    (6,  615,  750, 'Gamcheon Culture Village',     'Gamcheon Culture Village, Busan',          'pink'),
    (6,  900,  990, 'Jagalchi Fish Market',         'Jagalchi Market, Busan',                   'red'),
    (6, 1005, 1080, 'BIFF Square',                  'BIFF Square, Busan',                       'violet'),
    (6, 1120, 1260, 'Gwangalli Beach',              'Gwangalli Beach, Busan',                   'teal'),
    -- day 7 — Gyeongju for the day
    (7,  600,  720, 'Bulguksa Temple',              'Bulguksa Temple, Gyeongju',                'green'),
    (7,  880,  990, 'Daereungwon Tomb Complex',     'Daereungwon Tomb Complex, Gyeongju',       'violet'),
    (7, 1005, 1110, 'Donggung Palace and Wolji Pond','Donggung Palace and Wolji Pond, Gyeongju','blue'),
    -- day 8 — back north
    (8,  585,  675, 'Huinnyeoul Culture Village',   'Huinnyeoul Culture Village, Busan',        'teal'),
    (8,  785,  815, 'Busan Station — KTX back',     'Busan Station, Busan',                     'slate'),
    (8,  975, 1020, 'Back in Seoul — drop bags',    'Seoul Station, Seoul',                     'slate'),
    (8, 1055, 1170, 'N Seoul Tower',                'N Seoul Tower, Seoul',                     'blue'),
    -- day 9 — home
    (9,  630,  750, 'Last of Myeongdong',           'Myeongdong Shopping Street, Seoul',        'violet'),
    (9,  900,  940, 'Seoul Station — AREX',         'Seoul Station, Seoul',                     'slate'),
    (9, 1000, 1170, 'Incheon — check in, duty free','Incheon International Airport Terminal 1', 'blue')
  ) as v(day_index, start_min, end_min, title, place, color);

-- ------------------------------------------------------------- commutes ----
-- Both ends left empty on purpose. A commute reads the located blocks either
-- side of it, so these already know what they join — and keep knowing after
-- you drag something. Set `from_place` / `to_place` in the pane only where you
-- want to overrule that.
--
-- Note that Google routes nothing but transit inside Korea: on `walking` and
-- `driving` the pane falls back to an estimate from the distance.

insert into public.timeline_blocks
  (board_id, kind, day_index, start_min, end_min, travel_mode, color)
select b.id, 'commute', v.*
  from (select id from public.boards order by created_at limit 1) b,
  (values
    (0,  930, 1005, 'transit',  'slate'),   -- AREX into town
    (1,  555,  585, 'transit',  'slate'),
    (1,  720,  740, 'walking',  'slate'),
    (1,  900,  920, 'walking',  'slate'),
    (1, 1050, 1075, 'transit',  'slate'),
    (2,  870,  890, 'walking',  'slate'),
    (2,  990, 1025, 'transit',  'slate'),
    (3,  585,  620, 'transit',  'slate'),
    (3,  720,  735, 'walking',  'slate'),
    (3,  930,  960, 'transit',  'slate'),
    (4,  480,  580, 'transit',  'slate'),   -- ITX-Cheongchun to Gapyeong
    (4,  870,  900, 'driving',  'slate'),   -- the city tour bus
    (4, 1020, 1125, 'transit',  'slate'),
    (5,  495,  530, 'transit',  'slate'),
    (5,  560,  720, 'transit',  'slate'),   -- KTX, 2h40
    (5,  840,  885, 'transit',  'slate'),
    (6,  580,  615, 'transit',  'slate'),
    (6,  870,  900, 'transit',  'slate'),
    (6,  990, 1005, 'walking',  'slate'),
    (6, 1080, 1120, 'transit',  'slate'),
    (7,  530,  600, 'transit',  'slate'),
    (7,  720,  760, 'driving',  'slate'),
    (7,  990, 1005, 'walking',  'slate'),
    (7, 1110, 1185, 'transit',  'slate'),
    (8,  555,  585, 'transit',  'slate'),
    (8,  750,  785, 'transit',  'slate'),
    (8,  815,  975, 'transit',  'slate'),   -- KTX back
    (8, 1020, 1055, 'transit',  'slate'),
    (9,  870,  900, 'transit',  'slate'),
    (9,  940, 1000, 'transit',  'slate')    -- AREX to the airport
  ) as v(day_index, start_min, end_min, travel_mode, color);

-- --------------------------------------------------------------- trivia ----
-- Time that is spoken for without being anywhere. No location, and never
-- picked as the end of a commute.

insert into public.timeline_blocks
  (board_id, kind, day_index, start_min, end_min, title, color)
select b.id, 'trivia', v.*
  from (select id from public.boards order by created_at limit 1) b,
  (values
    (0, 1050, 1140, 'Unpack, shower, nothing',        'amber'),
    (0, 1230, 1320, 'Convenience store run',          'amber'),
    (1,  510,  555, 'Breakfast',                      'amber'),
    (1,  810,  900, 'Long lunch in Samcheong-dong',   'amber'),
    (1, 1170, 1260, 'Nothing planned',                'amber'),
    (2,  540,  630, 'Slow start',                     'amber'),
    (2,  750,  870, 'Lunch in Yeonnam-dong',          'amber'),
    (2, 1140, 1260, 'Chicken and beer by the river',  'amber'),
    (3,  540,  585, 'Breakfast',                      'amber'),
    (3,  840,  930, 'Lunch, then sit down',           'amber'),
    (3, 1080, 1200, 'Dinner in Songpa',               'amber'),
    (4,  450,  480, 'Coffee, out the door',           'amber'),
    (4,  780,  870, 'Lunch on the island',            'amber'),
    (4, 1125, 1260, 'Back in Seoul — dinner nearby',  'amber'),
    (5,  450,  495, 'Pack for Busan',                 'amber'),
    (5,  765,  840, 'Lunch in Choryang',              'amber'),
    (5, 1140, 1260, 'Dinner at Haeundae Market',      'amber'),
    (6,  540,  580, 'Breakfast',                      'amber'),
    (6,  750,  870, 'Lunch with a view',              'amber'),
    (7,  495,  530, 'Breakfast',                      'amber'),
    (7,  760,  880, 'Lunch on Hwangnidan-gil',        'amber'),
    (7, 1185, 1290, 'Dinner back in Busan',           'amber'),
    (8,  510,  555, 'Check out',                      'amber'),
    (8,  675,  750, 'Lunch in Nampo-dong',            'amber'),
    (8, 1170, 1290, 'Dinner in Itaewon',              'amber'),
    (9,  540,  630, 'Pack',                           'amber'),
    (9,  750,  870, 'Long lunch, nothing after it',   'amber')
  ) as v(day_index, start_min, end_min, title, color);

-- ---------------------------------------------------------- loose cards ----
-- The things you look up once and want next to the day. `y` is the day times
-- 1512 (a day band plus its gap) plus the minute, which is what puts a card
-- level with the block it belongs to.

insert into public.canvas_blocks
  (board_id, kind, title, body, url, x, y, width, height, color)
select b.id, 'data', v.*
  from (select id from public.boards order by created_at limit 1) b,
  (values
    ('T-money card',
     'Any CU or GS25. ₩4,000 for the card, top up in cash. Works on every bus and subway, Seoul and Busan both.',
     '', 500, 0 * 1512 + 800, 240, 132, 'blue'),
    ('Gyeongbokgung',
     '₩3,000, closed Tuesdays. Changing of the guard at 10:00 and 14:00. Free entry if you turn up in hanbok.',
     'https://www.google.com/maps/search/?api=1&query=Gyeongbokgung+Palace',
     500, 1 * 1512 + 585, 240, 132, 'green'),
    ('Seoul Sky',
     'Timed tickets — the sunset slots go first. Observatory is floors 117 to 123.',
     '', 500, 3 * 1512 + 960, 240, 120, 'blue'),
    ('Getting to Gapyeong',
     'ITX-Cheongchun from Yongsan, about 70 minutes. The Gapyeong city tour bus loops Nami and the Garden of Morning Calm all day.',
     '', 500, 4 * 1512 + 580, 240, 144, 'green'),
    ('KTX to Busan',
     'Book on Korail. 2h40 on the fast trains, around ₩60,000 one way. Reserve the day before — late August is busy.',
     '', 500, 5 * 1512 + 720, 240, 132, 'slate'),
    ('Gamcheon',
     'Stamp map ₩2,000 at the info centre by the bus stop. It is all stairs — wear the right shoes.',
     '', 500, 6 * 1512 + 615, 240, 132, 'pink')
  ) as v(title, body, url, x, y, width, height, color);

-- --------------------------------------------------------------- links ----
-- Joined by title rather than by id, since the ids were only just generated.

insert into public.block_links (board_id, source_kind, source_id, target_kind, target_id)
select t.board_id, 'timeline', t.id, 'canvas', c.id
  from public.timeline_blocks t
  join public.canvas_blocks c on c.board_id = t.board_id
 where t.board_id = (select id from public.boards order by created_at limit 1)
   and (t.title, c.title) in (
     ('Land at Incheon',               'T-money card'),
     ('Gyeongbokgung Palace',          'Gyeongbokgung'),
     ('Seoul Sky — Lotte World Tower', 'Seoul Sky'),
     ('Nami Island',                   'Getting to Gapyeong'),
     ('Busan Station — check in',      'KTX to Busan'),
     ('Gamcheon Culture Village',      'Gamcheon')
   );

commit;
