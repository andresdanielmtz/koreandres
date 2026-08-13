import { IconCards, IconExternal } from '../../components/icons'
import { mapsSearchUrl } from '../../lib/maps'
import { CARD_PHOTO_MAX, CATEGORY_COLOR, CATEGORY_LABEL } from '../lib/constants'
import type { Card, CardPhoto } from '../lib/types'

/** What the photos for this card are doing. */
export type PhotoState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; photos: CardPhoto[] }
  | { kind: 'failed'; denied: boolean }

type Props = {
  card: Card
  onKeep: () => void
  onDiscard: () => void
  /** False while the card is still flying in, so the buttons can't be pressed
   *  before it has landed. */
  ready: boolean
  photos: PhotoState
  onOpenPhoto: (index: number) => void
  onGrab: (e: React.PointerEvent) => void
}

/**
 * What goes *inside* the element Three is moving. Both faces are here, because
 * one element can only show one side: the back is turned 180° in CSS and both
 * hide their backface, so rotating the parent swaps them.
 *
 * Nothing here sets a transform or a transition on the card itself — that
 * element belongs to `CSS3DRenderer`.
 */
export function CardFace({
  card,
  onKeep,
  onDiscard,
  ready,
  photos,
  onOpenPhoto,
  onGrab,
}: Props) {
  const maps = card.url || mapsSearchUrl(card.name)

  return (
    <>
      {/* The whole face drags. `onGrab` bails on anything interactive, so the
          buttons, the link and the photos still answer a click themselves. */}
      <div
        className="card-face"
        data-side="front"
        data-color={CATEGORY_COLOR[card.category]}
        onPointerDown={onGrab}
      >
        <div className="card-head">
          <span className="card-kind">{CATEGORY_LABEL[card.category]}</span>
          <span className="card-name">{card.name}</span>
          <span className="card-where">{card.where}</span>
        </div>

        <a className="card-link" href={maps} target="_blank" rel="noreferrer">
          <IconExternal size={12} />
          Open in Google Maps
        </a>

        <div className="card-photos">
          {photos.kind === 'ready' ? (
            photos.photos.length ? (
              <div className="card-strip">
                {photos.photos.map((photo, i) => (
                  <button
                    key={photo.thumb}
                    type="button"
                    aria-label={`Open photo ${i + 1} of ${photos.photos.length}`}
                    onClick={() => onOpenPhoto(i)}
                  >
                    <img src={photo.thumb} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="card-note">No photos for this one.</p>
            )
          ) : photos.kind === 'failed' ? (
            <p className="card-note">
              {photos.denied ? 'Photos need Places API (New) on the key.' : 'Couldn’t load photos.'}
            </p>
          ) : (
            /* Holds the grid's shape while the request is out, so the card
               doesn't reflow under the pointer when the photos land. */
            <div className="card-strip" data-waiting="" aria-hidden>
              {Array.from({ length: CARD_PHOTO_MAX }, (_, i) => (
                <span key={i} />
              ))}
            </div>
          )}
        </div>

        <div className="card-actions">
          <button type="button" className="btn" disabled={!ready} onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="btn card-keep" disabled={!ready} onClick={onKeep}>
            Keep
          </button>
        </div>
      </div>

      <div className="card-face" data-side="back" aria-hidden>
        <IconCards size={40} />
      </div>
    </>
  )
}

