# Card mode

The board answers *when am I doing this*. Card mode answers *what is there*:
three decks of real places around you — restaurants, tourist attractions, and
trivia (parks, cafes, the small unplanned things) — that you draw from one card
at a time and either keep or put back. It is being shown somewhere rather than
searching for one.

It is reached from the vertical rail on the far left, and it takes over the
window: the board, the map pane and the board's toolbar all go away.

## Where it lives

Everything is under `src/cards/`, which repeats the project's own
`lib` / `state` / `components` split one level down. `lib/` keeps the house rule
locally: no React, no side effects.

| Path | What |
| --- | --- |
| `cards/lib/types.ts` | `Card`, `CardCategory`, `CardState`, `DeckSnapshot` |
| `cards/lib/constants.ts` | every Card-mode number, including the deck → Places type table |
| `cards/lib/deck.ts` | the deck machine, pure |
| `cards/lib/places.ts` | one `searchNearby` per deck |
| `cards/lib/location.ts` | geolocation, and the typed fallback |
| `cards/lib/cardsStore.ts` | Supabase / localStorage behind `CardsStore` |
| `cards/state/useCards.ts` | decks, draws, and the write queue |
| `cards/state/useCardScene.ts` | the Three scene |
| `cards/components/` | the UI |
| `cards/cards.css` | its styles |

Three things sit outside it on purpose. `src/components/SideNav.tsx` is chrome
for both sections, so card mode owning the switch that turns card mode off would
be backwards. `src/lib/section.ts` is the same. And the `--fill`/`--edge`/`--ink`
derivation for `.card-face` stays in `styles.css` next to the palette it derives
from — a deck is tinted by the same eight colour names a block is.

## A round

Pressing **Take one** does not draw anything. It deals a hand of
`CARD_FAN_COUNT` face-down cards out of that deck, fanned across the table.
Picking one of them is what draws: the card flips over on its way to the middle
and the rest go back to the deck.

The four backs are **not** four candidates. Only the back is rendered for them —
no front at all — so nothing about a place you haven't turned over is sitting in
the DOM. Which card you got is decided at the instant you pick, by the same
`takeOne` as before.

That is why the scene is keyed by **slot** ids (`hand3:0`) rather than place
ids: a face-down card has no place behind it yet. `CardDesk` holds a
`faces: Map<slotId, Card>` with exactly one entry — the picked slot — and
`CardTable` renders a `CardFace` for anything in it and a `CardBack` for
everything else. The round counter in the slot id matters: reusing `hand:0`
between rounds would let React match the new hand's portals to the old one's.

Photos stay keyed by **place** id, because they belong to the place rather than
to the slot it happened to be dealt into.

## The deck machine

State is **one map, not four piles**: `states` is card id → `'deck' | 'kept'`,
and `draws` is card id → how many times it has been dealt. Every pile is then a
derivation, which is also one row per card in the database.

| Move | What changes |
| --- | --- |
| **take one** | Nothing. A hand of backs is dealt; no card has been drawn yet. |
| **pick** | `draws[id]` goes up by one. The card is *not* removed from the deck. |
| **keep** | `states[id] = 'kept'`. It leaves its deck and appears in Seen. |
| **discard** | Nothing. It was never taken out. |

That is the point of the shape: **a discard is the absence of an edit.** Keeping
is the only thing that removes a card from a deck.

`takeOne` deals the card with the *fewest* draws, breaking ties at random. This
is what makes "discard puts it back" behave the way it does at a table — the
card really is back in the pile, but everything else is dealt before it comes
round again. A discard that could be handed straight back reads as a bug rather
than as chance.

Only one card is on the table at a time; that is what makes Keep and Discard
unambiguous, and it is why `draw` returns `null` while `drawn` is set.

A place returned by two searches (a cafe is both `cafe` and `restaurant`) is
claimed by the first deck in `CARD_CATEGORIES` order — see `dedupe`. Without it
the same place can be drawn twice and kept twice.

## The Three seam

`CSS3DRenderer` puts the browser's own 3D compositor behind a scene graph.
**Three owns where a card is; the document owns what it says.**

- Three writes `position`, `rotation` and `scale` as one `matrix3d` per frame.
- Card text is real DOM — selectable, findable, keyboard-reachable — and its
  colours are the same CSS variables as everything else.

The payoff is that **a theme switch needs nothing**. Compare `useGoogleMap`,
which must replace its map because `colorScheme` is fixed at construction. There
is deliberately no `cssColor()` in `src/cards/`: a colour read into JS is a
colour that stops following the theme.

