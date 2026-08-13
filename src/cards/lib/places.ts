/**
 * Filling a deck. One `searchNearby` per category, which is three requests for
 * the whole table — trivia's six types travel in the same call.
 *
 * This is the same shape as the board's nearby search in `useGoogleMap`: the
 * static method off the new Places classes, a `flatMap` that drops anything
 * without a location, and a failure that collapses into a union rather than
 * being thrown. Nothing above this has to know what a Places error looks like.
 */
import { loadMaps, placesError } from '../../lib/maps'
import { CARD_DECK_MAX, CATEGORY_TYPES } from './constants'
import type { Card, CardCategory, CardLocation, CardsError } from './types'

export async function searchDeck(
  at: CardLocation,
  radius: number,
  category: CardCategory,
): Promise<Card[] | CardsError> {
  try {
    await loadMaps()
    const fetchedAt = new Date().toISOString()
    const { places } = await google.maps.places.Place.searchNearby({
      // `formattedAddress` is what prints under the name — a point is not a
      // location anyone can read. The cache means it is asked for once.
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'googleMapsURI'],
      locationRestriction: { center: { lat: at.lat, lng: at.lng }, radius },
      includedPrimaryTypes: CATEGORY_TYPES[category],
      maxResultCount: CARD_DECK_MAX,
      rankPreference: google.maps.places.SearchNearbyRankPreference.POPULARITY,
    })
    return places.flatMap((p) => {
      const point = p.location?.toJSON()
      if (!point || !p.id) return []
      return [
        {
          id: p.id,
          category,
          name: p.displayName ?? '',
          where: p.formattedAddress ?? '',
          lat: point.lat,
          lng: point.lng,
          rating: p.rating ?? null,
          url: p.googleMapsURI ?? '',
          fetchedAt,
        },
      ]
    })
  } catch (err: unknown) {
    return placesError(err, `${category} deck`)
  }
}
