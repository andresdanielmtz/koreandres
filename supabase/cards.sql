-- Koreandres — Card Mode
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- It is safe to run twice.
--
-- Deliberately separate from schema.sql: card mode is optional, the board works
-- without these four tables, and a project that will never open it has no
-- reason to carry them.
--
-- If you skip this file, card mode still works — it falls back to localStorage,
-- the console says so, and the decks simply don't follow you to another
-- browser. Nothing fails loudly, which is exactly why it is worth saying here.
--
-- Everything hangs off `device_id`. There is no auth, so that id — generated in
-- the browser and kept in localStorage under `itinerary.cards.device` — is what
-- a row belongs to. It scopes; it does not secure. See the RLS note at the end.

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------- decks ----
-- One row per device: where the decks are drawn around.

create table if not exists public.card_decks (
  device_id  uuid primary key,
  label      text        not null default '',
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- places ----
-- What the Places searches came back with, so refilling a deck costs nothing.
--
-- Keyed on the place id rather than on the coordinates, which are floats and
-- would miss between two geolocation fixes eight metres apart. `fetched_at` is
-- when the search that found it ran; nothing here expires it, the client
-- compares it against CARD_CACHE_TTL_MS on read. A stale row is still dealt —
-- it is refreshed on the next fill, not hidden.

create table if not exists public.card_places (
  device_id  uuid        not null references public.card_decks (device_id) on delete cascade,
  place_id   text        not null,
  category   text        not null
    check (category in ('restaurant', 'attraction', 'trivia')),
  name       text        not null default '',
  -- What prints under the name: the formatted address Places gave back.
  where_text text        not null default '',
  lat        double precision not null,
  lng        double precision not null,
  rating     double precision,
  url        text        not null default '',
  fetched_at timestamptz not null default now(),
  primary key (device_id, place_id)
);

create index if not exists card_places_device_idx
  on public.card_places (device_id, category);

-- ---------------------------------------------------------------- states ----
-- Where a card is, and how many times it has been dealt.
--
-- Only two states, because a discard is not a move: the card was never taken
-- out of the deck, so putting it back is the absence of an edit. Keeping is the
-- one thing that removes a card. `draws` is what stops a discarded card being
-- handed straight back — the client deals the least-drawn card first.

create table if not exists public.card_states (
  device_id  uuid        not null references public.card_decks (device_id) on delete cascade,
  place_id   text        not null,
  state      text        not null default 'deck' check (state in ('deck', 'kept')),
  draws      integer     not null default 0 check (draws >= 0),
  updated_at timestamptz not null default now(),
  primary key (device_id, place_id)
);

-- ----------------------------------------------------------------- draws ----
-- Every card dealt and what happened to it, append-only.
--
-- Not derivable from card_states: a discard leaves the state alone, so without
-- this there is no record that the card was ever seen.

create table if not exists public.card_draws (
  id        uuid primary key default gen_random_uuid(),
  device_id uuid        not null references public.card_decks (device_id) on delete cascade,
  place_id  text        not null,
  outcome   text        not null check (outcome in ('kept', 'discarded')),
  drawn_at  timestamptz not null default now()
);

create index if not exists card_draws_device_idx
  on public.card_draws (device_id, drawn_at desc);

-- Unlike block_links in schema.sql, none of these ends are polymorphic, so real
-- foreign keys do the cleanup and no trigger is needed here.

-- ------------------------------------------------------------------ RLS ----
-- The app ships with the *publishable* (anon) key, so these policies are open,
-- exactly as the board's are. Anyone holding the key can read and write every
-- device's cards.
--
-- The device id is how a row finds its way back to the browser that wrote it.
-- It is not a security boundary. Add auth and `owner_id = auth.uid()` predicates
-- before this is exposed to real users.

alter table public.card_decks  enable row level security;
alter table public.card_places enable row level security;
alter table public.card_states enable row level security;
alter table public.card_draws  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['card_decks', 'card_places', 'card_states', 'card_draws'] loop
    execute format('drop policy if exists anon_all on public.%I', t);
    execute format(
      'create policy anon_all on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
