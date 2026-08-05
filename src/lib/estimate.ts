/**
 * A rough time for a trip Google won't route.
 *
 * Inside South Korea the Directions API answers `transit` normally and returns
 * ZERO_RESULTS for `walking`, `driving` and `bicycling` — every time, between
 * any two points. It is a mapping export restriction rather than a gap in the
 * data, so there is nothing to fix and nothing to retry: Google has no road
 * network for the country to route over.
 *
 * Saying nothing at all is the wrong answer to "should I walk or take a taxi",
 * so those three fall back to this instead: the straight line between the two
 * ends, lengthened by how much a real route wanders, at a speed for the mode.
 * It is an estimate, it is labelled as one in the pane, and it is roughly the
 * sum you'd do in your head.
 */
import { TRAVEL_DETOUR, TRAVEL_SPEED_KMH } from './constants'
import type { TravelMode } from './types'

export type TripEstimate = {
  /** Straight-line metres between the two ends. */
  metres: number
  /** Minutes for the longer distance a real route would cover. */
  minutes: number
}

const EARTH_M = 6371000

const rad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle metres between two points. */
export function metresBetween(
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral,
): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Null for transit, which answers for itself and can't be guessed at — it
 *  depends on a timetable rather than on a distance. */
export function estimateTrip(
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
  mode: TravelMode,
): TripEstimate | null {
  const speed = TRAVEL_SPEED_KMH[mode]
  if (!speed) return null
  const metres = metresBetween(from, to)
  const minutes = ((metres * TRAVEL_DETOUR) / 1000 / speed) * 60
  return { metres, minutes: Math.max(1, Math.round(minutes)) }
}

/** Metres under a kilometre, kilometres over it — the way a sign would. */
export const formatMetres = (metres: number) =>
  metres < 950 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`
