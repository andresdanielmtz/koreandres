import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconArrow } from './icons'

/** Matches `.tip { max-width }` — used to decide which side to open on. */
const TIP_W = 250

type Props = {
  /** Hidden until the block is hovered or selected. */
  visible: boolean
  onStart: (e: React.PointerEvent) => void
}

/**
 * The blue handle that starts a link. Hovering it explains the gesture —
 * that tooltip is the only onboarding this interaction gets, so it spells
 * out both outcomes.
 */
export function LinkPort({ visible, onStart }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null)
  const [hover, setHover] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; flip: boolean } | null>(null)

  useLayoutEffect(() => {
    if (!hover || !ref.current) {
      setTip(null)
      return
    }
    const r = ref.current.getBoundingClientRect()
    // Flip to the left of the port when there isn't room on the right.
    const flip = r.right + 12 + TIP_W > window.innerWidth
    setTip({ x: flip ? r.left - 12 : r.right + 12, y: r.top + r.height / 2, flip })
  }, [hover])

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="port"
        data-visible={visible || hover ? '' : undefined}
        aria-label="Drag to link this block"
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onPointerDown={(e) => {
          e.stopPropagation()
          setHover(false)
          onStart(e)
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <IconArrow size={11} />
      </button>

      {tip &&
        createPortal(
          <div
            className="tip"
            data-flip={tip.flip ? '' : undefined}
            style={{ left: tip.x, top: tip.y }}
            role="tooltip"
          >
            <div className="tip-title">Drag to a data block to link it</div>
            <div className="tip-sub">Release on empty space to create one</div>
          </div>,
          document.body,
        )}
    </>
  )
}
