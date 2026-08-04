# How the code is put together

Nothing here is clever for the sake of it, but a few decisions won't be obvious
from reading the files in alphabetical order. This is the tour.

## Where things live

```
src/
  lib/          pure functions and types, no React
  state/        the hooks that hold everything
  components/   the UI
  styles.css    all of it, one file
```

`lib/` has no imports from React and no side effects, so it's the easy part to
read first. `types.ts` is the vocabulary. `constants.ts` is where the numbers
live, including the default trip dates and the locale used for the day headers.
`time.ts` converts between minutes and pixels. `geometry.ts` works out where
blocks and connection lines go.

## Two coordinate systems

This trips people up, so it's worth being explicit.

Blocks are positioned in *board space*, which never changes. A block at x 480
is always at x 480 whether you're zoomed to 25% or 200%. Panning and zooming
only change a single CSS transform on the `.content` element that wraps
everything.

The upshot is that moving around the canvas doesn't touch a single block. React
doesn't re-render anything, the browser just moves one layer. `useViewport`
leans on that: it writes the transform straight to the DOM on every frame of a
gesture and keeps React entirely out of it. The `scale` value it returns as
state exists so the toolbar can print "100%", and for nothing else.

When you need to go the other way, from a mouse position to a board position,
use `toBoard(clientX, clientY)`.

Panning is bounded. `boardBounds` in `geometry.ts` returns the box the board
actually occupies — the rail's full height plus every loose canvas card, padded
by `PAN_MARGIN` — and every view change runs through a clamp that keeps that box
covering the viewport, so you can't drift off into empty space. Content smaller
than the viewport on an axis gets centred on it instead of pinned to one edge.
The bounds are recomputed each render and re-clamped in a layout effect, which
is what pulls the view back in when a day is removed under it.

## Days as numbers, not dates

A timeline block stores a day number and two minute counts, not timestamps.
Block on day 4 from minute 600 to minute 780 means 10:00 to 13:00 on the fifth
day of the trip. The board's `start_date` turns that into a real date when it's
time to print a header.

This makes dragging trivial, since moving a block is arithmetic on integers
rather than date maths, and it means shifting the whole trip forward a week is
one field change on the board.

Blocks that overlap in time get packed into side by side lanes by `packLanes`
in `geometry.ts`. It's the standard calendar algorithm: sort by start time,
group into clusters that overlap, put each block in the first lane that's free.
Everything in a cluster reports the same lane count so the widths line up.

## Connections

Links are polymorphic. A link joins any two blocks, so it stores a kind and an
id at each end rather than a foreign key, and that's true in Postgres as well as
in TypeScript. The trade-off is that the database can't clean up after itself
with a cascade, so there's a trigger doing it by hand.

Drawing them is in `LinkLayer.tsx`. It picks the left or right edge of each
block depending on which way the other one is, then draws a cubic bezier with
horizontal control points. Because the curve arrives horizontally, the arrowhead
is a fixed triangle rather than anything involving trigonometry.

The SVG sits inside the transformed layer with `overflow: visible` and a 1x1
size, which lets it draw at negative coordinates without any viewBox juggling.
Lines use `vector-effect="non-scaling-stroke"` so they stay a hairline at every
zoom level.

## Selection

Selection is a list of refs, and delete, duplicate, colour and drag all run over
the whole list. Ctrl/⌘ is the modifier for everything that widens it: clicking a
block with it held toggles that block in or out, and dragging on empty space
with it held draws a marquee that adds whatever the box touches. Without the
modifier a click on empty space clears the selection and a drag pans, which is
why the marquee needs one at all.

Clicking a block that's already selected is the awkward case, because it could
mean either "select just this" or "start dragging the group". It keeps the group
while the pointer is down and collapses to the one block on release, if the
pointer never moved.

The marquee is a plain div inside `.content`, positioned in board space, so it
pans and zooms with everything else — only its border width is divided back out,
to stay a hairline. Hit testing runs against the same `timelineRect` and
`canvasRect` used to lay the blocks out, so it never reads the DOM.

