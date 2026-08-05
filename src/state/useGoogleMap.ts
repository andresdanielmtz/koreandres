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
  MAP_ROUTE_BACKOFF,
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
import { estimateTrip, type TripEstimate } from '../lib/estimate'
import { clamp } from '../lib/time'
import type { TravelMode } from '../lib/types'

export type MapStatus = 'no-key' | 'loading' | 'ready' | 'error'

/** What a pasted location turned out to be. This is what gets saved. */
export type ResolvedPlace = {
  label: string
  lat: number
  lng: number
  zoom: number
}

/** A trip to draw instead of a place to stand at. Both ends are text — a name,
 *  or `lat,lng` for an end that has already been resolved. */
export type MapRoute = {
  from: string
  to: string
  mode: TravelMode
}

/** What the router came back with, for the pane to print. */
export type RouteInfo = {
  duration: string
  distance: string
  /** How it went: the transit lines, or the road the driving route is named
   *  for. Empty when the router didn't say. */
  via: string
}

/** Why there is no line on the map. `denied` is the Directions API not being
 *  enabled on the key, which is the one worth spelling out. */
export type RouteError = 'none' | 'denied' | 'failed'

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
  /** Set by a commute block. Takes over from the fields above entirely. */
  route: MapRoute | null
  /** The subject has no location at all — a trivia block. Nothing is looked
   *  up and the camera stays where it is. */
  hold: boolean
}

/** Where the camera should end up: a point, and how close to stand to it. */
type Camera = { center: google.maps.LatLngLiteral; zoom: number }

/** The two ends of a trip, once both are points. */
type Ends = [google.maps.LatLngLiteral, google.maps.LatLngLiteral]

const HOME: Camera = { center: MAP_DEFAULT_CENTER, zoom: MAP_DEFAULT_ZOOM }

/**
 * The pan and the zoom are eased apart. A brisk pan reads as purposeful, but
 * the same curve on the zoom is what makes a hop flash — scale changes are far
 * more noticeable than movement — so the zoom gets the gentler of the two.
 */
const easePan = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeZoom = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2

/** The route line is drawn on a canvas, not styled by the stylesheet, so its
 *  colour is read out of the same variable everything else uses. */
const cssColor = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/** An end that already resolved to a point skips the router's own geocode. */
const waypoint = (text: string): string | google.maps.LatLngLiteral =>
  parseLatLng(text) ?? text

/** Identifies a question to the router: the two ends and the way there. */
const routeKey = (want: MapRoute | null) =>
  want ? `${want.mode}|${want.from}|${want.to}` : ''

/** What to call the way it went. Transit answers with its lines, which is the
 *  useful part; driving answers with the road it is named for. */
