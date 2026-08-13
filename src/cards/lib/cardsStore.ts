/**
 * Card mode's storage, behind one interface — the same arrangement as
 * `lib/store.ts`, and deliberately a second one rather than four more methods
 * on that. The common case is a project where `schema.sql` has been run and
 * `cards.sql` has not, so the two have to be able to disagree about whether
 * the cloud is available.
 */
import { supabase } from '../../lib/supabase'
import { newId, type StoreMode } from '../../lib/store'
import type {
  Card,
  CardCategory,
  CardLocation,
  CardState,
  DeckSnapshot,
  DrawOutcome,
} from './types'
import { emptySnapshot } from './types'

export type CardsStore = {
  mode: StoreMode
  load(device: string): Promise<DeckSnapshot>
  saveLocation(device: string, location: CardLocation): Promise<void>
  /** Replaces one category's cards. Kept cards are folded in by the caller. */
  saveCards(device: string, category: CardCategory, cards: Card[]): Promise<void>
  /** One row per card: where it is, and how many times it has been dealt. The
   *  count is passed in rather than incremented here — the hook has already
   *  moved it optimistically, and this only has to catch up. */
  saveState(device: string, cardId: string, state: CardState, draws: number): Promise<void>
  /** The history, append-only. Separate from the count because a discard puts
   *  a card back — its state doesn't change, but it was still dealt. */
  logDraw(device: string, cardId: string, outcome: DrawOutcome): Promise<void>
  /** Puts a whole category back in the deck — the reshuffle. */
  resetCategory(device: string, category: CardCategory): Promise<void>
}

/* --------------------------------------------------------------- device id -- */

const DEVICE_KEY = 'itinerary.cards.device'

/**
 * There is no auth, so this is what a row belongs to. It scopes; it does not
 * secure — anyone holding the publishable key can read every device's cards,
 * exactly as they can read every board.
 */
export function deviceId(): string {
  const saved = localStorage.getItem(DEVICE_KEY)
  if (saved) return saved
  const made = newId()
  localStorage.setItem(DEVICE_KEY, made)
  return made
}

/* ------------------------------------------------------------- row shapes -- */

type Row = Record<string, unknown>

const cardFromRow = (r: Row): Card => ({
  id: r.place_id as string,
  category: (r.category as CardCategory) ?? 'trivia',
  name: (r.name as string) ?? '',
  where: (r.where_text as string) ?? '',
  lat: r.lat as number,
  lng: r.lng as number,
  rating: (r.rating as number | null) ?? null,
  url: (r.url as string) ?? '',
  fetchedAt: (r.fetched_at as string) ?? new Date(0).toISOString(),
})

const cardToRow = (device: string, c: Card): Row => ({
  device_id: device,
  place_id: c.id,
  category: c.category,
  name: c.name,
  where_text: c.where,
  lat: c.lat,
  lng: c.lng,
  rating: c.rating,
  url: c.url,
  fetched_at: c.fetchedAt,
})

const locationFromRow = (r: Row): CardLocation => ({
  lat: r.lat as number,
  lng: r.lng as number,
  label: (r.label as string) ?? '',
})

/* ---------------------------------------------------------- supabase store -- */