The camera is placed at `h / (2 · tan(fov/2))`, which makes one world unit equal
one CSS pixel — so `CARD_W`/`CARD_H` are both the element's size and its size in
the scene, and the two must stay in step with `.card`.

The rAF loop parks itself once nothing is moving and any command restarts it. A
still table costs no frames.

### The two rules that keep React and Three apart

Both exist because each library inserts and removes DOM, and where they overlap
one of them corrupts the other's bookkeeping.

1. **The renderer gets its own element.** `.card-stage` holds nothing React
   rendered; anything React draws over the table is a *sibling* of it. Sharing
   one parent makes React try to remove a node whose parent moved underneath it,
   which throws `removeChild: The node to be removed is not a child of this
   node` and — with no error boundary — takes the whole app down.
2. **The card element is created in `useCardScene` and never appears in JSX.**
   React renders *into* it through `createPortal`; it never renders *it*. Were it
   React-rendered with a `style` prop, React and Three would take turns
   clobbering each other's `transform`, and the symptom would be cards that jump
   when unrelated state changes.

The scene is built once and torn down when `CardDesk` unmounts. `CardDesk` is
split from `CardsView` for a load-bearing reason: `useCardScene`'s build effect
has no dependencies, so the host div must exist on its very first render. An
early return in front of the host — the location gate — leaves the effect with a
null ref and no second chance.

The fan is laid out by `poseFor` from the **table** anchor rather than being an
anchor of its own: cards step sideways by `CARD_FAN_SPREAD`, the inner ones ride
`CARD_FAN_ARC` higher, and each leans `CARD_FAN_TILT` away from the middle —
which is why a pose carries a `tilt` (Z) as well as a `turn` (Y). Each card is
given a *longer flight* than the one before rather than a delay: with a
decelerating curve they land in turn, which is what a dealt hand looks like, and
it needs no timers to cancel.

### Dragging

The whole front of the card is a drag handle. `grab` bails when the press lands
on a `button`, `a` or `input` — checked with `closest()` rather than by where
the listener sits — so Keep, Discard, the Maps link and the photos all still
answer a press of their own without starting a drag.

It reuses the board's plumbing exactly — window listeners, and nothing moves
until the pointer clears **3px** of Manhattan distance. Deltas are cumulative
from the grab and added to where the card already sat, so a drag can't
accumulate rounding, and because one CSS pixel is one world unit the card keeps
pace with the pointer 1:1. The scene's Y is up, so the screen delta is negated.

`dragTo` writes and paints on the spot rather than starting a tween: this is the
one move the pointer is holding, and **nothing the pointer is holding ever
eases**. It also cancels any flight in progress, so grabbing a card mid-deal
takes it over instead of fighting it.

The offset is clamped to keep the whole card on the table, and re-clamped on
resize. A window you can shove off the edge is a window you can lose — and Keep
and Discard live at the bottom of this one, so pushing them past the table's
`overflow: hidden` would strand the card with no way to answer it. The offset is
cleared whenever the card is sent somewhere else; the pile is a pile whatever
route the card took there.

**Nothing in `cards.css` may put a `transition` or a `transform` on `.card`.**
That element belongs to the renderer. The flip is done with two children,
`.card-face[data-side='front']` and `[data-side='back']`, the back rotated 180°
and both with `backface-visibility: hidden`, while Three rotates the parent.

## The refill rule

A deck is searched only when its cache is **missing**, **older than
`CARD_CACHE_TTL_MS`** (30 days), or **filled further than `CARD_REFETCH_METRES`**
(400m) from where you now are — see `isStale`. Otherwise it deals from the cached
rows. Three requests on a cold open, then none for a month.

Kept cards are never evicted by a refill: `mergeCards` carries them through even
when the search stops returning the place.

## Photos are not stored, and can't be

`fetchPhotos` runs the moment a card is turned over — started alongside the flip
rather than waited for, so the photos are usually there by the time the card
lands. One `Place.fetchFields` request per **place** per session, held in memory
by `CardDesk`, so a place drawn again is already loaded.

Note the cost shape: this is a request per card revealed rather than per card
you were curious about. The deck search still doesn't ask for photos, so filling
a deck is unaffected; what changed is that picking a card you immediately
discard now costs a Place Details call.

