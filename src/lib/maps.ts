/**
 * Google Maps, through the Maps JavaScript API. The pane keeps one live map
 * and flies its camera between places, so selecting a block moves the map
 * rather than reloading it.
 *
 * The key needs two APIs enabled on its Google Cloud project: *Maps
 * JavaScript API* to draw the map, and *Geocoding API* to turn a typed place
 * into coordinates. See docs/setup.md.
 *
 * Only VITE_-prefixed variables reach the browser, so a key named
 * GOOGLE_MAPS_API_KEY would silently read as undefined.
 */
const key = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim()

export const MAPS_KEY = key ?? ''
export const hasMapsKey = !!MAPS_KEY

/** The env var to point people at when the preview can't render. */
export const MAPS_KEY_VAR = 'VITE_GOOGLE_MAPS_API_KEY'

/**
 * A vector map is what makes the flight smooth — raster tiles only zoom in
 * whole steps — and vector rendering is selected by a Map ID. Google publishes
 * `DEMO_MAP_ID` for exactly this case, so the pane works before anyone visits
 * the Cloud console.
 *
 * The Map ID is also the only way to restyle the map: passing a `styles` array
 * in code is ignored the moment a `mapId` is present, because the style is
 * meant to live in the Cloud console instead. Point these at your own IDs and
 * the map takes on whatever style is attached to them — see docs/setup.md, and
 * docs/map-styles/ for a pair tuned to this app.
 */
const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim()
const mapIdDark = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID_DARK as string | undefined)?.trim()

/** Falls back to the light ID, then to Google's demo one. */
export const mapIdFor = (theme: 'light' | 'dark') =>
  (theme === 'dark' ? mapIdDark || mapId : mapId) || 'DEMO_MAP_ID'

const MAPS_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl)$/
const SHORT_HOST = /(^|\.)goo\.gl$/

const hostOf = (url: string): string | null => {
  try {
    return new URL(url.trim()).hostname
  } catch {
    return null
  }
}

/**
 * A shortened Maps link — `maps.app.goo.gl/…`, the one the share button
 * gives you.
 *
 * There is no way to expand one from the browser. It only resolves by
 * following its redirect, and goo.gl answers without CORS headers, so the
 * browser will not let us read where it lands; Google retired the API that
 * used to expand them. Doing it properly needs a server to make the request,
 * and this app deliberately hasn't got one. So the pane recognises them and
 * says what to paste instead, rather than quietly sitting on the wrong city.
 */
export const isShortMapsUrl = (url: string) => {
  const host = hostOf(url)
  return !!host && SHORT_HOST.test(host)
}

/** Path segments arrive encoded; query parameters are decoded already. */
function decodeSegment(value: string): string {
  const spaced = value.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(spaced).trim()
  } catch {
    return spaced.trim()
  }
}

/** Coordinates, a plus code, degrees-minutes-seconds — a point wearing a name. */
const looksLikePoint = (text: string) => /^[\d\s°'"+\-.,NSEW]+$/i.test(text)

/**
 * Pull something findable out of a Google Maps link, so a block that only
 * carries a URL still lands on the map. Handles the long forms Maps puts in
 * the address bar and the ones its share sheet builds; returns null for
 * anything it can't read, including the shortened links above.
 */
export function placeFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (!MAPS_HOST.test(parsed.hostname)) return null

  const params = parsed.searchParams
  const query =
    params.get('q') ?? params.get('query') ?? params.get('destination') ?? params.get('daddr')
  if (query?.trim()) return query.trim()

  const named = parsed.pathname.match(/\/maps\/(?:place|search)\/([^/@?]+)/)
  const name = named ? decodeSegment(named[1]) : ''
  if (name && !looksLikePoint(name)) return name

  // `!8m2!3d37.5796!4d126.9770` is the place Maps resolved to, which is better
  // than the `@` camera sitting next to it in the same URL.
  const pin = parsed.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (pin) return `${pin[1]},${pin[2]}`

  const at = parsed.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (at) return `${at[1]},${at[2]}`

  const ll = params.get('ll') ?? params.get('center')
  if (ll?.trim()) return ll.trim()

  return name || null
}

/**
 * What to hand the map for a pasted location. A Maps link resolves to the
 * place inside it; anything else is a name or a point and is used as written.
 */
export function queryFor(place: string): string | null {
  const text = place.trim()
  if (!text) return null
  return /^https?:\/\//i.test(text) ? placeFromUrl(text) : text
}

/**
 * What to *call* a pasted location, without looking anything up — the name out
 * of a Maps link, or the text itself if a name is what was typed. Coordinates
 * aren't a name, so they come back empty and the geocoder is asked to describe
 * them instead.
 */
export function labelFor(place: string): string {
  const query = queryFor(place)
  if (!query) return ''
  return parseLatLng(query) ? '' : query
}

/** A place typed as bare coordinates needs no geocode. */
export function parseLatLng(query: string): google.maps.LatLngLiteral | null {
  const m = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/** Web mercator tile size, which is what fixes the scale at each zoom level. */
const TILE = 256

const latRad = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return Math.log((1 + s) / (1 - s)) / 2
}

/**
 * The zoom that fits `bounds` into a viewport this size — the sum `fitBounds`
 * does internally, but returned as a number the camera can be flown towards.
 * A geocoded viewport is wide for a city and tight for a building, which is
 * what makes the map land at a sensible distance on its own.
 */
export function zoomForBounds(
  bounds: google.maps.LatLngBounds,
  width: number,
  height: number,
): number {
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const latFraction = Math.abs(latRad(ne.lat()) - latRad(sw.lat())) / Math.PI
  let lngDiff = ne.lng() - sw.lng()
  if (lngDiff < 0) lngDiff += 360
  const lngFraction = lngDiff / 360
  // A viewport can come back as a single point, which no zoom "fits".
  const latZoom = latFraction > 0 ? Math.log2(height / TILE / latFraction) : Infinity
  const lngZoom = lngFraction > 0 ? Math.log2(width / TILE / lngFraction) : Infinity
  return Math.min(latZoom, lngZoom)
}

/** The same place on maps.google.com — works without a key. */
export const mapsSearchUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`

/* ---------------------------------------------------------------- loader -- */

const CALLBACK = '__koreandresMapsReady'

let loading: Promise<void> | null = null

/**
 * Loads the SDK once per page. Google's `loading=async` wants a global
 * callback rather than the script's own load event, which is what the window
 * property is for.
 */
export function loadMaps(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    if (!hasMapsKey) {
      reject(new Error(`${MAPS_KEY_VAR} is not set`))
      return
    }
    const params = new URLSearchParams({
      key: MAPS_KEY,
      v: 'weekly',
      // `marker` is the only library worth naming — AdvancedMarkerElement lives
      // there, while Geocoder comes with the core namespace.
      libraries: 'marker',
      loading: 'async',
      callback: CALLBACK,
    })
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => reject(new Error('Google Maps failed to load'))
    Reflect.set(window, CALLBACK, () => resolve())
    document.head.appendChild(script)
  })
  return loading
}