## The map pane

The window is a toolbar over a `.stage`, and the stage is two columns: the
board on the left, a `MapPane` on the right, a one pixel `.split` between them
that you can drag. The pane's width is React state in `Board`, remembered in
local storage under `itinerary.mapPane`.

That's the one place the board isn't the whole window any more, and two things
follow from it.

The first is that `.viewport` can now change size without the window doing,
which the pan clamp has to know about — so `useViewport` watches the element
with a `ResizeObserver` rather than listening for `resize`. Everything else
already worked, because `toBoard` was measuring the viewport's own rect instead
of assuming it started at the top left of the screen.

The second is that the map answers to the pointer as well. `Board` sets
`data-busy` on `.app` for the length of any gesture — a block drag, a pan, a
link, a divider drag — and the stylesheet turns off pointer events on the map
while it's there, so a drag that wanders across the divider isn't caught by the
wrong thing.

What the pane looks at is derived, not stored. `mapView()` in `Board` reads the
selection each render: one timeline block answers with its `place`, one canvas
card with whatever place `placeFromUrl` can pull out of its link, and anything
else — nothing selected, or a group — falls back to Seoul. A timeline block is
also the only case that gets editable fields, because it's the only one with a
`place` of its own; that's why the "Set location" menu entry focuses the pane
instead of opening an editor on the block.

## Flying the camera

`useGoogleMap` builds one `google.maps.Map` and then never rebuilds it. A new
query is a camera move, not a reload — which is the whole reason this is the
Maps JavaScript API rather than an Embed API iframe, where every place change
is a fresh page load inside the frame.

Getting from a pasted place to a camera is `Geocoder`. What matters there isn't
the coordinates, it's the `viewport` that comes back with them: it's wide for a
city and tight for a building, so `zoomForBounds` turns it into a zoom level
and the map lands at a sensible distance without anyone choosing one. That fit
is then held back by `MAP_ZOOM_BACKOFF`, because an exact fit puts the place
edge to edge in the pane and reads as too close — a place wants to be seen in
its surroundings.

## What a location is

A timeline block stores both halves of it. `place` is exactly what was pasted —
a Maps link, a `lat,lng`, a name — and `placeLabel` / `placeLat` / `placeLng` /
`placeZoom` are what that turned out to mean. The second set is filled in the
first time the block is looked at and then saved, so opening the board again
flies straight there without asking Google anything. Editing `place` clears the
four, which is what makes the new text get looked up instead of the old point
being flown to.

That's the reason resolution has to travel back up rather than staying in the
hook: `useGoogleMap` is handed an `onResolved` callback, calls it once when a
lookup succeeds, and `Board` writes the answer onto the block. The in-memory
cache in the hook is the second line of defence, for loose canvas cards, which
have nowhere to keep an answer and so re-resolve once per session.

`labelFor` is what makes pasting a link sufficient. A Maps URL already contains
the place's name, so nothing needs looking up to know what to call it; typed
text is its own name; only bare coordinates have to be handed back to Google to
be described. The block takes that name as its title if it hasn't got one, and
`TimelineBlockView` shows `placeLabel` rather than `place` — nobody wants a
hundred-character URL rendered on a block.

The Cloud console owns how the map looks. Setting a `mapId` disables the
`styles` array in code outright, so styling isn't a thing the app can do; it
names a Map ID and whatever style is attached to it applies. `docs/map-styles/`
has a light and a dark one built from the same palette as the interface.

Either field can hold the location, and either can hold a Maps URL:
`placeFromUrl` reads the long forms — `?q=`, `/maps/place/<name>`, the
`!3d…!4d…` pin that Maps buries in its `data=` blob, a bare `@lat,lng` camera —
and prefers the pin over the camera, since they differ.

