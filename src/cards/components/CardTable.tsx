import { createPortal } from 'react-dom'
import type { Card } from '../lib/types'
import { CardBack } from './CardBack'
import { CardFace, type PhotoState } from './CardFace'

const IDLE: PhotoState = { kind: 'idle' }

type Props = {
  /** The div the renderer appends its layer into. Owned by `CardDesk`, which
   *  is where the scene is built — the host has to exist before the hook that
   *  observes it runs. */
  hostRef: React.RefObject<HTMLDivElement | null>
  /** The scene's portal targets: one element per card with an object in it. */
  mounted: { id: string; el: HTMLElement }[]
  /** What each slot is showing. A slot with no card is still face down. */
  faces: Map<string, Card>
  /** Photos per *place* id — they belong to the place, not to the slot. */
  photos: Map<string, PhotoState>
  /** True once the revealed card has landed, which is when it can be answered. */
  ready: boolean
  empty: React.ReactNode
  onPick: (slotId: string) => void
  onKeep: () => void
  onDiscard: () => void
  onOpenPhoto: (id: string, index: number) => void
  onGrab: (e: React.PointerEvent, slotId: string) => void
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
  faces,
  photos,
  ready,
  empty,
  onPick,
  onKeep,
  onDiscard,
  onOpenPhoto,
  onGrab,
}: Props) {
  return (
    <div className="card-table">
      <div ref={hostRef} className="card-stage" />

      {!mounted.length && <div className="card-table-empty">{empty}</div>}

      {mounted.map((slot, i) => {
        const card = faces.get(slot.id)
        return createPortal(
          card ? (
            <CardFace
              card={card}
              ready={ready}
              photos={photos.get(card.id) ?? IDLE}
              onKeep={onKeep}
              onDiscard={onDiscard}
              onOpenPhoto={(index) => onOpenPhoto(card.id, index)}
              onGrab={(e) => onGrab(e, slot.id)}
            />
          ) : (
            <CardBack
              label={`Take this card (${i + 1} of ${mounted.length})`}
              onPick={() => onPick(slot.id)}
            />
          ),
          slot.el,
          slot.id,
        )
      })}
    </div>
  )
}
