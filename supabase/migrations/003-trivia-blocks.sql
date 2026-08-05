-- 003 — trivia blocks
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run)
-- against a project that already has the tables. It is safe to run twice.
--
-- If you are setting the project up from scratch, you don't need this file —
-- supabase/schema.sql already allows the new kind.
--
-- 'trivia' is a timeline block that holds time without being anywhere: lunch,
-- a nap, an afternoon left clear. It uses none of the location or route
-- columns, so there is nothing to add — only the check to widen.
--
-- Until you run this, saving a trivia block fails with a check violation and
-- the toolbar says `Save failed`.

alter table public.timeline_blocks
  drop constraint if exists timeline_blocks_kind;

alter table public.timeline_blocks
  add constraint timeline_blocks_kind check (kind in ('event', 'commute', 'trivia'));
