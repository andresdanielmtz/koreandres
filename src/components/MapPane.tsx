import { useEffect, useRef, useState } from 'react'
import { TRAVEL_MODE_LABEL, TRAVEL_MODES } from '../lib/constants'
import { isShortMapsUrl, MAPS_KEY_VAR, mapsSearchUrl } from '../lib/maps'
import type { TravelMode } from '../lib/types'
import { useGoogleMap, type MapRoute, type ResolvedPlace } from '../state/useGoogleMap'
import { IconExternal, IconPin, IconRoute } from './icons'

/** Which field the context menu asked to focus. On a commute block the two
 *  are the ends of the trip rather than a location and a link. */
export type MapField = 'place' | 'url'

/** The pane's commute half: two ends to edit, and how you're getting there. */
export type CommuteView = {
  /** `value` is what was typed, `hint` what the block worked out on its own —
   *  shown as the placeholder, so an inferred end still reads as an end. */
  from: { value: string; hint: string }
  to: { value: string; hint: string }
  mode: TravelMode
  /** Where to open the same trip in Maps proper. Empty when an end is unknown. */
  openUrl: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
  onMode: (mode: TravelMode) => void
}

/** What the pane is looking at. Derived from the selection by `Board`. */
export type MapView = {
  /** Identifies the subject, so the fields remount when the selection moves. */
  id: string
  title: string
  meta: string
  /** Raw text to look up: a pasted Maps link, coordinates, or a name. */
  query: string
  /** Where that already resolved to, when it has been looked up and saved. */
  lat: number | null
  lng: number | null
  zoom: number | null
  /** What the place ended up being called. */
  label: string
  /** The location field's value; empty for blocks that don't have one. */
  place: string
  url: string
  /** Null when the selected block has no location fields of its own to edit. */
  onPlace: ((value: string) => void) | null
  onUrl: ((value: string) => void) | null
  onResolved: ((place: ResolvedPlace) => void) | null
  /** Set only for a commute block, and it replaces the fields above. */
  commute: CommuteView | null
  /** The trip to draw. Null while either end is still unknown. */
  route: MapRoute | null
}

type Props = {
  view: MapView
  width: number
  theme: 'light' | 'dark'
  /** A new object each time asks for that field to take focus. */
  focus: { field: MapField } | null
}

