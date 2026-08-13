import { useEffect, useRef, useState } from 'react'
import { CARD_DEAL_MS, CARD_FLIP_MS, CARD_STACK_SHOWN } from '../lib/constants'
import { fetchPhotos } from '../lib/places'
import type { Card, CardCategory } from '../lib/types'
import type { Cards } from '../state/useCards'
import { useCardScene } from '../state/useCardScene'
import { CardTable } from './CardTable'
import type { PhotoState } from './CardFace'
import { DeckShelf } from './DeckShelf'
import { SeenDeck } from './SeenDeck'

type Props = { cards: Cards }

/**
 * The table itself, mounted only once there is a location to deal around.
 *
 * That split is load-bearing rather than tidy: `useCardScene` builds on mount
 * and never rebuilds, so the host div has to be in the DOM on the very first
 * render of whatever calls it. Gating inside this component instead — an early
 * return for the location prompt — would run the build effect against a null
 * ref, and with no dependencies it would never get a second chance.
 */
export function CardDesk({ cards }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const scene = useCardScene(hostRef)
  /** The drawn card can only be answered once it has landed. */
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  /* Photos are a request per card, so they are held for the session — putting
     a card back and drawing it again doesn't pay twice. Not persisted: what
     `getURI` hands back is a temporary URL, see `fetchPhotos`. */
  const [photos, setPhotos] = useState<Map<string, PhotoState>>(new Map())
  const landing = useRef(0)

  const byId = new Map(cards.snapshot.cards.map((c) => [c.id, c]))

  useEffect(() => () => window.clearTimeout(landing.current), [])

  // A card is only in the scene while it is being looked at. The decks and the
  // seen pile are counts and a list, not stacks of objects — there is no reason
  // to build twenty elements to deal one of them.
  function take(category: CardCategory) {
    const card = cards.draw(category)
    if (!card) return
    setReady(false)
    scene.add(card.id, 'deck')
    // One frame, so the object exists at the deck before it is told to leave.
    requestAnimationFrame(() => scene.deal(card.id))
    window.clearTimeout(landing.current)
    landing.current = window.setTimeout(() => setReady(true), CARD_DEAL_MS + CARD_FLIP_MS)
  }

  const setPhoto = (id: string, state: PhotoState) =>
    setPhotos((m) => new Map(m).set(id, state))

  async function showPhotos(id: string) {
    if (photos.get(id)?.kind === 'loading') return
    setPhoto(id, { kind: 'loading' })
    const found = await fetchPhotos(id)
    if (typeof found === 'string') setPhoto(id, { kind: 'failed', denied: found === 'denied' })
    else setPhoto(id, { kind: 'ready', urls: found })
  }

  /**
   * Drags the card around the table like a window. Same plumbing as the
   * board's `startDrag`: window listeners, and nothing moves until the pointer
   * clears 3px, so a click on the card stays a click.
   *
   * Deltas are cumulative from the grab, added to where the card already was,
   * which is why a drag can't accumulate rounding. One CSS pixel is one world
   * unit — that is what the camera distance is set up for — so the card keeps
   * pace with the pointer exactly. Y is negated: the scene's is up.
   */
  function grab(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return
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

  function answer(resolve: () => Card | null, to: 'pile' | 'deck') {
    const card = resolve()
    if (!card) return
    setReady(false)
    const done = () => scene.remove(card.id)
    if (to === 'pile') scene.toPile(card.id, Math.min(cards.kept.length, CARD_STACK_SHOWN), done)
    else scene.toDeck(card.id, done)
  }

  return (
    <div className="cards-body" data-dragging={dragging ? '' : undefined}>
      <div className="cards-main">
        <CardTable
          hostRef={hostRef}
          mounted={scene.mounted}
          cards={byId}
          drawn={cards.drawn?.id ?? null}
          ready={ready}
          empty="Take a card from one of the decks below."
          photos={photos}
          onKeep={() => answer(cards.keep, 'pile')}
          onDiscard={() => answer(cards.discard, 'deck')}
          onPhotos={(id) => void showPhotos(id)}
          onGrab={grab}
        />
        <DeckShelf cards={cards} canDraw={!cards.drawn} onTake={take} />
      </div>

      <SeenDeck kept={cards.kept} />
    </div>
  )
}
