# AGENTS.md

Koreandres is a whiteboard for planning trips. Days run down the left as one
continuous timeline and you drop blocks onto it; loose reference cards (opening
hours, prices, a Maps link) sit off to the side on a free canvas and connect
back to the day with a drawn link. A map pane down the right shows where the
selected block is.

Client-side only. React 19 + TypeScript, Vite build, Supabase for storage with a
localStorage fallback. No UI library, no CSS framework, no server of its own.

## Commands

```bash
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build — the typecheck is part of the build
npm run lint      # eslint .
npm run preview   # serve the built bundle
```

Node 20.19+ (Vite 8). There is **no test suite** — don't claim tests pass, and
don't invent a runner. To verify a change, run `npm run build` (catches type
errors) and `npm run lint`, then exercise it in the browser.

## Layout

```
src/
  lib/          pure functions and types — no React, no side effects
  state/        the three hooks that hold everything
  components/   the UI
  styles.css    all of it, one file (~1250 lines)
supabase/schema.sql   the tables; nothing applies this for you
docs/                 setup.md (Supabase), architecture.md (the long tour)
```

`docs/architecture.md` is the real explanation of the design and is worth
reading before any non-trivial change. The rest of this file is the short list
of things that are easy to break.

`Board.tsx` (~950 lines) owns selection, editing, keyboard handling and all the
pointer plumbing; the block views under it are mostly presentational.

## Invariants

**Two coordinate systems.** Blocks live in *board space*, which never changes
with zoom. Pan and zoom only write a single CSS transform onto `.content`, so
moving around re-renders nothing. `useViewport` writes that transform straight
to the DOM every frame and keeps React out of it — the `scale` it returns as
state exists for the toolbar's "100%" readout and nothing else. Never drive the
transform from React state. Convert with `viewport.toBoard(clientX, clientY)`.
Pans and zooms are clamped to `boardBounds()` — the occupied box plus
`PAN_MARGIN` — so anything that changes where content sits has to be reflected
there or you'll be able to pan into a void again.

**Days are numbers, not dates.** A `TimelineBlock` stores `dayIndex` plus
`startMin`/`endMin` (minutes from midnight, 0–1440). The board's `startDate`
turns that into a real date only when a header is rendered. Keep it that way —
dragging stays integer arithmetic. Use `lib/time.ts` for conversions;
`parseISODate` exists because `new Date('2026-08-22')` parses as UTC and shifts
the day.

**Drags are optimistic, and commit on release.** Every mutation in
`useItinerary` updates state immediately and enqueues the write in a `Map` keyed
by entity id, flushed 200ms later — so a drag across the screen collapses into
one round trip. Drag handlers pass `commit = false` while the pointer is down,
then call `commitTimeline` / `commitCanvas` on pointerup. `snapRef` is a mirror
of the snapshot that is current within the same tick, because a pointerup has to
read what the last pointermove wrote and React state hasn't caught up. Read
`snapRef.current`, not `snapshot`, inside pointer handlers.

**Storage is behind one interface.** `lib/store.ts` puts Supabase and
localStorage behind `ItineraryStore`, and `resolveStore()` picks one at startup
by trying a query and falling back. Nothing above that layer knows which is in
use — don't import `supabase` outside `lib/`. Postgres rows are `snake_case` and
TypeScript is `camelCase`; the `*FromRow` / `*ToRow` mappers are the only place
that seam exists. Adding a field means touching the type, both mappers, and
`schema.sql`.

**Links are polymorphic.** A link stores a kind + id at each end rather than a
foreign key, so it can join any two blocks. The database therefore can't cascade
— a trigger in `schema.sql` cleans up instead. Deleting a block must also drop
its links (see `removeBlock`).

**Themes are resolved in JS.** `styles.css` never reads `prefers-color-scheme`;
it only reads `data-theme` on `<html>`. "System" is resolved to a concrete
light/dark before it reaches CSS. The inline script in `index.html` duplicates
four lines of `useTheme.ts` on purpose, to avoid a white flash on reload — **if
you change one, change the other.**

**Drag threshold.** `startDrag` in `Board.tsx` fires nothing until the pointer
clears 3px, so a click stays a click. Keep that in any new drag interaction.

