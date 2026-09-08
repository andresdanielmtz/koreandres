import { createPortal } from 'react-dom'

/** Matches `.tip { max-width }` — used to decide which side to open on. */
const TIP_W = 250

/** Clearance between the toolbar control and the tip hanging under it. */
const TIP_GAP = 8

type Props = {
  /**
   * The control the tip hangs under, or null when nothing is hovered —
   * passing the element rather than a boolean is what re-measures when the
   * hover moves between two controls without leaving the toolbar.
   */
  anchor: HTMLElement | null
  text: string
}

/**
 * A tooltip for a toolbar control. It opens *below* its anchor rather than
 * beside it, because the toolbar is the top 46px of the window and there is
 * nowhere above it to go. Portalled to the body so the toolbar's stacking
 * context can't clip it.
 *
 * The anchor is measured in render rather than in a layout effect: it is
 * already on screen when this mounts, so there is nothing to wait for, and
 * a rect read here shows the tip in the same commit as the hover.
 */
export function ToolbarTooltip({ anchor, text }: Props) {
  if (!anchor) return null

  const r = anchor.getBoundingClientRect()
  const mid = r.left + r.width / 2
  // Right-align on the anchor when a centred tip would run off the edge.
  const flip = mid + TIP_W / 2 > window.innerWidth

  return createPortal(
    <div
      className="tip"
      data-below=""
      data-flip={flip ? '' : undefined}
      style={{ left: flip ? r.right : mid, top: r.bottom + TIP_GAP }}
      role="tooltip"
    >
      <div className="tip-title">{text}</div>
    </div>,
    document.body,
  )
}
