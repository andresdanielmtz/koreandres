import { mapsSearchUrl } from '../../lib/maps'
import type { Card } from '../lib/types'

type Props = { kept: Card[] }

/** The kept pile, as a list you can actually open. All three decks keep into
 *  the same one — what you liked isn't sorted by what kind of place it was. */
export function SeenDeck({ kept }: Props) {
  return (
    <aside className="seen-deck">
      <div className="seen-head">
        <span>Seen</span>
        <span>{kept.length}</span>
      </div>

      {kept.length ? (
        <ul className="seen-list">
          {kept.map((card) => (
            <li key={card.id}>
              <a href={card.url || mapsSearchUrl(card.name)} target="_blank" rel="noreferrer">
                <span className="seen-name">{card.name}</span>
                <span className="seen-where">{card.where}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="seen-none">Nothing kept yet. Take a card and decide.</p>
      )}
    </aside>
  )
}
