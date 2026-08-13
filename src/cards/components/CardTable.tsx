import { createPortal } from 'react-dom'
import type { Card } from '../lib/types'
import { CardFace } from './CardFace'

type Props = {
  /** The div the renderer appends its layer into. Owned by the section, which
   *  is also where the scene is built — the host has to exist before the hook
   *  that observes it runs. */
  hostRef: React.RefObject<HTMLDivElement | null>
  /** The scene's portal targets: one element per card with an object in it. */
  mounted: { id: string; el: HTMLElement }[]
  cards: Map<string, Card>
  drawn: string | null
  /** True once the drawn card has landed, which is when it can be answered. */
  ready: boolean
  empty: React.ReactNode
  onKeep: () => void
  onDiscard: () => void
}

/**
 * The scene's host. `.card-table` is a bare div and React never touches the
 * subtree the renderer puts inside it. What React does own is the *content* of
 * each card, rendered through a portal into the element the scene made for it
 * — see the note at the top of `useCardScene.ts`.
 */
export function CardTable({
  hostRef,
  mounted,
  cards,
  drawn,
  ready,
  empty,
  onKeep,
  onDiscard,
}: Props) {
  return (
    <div ref={hostRef} className="card-table">
      {!mounted.length && <div className="card-table-empty">{empty}</div>}

      {mounted.map((slot) => {
        const card = cards.get(slot.id)
        if (!card) return null
        return createPortal(
          <CardFace
            card={card}
            ready={ready && drawn === slot.id}
            onKeep={onKeep}
            onDiscard={onDiscard}
          />,
          slot.el,
          slot.id,
        )
      })}
    </div>
  )
}
