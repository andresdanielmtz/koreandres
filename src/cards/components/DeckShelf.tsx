import { IconCards } from '../../components/icons'
import { CARD_CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL } from '../lib/constants'
import type { CardCategory, CardsError } from '../lib/types'
import type { Cards } from '../state/useCards'

/* One sentence per failure, and the `denied` one is the same sentence the map
   pane already uses — it is the same missing enablement. */
const TROUBLE: Record<CardsError, string> = {
  denied:
    'Places API (New) isn’t enabled on this key. It is a separate one from the three the map uses — turn it on in the Google Cloud console.',
  failed: 'Couldn’t fill this deck. The console has why.',
}

type Props = {
  cards: Cards
  /** False while a hand is out or a card is on the table — one round at a time
   *  is what makes keep and discard unambiguous. */
  canDraw: boolean
  /** Which deck has a hand out, if any — only that one says so. */
  picking: CardCategory | null
  onTake: (category: CardCategory) => void
}

export function DeckShelf({ cards, canDraw, picking, onTake }: Props) {
  return (
    <div className="deck-shelf">
      {CARD_CATEGORIES.map((category) => {
        const size = cards.deckSize(category)
        const { filling, error } = cards.status[category]
        const empty = !size && !filling

        return (
          <div
            key={category}
            className="deck"
            data-color={CATEGORY_COLOR[category]}
            data-error={error ? '' : undefined}
          >
            <div className="deck-head">
              <span className="deck-name">{CATEGORY_LABEL[category]}</span>
              <span className="deck-count">{filling ? '…' : size}</span>
            </div>

            <button
              type="button"
              className="deck-take"
              disabled={!canDraw || filling || !size}
              onClick={() => onTake(category)}
            >
              <IconCards size={14} />
              {picking === category ? 'Pick one' : 'Take one'}
            </button>

            {error ? (
              <p className="deck-note">{TROUBLE[error]}</p>
            ) : empty ? (
              <button type="button" className="deck-note" onClick={() => cards.reshuffle(category)}>
                Nothing left. Put the kept ones back?
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
