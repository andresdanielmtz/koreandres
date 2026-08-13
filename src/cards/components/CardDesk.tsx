import { useEffect, useRef, useState } from 'react'
import { CARD_DEAL_MS, CARD_FAN_COUNT, CARD_FLIP_MS, CARD_STACK_SHOWN } from '../lib/constants'
import { fetchPhotos } from '../lib/places'
import type { Card, CardCategory } from '../lib/types'
import type { Cards } from '../state/useCards'
import { useCardScene } from '../state/useCardScene'
import { CardTable } from './CardTable'
import type { PhotoState } from './CardFace'
import { DeckShelf } from './DeckShelf'
import { PhotoLightbox } from './PhotoLightbox'
import { SeenDeck } from './SeenDeck'

type Props = { cards: Cards }

/** A hand of face-down cards waiting to be picked from. */
type Hand = { category: CardCategory; ids: string[] }

/**
 * The table itself, mounted only once there is a location to deal around.
 *
 * That split is load-bearing rather than tidy: `useCardScene` builds on mount
 * and never rebuilds, so the host div has to be in the DOM on the very first
 * render of whatever calls it. Gating inside this component instead — an early
 * return for the location prompt — would run the build effect against a null
 * ref, and with no dependencies it would never get a second chance.
 *
 * Scene slots are keyed by a *slot* id rather than a place id, because the
 * face-down cards in a hand have no place behind them yet. Which card you drew
 * is decided at the moment you pick one, not when the hand is dealt.
 */
export function CardDesk({ cards }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const scene = useCardScene(hostRef)
  /** The drawn card can only be answered once it has landed. */
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hand, setHand] = useState<Hand | null>(null)
  /** The slot that was picked, and what turned out to be on it. */
  const [shown, setShown] = useState<{ slotId: string; card: Card } | null>(null)
  /* Photos are a request per place, so they are held for the session — putting
     a card back and drawing it again doesn't pay twice. Not persisted: what
     `getURI` hands back is a temporary URL, see `fetchPhotos`. */
  const [photos, setPhotos] = useState<Map<string, PhotoState>>(new Map())
  const [viewing, setViewing] = useState<{ id: string; index: number } | null>(null)
  const landing = useRef(0)
  /** Slot ids have to be fresh each round, or React reuses the last hand's. */
  const round = useRef(0)

  useEffect(() => () => window.clearTimeout(landing.current), [])

  const faces = new Map<string, Card>()
  if (shown) faces.set(shown.slotId, shown.card)

  const setPhoto = (id: string, state: PhotoState) =>
    setPhotos((m) => new Map(m).set(id, state))

  /** Fetched the moment a card is turned over. One request per place per
   *  session — a place drawn again is already held. */
  async function showPhotos(id: string) {
    const held = photos.get(id)
    if (held && held.kind !== 'failed') return
    setPhoto(id, { kind: 'loading' })
    const found = await fetchPhotos(id)
    if (typeof found === 'string') setPhoto(id, { kind: 'failed', denied: found === 'denied' })
    else setPhoto(id, { kind: 'ready', photos: found })
  }

  const openPhotos = viewing && photos.get(viewing.id)
  const open = openPhotos?.kind === 'ready' ? openPhotos.photos : null

  /* ---------------------------------------------------------- the round -- */

  /** Deals a hand out of a deck. Nothing is drawn yet — these are backs. */
  function take(category: CardCategory) {
    if (hand || shown) return
    const n = Math.min(CARD_FAN_COUNT, cards.deckSize(category))
    if (!n) return
    round.current += 1
    const ids = Array.from({ length: n }, (_, i) => `hand${round.current}:${i}`)
    scene.fanOut(ids)
    setHand({ category, ids })
  }

  /** Turns the picked card over. This is where the deck is actually drawn. */
  function pick(slotId: string) {
    if (!hand || shown) return
    const card = cards.draw(hand.category)
    if (!card) return

    setShown({ slotId, card })
    setHand(null)
    setReady(false)
    // Started with the flip rather than waited for, so the photos are usually
    // there by the time the card lands.
    void showPhotos(card.id)
    scene.deal(slotId)
    // The rest of the hand goes back where it came from, and out of the scene
    // once it gets there.
    for (const id of hand.ids) {
      if (id !== slotId) scene.toDeck(id, () => scene.remove(id))
    }
    window.clearTimeout(landing.current)
    landing.current = window.setTimeout(() => setReady(true), CARD_DEAL_MS + CARD_FLIP_MS)
  }

  function answer(resolve: () => Card | null, to: 'pile' | 'deck') {
    if (!shown) return
    const slotId = shown.slotId
    if (!resolve()) return
    setReady(false)
    setShown(null)
    const done = () => scene.remove(slotId)
    if (to === 'pile') scene.toPile(slotId, Math.min(cards.kept.length, CARD_STACK_SHOWN), done)
    else scene.toDeck(slotId, done)
  }

  /**
   * Drags the card around the table like a window. Same plumbing as the
   * board's `startDrag`: window listeners, and nothing moves until the pointer
   * clears 3px, so a click on the card stays a click.
   *
   * The whole face is a handle, so anything that answers a press of its own is
   * excluded here rather than by where the listener sits — otherwise pressing
   * Keep would also start a drag, and a photo could never be opened.
   *
   * Deltas are cumulative from the grab, added to where the card already was,
   * which is why a drag can't accumulate rounding. One CSS pixel is one world
   * unit — that is what the camera distance is set up for — so the card keeps
   * pace with the pointer exactly. Y is negated: the scene's is up.
   */
  function grab(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a, input')) return
    const startX = e.clientX
    const startY = e.clientY
    const from = scene.offsetOf(id)
    let moved = false

    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return
      if (!moved) {
        moved = true
        setDragging(true)
      }
      scene.dragTo(id, from.x + (ev.clientX - startX), from.y - (ev.clientY - startY))
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDragging(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return (
    <div className="cards-body" data-dragging={dragging ? '' : undefined}>
      <div className="cards-main">
        <CardTable
          hostRef={hostRef}
          mounted={scene.mounted}
          faces={faces}
          photos={photos}
          ready={ready}
          empty="Take a card from one of the decks below."
          onPick={pick}
          onKeep={() => answer(cards.keep, 'pile')}
          onDiscard={() => answer(cards.discard, 'deck')}
          onOpenPhoto={(id, index) => setViewing({ id, index })}
          onGrab={grab}
        />
        <DeckShelf
          cards={cards}
          canDraw={!hand && !shown}
          picking={hand?.category ?? null}
          onTake={take}
        />
      </div>

      <SeenDeck kept={cards.kept} />

      {viewing && open && (
        <PhotoLightbox
          photos={open}
          index={viewing.index}
          title={shown?.card.name ?? ''}
          onIndex={(index) => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
