import { CATEGORY_COLOR, CATEGORY_LABEL } from '../lib/constants'
import type { Card } from '../lib/types'
import { IconCards } from '../../components/icons'

type Props = {
  card: Card
  onKeep: () => void
  onDiscard: () => void
  /** False while the card is still flying in, so the buttons can't be pressed
   *  before it has landed. */
  ready: boolean
}

/**
 * What goes *inside* the element Three is moving. Both faces are here, because
 * one element can only show one side: the back is turned 180° in CSS and both
 * hide their backface, so rotating the parent swaps them.
 *
 * Nothing here sets a transform or a transition on the card itself — that
 * element belongs to `CSS3DRenderer`.
 */
export function CardFace({ card, onKeep, onDiscard, ready }: Props) {
  return (
    <>
      <div className="card-face" data-side="front" data-color={CATEGORY_COLOR[card.category]}>
        <span className="card-kind">{CATEGORY_LABEL[card.category]}</span>
        <span className="card-name">{card.name}</span>
        <span className="card-where">{card.where}</span>

        <div className="card-actions">
          <button type="button" className="btn" disabled={!ready} onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="btn card-keep" disabled={!ready} onClick={onKeep}>
            Keep
          </button>
        </div>
      </div>

      <div className="card-face" data-side="back" aria-hidden>
        <IconCards size={34} />
      </div>
    </>
  )
}
