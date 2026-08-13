import type { CardCategory } from './types'
import type { ColorName } from '../../lib/types'

/* ----------------------------------------------------------------- decks -- */

/** The order the decks are dealt out on the shelf, and the order a place is
 *  claimed in when two searches return it — see `dedupe` in `deck.ts`. */
export const CARD_CATEGORIES: CardCategory[] = ['restaurant', 'attraction', 'trivia']

export const CATEGORY_LABEL: Record<CardCategory, string> = {
  restaurant: 'Restaurants',
  attraction: 'Attractions',
  trivia: 'Trivia',
}

/** What each deck asks Places for. Trivia is six types in *one* request —
 *  `searchNearby` takes up to 50 included primary types, so the whole pile
 *  costs the same as the decks that ask for one. */
export const CATEGORY_TYPES: Record<CardCategory, string[]> = {
  restaurant: ['restaurant'],
  attraction: ['tourist_attraction'],
  trivia: ['park', 'cafe', 'book_store', 'art_gallery', 'library', 'spa'],
}

/** Which of the eight block colours tints each deck. Reusing the board's
 *  palette rather than inventing one is what keeps a card themed for free. */
export const CATEGORY_COLOR: Record<CardCategory, ColorName> = {
  restaurant: 'amber',
  attraction: 'violet',
  trivia: 'teal',
}

/* ---------------------------------------------------------------- search -- */

/** How far around you a deck looks. Wider than the board's nearby search,
 *  which is "what can I walk to from this block"; this one is "what is in
 *  this part of the city". */
export const CARD_RADIUS_DEFAULT = 1500
export const CARD_RADIUS_MIN = 500
export const CARD_RADIUS_MAX = 8000
export const CARD_RADIUS_STEP = 250

/** Most Places returns for one search. */
export const CARD_DECK_MAX = 20

/** How long a cached deck is dealt from before it is searched again. Long on
 *  purpose: the whole point of the cache is not to re-bill, and the places in
 *  a neighbourhood do not turn over weekly. */
export const CARD_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** How far you have to move before a cached deck stops being about where you
 *  are. Under this, a new geolocation fix is the same neighbourhood. */
export const CARD_REFETCH_METRES = 400

/** A dismissed permission prompt never resolves, so the request gives up and
 *  falls through to the text field rather than hanging on the gate. */
export const CARD_LOCATE_TIMEOUT_MS = 8000

/** How many photos a card shows, and how wide they are asked for. More than a
 *  handful is a gallery, and a card is not one.
 *
 *  Two widths because the grid thumbnails and the same photo opened full size
 *  are wildly different jobs, and `getURI` only builds a URL — it makes no
 *  request — so the second one is free. Both are asked for wider than they are
 *  drawn, for high-density screens. */
export const CARD_PHOTO_MAX = 6
export const CARD_PHOTO_WIDTH = 480
export const CARD_PHOTO_FULL = 1600

/* ---------------------------------------------------------------- motion -- */

/** The card's size in CSS pixels. The camera is set so one world unit is one
 *  pixel, so these are also its size in the scene — they must match `.card`. */
export const CARD_W = 320
export const CARD_H = 452

export const CARD_FOV = 45

/** How far a card is offset per sheet in a stack, and how many of a pile get a
 *  real object. Past this the pile reads as a pile whatever is under it. */
export const CARD_STACK_STEP = 1.6
export const CARD_STACK_SHOWN = 6

/** How small a card gets as it lands on the seen pile. */
export const CARD_PILE_SCALE = 0.34

/** The one place in the app a *thing* moves rather than a camera. Each answers
 *  a press, never a drag — see the note in docs/cards.md. */
export const CARD_DEAL_MS = 340
export const CARD_FLIP_MS = 280
export const CARD_RETURN_MS = 260

/** How far a card rises off the table on its way across, in world units. A
 *  dealt card passes over the pile rather than through it. */
export const CARD_LIFT = 190

/** Below this, a tween is close enough to be done. In pixels. */
export const CARD_EPSILON = 0.4
