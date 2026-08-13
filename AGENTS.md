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
npm run check:motion   # cards.css may not transition transform or size
```

Node 20.19+ (Vite 8). There is **no test suite** — don't claim tests pass, and
don't invent a runner. To verify a change, run `npm run build` (catches type
errors) and `npm run lint`, then exercise it in the browser. Those two and the
two guards run in CI on every branch; `docs/ci.md` says what breaks them.

## Layout

```
src/
  lib/          pure functions and types — no React, no side effects
  state/        the hooks that hold everything
  components/   the UI
  styles.css    the board's, and every shared variable (~1800 lines)
  cards/        card mode — the same three-way split, one level down
supabase/schema.sql   the tables; nothing applies this for you
supabase/cards.sql    card mode's, standalone; nothing applies this either
scripts/              the checks CI runs that aren't npm's own
.github/workflows/    one workflow per file — see docs/ci.md
docs/                 setup.md (Supabase), architecture.md (the long tour),
                      cards.md (card mode), ci.md (what runs on a branch)
```

**Card mode is its own folder, and its own stylesheet.** `src/cards/` repeats
the `lib`/`state`/`components` split and owns `cards.css`, imported once from
`CardsView.tsx` — the one place "all of it, one file" is bent, along the same
seam the code is already split on. Everything shared still lives in
`styles.css`: the variables, the app shell, and the left rail, which is chrome
for both sections rather than card mode's. Read `docs/cards.md` before touching
any of it; the Three/React seam has two rules that take the whole app down when
broken.

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
there or you'll be able to pan into a void again. `glideBy` is the one move
that eases rather than cuts (the day arrows); every gesture calls `stopGlide`
first, so nothing new may move the view without cancelling one.

**A commute block is a timeline block with a route.** `TimelineBlock.kind` is
`'event'`, `'commute'` or `'trivia'`; a commute uses `fromPlace` / `toPlace` /
`travelMode` and leaves `place` and its four resolved halves empty. **Either
end left empty is the normal case, not a missing value** — `lib/commute.ts`
reads it off the rail instead: the nearest located event before and after,
within `COMMUTE_GAP_MAX` (2 hours) of the block's own edges, measured in
absolute minutes so a gap can cross midnight. Anything that changes when a
block sits, or where, changes what the commutes around it are joining, so the
ends are recomputed every render rather than stored. Nothing in that file
touches Google; it answers with text, and `useGoogleMap` turns it into a route.

**Trivia is time with no place.** The third kind — lunch, a nap, an afternoon
left clear — uses none of the location or route fields, so it has no entry in
the pane and no menu entry that would open one. `locatable` in `lib/commute.ts`
only counts events, so a trivia block is never picked as a commute end: an hour
of lunch between two places doesn't make lunch one of them. Selecting one sets
`hold` on the map view, which is the one way anything asks the camera to stay
put; the alternative was flying home to Seoul for every meal.

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
the whole point of dropping the Embed API. It asks for
`renderingType: VECTOR`, because raster answers a zoom by fetching a whole new
set of tiles at the new level, which reads as the map reloading under you. The
Map ID's cloud configuration overrides that request, so the actual type is read
back with `getRenderingType()`; on raster the flight drops its zoom dip. The flight is a rAF loop over
`moveCamera` and is the one animation in the app allowed to move something.
`colorScheme` and `mapId` are fixed at construction, so a theme switch *does*
replace the map and bumps `built`, which is what re-runs the flight. What the
pane shows is derived from `selection` by `mapView()`. A commute block draws a
`DirectionsRenderer` polyline instead of a marker, and the camera is still
flown — to the route's bounds — rather than let the renderer cut to them
(`preserveViewport: true`, and don't remove it). Routes are cached per session
on both ends plus the mode, and a failure is cached as its reason.
**Google routes nothing but transit inside South Korea** — walking, driving and
cycling answer `ZERO_RESULTS` for any two points in the country, which is a
mapping export restriction rather than a gap, so there is nothing to retry and
no key that fixes it. Those three fall back to `lib/estimate.ts`: straight-line
distance times `TRAVEL_DETOUR` at `TRAVEL_SPEED_KMH`, drawn as a dashed
polyline and printed with a `≈`. Don't present that number as a route.
**Nearby restaurants are a fourth API.** Right-clicking a located event block
offers a search around it: `Place.searchNearby` out of the `places` library, a
`google.maps.Circle` sized by the pane's slider, and one
`AdvancedMarkerElement` per result whose content is a styled div, so the dots
follow the theme. The circle answers the slider on the frame it moves; the
search waits `NEARBY_SETTLE_MS` for the drag to settle, because every one of
those is a billed request. The camera is only pulled back when the circle has
grown out of the pane — flying on every step of a slider is unusable. Which
block is being asked, and how wide, lives in `Board` (the radius in
localStorage), so it survives selecting something else. Places API (New) is a
separate enablement from the other three; `denied` is what that looks like.

`lib/maps.ts` reads `VITE_GOOGLE_MAPS_API_KEY` (needs Maps JavaScript API,
Geocoding API, Directions API **and** Places API (New)) and the two `VITE_GOOGLE_MAPS_MAP_ID*` vars; running with no key is a supported
state, so don't make the pane assume one. The map's appearance lives in the
Cloud console, not here — a `styles` array is ignored once `mapId` is set.

**A location is two halves.** `place` is what the user pasted; `placeLabel` /
`placeLat` / `placeLng` / `placeZoom` are what it resolved to, and they are
persisted so a board doesn't re-geocode on every open. Editing `place` **must**
clear the other four, or the map flies to the old point. Resolution happens in
`useGoogleMap` and comes back through `onResolved` for `Board` to store — the
hook never writes. Show `placeLabel` in the UI, never `place`, which is often a
raw URL. A commute's two ends have no such second half — they are handed to the
router as text, and it does its own lookup.

## The feel

The brief is that it should feel *clicky*, and it's mostly restraint:

- Transitions are capped at 80ms (`--dur` at the top of `styles.css`) and apply
  only to colour, shadow and opacity.
- **Nothing affecting position or size is ever animated.** A block easing into
  place after a drag reads as lag. There are three exceptions — the map's
  flight, the board's own view when the day arrows move it for you (`glideBy`,
  `VIEW_GLIDE_MS`), and the cards in card mode. The first two are cameras; the
  third is the one place a *thing* moves, and it is allowed for the same reason:
  every one of them answers a press rather than a drag, where a cut loses which
  way you went. Nothing the pointer is holding ever eases, in either section.
  The card exception is granted to `useCardScene.ts`, not to the stylesheet —
  all of it is a rAF loop writing to a `CSS3DObject`, and no rule in `cards.css`
  may name `transform`, `width`, `height`, `top` or `left` in a `transition`.
  So a reviewer's check is a grep rather than a judgement call.
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

## Commits

`type: what changed` on one line, lower case. No body, no bullets, **no
`Co-Authored-By` or generated-with trailer** — this repo has one author and
commits are attributed to them alone.

```
feat: multiple selections
add: google maps loader and maps url parsing
fix: dark mode selects the style's dark variant
refactor: pan clamp watches the viewport element
remove: legacy embed api fallback
docs: map id is not a style id
```

Split by intent, not by file. One reason per commit, and each commit builds on
its own so the history bisects. If one file would have to straddle two commits,
resequence the work rather than splitting the file.

## Documentation

`docs/` is read by agents at least as often as by people. Write for someone who
needs one answer, not a tour: answer first, reasoning after, and only the
reasoning that isn't already plain in the code. A table or a numbered list beats
a paragraph whenever the content is steps or facts.

State failure modes — they're the highest-value sentences in the file. "A style
ID here renders the default map" saves an hour; more prose about what a Map ID
is saves nothing. When a doc drifts from the code, fix the doc in the same
commit.

Keep it short. If a section has stopped earning its length, cut it.

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