**The board no longer owns the window.** `.stage` splits it with the map pane,
so `.viewport` can resize on its own — `useViewport` watches it with a
`ResizeObserver`, and anything measuring the window instead of the viewport's
rect is a bug. Every gesture sets `data-busy` on `.app`, which turns off
pointer events on the map so a drag crossing the divider isn't answered by it;
a new drag has to do the same.

**The map is one map.** `useGoogleMap` builds a `google.maps.Map` once and
moves its camera; selecting a block must never rebuild or reload it — that was
the whole point of dropping the Embed API. The flight is a rAF loop over
`moveCamera` and is the one animation in the app allowed to move something.
`colorScheme` and `mapId` are fixed at construction, so a theme switch *does*
replace the map and bumps `built`, which is what re-runs the flight. What the
pane shows is derived from `selection` by `mapView()`. `lib/maps.ts` reads
`VITE_GOOGLE_MAPS_API_KEY` (needs Maps JavaScript API **and** Geocoding API)
and the two `VITE_GOOGLE_MAPS_MAP_ID*` vars; running with no key is a supported
state, so don't make the pane assume one. The map's appearance lives in the
Cloud console, not here — a `styles` array is ignored once `mapId` is set.

**A location is two halves.** `place` is what the user pasted; `placeLabel` /
`placeLat` / `placeLng` / `placeZoom` are what it resolved to, and they are
persisted so a board doesn't re-geocode on every open. Editing `place` **must**
clear the other four, or the map flies to the old point. Resolution happens in
`useGoogleMap` and comes back through `onResolved` for `Board` to store — the
hook never writes. Show `placeLabel` in the UI, never `place`, which is often a
raw URL.

## The feel

The brief is that it should feel *clicky*, and it's mostly restraint:

- Transitions are capped at 80ms (`--dur` at the top of `styles.css`) and apply
  only to colour, shadow and opacity.
- **Nothing affecting position or size is ever animated.** A block easing into
  place after a drag reads as lag. The map camera is the one exception, and it
  is the map's idiom rather than the interface's.
- Flat throughout. Depth comes from 1px borders. Soft drop shadows are reserved
  for things that genuinely float (menus, tooltips); every other `box-shadow` is
  a hard selection ring.
- The only gradient in the stylesheet is the `radial-gradient` that tiles the
  background dots, and it renders as flat dots rather than a fade. Don't add
  another one.

Colours come from the CSS variables in `:root` and the dark override — don't
hardcode hex values in components. Block colours are the eight names in
`ColorName`; sizes, snapping and zoom bounds all live in `lib/constants.ts`
rather than inline.

## Code style

No Prettier config; match the surrounding code. No semicolons, single quotes,
2-space indent, trailing commas, lines around 90 chars. Named exports; small
pure helpers as arrow consts, anything with branches as `function`. Section
banners look like `/* ------- name -- */`. Comments explain *why* — the existing
ones are load-bearing, don't strip them, and don't add narration of what the
code plainly does.

Types are in `lib/types.ts` and are the shared vocabulary; prefer widening those
over local structural types. `Ref` (`{ kind, id }`) is how any block is pointed
at across the app.

## Environment and data

`.env` is gitignored and must stay that way. Only `VITE_`-prefixed variables
reach the browser — a variable named `SUPABASE_URL` is silently undefined. With
no Supabase configured the app runs on localStorage under the key
`itinerary.boards.v2` and the toolbar says `Local only`.

Nothing creates the Supabase tables for you; `supabase/schema.sql` has to be
pasted into the SQL editor by hand, and restarting the dev server will never fix
a missing schema. See `docs/setup.md`.

The shipped RLS policies are wide open — anyone with the publishable key can
read and edit every board. That's deliberate so the app works with no login, and
it's documented in the README and `docs/setup.md`. Don't quietly "fix" it;
proper auth is a real piece of work (an `owner_id` column and rewritten policies
across all four tables), not a config change.

## Known gaps

Undo and realtime are both absent and known. Realtime needs the auth work
first.

Selection is a `Ref[]`. Ctrl/⌘+click toggles a block in and out of it, and
Ctrl/⌘+drag on empty space draws a marquee that adds everything it touches —
the modifier is what distinguishes both from a plain click, which replaces the
selection, and a plain drag, which pans. A plain click on a block that is
already selected keeps the group together so it can be dragged, and collapses
on release if the pointer never moved. Delete, duplicate, colour and drag all
act on the whole selection, so anything new that reads `selection` should
assume more than one. Realtime needs the auth work first.
