-- 002 — commute blocks
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run)
-- against a project that already has the tables. It is safe to run twice.
--
-- If you are setting the project up from scratch, you don't need this file —
-- supabase/schema.sql already has these columns.
--
-- A commute block is a timeline block that carries a route instead of a place.
-- Both ends are optional: an empty end means "work it out from the blocks
-- either side of me", which the client does without asking the database.

alter table public.timeline_blocks
  -- 'event' happens somewhere; 'commute' is the getting between two of them.
  add column if not exists kind        text not null default 'event',
  -- Where the trip starts and ends, exactly as pasted — a name, a Maps link,
  -- or `lat,lng`. Empty is the common case and is not a missing value.
  add column if not exists from_place  text not null default '',
  add column if not exists to_place    text not null default '',
  -- How you are getting there. Matches google.maps.TravelMode, lower case.
  add column if not exists travel_mode text not null default 'transit';

-- Added separately from the columns: `add column ... check` would be skipped
-- along with the column on a second run, leaving the constraint off.
alter table public.timeline_blocks
  drop constraint if exists timeline_blocks_kind;

alter table public.timeline_blocks
  add constraint timeline_blocks_kind check (kind in ('event', 'commute'));

alter table public.timeline_blocks
  drop constraint if exists timeline_blocks_travel_mode;

alter table public.timeline_blocks
  add constraint timeline_blocks_travel_mode
  check (travel_mode in ('transit', 'walking', 'driving', 'bicycling'));
