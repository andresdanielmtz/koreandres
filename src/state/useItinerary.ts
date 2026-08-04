import { useEffect, useRef, useState } from 'react'
import {
  CANVAS_DEFAULT_H,
  CANVAS_DEFAULT_W,
  DEFAULT_DAYS,
  DEFAULT_START_DATE,
  DEFAULT_TITLE,
  MIN_DURATION,
  MIN_PER_DAY,
} from '../lib/constants'
import { newId, resolveStore, type BoardSummary, type ItineraryStore } from '../lib/store'
import { clamp, snap, timeToY } from '../lib/time'
import type {
  Board,
  CanvasBlock,
  CanvasKind,
  ColorName,
  Link,
  Ref,
  Snapshot,
  TimelineBlock,
} from '../lib/types'

export type SaveStatus = 'idle' | 'saving' | 'error'

const LAST_BOARD_KEY = 'itinerary.lastBoard'

/** Content for the very first auto-created board, so it never opens blank.
 *  Day index 4 is 26 August — the day in the original sketch. */
const SEED_DAY = 4

function seedContent(boardId: string): Omit<Snapshot, 'board'> {
  const t1: TimelineBlock = {
    id: newId(),
    boardId,
    title: 'Shopping at Hongdae',
    notes: '',
    dayIndex: SEED_DAY,
    startMin: 10 * 60,
    endMin: 13 * 60,
    // Seeded unresolved on purpose: the first look at the board is what
    // geocodes them, and the answer is saved from there on.
    place: 'Hongdae, Seoul',
    placeLabel: '',
    placeLat: null,
    placeLng: null,
    placeZoom: null,
    url: '',
    color: 'blue',
  }
  const t2: TimelineBlock = {
    id: newId(),
    boardId,
    title: 'Palace — Gyeongbokgung',
    notes: '',
    dayIndex: SEED_DAY,
    startMin: 14 * 60,
    endMin: 15 * 60 + 30,
    place: 'Gyeongbokgung Palace, Seoul',
    placeLabel: '',
    placeLat: null,
    placeLng: null,
    placeZoom: null,
    url: '',
    color: 'green',
  }
  const c1: CanvasBlock = {
    id: newId(),
    boardId,
    kind: 'data',
    title: 'Gyeongbokgung',
    body: 'Entrance ₩3,000 · closes at 18:00',
    url: 'https://www.google.com/maps/search/?api=1&query=Gyeongbokgung+Palace',
    x: 480,
    y: timeToY(SEED_DAY, 14 * 60) - 30,
    width: CANVAS_DEFAULT_W,
    height: CANVAS_DEFAULT_H,
    color: 'green',
  }
  const link: Link = {
    id: newId(),
    boardId,
    sourceKind: 'timeline',
    sourceId: t2.id,
    targetKind: 'canvas',
    targetId: c1.id,
  }
  return { timeline: [t1, t2], canvas: [c1], links: [link] }
}

