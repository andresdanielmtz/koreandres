import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MAX_ZOOM, MIN_ZOOM } from '../lib/constants'
import { clamp } from '../lib/time'

export type View = { x: number; y: number; scale: number }
export type Point = { x: number; y: number }

/** Opens on 08:00 of day one rather than at midnight. */
const INITIAL: View = { x: 320, y: -392, scale: 1 }

/**
 * Pan/zoom for the board. The transform is written straight to the DOM on
 * every gesture frame — React state only trails behind for the zoom readout,
 * so panning never waits on a render.
 */
export function useViewport(
  viewportRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
) {
  const viewRef = useRef<View>(INITIAL)
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

  function apply(next: View) {
    viewRef.current = next
    paint()
    if (!syncing.current) {
      syncing.current = requestAnimationFrame(() => {
        syncing.current = 0
        setScale(viewRef.current.scale)
      })
    }
  }

  // Paint the initial transform once; refs are stable for the app's lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(paint, [])

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
