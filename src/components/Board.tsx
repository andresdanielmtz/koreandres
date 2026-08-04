import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CANVAS_MIN_H,
  CANVAS_MIN_W,
  DAY_STRIDE,
  GUTTER_W,
  LANE_W,
  LANE_X,
  MAP_DEFAULT_LABEL,
  MAP_PANE_DEFAULT,
  MAP_PANE_MAX_RATIO,
  MAP_PANE_MIN,
  MIN_DURATION,
  MIN_PER_DAY,
  PX_PER_MIN,
} from '../lib/constants'
import {
  boardBounds,
  canvasRect,
  packLanes,
  rectFromPoints,
  rectsOverlap,
  timelineRect,
} from '../lib/geometry'
import { placeFromUrl } from '../lib/maps'
import { clamp, dayTop, formatDayLabel, formatTime, snap, timeToY, yToTime } from '../lib/time'
import { refEq } from '../lib/types'
import type { CanvasBlock, ColorName, Ref, Rect, Snapshot } from '../lib/types'
import type { Itinerary } from '../state/useItinerary'
import { useTheme } from '../state/useTheme'
import { useViewport } from '../state/useViewport'
import { CanvasBlockView, type ResizeDir } from './CanvasBlockView'
import { ContextMenu, type MenuEntry } from './ContextMenu'
import { LinkLayer, type Draft } from './LinkLayer'
import { MapPane, type MapField, type MapView } from './MapPane'
import { Rail } from './Rail'
import { Toolbar } from './Toolbar'
import { TimelineBlockView, type ResizeEdge } from './TimelineBlockView'
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconLink,
  IconNote,
  IconPin,
  IconPlus,
  IconRoute,
  IconTarget,
  IconTrash,
} from './icons'

type EditField = 'title' | 'body' | 'url'
type Editing = { ref: Ref; field: EditField }
type Menu = { x: number; y: number; entries: MenuEntry[] }
type DraftState = { source: Ref; board: { x: number; y: number }; client: { x: number; y: number }; target: Ref | null }

/** Where a day boundary is parked, in pixels down from the top of the viewport. */
const DAY_ANCHOR_Y = 88

/** Width of the map pane, remembered per browser. */
const PANE_KEY = 'itinerary.mapPane'

const clampPane = (w: number) =>
  clamp(w, MAP_PANE_MIN, Math.max(MAP_PANE_MIN, window.innerWidth * MAP_PANE_MAX_RATIO))

function readPaneWidth(): number {
  const saved = Number(localStorage.getItem(PANE_KEY))
  return clampPane(Number.isFinite(saved) && saved > 0 ? saved : MAP_PANE_DEFAULT)
}

const isEditable = (el: EventTarget | null) => {
  const node = el as HTMLElement | null
  return !!node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName))
}

