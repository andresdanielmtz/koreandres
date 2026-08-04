import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CANVAS_MIN_H,
  CANVAS_MIN_W,
  DAY_STRIDE,
  GUTTER_W,
  LANE_W,
  LANE_X,
  MIN_DURATION,
  MIN_PER_DAY,
  PX_PER_MIN,
} from '../lib/constants'
import { boardBounds, canvasRect, packLanes, timelineRect } from '../lib/geometry'
import { clamp, dayTop, formatTime, snap, timeToY, yToTime } from '../lib/time'
import type { CanvasBlock, ColorName, Ref, Rect, Snapshot } from '../lib/types'
import type { Itinerary } from '../state/useItinerary'
import { useTheme } from '../state/useTheme'
import { useViewport } from '../state/useViewport'
import { CanvasBlockView, type ResizeDir } from './CanvasBlockView'
import { ContextMenu, type MenuEntry } from './ContextMenu'
import { LinkLayer, type Draft } from './LinkLayer'
import { Rail } from './Rail'
import { Toolbar } from './Toolbar'
import { TimelineBlockView, type ResizeEdge } from './TimelineBlockView'
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconLink,
  IconNote,
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

  const [selection, setSelection] = useState<Ref | null>(null)
  const [selectedLink, setSelectedLink] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [dragging, setDragging] = useState(false)

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

  const isSelected = (ref: Ref) =>
    selection?.kind === ref.kind && selection.id === ref.id

  const editFieldFor = (ref: Ref): EditField | null =>
    editing && editing.ref.kind === ref.kind && editing.ref.id === ref.id ? editing.field : null

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

  function grabTimeline(e: React.PointerEvent, id: string) {
    if (e.button !== 0 || viewport.spaceHeld) return
    const block = timeline.find((b) => b.id === id)
    if (!block) return
    e.stopPropagation()
    setSelection({ kind: 'timeline', id })
    setSelectedLink(null)
    if (editing?.ref.id !== id) setEditing(null)

    const duration = block.endMin - block.startMin
    const originY = timeToY(block.dayIndex, block.startMin)

    startDrag(
      e,
      (_dx, dy) => {
        const { dayIndex, minute } = yToTime(originY + dy, board.days)
        const startMin = clamp(snap(minute), 0, MIN_PER_DAY - duration)
        itinerary.updateTimeline(id, { dayIndex, startMin, endMin: startMin + duration }, false)
      },
      (moved) => moved && itinerary.commitTimeline(id),
    )
  }

  function resizeTimeline(e: React.PointerEvent, id: string, edge: ResizeEdge) {
    if (e.button !== 0) return
    const block = timeline.find((b) => b.id === id)
    if (!block) return
    e.stopPropagation()
    setSelection({ kind: 'timeline', id })

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

  function grabCanvas(e: React.PointerEvent, id: string) {
    if (e.button !== 0 || viewport.spaceHeld) return
    const block = canvas.find((b) => b.id === id)
    if (!block) return
    e.stopPropagation()
    setSelection({ kind: 'canvas', id })
    setSelectedLink(null)
    if (editing?.ref.id !== id) setEditing(null)

    const x0 = block.x
    const y0 = block.y

    startDrag(
      e,
      (dx, dy) => {
        itinerary.updateCanvas(id, { x: Math.round(x0 + dx), y: Math.round(y0 + dy) }, false)
      },
      (moved) => moved && itinerary.commitCanvas(id),
    )
  }

  function resizeCanvas(e: React.PointerEvent, id: string, dir: ResizeDir) {
    if (e.button !== 0) return
    const block = canvas.find((b) => b.id === id)
    if (!block) return
    e.stopPropagation()
    setSelection({ kind: 'canvas', id })

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
    setSelection(source)
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
        setSelection(hit)
      } else {
        // Dropped on nothing: spawn the data block the link was reaching for.
        const at = viewport.toBoard(ev.clientX, ev.clientY)
        const created = itinerary.addCanvasBlock('data', at.x, at.y - 40, {
          color: colorFor(source),
        })
        if (created) {
          itinerary.addLink(source, { kind: 'canvas', id: created.id })
          setSelection({ kind: 'canvas', id: created.id })
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
      ...(ref.kind === 'canvas'
        ? [
            {
              kind: 'item' as const,
              label: 'Edit link URL',
              icon: <IconLink size={13} />,
              onSelect: () => setEditing({ ref, field: 'url' }),
            },
          ]
        : []),
      {
        kind: 'item',
        label: 'Duplicate',
        hint: '⌘D',
        icon: <IconCopy size={13} />,
        onSelect: () => {
          const copy = itinerary.duplicateBlock(ref)
          if (copy) setSelection(copy)
        },
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Delete',
        hint: '⌫',
        icon: <IconTrash size={13} />,
        danger: true,
        onSelect: () => {
          itinerary.removeBlock(ref)
          setSelection(null)
        },
      },
    ]
  }

  function openBackgroundMenu(e: React.MouseEvent) {
    e.preventDefault()
    const at = viewport.toBoard(e.clientX, e.clientY)
    const { dayIndex, minute } = yToTime(at.y, board.days)
    const onRail = at.x > -GUTTER_W - 260 && at.x < LANE_X + LANE_W + 60

    setSelection(null)
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
              setSelection({ kind: 'canvas', id: created.id })
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
              setSelection({ kind: 'canvas', id: created.id })
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
              setSelection({ kind: 'timeline', id: created.id })
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
    setSelection(ref)
    setSelectedLink(null)
    setMenu({ x: e.clientX, y: e.clientY, entries: blockEntries(ref) })
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
   */
  function goToDay(step: -1 | 1) {
    const v = viewport.getView()
    const anchored = (DAY_ANCHOR_Y - v.y) / v.scale
    const raw = anchored / DAY_STRIDE
    const current = Math.floor(raw)
    const next = step > 0 ? current + 1 : raw - current > 0.01 ? current : current - 1
    viewport.panBy(0, (anchored - dayTop(clamp(next, 0, board.days - 1))) * v.scale)
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
    setSelection(null)
    setSelectedLink(null)
    setEditing(null)
    viewport.beginPan(e)
  }

  function onBackgroundDoubleClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement
    // Controls sitting over the board get double-clicked too — twice on "next
    // day" shouldn't also drop a block behind it.
    if (el.closest('[data-ref]') || el.closest('button') || el.closest('a')) return
    const at = viewport.toBoard(e.clientX, e.clientY)
    const onRail = at.x > -GUTTER_W && at.x < LANE_X + LANE_W + 24

    if (onRail) {
      const { dayIndex, minute } = yToTime(at.y, board.days)
      const created = itinerary.addTimelineBlock(dayIndex, minute)
      if (created) {
        setSelection({ kind: 'timeline', id: created.id })
        setEditing({ ref: { kind: 'timeline', id: created.id }, field: 'title' })
      }
    } else {
      const created = itinerary.addCanvasBlock('data', at.x, at.y - 40)
      if (created) {
        setSelection({ kind: 'canvas', id: created.id })
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
        setSelection(null)
        setSelectedLink(null)
        setEditing(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedLink) {
          e.preventDefault()
          itinerary.removeLink(selectedLink)
          setSelectedLink(null)
        } else if (selection) {
          e.preventDefault()
          itinerary.removeBlock(selection)
          setSelection(null)
        }
        return
      }
      if (e.key === 'Enter' && selection) {
        e.preventDefault()
        setEditing({ ref: selection, field: 'title' })
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && selection) {
        e.preventDefault()
        const copy = itinerary.duplicateBlock(selection)
        if (copy) setSelection(copy)
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

  return (
    <div className="app">
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
              setSelection(null)
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
                onGrab={(e) => grabCanvas(e, block.id)}
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
                onGrab={(e) => grabTimeline(e, block.id)}
                onResize={(e, edge) => resizeTimeline(e, block.id, edge)}
                onPort={(e) => startLink(e, ref)}
                onContext={(e) => openBlockMenu(e, ref)}
                onEdit={() => setEditing({ ref, field: 'title' })}
                onTitle={(title) => itinerary.updateTimeline(block.id, { title })}
                onEditDone={() => setEditing(null)}
              />
            )
          })}
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
          <kbd>Right-click</kbd> menu · <kbd>Double-click</kbd> new block
        </div>
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
