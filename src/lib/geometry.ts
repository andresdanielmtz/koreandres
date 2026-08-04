import {
  DAY_HEIGHT,
  LANE_GAP,
  LANE_W,
  LANE_X,
  PAN_MARGIN,
  PX_PER_MIN,
  RAIL_FOOT,
  RAIL_LEFT,
  RAIL_RIGHT,
} from './constants'
import { dayTop, timeToY } from './time'
import type { Bounds, CanvasBlock, Point, Rect, Ref, TimelineBlock } from './types'

export type Lane = { lane: number; lanes: number }

/**
 * Calendar-style lane packing: blocks that overlap in time get pushed into
 * side-by-side lanes, and every block in an overlapping cluster reports the
 * same lane count so the cluster reads as one tidy column.
 */
export function packLanes(blocks: TimelineBlock[]): Map<string, Lane> {
  const out = new Map<string, Lane>()
  const byDay = new Map<number, TimelineBlock[]>()

  for (const b of blocks) {
    const list = byDay.get(b.dayIndex)
    if (list) list.push(b)
    else byDay.set(b.dayIndex, [b])
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

    let cluster: TimelineBlock[] = []
    let clusterEnd = -Infinity
    let laneEnds: number[] = []

    const flush = () => {
      const lanes = Math.max(1, laneEnds.length)
      for (const b of cluster) out.set(b.id, { lane: out.get(b.id)!.lane, lanes })
      cluster = []
      laneEnds = []
      clusterEnd = -Infinity
    }

    for (const b of list) {
      if (b.startMin >= clusterEnd && cluster.length) flush()

      let lane = laneEnds.findIndex((end) => end <= b.startMin)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(b.endMin)
      } else {
        laneEnds[lane] = b.endMin
      }

      out.set(b.id, { lane, lanes: 1 })
      cluster.push(b)
      clusterEnd = Math.max(clusterEnd, b.endMin)
    }
    if (cluster.length) flush()
  }

  return out
}

export function timelineRect(block: TimelineBlock, lane: Lane | undefined): Rect {
  const lanes = lane?.lanes ?? 1
  const index = lane?.lane ?? 0
  const total = LANE_W
  const w = (total - LANE_GAP * (lanes - 1)) / lanes
  return {
    x: LANE_X + index * (w + LANE_GAP),
    y: timeToY(block.dayIndex, block.startMin),
    w,
    h: (block.endMin - block.startMin) * PX_PER_MIN,
  }
}

export const canvasRect = (block: CanvasBlock): Rect => ({
  x: block.x,
  y: block.y,
  w: block.width,
  h: block.height,
})

/** Top of the rail spine, which reaches a little above day one. */
const RAIL_TOP = -56

/**
 * Everything the board occupies, plus a margin. The pan clamp keeps this box
 * covering the viewport, so you can never drift off into empty space — loose
 * canvas cards widen it as they are dragged out.
 */
export function boardBounds(days: number, canvas: CanvasBlock[]): Bounds {
  let minX = RAIL_LEFT
  let minY = RAIL_TOP
  let maxX = RAIL_RIGHT
  let maxY = dayTop(days - 1) + DAY_HEIGHT + RAIL_FOOT

  for (const b of canvas) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }

  return {
    minX: minX - PAN_MARGIN,
    minY: minY - PAN_MARGIN,
    maxX: maxX + PAN_MARGIN,
    maxY: maxY + PAN_MARGIN,
  }
}

/** The box two corners span, dragged in any direction. */
export const rectFromPoints = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
})

/** Touching counts as a hit, so a marquee only has to graze a block. */
export const rectsOverlap = (a: Rect, b: Rect) =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h

/* ----------------------------------------------------------------- links -- */

export type Edge = { x: number; y: number; side: 'left' | 'right' }

/** Where a link should leave / enter a rectangle, given the other endpoint. */
export function anchorFor(rect: Rect, towards: { x: number; y: number }): Edge {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const side = towards.x >= cx ? 'right' : 'left'
  return { x: side === 'right' ? rect.x + rect.w : rect.x, y: cy, side }
}

export const rectCenter = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** Cubic bezier with horizontal handles — reads as a calm, deliberate wire. */
export function linkPath(from: Edge, to: Edge): string {
  const dist = Math.abs(to.x - from.x)
  const pull = Math.min(180, Math.max(48, dist * 0.45))
  const c1 = from.x + (from.side === 'right' ? pull : -pull)
  const c2 = to.x + (to.side === 'right' ? pull : -pull)
  return `M ${from.x} ${from.y} C ${c1} ${from.y}, ${c2} ${to.y}, ${to.x} ${to.y}`
}

/** Solid arrowhead at the target end. The curve arrives horizontally. */
export function arrowHead(to: Edge, size = 7): string {
  // Entering a left edge means travelling right (+x), and vice versa.
  const dir = to.side === 'left' ? 1 : -1
  const tipX = to.x + dir * 1
  const backX = to.x - dir * size
  return `M ${tipX} ${to.y} L ${backX} ${to.y - size * 0.62} L ${backX} ${to.y + size * 0.62} Z`
}

export type RectLookup = (ref: Ref) => Rect | null