function viaOf(route: google.maps.DirectionsRoute): string {
  const lines = (route.legs[0]?.steps ?? [])
    .map((s) => s.transit?.line?.short_name || s.transit?.line?.name)
    .filter((name): name is string => !!name)
  return lines.length ? lines.join(' · ') : route.summary
}

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
  /** Whether we ended up on raster tiles after asking for vector. */
  const raster = useRef(false)
  const directionsRef = useRef<google.maps.DirectionsService | null>(null)
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null)
  const routeCache = useRef(new Map<string, google.maps.DirectionsResult | RouteError>())
  /** The straight line stood in for a route Google won't work out. */
  const directRef = useRef<google.maps.Polyline | null>(null)

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
  /** What the router last said, tagged with what it was asked. Reading it back
   *  through the current question is what makes a stale answer disappear on
   *  its own, the same way `failed` does for a place. */
  const [answer, setAnswer] = useState<{
    key: string
    info: RouteInfo | null
    error: RouteError | null
  } | null>(null)
  /** What the trip works out at when the router has no route to give — read
   *  back through the current question, exactly like `answer` above. */
  const [guess, setGuess] = useState<{ key: string; trip: TripEstimate } | null>(null)

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
    // On raster tiles the dip is what makes a hop look like a reload: it costs
    // up to two extra levels out and two back, and every level crossed is a
    // fresh set of tiles. Without it the flight crosses the fewest it can.
    const dip = raster.current
      ? 0
      : Math.min(
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

  /* ---------------------------------------------------------------- routes -- */

  /**
   * Ask for the way between two ends. Cached per session on the ends and the
   * mode together, so flipping between two commute blocks — or back to one you
   * looked at a minute ago — costs nothing.
   *
   * A failure is cached too, as the reason: the two ends genuinely not being
   * connected doesn't become connected by asking twice.
   */
  async function findRoute(want: MapRoute): Promise<google.maps.DirectionsResult | RouteError> {
    const key = routeKey(want)
    const cached = routeCache.current.get(key)
    if (cached !== undefined) return cached

    const service = (directionsRef.current ??= new google.maps.DirectionsService())
    try {
      const result = await service.route({
        origin: waypoint(want.from),
        destination: waypoint(want.to),
        travelMode: google.maps.TravelMode[want.mode.toUpperCase() as Uppercase<TravelMode>],
      })
      routeCache.current.set(key, result)
      return result
    } catch (err: unknown) {
      const text = String(err)
      // ZERO_RESULTS is an answer — no transit at that hour, or an ocean in
      // between. REQUEST_DENIED is the Directions API not being enabled, which
      // is a setup problem and says so. A network blip is neither, and isn't
      // cached, so it recovers without an edit.
      const reason: RouteError = text.includes('ZERO_RESULTS')
        ? 'none'
        : text.includes('REQUEST_DENIED')
          ? 'denied'
          : 'failed'
      if (reason === 'failed') console.warn('[map] directions failed', err)
      else routeCache.current.set(key, reason)
      return reason
    }
  }

  /** Put the line on the map, or take it off. */
  function showRoute(result: google.maps.DirectionsResult | null) {
    const map = mapRef.current
    if (!map) return
    if (!result) {
      rendererRef.current?.setMap(null)
      return
    }
    const renderer = (rendererRef.current ??= new google.maps.DirectionsRenderer({
      // The camera is ours. Left to itself the renderer cuts straight to the
      // route's bounds, which is the one thing the flight exists to avoid.
      preserveViewport: true,
      polylineOptions: {
        strokeColor: cssColor('--accent', '#2c6bed'),
        strokeOpacity: 0.9,
        strokeWeight: 5,
      },
    }))
    renderer.setMap(map)
    renderer.setDirections(result)
  }

  /** Both ends as points, so a trip the router refused can still be worked out
   *  from the distance. Either end that can't be found means no estimate —
   *  half a line is worse than none. */
  async function guessTrip(want: MapRoute) {
    const [from, to] = await Promise.all([resolve(want.from), resolve(want.to)])
    if (!from || !to) return null
    const trip = estimateTrip(from, to, want.mode)
    return trip ? { trip, ends: [from, to] as Ends } : null
  }

  /**
   * Stand a straight line in for a route that doesn't exist, so a walk still
   * shows which way it goes and roughly how far. Dashed, and in the muted ink
   * rather than the accent the real route uses, because it is a distance
   * rather than a way anyone can take.
   */
  function showDirect(ends: Ends | null) {
    const map = mapRef.current
    if (!map) return
    if (!ends) {
      directRef.current?.setMap(null)
      return
    }
    const line = (directRef.current ??= new google.maps.Polyline({
      // A dashed line is a transparent stroke wearing repeated symbols; the
      // symbols take their colour from the polyline.
      strokeOpacity: 0,
      strokeColor: cssColor('--text-3', '#6b7280'),
      icons: [
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3 },
          offset: '0',
          repeat: '11px',
        },
      ],
    }))
    line.setPath([...ends])
    line.setMap(map)
  }

  /** Fly to what a pair of ends spans — the same arrival a real route gets. */
  function flyToSpan(ends: Ends) {
    const el = containerRef.current
    if (!el) return
    const bounds = new google.maps.LatLngBounds()
    for (const end of ends) bounds.extend(end)
    flyTo({
      center: bounds.getCenter().toJSON(),
      zoom: clamp(
        zoomForBounds(bounds, el.clientWidth, el.clientHeight) - MAP_ROUTE_BACKOFF,
        MAP_MIN_ZOOM,
        MAP_MAX_ZOOM,
      ),
    })
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
        // Both are bound to the map that is about to be thrown away. The
        // renderer is rebuilt on the next route, which is also what re-reads
        // the line colour for the new theme.
        markerRef.current = null
        rendererRef.current = null
        directRef.current = null
        const map = new google.maps.Map(el, {
          ...from,
          mapId: mapIdFor(theme),
          // Vector tiles are drawn once and reprojected, so a zoom moves what
          // is already on screen. Raster answers the same zoom by fetching a
          // whole new set of tiles at the new level, which is the flicker.
          renderingType: google.maps.RenderingType.VECTOR,
          // Default on a vector map, off on a raster one — where it is the
          // difference between tiles that scale as the camera moves and tiles
          // that are thrown away and refetched at every whole level.
          isFractionalZoomEnabled: true,
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
        mapRef.current = map
        geocoderRef.current ??= new google.maps.Geocoder()

        // Asking for vector is not getting it: the Map ID's cloud
        // configuration overrides the request, and a device without WebGL is
        // refused outright. It also settles a moment after construction, so
        // the answer is read again when it changes.
        const readRendering = () => {
          raster.current = map.getRenderingType() === google.maps.RenderingType.RASTER
        }
        readRendering()
        map.addListener('renderingtype_changed', readRendering)

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
    const want = place.route

    // Nothing to show and nowhere to go: drop the pin and the line, and leave
    // the camera on whatever was selected either side of this.
    if (place.hold) {
      showMarker(null)
      showRoute(null)
      showDirect(null)
      return
    }

    if (want) {
      let cancelled = false
      const key = routeKey(want)
      showMarker(null)
      void findRoute(want).then((result) => {
        if (cancelled) return
        if (typeof result === 'string') {
          showRoute(null)
          showDirect(null)
          setAnswer({ key, info: null, error: result })
          // No route is not the same as nothing to say. Inside Korea it is the
          // answer for every mode except transit — Google has no road network
          // there to route over — so the trip is worked out from the distance
          // instead, and the two ends are joined by a straight line.
          if (result === 'none') {
            void guessTrip(want).then((found) => {
              if (cancelled || !found) return
              setGuess({ key, trip: found.trip })
              showDirect(found.ends)
              flyToSpan(found.ends)
            })
          }
          return
        }
        const best = result.routes[0]
        const leg = best.legs[0]
        showRoute(result)
        showDirect(null)
        setAnswer({
          key,
          info: {
            duration: leg?.duration?.text ?? '',
            distance: leg?.distance?.text ?? '',
            via: viaOf(best),
          },
          error: null,
        })
        // The renderer draws the line; the camera is still flown, so arriving
        // at a route reads the same as arriving at a place.
        const el = containerRef.current
        if (best.bounds && el) {
          flyTo({
            center: best.bounds.getCenter().toJSON(),
            zoom: clamp(
              zoomForBounds(best.bounds, el.clientWidth, el.clientHeight) - MAP_ROUTE_BACKOFF,
              MAP_MIN_ZOOM,
              MAP_MAX_ZOOM,
            ),
          })
        }
      })
      return () => {
        cancelled = true
      }
    }

    // Not a commute any more: both lines go with it. The answers above are
    // left alone — they are read back through the current question, so they
    // are already out of the picture.
    showRoute(null)
    showDirect(null)

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
  }, [
    place.key,
    place.hold,
    place.query,
    place.lat,
    place.lng,
    place.zoom,
    place.route?.from,
    place.route?.to,
    place.route?.mode,
    built,
  ])

  // Only the text that actually came back empty, and only while it is still
  // the text on screen and still unresolved.
  const missing = failed !== null && failed === place.query.trim() && place.lat == null

  // Likewise: the router's answer counts only while it answers what is being
  // asked now. Anything else is a leftover from the last selection.
  const current = answer?.key === routeKey(place.route) ? answer : null
  const estimated = guess?.key === routeKey(place.route) ? guess.trip : null

  return {
    status,
    missing,
    route: current?.info ?? null,
    routeError: current?.error ?? null,
    estimate: estimated,
  }
}
