/* The vocabulary of card mode. Nothing here imports React or touches Google;
   it is the shape the decks, the store and the scene all agree on. */

/** The three decks. Restaurants and attractions are one Places type each;
 *  trivia is the small unplanned places, which is several. */
export type CardCategory = 'restaurant' | 'attraction' | 'trivia'

/** Where a card is. `deck` covers both never-drawn and discarded — a discard
 *  puts the card back, so the only thing that takes one out is keeping it. */
export type CardState = 'deck' | 'kept'

/** What happened to a card the moment it was resolved. Kept on its own row so
 *  the history survives a card moving back into the deck. */
export type DrawOutcome = 'kept' | 'discarded'

export type CardLocation = {
  lat: number
  lng: number
  /** What to call it. Never a raw URL — this is printed on the gate. */
  label: string
}

export type Card = {
  /** The Places id. Stable across searches, so a refill dedupes for free and a
   *  kept card keeps its identity when the deck is refetched. */
  id: string
  category: CardCategory
  name: string
  /** The location line printed on the card — Places' `formattedAddress`. */
  where: string
  lat: number
  lng: number
  rating: number | null
  /** Its page on Google Maps. Empty if it hasn't got one. */
  url: string
  /** When the search that found it ran, ISO. Decides whether it is stale. */
  fetchedAt: string
}

/** Everything card mode holds for one device, as one object — the same shape
 *  the store loads and the hook mirrors. */
export type DeckSnapshot = {
  location: CardLocation | null
  cards: Card[]
  /** Card id to state. A card absent from this map is in the deck. */
  states: Record<string, CardState>
  /** Card id to how many times it has been drawn. Absent means never. */
  draws: Record<string, number>
}

export const emptySnapshot = (): DeckSnapshot => ({
  location: null,
  cards: [],
  states: {},
  draws: {},
})

/** Why a deck couldn't be filled. `denied` is Places API (New) not being
 *  enabled on the key — a separate enablement from the other three. */
export type CardsError = 'denied' | 'failed'

/** Why a location couldn't be worked out. `denied` is the browser permission;
 *  `notfound` is text that geocoded to nothing. */
export type LocationError = 'denied' | 'unavailable' | 'notfound'
