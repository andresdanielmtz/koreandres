import { useEffect, useRef, useState } from 'react'
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_FLIGHT_DIP,
  MAP_FLIGHT_DIP_MAX,
  MAP_FLIGHT_MS,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_POINT_ZOOM,
  MAP_ZOOM_BACKOFF,
} from '../lib/constants'
import {
  hasMapsKey,
  labelFor,
  loadMaps,
  mapIdFor,
  parseLatLng,
  queryFor,
  usesColorScheme,
  zoomForBounds,
} from '../lib/maps'
import { clamp } from '../lib/time'

export type MapStatus = 'no-key' | 'loading' | 'ready' | 'error'

/** What a pasted location turned out to be. This is what gets saved. */
export type ResolvedPlace = {
  label: string
  lat: number
  lng: number
  zoom: number
}

export type MapPlace = {
  /** Identifies the block, so a slow answer lands on the right one. */
  key: string
  /** What was pasted. Resolved only while the coordinates below are empty. */
  query: string
  lat: number | null
  lng: number | null
  zoom: number | null
  /** Called once, when a lookup succeeds, so the answer can be stored. */
  onResolved: ((place: ResolvedPlace) => void) | null
}

/** Where the camera should end up: a point, and how close to stand to it. */
type Camera = { center: google.maps.LatLngLiteral; zoom: number }

const HOME: Camera = { center: MAP_DEFAULT_CENTER, zoom: MAP_DEFAULT_ZOOM }

/**
 * The pan and the zoom are eased apart. A brisk pan reads as purposeful, but
 * the same curve on the zoom is what makes a hop flash — scale changes are far
 * more noticeable than movement — so the zoom gets the gentler of the two.
 */
const easePan = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeZoom = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2

/**
 * One live map for the life of the pane. Handing it a new place moves the
 * camera there rather than rebuilding anything — which is the whole reason
 * this isn't an Embed API iframe.
 *
 * A block that already carries coordinates is flown to directly. Only a place
 * that has never been resolved costs a geocode, and the answer goes back up
 * through `onResolved` to be saved, so it costs one exactly once.
 */
