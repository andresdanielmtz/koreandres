/**
 * Card mode's state: the decks, what has been drawn, and the writes behind it.
 *
 * The write discipline is `useItinerary`'s — a `snapRef` mirror that is current
 * within the same tick, and a queue keyed by entity so a burst collapses into
 * one round trip. The reasons are the same, and so is the 200ms.
 *
 * It lives in `App` rather than in the section, so the decks and the card on
 * the table survive switching to the board and back. `active` is what keeps a
 * user who never opens cards from probing Supabase or billing a Places search.
 */
import { useEffect, useRef, useState } from 'react'
import { hasMapsKey } from '../../lib/maps'
import { CARD_CATEGORIES, CARD_RADIUS_DEFAULT } from '../lib/constants'
import { deckOf, isStale, keptOf, mergeCards, takeOne } from '../lib/deck'
import { searchDeck } from '../lib/places'
import { deviceId, resolveCardsStore, type CardsStore } from '../lib/cardsStore'
import { emptySnapshot } from '../lib/types'
import type {
  Card,
  CardCategory,
  CardLocation,
  CardsError,
  DeckSnapshot,
  LocationError,
} from '../lib/types'

export type DeckStatus = { filling: boolean; error: CardsError | null }

const noStatus = (): DeckStatus => ({ filling: false, error: null })

