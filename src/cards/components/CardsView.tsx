import { hasMapsKey, MAPS_KEY_VAR } from '../../lib/maps'
import type { Cards } from '../state/useCards'
import { CardDesk } from './CardDesk'
import { LocationGate } from './LocationGate'
import '../cards.css'

type Props = { cards: Cards }

/**
 * The section root, and nothing but the gating. The table lives in `CardDesk`
 * so that the scene's host is present on its first render — see the note
 * there; an early return in front of the host is what breaks it.
 */
export function CardsView({ cards }: Props) {
  if (!hasMapsKey) {
    return (
      <div className="cards">
        <div className="gate">
          <div className="gate-inner">
            <h2>No Google Maps key</h2>
            <p>
              Card mode is dealt from Places, and the typed fallback needs the geocoder. Set{' '}
              <code>{MAPS_KEY_VAR}</code> and reload.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (cards.loading) return <div className="boot">Loading cards…</div>

  return (
    <div className="cards">
      {cards.snapshot.location ? (
        <>
          <div className="cards-head">
            <span className="cards-where">
              Around <strong>{cards.snapshot.location.label}</strong>
            </span>
            <button type="button" className="btn" onClick={cards.clearLocation}>
              Somewhere else
            </button>
          </div>
          <CardDesk cards={cards} />
        </>
      ) : (
        <LocationGate cards={cards} />
      )}
    </div>
  )
}
