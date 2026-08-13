import { useEffect, useRef, useState } from 'react'
import { CARD_DEAL_MS, CARD_FLIP_MS, CARD_STACK_SHOWN } from '../lib/constants'
import type { Card, CardCategory } from '../lib/types'
import type { Cards } from '../state/useCards'
import { useCardScene } from '../state/useCardScene'
import { CardTable } from './CardTable'
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

  function answer(resolve: () => Card | null, to: 'pile' | 'deck') {
    const card = resolve()
    if (!card) return
    setReady(false)
    const done = () => scene.remove(card.id)
    if (to === 'pile') scene.toPile(card.id, Math.min(cards.kept.length, CARD_STACK_SHOWN), done)
    else scene.toDeck(card.id, done)
  }

  return (
    <div className="cards-body">
      <div className="cards-main">
        <CardTable
          hostRef={hostRef}
          mounted={scene.mounted}
          cards={byId}
          drawn={cards.drawn?.id ?? null}
          ready={ready}
          empty="Take a card from one of the decks below."
          onKeep={() => answer(cards.keep, 'pile')}
          onDiscard={() => answer(cards.discard, 'deck')}
        />
        <DeckShelf cards={cards} canDraw={!cards.drawn} onTake={take} />
      </div>

      <SeenDeck kept={cards.kept} />
    </div>
  )
}