What it can't read is a short `maps.app.goo.gl` link, and that isn't a gap to
fill later. They resolve only by following a redirect, goo.gl serves no CORS
headers so the browser won't let the page read where it lands, and the API that
used to expand them is gone. Doing it needs a server making the request, which
is the one thing this app doesn't have. So `isShortMapsUrl` recognises them and
the pane says what to paste instead — the footer link points at the short URL
itself, since following it is how you get the long one.

The flight itself is a `requestAnimationFrame` loop over `moveCamera`, easing
centre and zoom together. `panTo` isn't enough on its own: it only animates the
pan, and only when the target is already close. The zoom also dips on the way
out, in proportion to how far apart the two points are, which is what stops a
long hop reading as a smear of tiles — it's the same shape as the arc Google
Maps flies. Fractional zoom is a vector-map feature, which is why the map is
built with a Map ID; without one configured it falls back to `DEMO_MAP_ID`.

This is the one animation in the app that moves something, and it's a
deliberate exception to the rule below: it's the map's own idiom rather than
the interface's, and the alternative — cutting straight there — is what the
Embed API already did badly.

A map's `colorScheme` is fixed at construction, so following the app's theme
means replacing the map. That's what the `built` counter is for: the effect
that flies the camera watches it, so a rebuilt map gets its place put back.
It only happens on a deliberate theme switch, and the camera carries over.

`lib/maps.ts` holds the parts with no state: reading the two env vars, loading
the SDK once, pulling a place out of a Google Maps URL, and the mercator sum
behind `zoomForBounds`. With no key it rejects, and the pane says which
variable is missing instead of showing a broken map.

## Saving

`lib/store.ts` puts Supabase and local storage behind the same interface, and
`resolveStore()` picks one at startup by trying a query and falling back if it
throws. Everything above that point has no idea which is in use.

Writes are optimistic. State updates immediately and the network call goes into
a queue keyed by entity id, flushed 200ms later. Because it's a map rather than
a list, dragging a block across the screen collapses into one write instead of
sixty.

Drag handlers pass `commit = false` while the pointer is down, then call
`commitTimeline` or `commitCanvas` on release. That's why `useItinerary` keeps a
`snapRef` alongside its state: the mouseup handler needs to read what the last
mousemove wrote, and React state won't have caught up yet within the same tick.

## The feel

The brief was that it should feel clicky, and most of that is restraint rather
than technique.

Transitions are capped at 80ms, in the `--dur` variable at the top of
`styles.css`, and they only ever apply to colour, shadow and opacity. Nothing
that affects position or size is ever animated. If a block eased into place
after you dragged it, it would feel like it was lagging behind your hand.

Drags don't start until the pointer has moved 3px, so a click still reads as a
click and doesn't nudge anything.

Design is flat throughout. Depth comes from one pixel borders. Drop shadows are
reserved for menus and tooltips, the things that genuinely float, and everywhere
else a `box-shadow` is a hard ring marking selection rather than anything
soft. The one gradient in the stylesheet is the `radial-gradient` that tiles the
background dots, which renders as flat dots rather than a fade.

## Themes

The stylesheet doesn't look at `prefers-color-scheme` at all. It only reads a
`data-theme` attribute on `<html>`, and JavaScript decides what that should be.
"Follow the system" is resolved to a concrete light or dark before it ever
reaches CSS.

There's a small inline script in `index.html` that does this before the first
paint, which is what stops the page flashing white on reload if you've picked
dark. It duplicates four lines of `useTheme.ts` on purpose. If you change one,
change the other.

## Things that would be worth doing

Undo is the obvious gap. The state shape would make it straightforward, since
every mutation goes through a handful of functions in `useItinerary`.

Rubber banding only adds to the selection, since the modifier that starts it is
the one that means "and this too". Replacing the selection with a box means
clicking empty space first.

Realtime would be nice for planning with other people, and Supabase gives you
most of it for free, but it needs the auth work in
[setup.md](setup.md) first.
