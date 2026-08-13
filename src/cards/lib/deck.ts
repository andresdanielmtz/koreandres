/**
 * The deck machine, as pure functions over a `DeckSnapshot`.
 *
 * Every pile is a derivation rather than a stored array — one map of card id
 * to state, which is also one row per card in the database. A discard is
 * therefore not a move: the card was never taken out, so putting it back is
 * the absence of an edit. Only keeping a card takes it out of a deck.
 */
import { metresBetween } from '../../lib/estimate'
import { CARD_CACHE_TTL_MS, CARD_CATEGORIES, CARD_REFETCH_METRES } from './constants'
import type { Card, CardCategory, CardLocation, DeckSnapshot } from './types'

/** Fisher–Yates, on a copy. */
export function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * One place, one deck. A cafe comes back from both the restaurant search and
 * the trivia one, and a place in two decks can be drawn twice and kept twice.
 * First claim wins, in `CARD_CATEGORIES` order.
 */
export function dedupe(cards: Card[]): Card[] {
  const rank = (c: Card) => CARD_CATEGORIES.indexOf(c.category)
  const best = new Map<string, Card>()
  for (const card of cards) {
    const held = best.get(card.id)
    if (!held || rank(card) < rank(held)) best.set(card.id, card)
  }
  return [...best.values()]
}

/** What is left to draw from a deck: everything in it that hasn't been kept. */
export const deckOf = (snap: DeckSnapshot, category: CardCategory): Card[] =>
  snap.cards.filter((c) => c.category === category && snap.states[c.id] !== 'kept')

/** The seen pile, newest first. All three decks keep into the same one. */
export const keptOf = (snap: DeckSnapshot): Card[] =>
  snap.cards.filter((c) => snap.states[c.id] === 'kept')

/**
 * Takes a card off a deck, preferring the ones drawn fewest times and breaking
 * ties at random.
 *
 * This is what makes "discard puts it back" behave the way it does at a table.
 * The card really is back in the pile, but everything else is dealt before it
 * comes round again — a discard that could be handed straight back reads as a
 * bug rather than as chance.
 */
export function takeOne(deck: Card[], draws: Record<string, number>): Card | null {
  if (!deck.length) return null
  const fewest = Math.min(...deck.map((c) => draws[c.id] ?? 0))
  const pool = deck.filter((c) => (draws[c.id] ?? 0) === fewest)
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Whether a deck has to be searched again. Two reasons, and both are about the
 * question having changed rather than the answer having expired: the cache is
 * old, or you are no longer standing where it was filled.
 */
export function isStale(
  snap: DeckSnapshot,
  category: CardCategory,
  at: CardLocation,
  now = Date.now(),
): boolean {
  const cards = snap.cards.filter((c) => c.category === category)
  if (!cards.length) return true
  if (!snap.location) return true
  if (metresBetween(snap.location, at) > CARD_REFETCH_METRES) return true
  // The freshest card in the deck is when the search that filled it ran.
  const newest = Math.max(...cards.map((c) => Date.parse(c.fetchedAt) || 0))
  return now - newest > CARD_CACHE_TTL_MS
}

/**
 * Folds a search's results into the snapshot. Cards already present keep their
 * state and draw count — a refill must never lose the seen pile — and are
 * updated in place so a renamed or moved place corrects itself.
 */
export function mergeCards(snap: DeckSnapshot, category: CardCategory, found: Card[]): Card[] {
  const fresh = new Map(found.map((c) => [c.id, c]))
  const kept = snap.cards.filter((c) => {
    // A card of this category that the search no longer returns is dropped,
    // unless it has been kept — the seen pile outlives the deck it came from.
    if (c.category !== category) return !fresh.has(c.id)
    return !fresh.has(c.id) && snap.states[c.id] === 'kept'
  })
  return dedupe([...kept, ...found])
}
