/**
 * What a commute block is travelling between.
 *
 * Either end can be typed in, and usually neither is: a commute block dropped
 * into the gap between two things on the rail should already know it runs from
 * one to the other. So an empty end is read off the timeline — the nearest
 * event block before it, and the nearest one after.
 *
 * Nothing here talks to Google. It answers with the *text* of each end; turning
 * that into a route is `useGoogleMap`'s job.
 */
import { COMMUTE_GAP_MAX, MIN_PER_DAY } from './constants'
import type { TimelineBlock } from './types'

export type EndSource = 'typed' | 'block' | 'none'

export type CommuteEnd = {
  /** What to hand the router: coordinates when the block has them, else the
   *  text. Empty when there is nothing to go on. */
  query: string
  /** What to call it in the interface. */
  label: string
  source: EndSource
}

export type CommuteEnds = { from: CommuteEnd; to: CommuteEnd }

const EMPTY: CommuteEnd = { query: '', label: '', source: 'none' }

/** Minutes since the start of day zero, so a gap can cross midnight. */
const absolute = (b: TimelineBlock, edge: 'start' | 'end') =>
  b.dayIndex * MIN_PER_DAY + (edge === 'start' ? b.startMin : b.endMin)

/** Whether a block is worth routing to — an event that says where it is. */
const locatable = (b: TimelineBlock) =>
  b.kind === 'event' && (b.placeLat != null || !!b.place.trim())

/** A resolved point beats the pasted text: it is exact, and it costs the
 *  router no lookup. Text is what a block that has never been opened has. */
function endFromBlock(b: TimelineBlock): CommuteEnd {
  const query = b.placeLat != null && b.placeLng != null ? `${b.placeLat},${b.placeLng}` : b.place.trim()
  return { query, label: b.placeLabel || b.title.trim() || b.place.trim(), source: 'block' }
}

const endFromText = (text: string): CommuteEnd => ({
  query: text.trim(),
  label: text.trim(),
  source: 'typed',
})

/**
 * The nearest locatable event on the far side of `edge`, within
 * `COMMUTE_GAP_MAX` of it. Past that window the next thing on the rail is not
 * what this trip is for, and guessing would quietly route you to breakfast.
 */
function neighbour(
  block: TimelineBlock,
  blocks: TimelineBlock[],
  direction: -1 | 1,
): CommuteEnd {
  const edge = absolute(block, direction < 0 ? 'start' : 'end')
  let best: TimelineBlock | null = null
  let bestGap = Infinity

  for (const b of blocks) {
    if (b.id === block.id || !locatable(b)) continue
    // Before: measured from where it ends. After: from where it starts.
    const gap = direction < 0 ? edge - absolute(b, 'end') : absolute(b, 'start') - edge
    if (gap < 0 || gap > COMMUTE_GAP_MAX || gap >= bestGap) continue
    best = b
    bestGap = gap
  }

  return best ? endFromBlock(best) : EMPTY
}

/** Both ends of a commute block: what was typed, else what it sits between. */
export function commuteEnds(block: TimelineBlock, blocks: TimelineBlock[]): CommuteEnds {
  return {
    from: block.fromPlace.trim() ? endFromText(block.fromPlace) : neighbour(block, blocks, -1),
    to: block.toPlace.trim() ? endFromText(block.toPlace) : neighbour(block, blocks, 1),
  }
}

/** A commute can only be routed with both ends known. */
export const routable = (ends: CommuteEnds) => !!ends.from.query && !!ends.to.query

/** "Hongdae → Gyeongbokgung", for the block and the pane's heading. Takes an
 *  absent pair so a caller holding a map of them doesn't have to check. */
export function commuteTitle(ends: CommuteEnds | undefined): string {
  if (!ends || (!ends.from.label && !ends.to.label)) return ''
  return `${ends.from.label || '?'} → ${ends.to.label || '?'}`
}
