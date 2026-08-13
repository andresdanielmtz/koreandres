import { IconCards, IconExternal, IconNote } from '../../components/icons'
import { mapsSearchUrl } from '../../lib/maps'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '../lib/constants'
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
  onPhotos: () => void
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
  onPhotos,
  onOpenPhoto,
  onGrab,
}: Props) {
  const maps = card.url || mapsSearchUrl(card.name)

  return (
    <>
      <div className="card-face" data-side="front" data-color={CATEGORY_COLOR[card.category]}>
        {/* The whole head is the drag handle, the way a window's title bar is.
            The buttons and the link below it are not, so a click on them still
            reads as a click. */}
        <div className="card-grip" onPointerDown={onGrab}>
          <span className="card-kind">{CATEGORY_LABEL[card.category]}</span>
          <span className="card-name">{card.name}</span>
          <span className="card-where">{card.where}</span>
        </div>

        <a className="card-link" href={maps} target="_blank" rel="noreferrer">
          <IconExternal size={12} />
          Open in Google Maps
        </a>

        <div className="card-photos">
          {photos.kind === 'ready' &&
            (photos.photos.length ? (
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
            ))}

          {photos.kind === 'failed' && (
            <p className="card-note">
              {photos.denied
                ? 'Photos need Places API (New) on the key.'
                : 'Couldn’t load photos.'}
            </p>
          )}

          {photos.kind !== 'ready' && (
            <button
              type="button"
              className="card-photos-btn"
              disabled={!ready || photos.kind === 'loading'}
              onClick={onPhotos}
            >
              <IconNote size={12} />
              {photos.kind === 'loading' ? 'Loading photos…' : 'Show photos'}
            </button>
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