export function useItinerary() {
  const [store, setStore] = useState<ItineraryStore | null>(null)
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [snapshot, setSnapshotState] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<SaveStatus>('idle')

  /* A mirror of `snapshot` that is always current within the same tick, so a
     pointerup can flush the value a pointermove just wrote. */
  const snapRef = useRef<Snapshot | null>(null)
  const queue = useRef(new Map<string, () => Promise<void>>())
  const timer = useRef<number | null>(null)

  function setSnapshot(next: Snapshot | null) {
    snapRef.current = next
    setSnapshotState(next)
  }

  function patchSnapshot(fn: (s: Snapshot) => Snapshot) {
    const prev = snapRef.current
    if (prev) setSnapshot(fn(prev))
  }

  function flush() {
    timer.current = null
    const tasks = [...queue.current.values()]
    queue.current.clear()
    if (!tasks.length) return
    setStatus('saving')
    void (async () => {
      try {
        for (const task of tasks) await task()
        setStatus((s) => (s === 'saving' ? 'idle' : s))
      } catch (err) {
        console.error('[itinerary] write failed', err)
        setStatus('error')
      }
    })()
  }

  /** Coalesces writes per entity, so a whole drag costs one round trip. */
  function enqueue(key: string, task: () => Promise<void>) {
    queue.current.set(key, task)
    if (timer.current === null) timer.current = window.setTimeout(flush, 200)
  }

  /* ------------------------------------------------------------ bootstrap -- */

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await resolveStore()
      if (cancelled) return
      setStore(s)

      let list = await s.listBoards()
      let fresh = false

      if (!list.length) {
        const board = await s.createBoard({
          title: DEFAULT_TITLE,
          startDate: DEFAULT_START_DATE,
          days: DEFAULT_DAYS,
        })
        list = [board]
        fresh = true
      }

      const wanted = localStorage.getItem(LAST_BOARD_KEY)
      const target = list.find((b) => b.id === wanted) ?? list[0]
      localStorage.setItem(LAST_BOARD_KEY, target.id)
      const loaded = await s.loadBoard(target.id)

      if (fresh) {
        const extra = seedContent(target.id)
        for (const b of extra.timeline) await s.upsertTimeline(b)
        for (const b of extra.canvas) await s.upsertCanvas(b)
        for (const l of extra.links) await s.createLink(l)
        Object.assign(loaded, extra)
      }

      if (cancelled) return
      setBoards(list)
      setSnapshot(loaded)
      setLoading(false)
    })().catch((err) => {
      console.error('[itinerary] bootstrap failed', err)
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const boardId = snapshot?.board.id ?? null

  /* --------------------------------------------------------------- boards -- */

  async function openBoard(id: string) {
    if (!store || id === boardId) return
    setLoading(true)
    const loaded = await store.loadBoard(id)
    localStorage.setItem(LAST_BOARD_KEY, id)
    setSnapshot(loaded)
    setLoading(false)
  }

  async function createBoard(title: string, startDate: string, days = DEFAULT_DAYS) {
    if (!store) return
    const board = await store.createBoard({ title, startDate, days })
    setBoards((prev) => [...prev, board])
    localStorage.setItem(LAST_BOARD_KEY, board.id)
    setSnapshot({ board, timeline: [], canvas: [], links: [] })
  }

  async function deleteBoard(id: string) {
    if (!store) return
    await store.deleteBoard(id)
    const rest = boards.filter((b) => b.id !== id)
    setBoards(rest)
    if (id === boardId) {
      if (rest.length) {
        setSnapshot(await store.loadBoard(rest[0].id))
        localStorage.setItem(LAST_BOARD_KEY, rest[0].id)
      } else {
        await createBoard('Untitled itinerary', DEFAULT_START_DATE)
      }
    }
  }

  function updateBoard(patch: Partial<Board>) {
    const current = snapRef.current
    if (!current || !store) return
    const board = { ...current.board, ...patch }
    patchSnapshot((s) => ({ ...s, board }))
    setBoards((prev) => prev.map((b) => (b.id === board.id ? board : b)))
    enqueue(`board:${board.id}`, () => store.updateBoard(board))
  }

  /* ------------------------------------------------------ timeline blocks -- */

  function addTimelineBlock(dayIndex: number, startMin: number, color: ColorName = 'blue') {
    const current = snapRef.current
    if (!current || !store) return null
    const start = clamp(snap(startMin), 0, MIN_PER_DAY - 60)
    const block: TimelineBlock = {
      id: newId(),
      boardId: current.board.id,
      title: '',
      notes: '',
      dayIndex: clamp(dayIndex, 0, current.board.days - 1),
      startMin: start,
      endMin: Math.min(MIN_PER_DAY, start + 60),
      place: '',
      placeLabel: '',
      placeLat: null,
      placeLng: null,
      placeZoom: null,
      url: '',
      color,
    }
    patchSnapshot((s) => ({ ...s, timeline: [...s.timeline, block] }))
    enqueue(`t:${block.id}`, () => store.upsertTimeline(block))
    return block
  }

  /** Pass `commit = false` during a drag; call `commitTimeline` on release. */
  function updateTimeline(id: string, patch: Partial<TimelineBlock>, commit = true) {
    if (!store) return
    let next: TimelineBlock | undefined
    patchSnapshot((s) => ({
      ...s,
      timeline: s.timeline.map((b) => {
        if (b.id !== id) return b
        next = { ...b, ...patch }
        return next
      }),
    }))
    if (commit && next) {
      const value = next
      enqueue(`t:${id}`, () => store.upsertTimeline(value))
    }
  }

  function commitTimeline(id: string) {
    const block = snapRef.current?.timeline.find((b) => b.id === id)
    if (store && block) enqueue(`t:${id}`, () => store.upsertTimeline(block))
  }

  /* -------------------------------------------------------- canvas blocks -- */

  function addCanvasBlock(
    kind: CanvasKind,
    x: number,
    y: number,
    patch: Partial<CanvasBlock> = {},
  ) {
    const current = snapRef.current
    if (!current || !store) return null
    const block: CanvasBlock = {
      id: newId(),
      boardId: current.board.id,
      kind,
      title: '',
      body: '',
      url: '',
      x: Math.round(x),
      y: Math.round(y),
      width: CANVAS_DEFAULT_W,
      height: kind === 'travel' ? 96 : CANVAS_DEFAULT_H,
      color: kind === 'travel' ? 'slate' : 'green',
      ...patch,
    }
    patchSnapshot((s) => ({ ...s, canvas: [...s.canvas, block] }))
    enqueue(`c:${block.id}`, () => store.upsertCanvas(block))
    return block
  }

  function updateCanvas(id: string, patch: Partial<CanvasBlock>, commit = true) {
    if (!store) return
    let next: CanvasBlock | undefined
    patchSnapshot((s) => ({
      ...s,
      canvas: s.canvas.map((b) => {
        if (b.id !== id) return b
        next = { ...b, ...patch }
        return next
      }),
    }))
    if (commit && next) {
      const value = next
      enqueue(`c:${id}`, () => store.upsertCanvas(value))
    }
  }

  function commitCanvas(id: string) {
    const block = snapRef.current?.canvas.find((b) => b.id === id)
    if (store && block) enqueue(`c:${id}`, () => store.upsertCanvas(block))
  }

  /* ---------------------------------------------------------------- links -- */

  function addLink(source: Ref, target: Ref) {
    const current = snapRef.current
    if (!current || !store) return null
    if (source.id === target.id) return null

    const duplicate = current.links.some(
      (l) =>
        (l.sourceId === source.id && l.targetId === target.id) ||
        (l.sourceId === target.id && l.targetId === source.id),
    )
    if (duplicate) return null

    const link: Link = {
      id: newId(),
      boardId: current.board.id,
      sourceKind: source.kind,
      sourceId: source.id,
      targetKind: target.kind,
      targetId: target.id,
    }
    patchSnapshot((s) => ({ ...s, links: [...s.links, link] }))
    enqueue(`l:${link.id}`, () => store.createLink(link))
    return link
  }

  function removeLink(id: string) {
    if (!store) return
    patchSnapshot((s) => ({ ...s, links: s.links.filter((l) => l.id !== id) }))
    enqueue(`l:${id}`, () => store.deleteLink(id))
  }

  /* --------------------------------------------------------------- blocks -- */

  function removeBlock(ref: Ref) {
    const current = snapRef.current
    if (!current || !store) return
    const orphaned = current.links
      .filter((l) => l.sourceId === ref.id || l.targetId === ref.id)
      .map((l) => l.id)

    patchSnapshot((s) => ({
      ...s,
      timeline:
        ref.kind === 'timeline' ? s.timeline.filter((b) => b.id !== ref.id) : s.timeline,
      canvas: ref.kind === 'canvas' ? s.canvas.filter((b) => b.id !== ref.id) : s.canvas,
      links: s.links.filter((l) => l.sourceId !== ref.id && l.targetId !== ref.id),
    }))

    enqueue(`del:${ref.id}`, async () => {
      for (const id of orphaned) await store.deleteLink(id)
      if (ref.kind === 'timeline') await store.deleteTimeline(ref.id)
      else await store.deleteCanvas(ref.id)
    })
  }

  function duplicateBlock(ref: Ref): Ref | null {
    const current = snapRef.current
    if (!current) return null

    if (ref.kind === 'timeline') {
      const src = current.timeline.find((b) => b.id === ref.id)
      if (!src) return null
      const span = src.endMin - src.startMin
      const startMin = clamp(src.endMin, 0, MIN_PER_DAY - MIN_DURATION)
      const copy = addTimelineBlock(src.dayIndex, startMin, src.color)
      if (!copy) return null
      updateTimeline(copy.id, {
        title: src.title,
        notes: src.notes,
        place: src.place,
        placeLabel: src.placeLabel,
        placeLat: src.placeLat,
        placeLng: src.placeLng,
        placeZoom: src.placeZoom,
        url: src.url,
        endMin: Math.min(MIN_PER_DAY, startMin + span),
      })
      return { kind: 'timeline', id: copy.id }
    }

    const src = current.canvas.find((b) => b.id === ref.id)
    if (!src) return null
    const copy = addCanvasBlock(src.kind, src.x + 28, src.y + 28, {
      title: src.title,
      body: src.body,
      url: src.url,
      width: src.width,
      height: src.height,
      color: src.color,
    })
    return copy ? { kind: 'canvas', id: copy.id } : null
  }

  function setColor(ref: Ref, color: ColorName) {
    if (ref.kind === 'timeline') updateTimeline(ref.id, { color })
    else updateCanvas(ref.id, { color })
  }

  return {
    mode: store?.mode ?? 'local',
    loading,
    status,
    boards,
    snapshot,
    openBoard,
    createBoard,
    deleteBoard,
    updateBoard,
    addTimelineBlock,
    updateTimeline,
    commitTimeline,
    addCanvasBlock,
    updateCanvas,
    commitCanvas,
    addLink,
    removeLink,
    removeBlock,
    duplicateBlock,
    setColor,
  }
}

export type Itinerary = ReturnType<typeof useItinerary>