export function useCards(active: boolean) {
  const [store, setStore] = useState<CardsStore | null>(null)
  const [snapshot, setSnapshotState] = useState<DeckSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [drawn, setDrawn] = useState<Card | null>(null)
  const [status, setStatus] = useState<Record<CardCategory, DeckStatus>>({
    restaurant: noStatus(),
    attraction: noStatus(),
    trivia: noStatus(),
  })
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<LocationError | null>(null)

  /* A mirror of `snapshot` that is always current within the same tick, so a
     keep can read what the draw before it wrote. */
  const snapRef = useRef<DeckSnapshot>(emptySnapshot())
  const queue = useRef(new Map<string, () => Promise<void>>())
  const timer = useRef<number | null>(null)
  const device = useRef<string>('')
  /* Which searches are in the air. A ref rather than `status`, because a
     sequence of fills would each read the state of the render that started it
     and every one of them would think it was the first. */
  const filling = useRef(new Set<CardCategory>())

  function setSnapshot(next: DeckSnapshot) {
    snapRef.current = next
    setSnapshotState(next)
  }

  function patch(fn: (s: DeckSnapshot) => DeckSnapshot) {
    setSnapshot(fn(snapRef.current))
  }

  function flush() {
    timer.current = null
    const tasks = [...queue.current.values()]
    queue.current.clear()
    if (!tasks.length) return
    void (async () => {
      try {
        for (const task of tasks) await task()
      } catch (err) {
        console.error('[cards] write failed', err)
      }
    })()
  }

  /** Coalesces writes per entity, the same way the board's do. */
  function enqueue(key: string, task: () => Promise<void>) {
    queue.current.set(key, task)
    if (timer.current === null) timer.current = window.setTimeout(flush, 200)
  }

  /* ----------------------------------------------------------- bootstrap -- */

  useEffect(() => {
    if (!active || store) return
    let cancelled = false
    void (async () => {
      const s = await resolveCardsStore()
      if (cancelled) return
      device.current = deviceId()
      const loaded = await s.load(device.current)
      if (cancelled) return
      setStore(s)
      setSnapshot(loaded)
      setLoading(false)
    })().catch((err) => {
      console.error('[cards] bootstrap failed', err)
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  /* ------------------------------------------------------------ location -- */

  async function setLocation(next: CardLocation) {
    setLocateError(null)
    patch((s) => ({ ...s, location: next }))
    if (store) enqueue('loc', () => store.saveLocation(device.current, next))
  }

  /** Back to the gate. The cards stay: if you come back to the same place the
   *  cache is still good, and if you don't, `isStale` says so. */
  function clearLocation() {
    setLocateError(null)
    patch((s) => ({ ...s, location: null }))
  }

  async function locateWith(run: () => Promise<CardLocation | LocationError>) {
    setLocating(true)
    const found = await run()
    setLocating(false)
    if (typeof found === 'string') {
      setLocateError(found)
      return
    }
    await setLocation(found)
  }

  /* --------------------------------------------------------------- decks -- */

  /**
   * Fills one deck, cache first. A category is only searched when the cache is
   * missing, older than the window, or filled somewhere you no longer are —
   * every one of these is a billed request.
   */
  async function fill(category: CardCategory, force = false) {
    const at = snapRef.current.location
    if (!at || !store || !hasMapsKey) return
    if (filling.current.has(category)) return
    if (!force && !isStale(snapRef.current, category, at)) return

    filling.current.add(category)
    setStatus((s) => ({ ...s, [category]: { filling: true, error: null } }))
    const found = await searchDeck(at, CARD_RADIUS_DEFAULT, category)
    filling.current.delete(category)

    if (typeof found === 'string') {
      setStatus((s) => ({ ...s, [category]: { filling: false, error: found } }))
      return
    }

    const cards = mergeCards(snapRef.current, category, found)
    patch((s) => ({ ...s, cards }))
    setStatus((s) => ({ ...s, [category]: noStatus() }))
    // What actually landed in this category after the dedupe, which is what
    // the row set has to match.
    const mine = cards.filter((c) => c.category === category)
    enqueue(`deck:${category}`, () => store.saveCards(device.current, category, mine))
  }

  /* Fills whatever is stale once there is a location to fill it from. Three
     requests on a cold open, then none for a month — a deck whose "Take one"
     is disabled with no counts to explain it is worse than the first search.
     One at a time rather than in parallel: they are billed, and a location
     changed halfway through should stop the ones that haven't gone yet. */
  useEffect(() => {
    if (!active || !store || !snapshot.location) return
    let cancelled = false
    void (async () => {
      for (const category of CARD_CATEGORIES) {
        if (cancelled) return
        await fill(category)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, store, snapshot.location?.lat, snapshot.location?.lng])

  /** Deals one card. Nothing happens while another is still on the table. */
  function draw(category: CardCategory): Card | null {
    if (drawn) return null
    const card = takeOne(deckOf(snapRef.current, category), snapRef.current.draws)
    if (!card) {
      void fill(category)
      return null
    }
    const draws = (snapRef.current.draws[card.id] ?? 0) + 1
    patch((s) => ({ ...s, draws: { ...s.draws, [card.id]: draws } }))
    setDrawn(card)
    if (store) {
      const state = snapRef.current.states[card.id] ?? 'deck'
      enqueue(`card:${card.id}`, () => store.saveState(device.current, card.id, state, draws))
    }
    return card
  }

  /** Keeps the card on the table. It leaves its deck for the seen pile. */
  function keep(): Card | null {
    const card = drawn
    if (!card) return null
    const draws = snapRef.current.draws[card.id] ?? 0
    patch((s) => ({ ...s, states: { ...s.states, [card.id]: 'kept' } }))
    setDrawn(null)
    if (store) {
      enqueue(`card:${card.id}`, () => store.saveState(device.current, card.id, 'kept', draws))
      enqueue(`draw:${card.id}`, () => store.logDraw(device.current, card.id, 'kept'))
    }
    return card
  }

  /**
   * Puts the card back. Its state doesn't change — it never left the deck —
   * so the only record is the draw count that already went up, and the log.
   */
  function discard(): Card | null {
    const card = drawn
    if (!card) return null
    setDrawn(null)
    if (store) enqueue(`draw:${card.id}`, () => store.logDraw(device.current, card.id, 'discarded'))
    return card
  }

  /** Puts a whole category's kept cards back in its deck. */
  function reshuffle(category: CardCategory) {
    const ids = snapRef.current.cards.filter((c) => c.category === category).map((c) => c.id)
    patch((s) => {
      const states = { ...s.states }
      for (const id of ids) delete states[id]
      return { ...s, states }
    })
    if (store) {
      enqueue(`reset:${category}`, () => store.resetCategory(device.current, category))
    }
  }

  return {
    mode: store?.mode ?? 'local',
    loading,
    snapshot,
    status,
    drawn,
    locating,
    locateError,
    kept: keptOf(snapshot),
    deckSize: (category: CardCategory) => deckOf(snapshot, category).length,
    setLocation,
    clearLocation,
    locateWith,
    fill,
    draw,
    keep,
    discard,
    reshuffle,
  }
}

export type Cards = ReturnType<typeof useCards>
