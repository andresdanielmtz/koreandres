import { useState } from 'react'
import { deviceLocation, locationFromText } from '../lib/location'
import type { Cards } from '../state/useCards'
import type { LocationError } from '../lib/types'

const REASON: Record<LocationError, string> = {
  denied: 'Location permission was refused. Type where you are instead.',
  unavailable:
    'Couldn’t get a fix. Geolocation also needs a secure origin, so it is off over plain http.',
  notfound: 'Nothing found for that. A place name, a lat,lng, or a long Google Maps link.',
}

type Props = { cards: Cards }

/**
 * Asked once, then remembered. The text field is shown from the first frame
 * rather than after a failure: geolocation is refused outright on a non-secure
 * origin and a dismissed prompt never resolves, so a gate that waits on the
 * button is a gate that hangs.
 */
export function LocationGate({ cards }: Props) {
  const [text, setText] = useState('')

  return (
    <div className="gate">
      <div className="gate-inner">
        <h2>Where are you?</h2>
        <p>The decks are dealt from what is around you, so they need a starting point.</p>

        <button
          type="button"
          className="deck-take"
          disabled={cards.locating}
          onClick={() => void cards.locateWith(deviceLocation)}
        >
          {cards.locating ? 'Locating…' : 'Use my location'}
        </button>

        <span className="gate-sep">or</span>

        <form
          className="gate-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) void cards.locateWith(() => locationFromText(text))
          }}
        >
          <input
            value={text}
            placeholder="Hongdae, Seoul"
            spellCheck={false}
            aria-label="Where you are"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="deck-take" disabled={!text.trim() || cards.locating}>
            Set
          </button>
        </form>

        {cards.locateError && (
          <p className="gate-note" data-error="">
            {REASON[cards.locateError]}
          </p>
        )}
      </div>
    </div>
  )
}
