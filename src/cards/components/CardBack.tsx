import { IconCards } from '../../components/icons'

type Props = {
  /** Absent once the hand has been picked from, which freezes the rest. */
  onPick?: () => void
  label?: string
}

/**
 * A face-down card.
 *
 * Only the back is rendered — the card object is turned π about Y, so the front
 * would be hidden by `backface-visibility` anyway, but leaving it out means the
 * place's name isn't sitting in the DOM of a card you haven't turned over.
 * These are not the cards you are choosing between; which one you picked is
 * decided when you pick it.
 */
export function CardBack({ onPick, label }: Props) {
  return (
    <button
      type="button"
      className="card-face"
      data-side="back"
      disabled={!onPick}
      aria-label={label}
      onClick={onPick}
    >
      <IconCards size={40} />
    </button>
  )
}
