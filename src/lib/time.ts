import { DATE_LOCALE, DAY_STRIDE, MIN_PER_DAY, PX_PER_MIN, SNAP_MIN } from './constants'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const snap = (min: number, grid = SNAP_MIN) => Math.round(min / grid) * grid

/** Board-space y of the top of a day band. */
export const dayTop = (dayIndex: number) => dayIndex * DAY_STRIDE

/** Board-space y of a moment inside a day. */
export const timeToY = (dayIndex: number, minute: number) =>
  dayTop(dayIndex) + minute * PX_PER_MIN

/** Inverse of `timeToY`: which day + minute does this board-space y land on? */
export function yToTime(y: number, days: number): { dayIndex: number; minute: number } {
  const raw = Math.floor(y / DAY_STRIDE)
  const dayIndex = clamp(raw, 0, days - 1)
  const minute = clamp((y - dayTop(dayIndex)) / PX_PER_MIN, 0, MIN_PER_DAY)
  return { dayIndex, minute }
}

export function formatTime(minute: number): string {
  const m = clamp(Math.round(minute), 0, MIN_PER_DAY)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  if (rest === 0) return `${h}h`
  return `${h}h ${rest}m`
}

/** Parses a YYYY-MM-DD string as a *local* date (avoids the UTC shift). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, n: number): Date {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + n)
  return date
}

const longDate = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const weekday = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: 'long' })

export const formatDayLabel = (startDate: string, dayIndex: number) =>
  longDate.format(addDays(startDate, dayIndex))

export const formatWeekday = (startDate: string, dayIndex: number) =>
  weekday.format(addDays(startDate, dayIndex))
