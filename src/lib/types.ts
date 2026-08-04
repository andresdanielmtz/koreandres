export type BlockKind = 'timeline' | 'canvas'
export type CanvasKind = 'data' | 'travel'

export type ColorName =
  | 'blue'
  | 'green'
  | 'red'
  | 'amber'
  | 'violet'
  | 'teal'
  | 'pink'
  | 'slate'

export type Board = {
  id: string
  title: string
  /** ISO date (YYYY-MM-DD) of day index 0. */
  startDate: string
  days: number
}

export type TimelineBlock = {
  id: string
  boardId: string
  title: string
  notes: string
  dayIndex: number
  /** Minutes from midnight, 0–1440. */
  startMin: number
  endMin: number
  /** Exactly what was pasted into the location field: a Google Maps link,
   *  coordinates, or a place name. Empty means "no location yet". */
  place: string
  /** What that resolved to, and where. Filled in once the geocoder answers,
   *  and saved — so reopening a board flies straight there without asking
   *  Google again. Cleared whenever `place` is edited. */
  placeLabel: string
  placeLat: number | null
  placeLng: number | null
  /** How close to stand, taken from the geocoded viewport. */
  placeZoom: number | null
  url: string
  color: ColorName
}

export type CanvasBlock = {
  id: string
  boardId: string
  kind: CanvasKind
  title: string
  body: string
  url: string
  x: number
  y: number
  width: number
  height: number
  color: ColorName
}

export type Link = {
  id: string
  boardId: string
  sourceKind: BlockKind
  sourceId: string
  targetKind: BlockKind
  targetId: string
}

/** A pointer at any block on the board. */
export type Ref = { kind: BlockKind; id: string }

export type Snapshot = {
  board: Board
  timeline: TimelineBlock[]
  canvas: CanvasBlock[]
  links: Link[]
}

export type Point = { x: number; y: number }

export type Rect = { x: number; y: number; w: number; h: number }

/** An axis-aligned box in board space, as edges rather than size. */
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export const refEq = (a: Ref | null, b: Ref | null) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id
