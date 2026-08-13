import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronLeft, IconChevronRight, IconClose } from '../../components/icons'
import type { CardPhoto } from '../lib/types'

type Props = {
  photos: CardPhoto[]
  index: number
  /** What the photos are of, for the caption and the alt text. */
  title: string
  onIndex: (index: number) => void
  onClose: () => void
}

/**
 * One photo, full size, over everything.
 *
 * Portalled to `document.body` rather than rendered where it is opened from —
 * that would put it inside the card, which lives in a `preserve-3d` subtree the
 * renderer writes a `matrix3d` onto, so the "full size" photo would be flown
 * around with the card and clipped by the table.
 *
 * The scrim is dark in both themes. It is the one surface in the app not
 * following the interface: a photo wants to be looked at, and a light backdrop
 * around it is glare.
 */
export function PhotoLightbox({ photos, index, title, onIndex, onClose }: Props) {
  const many = photos.length > 1
  const step = (by: number) => onIndex((index + by + photos.length) % photos.length)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // Nothing behind this should answer while it is open.
      e.stopPropagation()
      if (e.key === 'Escape') onClose()
      if (many && e.key === 'ArrowLeft') step(-1)
      if (many && e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })

  const photo = photos[index]
  if (!photo) return null

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — photo ${index + 1} of ${photos.length}`}
      // Only a press on the backdrop itself closes; one that lands on the
      // photo or a button has already been answered by them.
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button type="button" className="lightbox-close" aria-label="Close" onClick={onClose}>
        <IconClose size={16} />
      </button>

      {many && (
        <button
          type="button"
          className="lightbox-step"
          data-side="prev"
          aria-label="Previous photo"
          onClick={() => step(-1)}
        >
          <IconChevronLeft size={18} />
        </button>
      )}

      <img className="lightbox-img" src={photo.full} alt={title} />

      {many && (
        <button
          type="button"
          className="lightbox-step"
          data-side="next"
          aria-label="Next photo"
          onClick={() => step(1)}
        >
          <IconChevronRight size={18} />
        </button>
      )}

      <div className="lightbox-foot">
        <span>{title}</span>
        {many && (
          <span className="lightbox-count">
            {index + 1} / {photos.length}
          </span>
        )}
      </div>
    </div>,
    document.body,
  )
}
