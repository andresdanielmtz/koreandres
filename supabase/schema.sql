-- Smart Itinerary — schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
-- Multi-board by design: every row hangs off `boards.id`, so adding more
-- whiteboards is just another row in `boards`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- boards ----

create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null default 'Untitled itinerary',
  start_date  date        not null default current_date,
  days        integer     not null default 7 check (days between 1 and 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------- timeline blocks ----
-- Blocks that live on the day rail. Positioned by (day_index, start_min).

create table if not exists public.timeline_blocks (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid        not null references public.boards (id) on delete cascade,
  title      text        not null default '',
  notes      text        not null default '',
  day_index  integer     not null default 0,
  start_min  integer     not null default 540  check (start_min >= 0 and start_min < 1440),
  end_min    integer     not null default 600  check (end_min   > 0 and end_min  <= 1440),
  color      text        not null default 'blue',
  created_at timestamptz not null default now(),
  constraint timeline_blocks_span check (end_min > start_min)
);

create index if not exists timeline_blocks_board_idx on public.timeline_blocks (board_id);

-- --------------------------------------------------------- canvas blocks ----
-- Free-floating data / travel cards. Positioned by (x, y) in board space.

create table if not exists public.canvas_blocks (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid        not null references public.boards (id) on delete cascade,
  kind       text        not null default 'data' check (kind in ('data', 'travel')),
  title      text        not null default '',
  body       text        not null default '',
  url        text        not null default '',
  x          double precision not null default 0,
  y          double precision not null default 0,
  width      double precision not null default 240,
  height     double precision not null default 132,
  color      text        not null default 'green',
  created_at timestamptz not null default now()
);

create index if not exists canvas_blocks_board_idx on public.canvas_blocks (board_id);

-- ----------------------------------------------------------------- links ----
-- Polymorphic edges: timeline→canvas, canvas→canvas, canvas→timeline, …

create table if not exists public.block_links (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid        not null references public.boards (id) on delete cascade,
  source_kind text        not null check (source_kind in ('timeline', 'canvas')),
  source_id   uuid        not null,
  target_kind text        not null check (target_kind in ('timeline', 'canvas')),
  target_id   uuid        not null,
  created_at  timestamptz not null default now(),
  unique (source_kind, source_id, target_kind, target_id)
);

create index if not exists block_links_board_idx on public.block_links (board_id);

-- The edge endpoints are polymorphic, so they can't carry a foreign key.
-- This trigger keeps them from outliving the blocks they point at.
create or replace function public.prune_block_links() returns trigger
language plpgsql security definer as $$
begin
  delete from public.block_links
   where source_id = old.id or target_id = old.id;
  return old;
end;
$$;

drop trigger if exists prune_links on public.timeline_blocks;
create trigger prune_links after delete on public.timeline_blocks
  for each row execute function public.prune_block_links();

drop trigger if exists prune_links on public.canvas_blocks;
create trigger prune_links after delete on public.canvas_blocks
  for each row execute function public.prune_block_links();

-- ------------------------------------------------------------------ RLS ----
-- The app ships with the *publishable* (anon) key, so these policies are open.
-- Anyone holding the key can read and write every board. That is fine for a
-- private planning tool; add auth + `owner_id = auth.uid()` predicates before
-- this is exposed to real users.

alter table public.boards          enable row level security;
alter table public.timeline_blocks enable row level security;
alter table public.canvas_blocks   enable row level security;
alter table public.block_links     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['boards', 'timeline_blocks', 'canvas_blocks', 'block_links'] loop
    execute format('drop policy if exists anon_all on public.%I', t);
    execute format(
      'create policy anon_all on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