While it is out, the grid renders `CARD_PHOTO_MAX` empty tiles. That is not
decoration — it holds the card's shape so the actions don't jump when the photos
land under the pointer. It doesn't pulse: a shimmer is a moving gradient, and
this stylesheet has neither.

They are deliberately absent from `card_places`, and this is not an oversight to
fix later:

- The SDK's `Photo` exposes `getURI()` and **no resource name**, so there is no
  stable handle to persist.
- What `getURI()` returns is a temporary signed URL. A row written today 404s
  later — a cache that rots into broken images is worse than no cache.
- Google's terms cap caching of non-id place content at 30 days anyway. Place
  **ids** may be kept indefinitely, which is exactly what `card_places` stores,
  and is why re-fetching a photo from an id is cheap and correct.

Photos are also not requested in the deck search, so a deck you never open
photos on never pays for them.

Each photo is kept at **two** URLs — `thumb` for the card's grid and `full` for
the viewer. `getURI` only builds a URL and makes no request, so the second size
is free; asking for one width and scaling it in CSS would either blur the viewer
or make the card download six full-size photos.

### The viewer

Clicking a thumbnail opens it over everything (`PhotoLightbox`). Arrow keys and
the chevrons step through, with wrap-around; Escape, the close button, or a
press on the backdrop closes. A press on the photo itself does not — the handler
only fires when the press lands on the backdrop element rather than bubbling
from a child.

Two things about it are load-bearing:

- **It is portalled to `document.body`.** Rendering it where it is opened from
  would put it inside the card, which lives in a `preserve-3d` subtree the
  renderer writes a `matrix3d` onto — the "full size" photo would be flown
  around with the card and clipped by the table.
- **Both grid tracks are `minmax(0, 1fr)`, not `1fr`.** Against an auto-sized
  track the photo's `max-height: 100%` resolves to nothing, and a tall picture
  runs straight off the bottom of the screen. This was a real bug: a 1600×1200
  photo rendered 1304×978 in a 900px viewport before the tracks were made
  definite.

The scrim uses two new variables in `styles.css`, `--scrim` and `--on-scrim`.
They are the one pair that does **not** flip with the theme — a photo wants to
be looked at, and a light backdrop around it is glare — so both themes are dark,
the dark one just more so.

The photo does not ease into place, and neither does the scrim beyond its
colour. The card-motion exception is granted to `useCardScene`, not to card
mode at large; the viewer is ordinary UI and obeys the ordinary rule.

## Storage

`supabase/cards.sql`, run by hand, standalone — not folded into `schema.sql`,
because card mode is optional and the board works without it.

| Table | Key | Holds |
| --- | --- | --- |
| `card_decks` | `device_id` | the saved location |
| `card_places` | `(device_id, place_id)` | the cached search results |
| `card_states` | `(device_id, place_id)` | `state` and `draws` |
| `card_draws` | `id` | append-only draw log with its outcome |

There is no auth, so ownership is a device uuid in `localStorage` under
`itinerary.cards.device`. **It scopes; it does not secure** — the RLS policies
are wide open, exactly as the board's are.

`resolveCardsStore()` is a *separate* memo from `resolveStore()`. The common case
is a project where `schema.sql` has been run and `cards.sql` has not; probing a
board table would answer "cloud" and then every card write would throw.

## Failure modes

| Symptom | Cause |
| --- | --- |
| Decks empty, `Places API (New) isn't enabled` on every deck | Places API (New) is a **fourth** enablement, separate from Maps JavaScript, Geocoding and Directions. The *legacy* Places API is not the same thing and produces the identical message. |
| Console says `[cards] Supabase unavailable`, decks don't follow you to another browser | `supabase/cards.sql` hasn't been run. Card mode still works, on localStorage. Nothing fails loudly. |
| "Use my location" does nothing, or the gate seems stuck | Geolocation needs a secure origin — it is off over plain `http` — and a dismissed prompt never resolves. `CARD_LOCATE_TIMEOUT_MS` falls through to the text field, which is why that field is shown from the first frame rather than after a failure. |
| `npm run build` can't find `three/addons/...` | `@types/three` is missing. `three` ships **no** bundled `.d.ts`; the types package is mandatory, and both route `three/addons/*` → `examples/jsm/*` through their `exports` maps. |
| Cards stutter, drift, or jump on unrelated state changes | Something gave `.card` a `transition` or a `transform`. See the two rules above. |
| The card doesn't keep pace with the pointer when dragged | `CARD_W`/`CARD_H` have drifted from `.card` in `cards.css`, or the camera distance was changed. One world unit is one CSS pixel only while those agree. |
| Every card says photos need the key enabled, but the decks fill | Photos are a `fetchFields` call rather than a search. Same enablement, so this usually means a key restriction that allows Nearby Search but not Place Details. |
| Six empty tiles and nothing else | The photo request is still out, or it failed silently — check the console. The tiles are the placeholder, not a broken image. |
| `removeChild: The node to be removed is not a child of this node`, app goes blank | React rendered a child into an element the renderer also writes to. See rule 1. |
| The whole section says "No Google Maps key" | `VITE_GOOGLE_MAPS_API_KEY` is unset. Card mode needs it for both the search and the typed fallback's geocoder. |

