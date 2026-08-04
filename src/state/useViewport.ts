import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MAX_ZOOM, MIN_ZOOM } from '../lib/constants'
import { clamp } from '../lib/time'
import type { Bounds } from '../lib/types'

export type View = { x: number; y: number; scale: number }
export type Point = { x: number; y: number }

/** Opens on 08:00 of day one rather than at midnight. */
const INITIAL: View = { x: 320, y: -392, scale: 1 }

/**
 * One axis of the pan clamp. `lo`/`hi` are the offsets at which the content's
 * far and near edges meet the viewport; when the content is the smaller of the
 * two the range inverts, and it gets centred instead.
 */
function containAxis(offset: number, min: number, max: number, size: number, scale: number) {
  const lo = size - max * scale
  const hi = -min * scale
  return lo > hi ? (lo + hi) / 2 : clamp(offset, lo, hi)
}

/**
 * Pan/zoom for the board. The transform is written straight to the DOM on
 * every gesture frame — React state only trails behind for the zoom readout,
 * so panning never waits on a render.
 */
export function useViewport(
  viewportRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
  bounds: Bounds,
) {
  const viewRef = useRef<View>(INITIAL)
  // Read inside pointer handlers, which outlive the render that started them.
  const boundsRef = useRef(bounds)
  const downRef = useRef(false)
  const [scale, setScale] = useState(INITIAL.scale)
  const [panning, setPanning] = useState(false)
  const spaceRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const syncing = useRef(0)

  function paint() {
    const el = contentRef.current
    const v = viewRef.current
    if (el) el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`
  }

  /** Stops a pan once the padded content box no longer covers the viewport. */
  function contain(v: View): View {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return v
    const b = boundsRef.current
    return {
      scale: v.scale,
      x: containAxis(v.x, b.minX, b.maxX, rect.width, v.scale),
      y: containAxis(v.y, b.minY, b.maxY, rect.height, v.scale),
    }
  }

  function apply(next: View) {
    viewRef.current = contain(next)
    paint()
    if (!syncing.current) {
      syncing.current = requestAnimationFrame(() => {
        syncing.current = 0
        setScale(viewRef.current.scale)
      })
    }
  }

  // Paints the initial transform, and pulls the view back in when the content
  // shrinks under it — removing a day can leave you looking at nothing. Never
  // while the pointer is down: a card dragged back from the far edge shrinks
  // the bounds as it moves, and correcting the view then would slide the board
  // out from under the card.
  useLayoutEffect(() => {
    boundsRef.current = bounds
    if (!downRef.current) apply(viewRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY])

  useEffect(() => {
    const down = () => (downRef.current = true)
    const up = () => (downRef.current = false)
    const onResize = () => apply(viewRef.current)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Client coordinates → board coordinates. */
  function toBoard(clientX: number, clientY: number): Point {
    const rect = viewportRef.current?.getBoundingClientRect()
    const v = viewRef.current
    const px = clientX - (rect?.left ?? 0)
    const py = clientY - (rect?.top ?? 0)
    return { x: (px - v.x) / v.scale, y: (py - v.y) / v.scale }
  }

  /** Board coordinates → client coordinates. */
  function toClient(x: number, y: number): Point {
    const rect = viewportRef.current?.getBoundingClientRect()
    const v = viewRef.current
    return {
      x: x * v.scale + v.x + (rect?.left ?? 0),
      y: y * v.scale + v.y + (rect?.top ?? 0),
    }
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const rect = viewportRef.current?.getBoundingClientRect()
    const v = viewRef.current
    const px = clientX - (rect?.left ?? 0)
    const py = clientY - (rect?.top ?? 0)
    const next = clamp(v.scale * factor, MIN_ZOOM, MAX_ZOOM)
    if (next === v.scale) return
    const k = next / v.scale
    apply({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, scale: next })
  }

  function zoomBy(factor: number) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  function panBy(dx: number, dy: number) {
    const v = viewRef.current
    apply({ ...v, x: v.x + dx, y: v.y + dy })
  }

  /** Centres a board-space point in the viewport, keeping the current zoom. */
  function centerOn(x: number, y: number) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const v = viewRef.current
    apply({ x: rect.width / 2 - x * v.scale, y: rect.height / 2 - y * v.scale, scale: v.scale })
  }

  /** Parks a board-space point at a fixed offset from the viewport's corner. */
  function focus(x: number, y: number, offsetX = INITIAL.x, offsetY = 88) {
    const v = viewRef.current
    apply({ x: offsetX - x * v.scale, y: offsetY - y * v.scale, scale: v.scale })
  }

  function reset() {
    apply(INITIAL)
  }

  /* ----------------------------------------------------------------- wheel */

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0125))
      } else if (e.shiftKey) {
        panBy(-(e.deltaY || e.deltaX), 0)
      } else {
        panBy(-e.deltaX, -e.deltaY)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // Bound once: the handlers read live values through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --------------------------------------------------------- space to pan  */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return
      e.preventDefault()
      spaceRef.current = true
      setSpaceHeld(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceRef.current = false
      setSpaceHeld(false)
    }
    const blur = () => {
      spaceRef.current = false
      setSpaceHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /** Attach to a pointerdown that should start a pan. */
  function beginPan(e: React.PointerEvent) {
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    setPanning(true)
    let lastX = e.clientX
    let lastY = e.clientY

    const move = (ev: PointerEvent) => {
      panBy(ev.clientX - lastX, ev.clientY - lastY)
      lastX = ev.clientX
      lastY = ev.clientY
    }
    const end = () => {
      setPanning(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return {
    scale,
    panning,
    spaceHeld,
    getView: () => viewRef.current,
    toBoard,
    toClient,
    zoomBy,
    panBy,
    centerOn,
    focus,
    reset,
    beginPan,
  }
}

export type Viewport = ReturnType<typeof useViewport>
