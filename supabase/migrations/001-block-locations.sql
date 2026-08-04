-- 001 — locations on timeline blocks
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run)
-- against a project that already has the tables. It is safe to run twice.
--
-- If you are setting the project up from scratch, you don't need this file —
-- supabase/schema.sql already has these columns.

alter table public.timeline_blocks
  -- Exactly what was pasted: a Google Maps link, coordinates, or a name.
  add column if not exists place       text not null default '',
  -- What that resolved to. Saved so reopening a board flies straight to the
  -- place instead of asking Google to look it up again.
  add column if not exists place_label text not null default '',
  add column if not exists place_lat   double precision,
  add column if not exists place_lng   double precision,
  -- How close to stand, taken from the geocoded viewport.
  add column if not exists place_zoom  double precision,
  -- A link to go with the block: booking, opening hours, whatever.
  add column if not exists url         text not null default '';

-- Coordinates are stored as a pair or not at all.
alter table public.timeline_blocks
  drop constraint if exists timeline_blocks_place_point;

alter table public.timeline_blocks
  add constraint timeline_blocks_place_point check (
    (place_lat is null) = (place_lng is null)
    and (place_lat is null or place_lat between -90 and 90)
    and (place_lng is null or place_lng between -180 and 180)
  );
