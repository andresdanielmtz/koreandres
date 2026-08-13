/**
 * Working out where the decks are drawn around.
 *
 * Two ways in, and the typed one is not a fallback for the other — it is shown
 * from the first frame. Geolocation is refused outright on a non-secure origin
 * and a dismissed prompt never resolves at all, so a gate that waits on it is a
 * gate that hangs.
 */
import { labelFor, loadMaps, parseLatLng, queryFor } from '../../lib/maps'
import { CARD_LOCATE_TIMEOUT_MS } from './constants'
import type { CardLocation, LocationError } from './types'

/** Describes a point, so the gate can say where it decided you are. */
async function describe(at: google.maps.LatLngLiteral): Promise<string> {
  try {
    await loadMaps()
    const { results } = await new google.maps.Geocoder().geocode({ location: at })
    return results[0]?.formatted_address ?? ''
  } catch {
    // A point with no name is still a point. The decks only need the numbers.
    return ''
  }
}

export async function deviceLocation(): Promise<CardLocation | LocationError> {
  if (!navigator.geolocation) return 'unavailable'

  const fix = await new Promise<GeolocationPosition | LocationError>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      // Without the timeout a prompt the user walks away from never settles.
      { timeout: CARD_LOCATE_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
    )
  })
  if (typeof fix === 'string') return fix

  const at = { lat: fix.coords.latitude, lng: fix.coords.longitude }
  return { ...at, label: (await describe(at)) || 'Where you are' }
}

/**
 * A place name, a `lat,lng`, or a long Google Maps URL — the same three things
 * a block's location field takes, read by the same helpers.
 */
export async function locationFromText(text: string): Promise<CardLocation | LocationError> {
  const query = queryFor(text)
  if (!query) return 'notfound'

  const point = parseLatLng(query)
  if (point) return { ...point, label: (await describe(point)) || query }

  try {
    await loadMaps()
    const { results } = await new google.maps.Geocoder().geocode({ address: query })
    const best = results[0]
    if (!best) return 'notfound'
    return {
      lat: best.geometry.location.lat(),
      lng: best.geometry.location.lng(),
      // What was typed is a better name than what Google expands it to —
      // "Hongdae" beats "Hongdae, Mapo-gu, Seoul, South Korea".
      label: labelFor(text) || best.formatted_address,
    }
  } catch {
    return 'notfound'
  }
}
