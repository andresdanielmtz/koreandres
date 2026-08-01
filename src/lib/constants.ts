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

export const CANVAS_MIN_W = 140
export const CANVAS_MIN_H = 72
export const CANVAS_DEFAULT_W = 240
export const CANVAS_DEFAULT_H = 132

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2.5

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