export function MapPane({ view, width, theme, focus }: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { status, missing, route, routeError } = useGoogleMap(
    canvasRef,
    {
      key: view.id,
      query: view.query,
      lat: view.lat,
      lng: view.lng,
      zoom: view.zoom,
      onResolved: view.onResolved,
      route: view.route,
    },
    theme,
  )
  /* Nothing to look at, but there is a link — and it's one we can't follow. */
  const shortened = isShortMapsUrl(view.query)
  /** What to call the place: what it resolved to, else what was pasted. */
  const named = view.label || (shortened ? '' : view.query.trim())
  const placeRef = useRef<HTMLInputElement | null>(null)
  const urlRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!focus) return
    const el = focus.field === 'place' ? placeRef.current : urlRef.current
    el?.focus()
    el?.select()
  }, [focus])

  return (
    <aside className="map-pane" style={{ width }}>
      <div className="map-head">
        <div className="map-title">{view.title}</div>
        {view.meta && <div className="map-meta">{view.meta}</div>}
      </div>

      {view.commute ? (
        <div className="map-fields" key={view.id}>
          {/* An empty end is not a blank: the placeholder is the block it
              worked out for itself, and typing is how you overrule it. */}
          <Field
            label="From"
            inputRef={placeRef}
            value={view.commute.from.value}
            placeholder={view.commute.from.hint || 'Nothing before this'}
            onCommit={view.commute.onFrom}
          />
          <Field
            label="To"
            inputRef={urlRef}
            value={view.commute.to.value}
            placeholder={view.commute.to.hint || 'Nothing after this'}
            onCommit={view.commute.onTo}
          />

          <div className="segmented map-modes" role="group" aria-label="How you're travelling">
            {TRAVEL_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                data-active={mode === view.commute?.mode ? '' : undefined}
                onClick={() => view.commute?.onMode(mode)}
              >
                {TRAVEL_MODE_LABEL[mode]}
              </button>
            ))}
          </div>

          {route && (
            <div className="map-route">
              <IconRoute size={11} />
              <strong>{route.duration}</strong>
              {route.distance && <span>{route.distance}</span>}
              {route.via && <span className="map-via">{route.via}</span>}
            </div>
          )}
        </div>
      ) : (
        view.onPlace &&
        view.onUrl && (
          <div className="map-fields" key={view.id}>
            <Field
              label="Location"
              inputRef={placeRef}
              value={view.place}
              placeholder="Paste a Google Maps link"
              onCommit={view.onPlace}
            />
            <Field
              label="Link"
              inputRef={urlRef}
              value={view.url}
              placeholder="https://…"
              onCommit={view.onUrl}
            />
          </div>
        )
      )}

      <div className="map-frame">
        {/* The map is built into this element once and then flown around —
            it is deliberately never re-rendered by React. */}
        <div className="map-canvas" ref={canvasRef} />

        {status === 'no-key' && (
          <div className="map-note">
            <p>
              <strong>No Google Maps key.</strong> Add <code>{MAPS_KEY_VAR}</code> to{' '}
              <code>.env</code> and restart the dev server.
            </p>
            <p>
              It wants a Google Cloud API key with the <strong>Maps JavaScript API</strong>,
              the <strong>Geocoding API</strong> and — for commute blocks — the{' '}
              <strong>Directions API</strong> enabled. Only <code>VITE_</code>-prefixed
              variables reach the browser.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="map-note">
            <p>
              <strong>Google Maps didn't load.</strong> The console has the reason — usually a
              key with the wrong APIs enabled, or a referrer restriction that doesn't cover
              this origin.
            </p>
          </div>
        )}

        {status === 'ready' && view.commute && !view.route && (
          <div className="map-toast">
            {view.commute.from.hint || view.commute.from.value
              ? 'Nothing to travel to. Set a destination, or put a located block within two hours after this one.'
              : 'Nothing to travel from. Set a start, or put a located block within two hours before this one.'}
          </div>
        )}

        {status === 'ready' && routeError === 'none' && (
          <div className="map-toast">
            No {TRAVEL_MODE_LABEL[view.commute?.mode ?? 'transit'].toLowerCase()} route between
            these two — try another way of getting there.
          </div>
        )}

        {status === 'ready' && routeError === 'denied' && (
          <div className="map-toast">
            <strong>Directions API isn't enabled</strong> on this key. Turn it on in the Google
            Cloud console — the map itself needs no such thing, so everything else still works.
          </div>
        )}

        {status === 'ready' && routeError === 'failed' && (
          <div className="map-toast">Couldn't work out a route. The console has the reason.</div>
        )}

        {status === 'ready' && missing && !shortened && !view.commute && (
          <div className="map-toast">Couldn't find “{view.query.trim()}”</div>
        )}

        {status === 'ready' && shortened && !view.commute && (
          <div className="map-toast">
            A short Google Maps link can't be opened from the browser. Open it, then paste the
            full link it lands on — or just the name of the place.
          </div>
        )}
      </div>

      {view.commute?.openUrl && (
        <a className="map-open" href={view.commute.openUrl} target="_blank" rel="noreferrer">
          <IconRoute size={11} />
          <span>Directions in Maps</span>
          <IconExternal size={11} />
        </a>
      )}

      {/* With nothing to search for, the block's own link is still worth
          offering — following a short one is how you get the full link. */}
      {!view.commute && (named || view.query.trim() || view.url) && (
        <a
          className="map-open"
          href={named ? mapsSearchUrl(named) : view.query.trim() || view.url}
          target="_blank"
          rel="noreferrer"
        >
          <IconPin size={11} />
          <span>{named || hostOf(view.query.trim() || view.url)}</span>
          <IconExternal size={11} />
        </a>
      )}
    </aside>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

type FieldProps = {
  label: string
  value: string
  placeholder: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onCommit: (value: string) => void
}

/** Commits on blur or Enter rather than per keystroke — every commit is a
 *  write to the store and a fresh geocode on the frame below. */
function Field({ label, value, placeholder, inputRef, onCommit }: FieldProps) {
  const [draft, setDraft] = useState(value)
  const reverted = useRef(false)

  return (
    <label className="map-field">
      <span>{label}</span>
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          // `draft` is the value this render closed over, so Escape has to
          // latch rather than rely on the state it just set.
          if (reverted.current) {
            reverted.current = false
            return
          }
          if (draft.trim() !== value) onCommit(draft.trim())
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            reverted.current = true
            setDraft(value)
            e.currentTarget.blur()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}