function assertOk(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function createCloudStore(client: NonNullable<typeof supabase>): CardsStore {
  return {
    mode: 'cloud',

    async load(device) {
      const [deck, places, states] = await Promise.all([
        client.from('card_decks').select('*').eq('device_id', device).maybeSingle(),
        client.from('card_places').select('*').eq('device_id', device),
        client.from('card_states').select('*').eq('device_id', device),
      ])
      assertOk(deck.error)
      assertOk(places.error)
      assertOk(states.error)

      const snap = emptySnapshot()
      if (deck.data) snap.location = locationFromRow(deck.data as Row)
      snap.cards = (places.data ?? []).map(cardFromRow)
      for (const row of (states.data ?? []) as Row[]) {
        snap.states[row.place_id as string] = row.state as CardState
        snap.draws[row.place_id as string] = (row.draws as number) ?? 0
      }
      return snap
    },

    async saveLocation(device, location) {
      assertOk(
        (
          await client.from('card_decks').upsert(
            {
              device_id: device,
              lat: location.lat,
              lng: location.lng,
              label: location.label,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'device_id' },
          )
        ).error,
      )
    },

    async saveCards(device, category, cards) {
      // The deck is replaced wholesale: a place the search stopped returning
      // should leave, and `mergeCards` has already decided what survives.
      assertOk(
        (
          await client
            .from('card_places')
            .delete()
            .eq('device_id', device)
            .eq('category', category)
        ).error,
      )
      if (!cards.length) return
      assertOk((await client.from('card_places').insert(cards.map((c) => cardToRow(device, c)))).error)
    },

    async saveState(device, cardId, state, draws) {
      assertOk(
        (
          await client
            .from('card_states')
            .upsert(
              { device_id: device, place_id: cardId, state, draws },
              { onConflict: 'device_id,place_id' },
            )
        ).error,
      )
    },

    async logDraw(device, cardId, outcome) {
      assertOk(
        (await client.from('card_draws').insert({ device_id: device, place_id: cardId, outcome }))
          .error,
      )
    },

    async resetCategory(device, category) {
      const { data, error } = await client
        .from('card_places')
        .select('place_id')
        .eq('device_id', device)
        .eq('category', category)
      assertOk(error)
      const ids = (data ?? []).map((r) => (r as Row).place_id as string)
      if (!ids.length) return
      assertOk(
        (await client.from('card_states').delete().eq('device_id', device).in('place_id', ids))
          .error,
      )
    },
  }
}

/* ------------------------------------------------------------- local store -- */
/* Keeps card mode fully usable before cards.sql is run — and offline. The
   `device` argument is ignored throughout: on this machine there is only ever
   one, and the parameter exists to keep the two stores the same shape. */

const LS_KEY = 'itinerary.cards.v1'

const readDb = (): DeckSnapshot => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? { ...emptySnapshot(), ...(JSON.parse(raw) as DeckSnapshot) } : emptySnapshot()
  } catch {
    return emptySnapshot()
  }
}

const writeDb = (snap: DeckSnapshot) => localStorage.setItem(LS_KEY, JSON.stringify(snap))

function mutate(fn: (snap: DeckSnapshot) => void) {
  const snap = readDb()
  fn(snap)
  writeDb(snap)
}

function createLocalStore(): CardsStore {
  return {
    mode: 'local',

    async load() {
      return readDb()
    },

    async saveLocation(_device, location) {
      mutate((s) => {
        s.location = location
      })
    },

    async saveCards(_device, category, cards) {
      mutate((s) => {
        s.cards = [...s.cards.filter((c) => c.category !== category), ...cards]
      })
    },

    async saveState(_device, cardId, state, draws) {
      mutate((s) => {
        s.states[cardId] = state
        s.draws[cardId] = draws
      })
    },

    /* Nothing reads the history back yet — it is kept so the decks can explain
       themselves later, and so a draw survives a discard that changes no state. */
    async logDraw() {},

    async resetCategory(_device, category) {
      mutate((s) => {
        for (const card of s.cards) {
          if (card.category === category) delete s.states[card.id]
        }
      })
    },
  }
}

/* ----------------------------------------------------------------- resolve -- */

let resolved: Promise<CardsStore> | null = null

/**
 * Prefers Supabase, falls back to localStorage when the project is unreachable
 * or `cards.sql` hasn't been run yet.
 *
 * Separate from `resolveStore()` on purpose: probing a board table would answer
 * "cloud" for a project that has the boards schema but not this one, and then
 * every card write would throw.
 */
export function resolveCardsStore(): Promise<CardsStore> {
  resolved ??= (async () => {
    if (!supabase) return createLocalStore()
    try {
      const { error } = await supabase.from('card_decks').select('device_id').limit(1)
      if (error) throw new Error(error.message)
      return createCloudStore(supabase)
    } catch (err) {
      console.warn(
        '[cards] Supabase unavailable — falling back to local storage. ' +
          'Run supabase/cards.sql to enable sync.',
        err,
      )
      return createLocalStore()
    }
  })()
  return resolved
}
