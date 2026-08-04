import type { ColorName } from './types'

/* ------------------------------------------------------------------ time -- */

export const MIN_PER_DAY = 1440
/** Board-space pixels per minute at zoom 1. A day is 1440px tall. */
export const PX_PER_MIN = 1
/** Vertical breathing room drawn between two day bands. */
export const DAY_GAP = 72
export const DAY_HEIGHT = MIN_PER_DAY * PX_PER_MIN
export const DAY_STRIDE = DAY_HEIGHT + DAY_GAP

/** Everything on the rail snaps to this grid. */
export const SNAP_MIN = 15
export const MIN_DURATION = 15

/* -------------------------------------------------------------- geometry -- */

/** The rail spine sits at board-space x = 0. */
export const RAIL_X = 0
/** Left edge of the first lane of timeline blocks. */
export const LANE_X = 20
export const LANE_W = 208
export const LANE_GAP = 8
/** Hour labels live in the gutter immediately left of the spine. */
export const GUTTER_W = 46
/** Date headers are right-aligned to this board-space x. */
export const DATE_RIGHT = -(GUTTER_W + 26)

/** How far the rail's rules and night shading reach either side of the spine. */
export const RAIL_LEFT = -330
export const RAIL_RIGHT = LANE_X + LANE_W + 640
/** Room kept below the last day for the "Add day" button. */
export const RAIL_FOOT = 64
/** Empty space left around the content before a pan is stopped. */
export const PAN_MARGIN = 320

export const CANVAS_MIN_W = 140
export const CANVAS_MIN_H = 72
export const CANVAS_DEFAULT_W = 240
export const CANVAS_DEFAULT_H = 132

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2.5

/* ------------------------------------------------------------------- map -- */

/** Where the preview looks when nothing with a location is selected. */
export const MAP_DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }
export const MAP_DEFAULT_ZOOM = 11
export const MAP_DEFAULT_LABEL = 'Seoul'

/** How long the camera takes to fly from one place to the next. */
export const MAP_FLIGHT_MS = 1000
/** How far the camera pulls back mid-flight, per doubling of the distance it
 *  has to cover, and the most it will ever pull back. This is the number that
 *  decides whether a hop reads as a glide or a flash — one zoom level is twice
 *  as much ground, so it doesn't take much. */
export const MAP_FLIGHT_DIP = 0.5
export const MAP_FLIGHT_DIP_MAX = 2
/** Zoom the camera may settle at. A geocoded viewport picks within this. */
export const MAP_MIN_ZOOM = 3
export const MAP_MAX_ZOOM = 16
/** Held back from the exact fit, so a place sits in its surroundings instead
 *  of filling the pane. One level is twice as much ground. */
export const MAP_ZOOM_BACKOFF = 1.4
/** Bare coordinates carry no viewport to fit, so they land here. */
export const MAP_POINT_ZOOM = 15

/** Width of the preview pane, and how far the divider may be dragged. */
export const MAP_PANE_DEFAULT = 460
export const MAP_PANE_MIN = 280
export const MAP_PANE_MAX_RATIO = 0.7

/* ---------------------------------------------------------------- colors -- */

export const COLORS: ColorName[] = [
  'blue',
  'green',
  'red',
  'amber',
  'violet',
  'teal',
  'pink',
  'slate',
]

export const COLOR_LABEL: Record<ColorName, string> = {
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  amber: 'Amber',
  violet: 'Violet',
  teal: 'Teal',
  pink: 'Pink',
  slate: 'Slate',
}

/** Locale used for the day headers on the rail. */
export const DATE_LOCALE = 'es-ES'

/* ----------------------------------------------------------- new boards -- */

/** The trip window: 22 August 2026 through 31 August, inclusive. */
export const DEFAULT_START_DATE = '2026-08-22'
export const DEFAULT_DAYS = 10
export const DEFAULT_TITLE = 'Korea — 22–31 August 2026'
