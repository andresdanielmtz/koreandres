# How the code is put together

Nothing here is clever for the sake of it, but a few decisions won't be obvious
from reading the files in alphabetical order. This is the tour.

## Where things live

```
src/
  lib/          pure functions and types, no React
  state/        the three hooks that hold everything
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

Multi-select and rubber band selection aren't there either. Selection is a
single optional block today, so that would ripple a bit further.

Realtime would be nice for planning with other people, and Supabase gives you
most of it for free, but it needs the auth work in
[setup.md](setup.md) first.
