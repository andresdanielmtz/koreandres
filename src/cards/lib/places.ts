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
import {
  CARD_DECK_MAX,
  CARD_PHOTO_FULL,
  CARD_PHOTO_MAX,
  CARD_PHOTO_WIDTH,
  CATEGORY_TYPES,
} from './constants'
import type { Card, CardCategory, CardLocation, CardPhoto, CardsError } from './types'

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

/* ---------------------------------------------------------------- photos -- */

/**
 * A card's photos, fetched only when they are asked for.
 *
 * They are deliberately **not** persisted alongside the rest of the card. The
 * SDK's `Photo` exposes `getURI()` and no resource name, and what comes back is
 * a temporary signed URL — storing one in Supabase means a row that works today
 * and 404s later. Google's terms cap caching of non-id place content at 30 days
 * anyway. So this is a request per card per session, cached in memory by the
 * caller, and the deck search doesn't pay for photos it may never show.
 */
export async function fetchPhotos(placeId: string): Promise<CardPhoto[] | CardsError> {
  try {
    await loadMaps()
    const place = new google.maps.places.Place({ id: placeId })
    await place.fetchFields({ fields: ['photos'] })
    return (place.photos ?? []).slice(0, CARD_PHOTO_MAX).map((p) => ({
      thumb: p.getURI({ maxWidth: CARD_PHOTO_WIDTH }),
      full: p.getURI({ maxWidth: CARD_PHOTO_FULL }),
    }))
  } catch (err: unknown) {
    return placesError(err, 'photos')
  }
}
