import { createPortal } from 'react-dom'
import type { Card } from '../lib/types'
import { CardFace, type PhotoState } from './CardFace'

const IDLE: PhotoState = { kind: 'idle' }

type Props = {
  /** The div the renderer appends its layer into. Owned by `CardDesk`, which
   *  is where the scene is built — the host has to exist before the hook that
   *  observes it runs. */
  hostRef: React.RefObject<HTMLDivElement | null>
  /** The scene's portal targets: one element per card with an object in it. */
  mounted: { id: string; el: HTMLElement }[]
  cards: Map<string, Card>
  drawn: string | null
  /** True once the drawn card has landed, which is when it can be answered. */
  ready: boolean
  empty: React.ReactNode
  /** Photos per card id, so a card put back and drawn again keeps them. */
  photos: Map<string, PhotoState>
  onKeep: () => void
  onDiscard: () => void
  onPhotos: (id: string) => void
  onGrab: (e: React.PointerEvent, id: string) => void
}

/**
 * The scene's host.
 *
 * `.card-stage` is the renderer's and holds nothing React rendered; anything
 * React draws over the table is a sibling of it, never a child. That
 * separation is not tidiness — React and `CSS3DRenderer` both insert and
 * remove children, and sharing one parent between them makes React try to
 * remove a node whose parent has moved underneath it. It throws
 * `removeChild: The node to be removed is not a child of this node`, and
 * because there is no error boundary it takes the whole app down.
 *
 * The card *contents* are portalled into the elements the scene made for them,
 * which is safe for the mirror-image reason — see the note in `useCardScene`.
 */
export function CardTable({
  hostRef,
  mounted,
  cards,
  drawn,
  ready,
  empty,
  photos,
  onKeep,
  onDiscard,
  onPhotos,
  onGrab,
}: Props) {
  return (
    <div className="card-table">
      <div ref={hostRef} className="card-stage" />

      {!mounted.length && <div className="card-table-empty">{empty}</div>}

      {mounted.map((slot) => {
        const card = cards.get(slot.id)
        if (!card) return null
        return createPortal(
          <CardFace
            card={card}
            ready={ready && drawn === slot.id}
            photos={photos.get(slot.id) ?? IDLE}
            onKeep={onKeep}
            onDiscard={onDiscard}
            onPhotos={() => onPhotos(slot.id)}
            onGrab={(e) => onGrab(e, slot.id)}
          />,
          slot.el,
          slot.id,
        )
      })}
    </div>
  )
}
