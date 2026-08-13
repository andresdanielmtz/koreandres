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

## The deck machine

State is **one map, not four piles**: `states` is card id → `'deck' | 'kept'`,
and `draws` is card id → how many times it has been dealt. Every pile is then a
derivation, which is also one row per card in the database.

| Move | What changes |
| --- | --- |
| **take one** | `draws[id]` goes up by one. The card is *not* removed from the deck. |
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

13. `draw` is a no-op while a card is already drawn.
14. `keep` sets `'kept'` and the card leaves `deckSize`; `discard` leaves
    `deckSize` unchanged.
15. `fill` does not search when `isStale` is false, and does not issue a second
    search for a category already in flight.
16. `useCards(false)` never resolves a store or issues a search.

**The scene** is the least worth unit-testing and the most worth exercising in a
browser: deal, keep, discard, a theme switch with a card on the table, a resize,
and `prefers-reduced-motion: reduce`. Assert on `.card`'s inline `transform` and
on the card count in the DOM rather than on pixels.