export function Board({ itinerary, snapshot }: { itinerary: Itinerary; snapshot: Snapshot }) {
  const { board, timeline, canvas, links } = snapshot
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const viewport = useViewport(viewportRef, contentRef, boardBounds(board.days, canvas))
  const theme = useTheme()

  const [selection, setSelection] = useState<Ref[]>([])
  const [selectedLink, setSelectedLink] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [paneW, setPaneW] = useState(readPaneWidth)
  const [splitting, setSplitting] = useState(false)
  const [mapFocus, setMapFocus] = useState<{ field: MapField } | null>(null)

  const lanes = packLanes(timeline)

  const rectFor = (ref: Ref): Rect | null => {
    if (ref.kind === 'timeline') {
      const b = timeline.find((x) => x.id === ref.id)
      return b ? timelineRect(b, lanes.get(b.id)) : null
    }
    const b = canvas.find((x) => x.id === ref.id)
    return b ? canvasRect(b) : null
  }

  const colorFor = (ref: Ref): ColorName => {
    const b =
      ref.kind === 'timeline'
        ? timeline.find((x) => x.id === ref.id)
        : canvas.find((x) => x.id === ref.id)
    return b?.color ?? 'slate'
  }

  const isSelected = (ref: Ref) => selection.some((r) => refEq(r, ref))

  const editFieldFor = (ref: Ref): EditField | null =>
    editing && editing.ref.kind === ref.kind && editing.ref.id === ref.id ? editing.field : null

  /**
   * Ctrl/⌘+click toggles a block in and out of the selection; a plain click
   * replaces it — except on a block that is already selected, which keeps the
   * group so it can be dragged as one. That case collapses on release instead,
   * once it's clear the pointer never moved.
   */
  function select(ref: Ref, additive: boolean) {
    setSelection((prev) => {
      const has = prev.some((r) => refEq(r, ref))
      if (!additive) return has ? prev : [ref]
      return has ? prev.filter((r) => !refEq(r, ref)) : [...prev, ref]
    })
  }

  /** Duplicate every block in `refs`; returns the copies, to select in turn. */
  function duplicateAll(refs: Ref[]): Ref[] {
    return refs.flatMap((ref) => {
      const copy = itinerary.duplicateBlock(ref)
      return copy ? [copy] : []
    })
  }

  function removeAll(refs: Ref[]) {
    // `removeBlock` reads `snapRef`, so a loop sees each previous removal.
    for (const ref of refs) itinerary.removeBlock(ref)
    setSelection([])
  }

  /* --------------------------------------------------------------- drags -- */

  /**
   * Shared pointer plumbing. Deltas arrive in board space, and nothing fires
   * until the pointer clears a 3px threshold, so a click still reads as a
   * click.
   */
  function startDrag(
    e: React.PointerEvent,
    onMove: (dx: number, dy: number, ev: PointerEvent) => void,
    onEnd?: (moved: boolean) => void,
  ) {
    const startX = e.clientX
    const startY = e.clientY
    const { scale } = viewport.getView()
    let moved = false

    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return
      if (!moved) {
        moved = true
        setDragging(true)
      }
      onMove((ev.clientX - startX) / scale, (ev.clientY - startY) / scale, ev)
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDragging(false)
      onEnd?.(moved)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /**
   * Grab a block. Whatever else is selected comes with it, so a multi-selection
   * moves as one — timeline blocks still re-derive their day and time from the
   * dragged y, so they keep snapping; canvas blocks just take the raw delta.
   */
  function grabBlock(e: React.PointerEvent, ref: Ref) {
    if (e.button !== 0 || viewport.spaceHeld) return
    e.stopPropagation()
    const additive = e.metaKey || e.ctrlKey
    const refs = isSelected(ref) ? selection : [ref]

    select(ref, additive)
    setSelectedLink(null)
    if (editing?.ref.id !== ref.id) setEditing(null)
    // Ctrl+click is a selection gesture — dragging from it would fight the toggle.
    if (additive) return

    const canvasFrom = refs.flatMap((r) => {
      const b = r.kind === 'canvas' ? canvas.find((x) => x.id === r.id) : null
      return b ? [{ id: b.id, x: b.x, y: b.y }] : []
    })
    const timelineFrom = refs.flatMap((r) => {
      const b = r.kind === 'timeline' ? timeline.find((x) => x.id === r.id) : null
      return b ? [{ id: b.id, y: timeToY(b.dayIndex, b.startMin), span: b.endMin - b.startMin }] : []
    })

    startDrag(
      e,
      (dx, dy) => {
        for (const o of canvasFrom) {
          itinerary.updateCanvas(o.id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }, false)
        }
        for (const o of timelineFrom) {
          const { dayIndex, minute } = yToTime(o.y + dy, board.days)
          const startMin = clamp(snap(minute), 0, MIN_PER_DAY - o.span)
          itinerary.updateTimeline(o.id, { dayIndex, startMin, endMin: startMin + o.span }, false)
        }
      },
      (moved) => {
        if (!moved) {
          if (refs.length > 1) setSelection([ref])
          return
        }
        for (const o of canvasFrom) itinerary.commitCanvas(o.id)
        for (const o of timelineFrom) itinerary.commitTimeline(o.id)
      },
    )
  }

  function resizeTimeline(e: React.PointerEvent, id: string, edge: ResizeEdge) {
    if (e.button !== 0) return
    const block = timeline.find((b) => b.id === id)
    if (!block) return
    e.stopPropagation()
    setSelection([{ kind: 'timeline', id }])

    const start0 = block.startMin
    const end0 = block.endMin

    startDrag(
      e,
      (_dx, dy) => {
        const delta = dy / PX_PER_MIN
        if (edge === 'top') {
          const startMin = clamp(snap(start0 + delta), 0, end0 - MIN_DURATION)
          itinerary.updateTimeline(id, { startMin }, false)
        } else {
          const endMin = clamp(snap(end0 + delta), start0 + MIN_DURATION, MIN_PER_DAY)
          itinerary.updateTimeline(id, { endMin }, false)
        }
      },
      (moved) => moved && itinerary.commitTimeline(id),
    )
  }

  function resizeCanvas(e: React.PointerEvent, id: string, dir: ResizeDir) {
    if (e.button !== 0) return
    const block = canvas.find((b) => b.id === id)
    if (!block) return
    e.stopPropagation()
    setSelection([{ kind: 'canvas', id }])

    const { x, y, width, height } = block
    const west = dir.includes('w')
    const east = dir.includes('e')
    const north = dir.includes('n')
    const south = dir.includes('s')

    startDrag(
      e,
      (dx, dy) => {
        const patch: Partial<CanvasBlock> = {}
        if (east) patch.width = Math.max(CANVAS_MIN_W, Math.round(width + dx))
        if (west) {
          const w = Math.max(CANVAS_MIN_W, Math.round(width - dx))
          patch.width = w
          patch.x = Math.round(x + width - w)
        }
        if (south) patch.height = Math.max(CANVAS_MIN_H, Math.round(height + dy))
        if (north) {
          const h = Math.max(CANVAS_MIN_H, Math.round(height - dy))
          patch.height = h
          patch.y = Math.round(y + height - h)
        }
        itinerary.updateCanvas(id, patch, false)
      },
      (moved) => moved && itinerary.commitCanvas(id),
    )
  }

  /* ---------------------------------------------------------------- links -- */

  function refAt(clientX: number, clientY: number): Ref | null {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const holder = el?.closest('[data-ref]') as HTMLElement | null
    const value = holder?.dataset.ref
    if (!value) return null
    const [kind, id] = value.split(':')
    return { kind: kind as Ref['kind'], id }
  }

  function startLink(e: React.PointerEvent, source: Ref) {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelection([source])
    setEditing(null)

    const point = viewport.toBoard(e.clientX, e.clientY)
    setDraft({ source, board: point, client: { x: e.clientX, y: e.clientY }, target: null })

    const move = (ev: PointerEvent) => {
      const hit = refAt(ev.clientX, ev.clientY)
      setDraft({
        source,
        board: viewport.toBoard(ev.clientX, ev.clientY),
        client: { x: ev.clientX, y: ev.clientY },
        target: hit && hit.id !== source.id ? hit : null,
      })
    }

    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)

      const hit = refAt(ev.clientX, ev.clientY)
      if (hit && hit.id !== source.id) {
        itinerary.addLink(source, hit)
        setSelection([hit])
      } else {
        // Dropped on nothing: spawn the data block the link was reaching for.
        const at = viewport.toBoard(ev.clientX, ev.clientY)
        const created = itinerary.addCanvasBlock('data', at.x, at.y - 40, {
          color: colorFor(source),
        })
        if (created) {
          itinerary.addLink(source, { kind: 'canvas', id: created.id })
          setSelection([{ kind: 'canvas', id: created.id }])
          setEditing({ ref: { kind: 'canvas', id: created.id }, field: 'title' })
        }
      }
      setDraft(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /* ----------------------------------------------------------------- menu -- */

  function blockEntries(ref: Ref): MenuEntry[] {
    const canvasBlock = ref.kind === 'canvas' ? canvas.find((b) => b.id === ref.id) : null
    return [
      {
        kind: 'label',
        text:
          ref.kind === 'timeline'
            ? 'Time block'
            : canvasBlock?.kind === 'travel'
              ? 'Travel block'
              : 'Data block',
      },
      { kind: 'colors', value: colorFor(ref), onPick: (c) => itinerary.setColor(ref, c) },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Rename',
        hint: '⏎',
        icon: <IconNote size={13} />,
        onSelect: () => setEditing({ ref, field: 'title' }),
      },
      // A time block keeps its location and link in the map pane rather than on
      // the block, so these open the pane's fields instead of an inline editor.
      ...(ref.kind === 'timeline'
        ? [
            {
              kind: 'item' as const,
              label: 'Set location',
              icon: <IconPin size={13} />,
              onSelect: () => setMapFocus({ field: 'place' }),
            },
            {
              kind: 'item' as const,
              label: 'Edit link URL',
              icon: <IconLink size={13} />,
              onSelect: () => setMapFocus({ field: 'url' }),
            },
          ]
        : [
            {
              kind: 'item' as const,
              label: 'Edit link URL',
              icon: <IconLink size={13} />,
              onSelect: () => setEditing({ ref, field: 'url' }),
            },
          ]),
      {
        kind: 'item',
        label: 'Duplicate',
        hint: '⌘D',
        icon: <IconCopy size={13} />,
        onSelect: () => {
          const copy = itinerary.duplicateBlock(ref)
          if (copy) setSelection([copy])
        },
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Delete',
        hint: '⌫',
        icon: <IconTrash size={13} />,
        danger: true,
        onSelect: () => removeAll([ref]),
      },
    ]
  }

  /** Right-clicking inside a multi-selection acts on all of it. */
  function groupEntries(refs: Ref[]): MenuEntry[] {
    return [
      { kind: 'label', text: `${refs.length} blocks` },
      {
        kind: 'colors',
        value: colorFor(refs[0]),
        onPick: (c) => refs.forEach((r) => itinerary.setColor(r, c)),
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Duplicate',
        hint: '⌘D',
        icon: <IconCopy size={13} />,
        onSelect: () => {
          const copies = duplicateAll(refs)
          if (copies.length) setSelection(copies)
        },
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: `Delete ${refs.length} blocks`,
        hint: '⌫',
        icon: <IconTrash size={13} />,
        danger: true,
        onSelect: () => removeAll(refs),
      },
    ]
  }

  function openBackgroundMenu(e: React.MouseEvent) {
    e.preventDefault()
    const at = viewport.toBoard(e.clientX, e.clientY)
    const { dayIndex, minute } = yToTime(at.y, board.days)
    const onRail = at.x > -GUTTER_W - 260 && at.x < LANE_X + LANE_W + 60

    setSelection([])
    setSelectedLink(null)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [
        {
          kind: 'item',
          label: 'Add data block',
          icon: <IconNote size={13} />,
          onSelect: () => {
            const created = itinerary.addCanvasBlock('data', at.x, at.y)
            if (created) {
              setSelection([{ kind: 'canvas', id: created.id }])
              setEditing({ ref: { kind: 'canvas', id: created.id }, field: 'title' })
            }
          },
        },
        {
          kind: 'item',
          label: 'Add travel block',
          icon: <IconRoute size={13} />,
          onSelect: () => {
            const created = itinerary.addCanvasBlock('travel', at.x, at.y)
            if (created) {
              setSelection([{ kind: 'canvas', id: created.id }])
              setEditing({ ref: { kind: 'canvas', id: created.id }, field: 'title' })
            }
          },
        },
        { kind: 'separator' },
        {
          kind: 'item',
          label: 'Add time block',
          hint: onRail ? formatTime(snap(minute)) : undefined,
          icon: <IconPlus size={13} />,
          onSelect: () => {
            const created = itinerary.addTimelineBlock(dayIndex, minute)
            if (created) {
              setSelection([{ kind: 'timeline', id: created.id }])
              setEditing({ ref: { kind: 'timeline', id: created.id }, field: 'title' })
            }
          },
        },
        { kind: 'separator' },
        {
          kind: 'item',
          label: 'Reset view',
          hint: '0',
          icon: <IconTarget size={13} />,
          onSelect: viewport.reset,
        },
      ],
    })
  }

  function openBlockMenu(e: React.MouseEvent, ref: Ref) {
    e.preventDefault()
    e.stopPropagation()
    const group = isSelected(ref) && selection.length > 1
    if (!group) setSelection([ref])
    setSelectedLink(null)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: group ? groupEntries(selection) : blockEntries(ref),
    })
  }

  function openLinkMenu(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedLink(id)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [
        { kind: 'label', text: 'Connection' },
        {
          kind: 'item',
          label: 'Delete link',
          hint: '⌫',
          icon: <IconTrash size={13} />,
          danger: true,
          onSelect: () => {
            itinerary.removeLink(id)
            setSelectedLink(null)
          },
        },
      ],
    })
  }

  /* ------------------------------------------------------------------ days -- */

  /**
   * Step the view to the previous / next day. The current day is read back out
   * of the transform rather than tracked, so it stays honest after a free pan —
   * and stepping up from mid-day lands on the top of the day you are already on.
   *
   * The step is read from where a slide already underway is going to land, not
   * from the frame it is on, so holding the arrow down walks a day at a time.
   */
  function goToDay(step: -1 | 1) {
    const v = viewport.getTarget()
    const anchored = (DAY_ANCHOR_Y - v.y) / v.scale
    const raw = anchored / DAY_STRIDE
    const current = Math.floor(raw)
    const next = step > 0 ? current + 1 : raw - current > 0.01 ? current : current - 1
    viewport.glideBy(0, (anchored - dayTop(clamp(next, 0, board.days - 1))) * v.scale)
  }

  /* -------------------------------------------------------------- preview -- */

  /**
   * What the map on the right is looking at. One selected block wins; a time
   * block answers with its own location, a loose card with whatever place its
   * link carries. Anything else — nothing selected, or a group — falls back to
   * the city.
   */
  function mapView(): MapView {
    const only = selection.length === 1 ? selection[0] : null

    const block = only?.kind === 'timeline' ? timeline.find((b) => b.id === only.id) : null
    if (block) {
      return {
        id: `timeline:${block.id}`,
        title: block.title || block.placeLabel || 'Untitled',
        meta: `${formatDayLabel(board.startDate, block.dayIndex)} · ${formatTime(block.startMin)} – ${formatTime(block.endMin)}`,
        // The location field is the one that matters, but a Maps link left in
        // the link field still counts as saying where the block is.
        query: block.place.trim() || (placeFromUrl(block.url) ? block.url : ''),
        lat: block.placeLat,
        lng: block.placeLng,
        zoom: block.placeZoom,
        label: block.placeLabel,
        place: block.place,
        url: block.url,
        // Editing the location throws away what the old one resolved to, so
        // the new text is looked up rather than flown to the old point.
        onPlace: (place) =>
          itinerary.updateTimeline(block.id, {
            place,
            placeLabel: '',
            placeLat: null,
            placeLng: null,
            placeZoom: null,
          }),
        onUrl: (url) => itinerary.updateTimeline(block.id, { url }),
        onResolved: (found) =>
          itinerary.updateTimeline(block.id, {
            placeLabel: found.label,
            placeLat: found.lat,
            placeLng: found.lng,
            placeZoom: found.zoom,
            // Pasting a link is meant to be the whole job, so a block that
            // was never named takes the name of the place. One you've titled
            // yourself is left alone.
            ...(block.title.trim() ? {} : { title: found.label }),
          }),
      }
    }

    const card = only?.kind === 'canvas' ? canvas.find((b) => b.id === only.id) : null
    if (card) {
      const travel = card.kind === 'travel'
      return {
        id: `canvas:${card.id}`,
        title: card.title || (travel ? 'Travel leg' : 'Untitled data'),
        meta: travel ? 'Travel block' : 'Data block',
        query: placeFromUrl(card.url) ? card.url : '',
        lat: null,
        lng: null,
        zoom: null,
        label: '',
        place: '',
        url: card.url,
        onPlace: null,
        onUrl: null,
        // A loose card has nowhere to keep the answer, so it looks up each
        // time — the cache in the hook means that costs one request a session.
        onResolved: null,
      }
    }

    return {
      id: '',
      title: MAP_DEFAULT_LABEL,
      meta:
        selection.length > 1
          ? `${selection.length} blocks selected`
          : 'Select a block to see where it is',
      query: '',
      lat: null,
      lng: null,
      zoom: null,
      label: '',
      place: '',
      url: '',
      onPlace: null,
      onUrl: null,
      onResolved: null,
    }
  }

  /** Drag the divider. The pane is measured from the right edge of the window,
   *  so the width follows the pointer without tracking where it started. */
  function startSplit(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    setSplitting(true)
    let width = paneW

    const move = (ev: PointerEvent) => {
      width = clampPane(window.innerWidth - ev.clientX)
      setPaneW(width)
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setSplitting(false)
      localStorage.setItem(PANE_KEY, String(Math.round(width)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /* A narrower window can leave the saved pane wider than the cap allows. */
  useEffect(() => {
    const onResize = () => setPaneW((w) => clampPane(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* -------------------------------------------------------------- marquee -- */

  /** Every block the box touches. */
  function refsIn(box: Rect): Ref[] {
    const hits: Ref[] = []
    for (const b of canvas) {
      if (rectsOverlap(box, canvasRect(b))) hits.push({ kind: 'canvas', id: b.id })
    }
    for (const b of timeline) {
      if (rectsOverlap(box, timelineRect(b, lanes.get(b.id)))) {
        hits.push({ kind: 'timeline', id: b.id })
      }
    }
    return hits
  }

  /**
   * Ctrl/⌘+drag on empty space draws a selection box. It's the same modifier
   * that adds one block at a time, so whatever the box catches joins the
   * selection instead of replacing it. A plain drag still pans.
   */
  function startMarquee(e: React.PointerEvent) {
    const from = viewport.toBoard(e.clientX, e.clientY)
    setSelectedLink(null)
    setEditing(null)
    setMarquee(rectFromPoints(from, from))

    const boxAt = (ev: PointerEvent) =>
      rectFromPoints(from, viewport.toBoard(ev.clientX, ev.clientY))

    const move = (ev: PointerEvent) => setMarquee(boxAt(ev))
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      const box = boxAt(ev)
      setMarquee(null)
      // A stray Ctrl+click on the background isn't a box — leave the selection be.
      if (box.w < 3 && box.h < 3) return
      const hits = refsIn(box)
      setSelection((prev) => [...prev, ...hits.filter((r) => !prev.some((p) => refEq(p, r)))])
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /* ------------------------------------------------------------ background -- */

  function onBackgroundDown(e: React.PointerEvent) {
    if (e.button === 2) return
    const el = e.target as HTMLElement
    const onBlock = el.closest('[data-ref]') || el.closest('button') || el.closest('a')
    if (e.button === 1 || viewport.spaceHeld) {
      e.preventDefault()
      viewport.beginPan(e)
      return
    }
    if (onBlock) return
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      startMarquee(e)
      return
    }
    setSelection([])
    setSelectedLink(null)
    setEditing(null)
    viewport.beginPan(e)
  }

  function onBackgroundDoubleClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement
    // Controls sitting over the board get double-clicked too — twice on "next
    // day" shouldn't also drop a block behind it. A held modifier means the
    // gesture was two stabs at a marquee, not a request for a block.
    if (el.closest('[data-ref]') || el.closest('button') || el.closest('a')) return
    if (e.metaKey || e.ctrlKey) return
    const at = viewport.toBoard(e.clientX, e.clientY)
    const onRail = at.x > -GUTTER_W && at.x < LANE_X + LANE_W + 24

    if (onRail) {
      const { dayIndex, minute } = yToTime(at.y, board.days)
      const created = itinerary.addTimelineBlock(dayIndex, minute)
      if (created) {
        setSelection([{ kind: 'timeline', id: created.id }])
        setEditing({ ref: { kind: 'timeline', id: created.id }, field: 'title' })
      }
    } else {
      const created = itinerary.addCanvasBlock('data', at.x, at.y - 40)
      if (created) {
        setSelection([{ kind: 'canvas', id: created.id }])
        setEditing({ ref: { kind: 'canvas', id: created.id }, field: 'title' })
      }
    }
  }

  /* ------------------------------------------------------------- keyboard -- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return

      if (e.key === 'Escape') {
        setMenu(null)
        setSelection([])
        setSelectedLink(null)
        setEditing(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedLink) {
          e.preventDefault()
          itinerary.removeLink(selectedLink)
          setSelectedLink(null)
        } else if (selection.length) {
          e.preventDefault()
          removeAll(selection)
        }
        return
      }
      // Rename only makes sense for one block at a time.
      if (e.key === 'Enter' && selection.length === 1) {
        e.preventDefault()
        setEditing({ ref: selection[0], field: 'title' })
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && selection.length) {
        e.preventDefault()
        const copies = duplicateAll(selection)
        if (copies.length) setSelection(copies)
        return
      }
      if (e.key === '0' && !e.metaKey && !e.ctrlKey) viewport.reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `itinerary` and `viewport` are fresh objects each render; their methods
    // read live state, so only the selection needs to re-bind the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, selectedLink])

  /* Open each board on its first block rather than at midnight on day one. */
  useEffect(() => {
    const first = timeline.reduce<typeof timeline[number] | null>(
      (best, b) =>
        !best || b.dayIndex < best.dayIndex || (b.dayIndex === best.dayIndex && b.startMin < best.startMin)
          ? b
          : best,
      null,
    )
    const y = first ? timeToY(first.dayIndex, first.startMin) : 8 * 60 * PX_PER_MIN
    viewport.focus(0, y - 72)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id])

  /* ---------------------------------------------------------------- render -- */

  const draftLine: Draft | null = (() => {
    if (!draft) return null
    const from = rectFor(draft.source)
    if (!from) return null
    const target = draft.target ? rectFor(draft.target) : null
    const to = target
      ? { x: target.x + target.w / 2, y: target.y + target.h / 2 }
      : draft.board
    return { from, to, color: colorFor(draft.source) }
  })()

  const isTargeted = (ref: Ref) =>
    !!draft?.target && draft.target.kind === ref.kind && draft.target.id === ref.id

  // A cross-origin iframe swallows the pointer, so the map stops taking events
  // for the length of any gesture that might travel across it.
  const busy = dragging || splitting || viewport.panning || !!draft

  return (
    <div
      className="app"
      data-busy={busy ? '' : undefined}
      data-splitting={splitting ? '' : undefined}
    >
      <Toolbar
        board={board}
        boards={itinerary.boards}
        mode={itinerary.mode}
        status={itinerary.status}
        zoom={viewport.scale}
        theme={theme.mode}
        onTheme={theme.setMode}
        onOpenBoard={(id) => void itinerary.openBoard(id)}
        onNewBoard={() => void itinerary.createBoard('Untitled itinerary', board.startDate)}
        onDeleteBoard={(id) => void itinerary.deleteBoard(id)}
        onPatchBoard={itinerary.updateBoard}
        onZoom={viewport.zoomBy}
        onResetView={viewport.reset}
      />

      <div className="stage">
        <div
          ref={viewportRef}
          className="viewport"
          data-panning={viewport.panning ? '' : undefined}
          data-space={viewport.spaceHeld ? '' : undefined}
          data-dragging={dragging ? '' : undefined}
          data-linking={draft ? '' : undefined}
          onPointerDown={onBackgroundDown}
          onDoubleClick={onBackgroundDoubleClick}
          onContextMenu={openBackgroundMenu}
        >
          <div ref={contentRef} className="content">
            <div className="grid" />

            <Rail
              days={board.days}
              startDate={board.startDate}
              onAddDay={() => itinerary.updateBoard({ days: board.days + 1 })}
            />

            <LinkLayer
              links={links}
              rectFor={rectFor}
              colorFor={colorFor}
              selected={selectedLink}
              onSelect={(id) => {
                setSelectedLink(id)
                setSelection([])
              }}
              onContext={openLinkMenu}
              draft={draftLine}
            />

            {canvas.map((block) => {
              const ref: Ref = { kind: 'canvas', id: block.id }
              return (
                <CanvasBlockView
                  key={block.id}
                  block={block}
                  selected={isSelected(ref)}
                  editing={editFieldFor(ref)}
                  targeted={isTargeted(ref)}
                  linking={!!draft}
                  onGrab={(e) => grabBlock(e, ref)}
                  onResize={(e, dir) => resizeCanvas(e, block.id, dir)}
                  onPort={(e) => startLink(e, ref)}
                  onContext={(e) => openBlockMenu(e, ref)}
                  onEdit={(field) => setEditing({ ref, field })}
                  onPatch={(patch) => itinerary.updateCanvas(block.id, patch)}
                  onEditDone={() => setEditing(null)}
                />
              )
            })}

            {timeline.map((block) => {
              const ref: Ref = { kind: 'timeline', id: block.id }
              return (
                <TimelineBlockView
                  key={block.id}
                  block={block}
                  rect={timelineRect(block, lanes.get(block.id))}
                  selected={isSelected(ref)}
                  editing={editFieldFor(ref) === 'title'}
                  targeted={isTargeted(ref)}
                  linking={!!draft}
                  onGrab={(e) => grabBlock(e, ref)}
                  onResize={(e, edge) => resizeTimeline(e, block.id, edge)}
                  onPort={(e) => startLink(e, ref)}
                  onContext={(e) => openBlockMenu(e, ref)}
                  onEdit={() => setEditing({ ref, field: 'title' })}
                  onTitle={(title) => itinerary.updateTimeline(block.id, { title })}
                  onEditDone={() => setEditing(null)}
                />
              )
            })}

            {marquee && (
              <div
                className="marquee"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                  // The box rides inside the scaled content, so the border is
                  // divided back out to stay a hairline at any zoom.
                  borderWidth: 1 / viewport.scale,
                }}
              />
            )}
          </div>

          <div className="day-nav">
            <button type="button" aria-label="Previous day" title="Previous day" onClick={() => goToDay(-1)}>
              <IconArrowUp size={13} />
            </button>
            <button type="button" aria-label="Next day" title="Next day" onClick={() => goToDay(1)}>
              <IconArrowDown size={13} />
            </button>
          </div>

          <div className="hints">
            <kbd>Scroll</kbd> pan · <kbd>⌘</kbd>+scroll zoom · <kbd>Space</kbd> drag ·{' '}
            <kbd>⌘</kbd>+click or drag multi-select · <kbd>Right-click</kbd> menu ·{' '}
            <kbd>Double-click</kbd> new block
          </div>
        </div>

        <div
          className="split"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the map"
          onPointerDown={startSplit}
        />

        <MapPane view={mapView()} width={paneW} theme={theme.resolved} focus={mapFocus} />
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />
      )}

      {draft &&
        createPortal(
          <div
            className="drag-hint"
            style={{
              left: Math.min(draft.client.x + 16, window.innerWidth - 316),
              top: draft.client.y + 18,
            }}
          >
            {draft.target ? 'Release to link' : 'Release on empty space to create a data block'}
          </div>,
          document.body,
        )}
    </div>
  )
}