export function useGoogleMap(
  containerRef: React.RefObject<HTMLElement | null>,
  place: MapPlace,
  theme: 'light' | 'dark',
) {
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)
  const cache = useRef(new Map<string, ResolvedPlace | null>())
  const frame = useRef(0)

  /* Read after an await, where the render that started it is long gone. */
  const resolvedRef = useRef(place.onResolved)
  useEffect(() => {
    resolvedRef.current = place.onResolved
  })

  const [status, setStatus] = useState<MapStatus>(hasMapsKey ? 'loading' : 'no-key')
  /** Bumped every time the map is (re)built, to re-run the flight below. */
  const [built, setBuilt] = useState(0)
  /** The text a lookup came back empty for, so the message can go away by
   *  itself once the location is edited into something findable. */
  const [failed, setFailed] = useState<string | null>(null)

  /** Ask Google what is at a point, for something to call it. */
  async function describe(point: google.maps.LatLngLiteral): Promise<string> {
    try {
      const { results } = await geocoderRef.current!.geocode({ location: point })
      return results[0]?.formatted_address ?? ''
    } catch {
      return ''
    }
  }

  /** Pasted text → a place worth saving. Null if it can't be found. */
  async function resolve(input: string): Promise<ResolvedPlace | null> {
    const cached = cache.current.get(input)
    if (cached !== undefined) return cached

    const query = queryFor(input)
    const el = containerRef.current
    if (!query || !geocoderRef.current || !el) return null

    // What it's called is known before anything is looked up, unless what was
    // pasted was a bare point — then Google has to say what's there.
    const label = labelFor(input)

    const point = parseLatLng(query)
    if (point) {
      const found: ResolvedPlace = {
        label: label || (await describe(point)) || query,
        ...point,
        zoom: MAP_POINT_ZOOM,
      }
      cache.current.set(input, found)
      return found
    }

    try {
      const { results } = await geocoderRef.current.geocode({ address: query })
      const best = results[0]
      if (!best) {
        cache.current.set(input, null)
        return null
      }
      const found: ResolvedPlace = {
        label: label || best.formatted_address,
        ...best.geometry.location.toJSON(),
        // The viewport is wide for a city and tight for a building, which is
        // what lets the map pick its own distance. Held back a little, since
        // an exact fit reads as too close.
        zoom: clamp(
          zoomForBounds(best.geometry.viewport, el.clientWidth, el.clientHeight) -
            MAP_ZOOM_BACKOFF,
          MAP_MIN_ZOOM,
          MAP_MAX_ZOOM,
        ),
      }
      cache.current.set(input, found)
      return found
    } catch (err: unknown) {
      // A place that genuinely isn't there stays cached; a network blip must
      // not be, or it would never recover without an edit to the text.
      if (String(err).includes('ZERO_RESULTS')) cache.current.set(input, null)
      else console.warn('[map] geocode failed', err)
      return null
    }
  }

  /**
   * Ease the camera across. `panTo` only animates the pan, and only over short
   * hops, so the interpolation is ours — including a zoom that dips on the way
   * out when the two points are far apart, which is what keeps a long hop from
   * reading as a smear of tiles.
   */
  function flyTo(to: Camera) {
    const map = mapRef.current
    if (!map) return
    cancelAnimationFrame(frame.current)

    const center = map.getCenter()
    const zoom = map.getZoom()
    if (!center || zoom == null) {
      map.moveCamera(to)
      return
    }
    const from: Camera = { center: center.toJSON(), zoom }

    const dLat = to.center.lat - from.center.lat
    const dLng = to.center.lng - from.center.lng
    const dZoom = to.zoom - from.zoom
    if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7 && Math.abs(dZoom) < 0.01) return

    // Distance, measured in screens at the wider of the two zooms.
    const span = 360 / 2 ** Math.min(from.zoom, to.zoom)
    const dip = Math.min(
      MAP_FLIGHT_DIP_MAX,
      MAP_FLIGHT_DIP * Math.log2(1 + Math.hypot(dLat, dLng) / span),
    )

    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / MAP_FLIGHT_MS)
      const pan = easePan(t)
      map.moveCamera({
        center: { lat: from.center.lat + dLat * pan, lng: from.center.lng + dLng * pan },
        // The dip rides on raw time, not on the eased zoom — running it
        // through the easing as well made it swing hardest mid-flight, which
        // is exactly where a scale change is most obvious. sin() is zero at
        // both ends either way, so it never moves where the camera lands.
        zoom: Math.max(
          MAP_MIN_ZOOM,
          from.zoom + dZoom * easeZoom(t) - dip * Math.sin(Math.PI * t),
        ),
      })
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }

  function showMarker(at: google.maps.LatLngLiteral | null) {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map) return
    if (!at) {
      if (marker) marker.map = null
      return
    }
    if (marker) {
      marker.position = at
      marker.map = map
    } else {
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({ map, position: at })
    }
  }

  /* ------------------------------------------------------------- the map -- */

  useEffect(() => {
    if (!hasMapsKey) return
    let cancelled = false

    void loadMaps()
      .then(() => {
        const el = containerRef.current
        if (cancelled || !el) return

        // Both the colour scheme and the Map ID are fixed when the map is
        // constructed, so following the app's theme means replacing it. The
        // camera carries over, and it only happens on a theme switch.
        const previous = mapRef.current
        const from: Camera = previous
          ? {
              center: previous.getCenter()?.toJSON() ?? HOME.center,
              zoom: previous.getZoom() ?? HOME.zoom,
            }
          : HOME

        el.replaceChildren()
        markerRef.current = null
        mapRef.current = new google.maps.Map(el, {
          ...from,
          mapId: mapIdFor(theme),
          // Left off only when a dark Map ID says the styles handle it.
          ...(usesColorScheme
            ? {
                colorScheme:
                  theme === 'dark'
                    ? google.maps.ColorScheme.DARK
                    : google.maps.ColorScheme.LIGHT,
              }
            : {}),
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          // The board owns the wheel on its own side of the divider; over the
          // map a plain scroll should zoom, without asking for a modifier.
          gestureHandling: 'greedy',
        })
        geocoderRef.current ??= new google.maps.Geocoder()

        setStatus('ready')
        setBuilt((n) => n + 1)
      })
      .catch((err: unknown) => {
        console.error('[map] could not start Google Maps', err)
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  /* Never leave a flight running past the pane. */
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  /* ----------------------------------------------------------- the place -- */

  useEffect(() => {
    if (!built) return

    // Already resolved and saved: no lookup, just go.
    if (place.lat != null && place.lng != null) {
      const center = { lat: place.lat, lng: place.lng }
      flyTo({ center, zoom: place.zoom ?? MAP_POINT_ZOOM })
      showMarker(center)
      return
    }

    if (!place.query.trim()) {
      flyTo(HOME)
      showMarker(null)
      return
    }

    let cancelled = false
    void resolve(place.query).then((found) => {
      if (cancelled) return
      setFailed(found ? null : place.query.trim())
      flyTo(found ? { center: found, zoom: found.zoom } : HOME)
      showMarker(found ?? null)
      if (found) resolvedRef.current?.(found)
    })

    return () => {
      cancelled = true
    }
    // The helpers above read everything else through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.key, place.query, place.lat, place.lng, place.zoom, built])

  // Only the text that actually came back empty, and only while it is still
  // the text on screen and still unresolved.
  const missing = failed !== null && failed === place.query.trim() && place.lat == null

  return { status, missing }
}