## Bundle

`three` is the only new runtime dependency, and `CardsView` is `React.lazy`'d in
`App.tsx` so a session that never opens card mode downloads none of it. Measured
at the time of writing: the cards chunk is **104 kB / 31.6 kB gzipped**, split
out of a main bundle that stayed at ~498 kB. Import named symbols from `three`,
never `* as THREE`, or that number climbs.

## What to test

There is no test suite in this repo, by design — this section is the brief for
whoever adds one. In rough order of value:

**`lib/deck.ts` — pure, no mocks needed, and where the behaviour actually is.**

1. `takeOne` returns `null` on an empty deck, and only ever a card whose draw
   count equals the minimum in the deck.
2. Over many calls with equal draw counts, `takeOne`'s distribution is roughly
   uniform — the randomness is real, not always index 0.
3. Dealing repeatedly (incrementing `draws` each time) visits **every** card
   before repeating any. This is the "discard doesn't come straight back"
   guarantee.
4. `dedupe` keeps one card per id, and picks the earliest category in
   `CARD_CATEGORIES` order.
5. `mergeCards` keeps a card the search no longer returns **iff** it is kept,
   updates cards that are still returned, and never drops another category's.
6. `isStale`: true with no cards, true with no location, true past
   `CARD_REFETCH_METRES`, true past `CARD_CACHE_TTL_MS`, false otherwise. Pass
   `now` explicitly rather than mocking the clock.
7. `shuffle` returns a permutation and does not mutate its input.

**`lib/cardsStore.ts`**

8. `cardFromRow`/`cardToRow` round-trip, including the `where` ↔ `where_text`
   rename and a null `rating`.
9. `cardFromRow` fills its defaults for a row missing newer columns.
10. The local store: `saveCards` replaces only its own category; `resetCategory`
    clears states only for that category's cards.

**`lib/places.ts`** — with `google.maps.places.Place.searchNearby` stubbed.

11. Results with no `location` or no `id` are dropped rather than becoming
    half-built cards.
12. A rejection matching `/denied|not authorized|ApiNotActivated|PERMISSION/i`
    returns `'denied'`; anything else returns `'failed'`. (`placesError` in
    `src/lib/maps.ts` is the shared classifier — test it there, once.)

**`state/useCards.ts`** — needs a React test renderer.

13. `draw` is a no-op while a card is already drawn — and `take` is a no-op
    while a hand is already out, so a round can't be started twice.
14. `keep` sets `'kept'` and the card leaves `deckSize`; `discard` leaves
    `deckSize` unchanged.
15. `fill` does not search when `isStale` is false, and does not issue a second
    search for a category already in flight.
16. `useCards(false)` never resolves a store or issues a search.

17. `fetchPhotos` returns `'denied'` / `'failed'` the same way, caps at
    `CARD_PHOTO_MAX`, and gives every photo both a `thumb` and a `full` URL at
    the two configured widths.

**The scene** is the least worth unit-testing and the most worth exercising in a
browser: deal, keep, discard, a theme switch with a card on the table, a resize,
and `prefers-reduced-motion: reduce`. Assert on `.card`'s inline `transform` and
on the card count in the DOM rather than on pixels. For the drag specifically:
2px of pointer movement must not move the card and 3px must, a press on Keep
must not drag it, the card must stay inside `.card-table`'s box however hard it
is shoved, and Keep must still be visible afterwards. For a round: the hand is
all backs with no `.card-face[data-side='front']` in the DOM at all, the deck's
count does not move until a card is picked, and a second round's cards get
different slot ids from the first's. For the viewer: the photo must fit inside the window at any
viewport size (assert `getBoundingClientRect()`, not that it merely rendered), a
press on the photo must not close it while one beside it must, and the whole
thing must be a direct child of `<body>`.
