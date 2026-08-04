import { supabase } from './supabase'
import type {
  Board,
  CanvasBlock,
  ColorName,
  Link,
  Snapshot,
  TimelineBlock,
} from './types'

export type BoardSummary = Pick<Board, 'id' | 'title' | 'startDate' | 'days'>
export type StoreMode = 'cloud' | 'local'

export type ItineraryStore = {
  mode: StoreMode
  listBoards(): Promise<BoardSummary[]>
  createBoard(init: Omit<Board, 'id'>): Promise<Board>
  updateBoard(board: Board): Promise<void>
  deleteBoard(id: string): Promise<void>
  loadBoard(id: string): Promise<Snapshot>
  upsertTimeline(block: TimelineBlock): Promise<void>
  deleteTimeline(id: string): Promise<void>
  upsertCanvas(block: CanvasBlock): Promise<void>
  deleteCanvas(id: string): Promise<void>
  createLink(link: Link): Promise<void>
  deleteLink(id: string): Promise<void>
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`

/* ------------------------------------------------------------- row shapes -- */

type Row = Record<string, unknown>

const boardFromRow = (r: Row): Board => ({
  id: r.id as string,
  title: (r.title as string) ?? '',
  startDate: r.start_date as string,
  days: (r.days as number) ?? 7,
})

const timelineFromRow = (r: Row): TimelineBlock => ({
  id: r.id as string,
  boardId: r.board_id as string,
  title: (r.title as string) ?? '',
  notes: (r.notes as string) ?? '',
  dayIndex: r.day_index as number,
  startMin: r.start_min as number,
  endMin: r.end_min as number,
  place: (r.place as string) ?? '',
  placeLabel: (r.place_label as string) ?? '',
  placeLat: (r.place_lat as number | null) ?? null,
  placeLng: (r.place_lng as number | null) ?? null,
  placeZoom: (r.place_zoom as number | null) ?? null,
  url: (r.url as string) ?? '',
  color: (r.color as ColorName) ?? 'blue',
})

const timelineToRow = (b: TimelineBlock): Row => ({
  id: b.id,
  board_id: b.boardId,
  title: b.title,
  notes: b.notes,
  day_index: b.dayIndex,
  start_min: Math.round(b.startMin),
  end_min: Math.round(b.endMin),
  place: b.place,
  place_label: b.placeLabel,
  place_lat: b.placeLat,
  place_lng: b.placeLng,
  place_zoom: b.placeZoom,
  url: b.url,
  color: b.color,
})

const canvasFromRow = (r: Row): CanvasBlock => ({
  id: r.id as string,
  boardId: r.board_id as string,
  kind: (r.kind as CanvasBlock['kind']) ?? 'data',
  title: (r.title as string) ?? '',
  body: (r.body as string) ?? '',
  url: (r.url as string) ?? '',
  x: r.x as number,
  y: r.y as number,
  width: r.width as number,
  height: r.height as number,
  color: (r.color as ColorName) ?? 'green',
})

const canvasToRow = (b: CanvasBlock): Row => ({
  id: b.id,
  board_id: b.boardId,
  kind: b.kind,
  title: b.title,
  body: b.body,
  url: b.url,
  x: b.x,
  y: b.y,
  width: b.width,
  height: b.height,
  color: b.color,
})

const linkFromRow = (r: Row): Link => ({
  id: r.id as string,
  boardId: r.board_id as string,
  sourceKind: r.source_kind as Link['sourceKind'],
  sourceId: r.source_id as string,
  targetKind: r.target_kind as Link['targetKind'],
  targetId: r.target_id as string,
})

const linkToRow = (l: Link): Row => ({
  id: l.id,
  board_id: l.boardId,
  source_kind: l.sourceKind,
  source_id: l.sourceId,
  target_kind: l.targetKind,
  target_id: l.targetId,
})

/* --------------------------------------------------------- supabase store -- */

function assertOk(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function createCloudStore(client: NonNullable<typeof supabase>): ItineraryStore {
  return {
    mode: 'cloud',

    async listBoards() {
      const { data, error } = await client
        .from('boards')
        .select('id, title, start_date, days')
        .order('created_at', { ascending: true })
      assertOk(error)
      return (data ?? []).map(boardFromRow)
    },

    async createBoard(init) {
      const { data, error } = await client
        .from('boards')
        .insert({ title: init.title, start_date: init.startDate, days: init.days })
        .select()
        .single()
      assertOk(error)
      return boardFromRow(data as Row)
    },

    async updateBoard(board) {
      const { error } = await client
        .from('boards')
        .update({
          title: board.title,
          start_date: board.startDate,
          days: board.days,
          updated_at: new Date().toISOString(),
        })
        .eq('id', board.id)
      assertOk(error)
    },

    async deleteBoard(id) {
      assertOk((await client.from('boards').delete().eq('id', id)).error)
    },

    async loadBoard(id) {
      const [board, timeline, canvas, links] = await Promise.all([
        client.from('boards').select('*').eq('id', id).single(),
        client.from('timeline_blocks').select('*').eq('board_id', id),
        client.from('canvas_blocks').select('*').eq('board_id', id),
        client.from('block_links').select('*').eq('board_id', id),
      ])
      assertOk(board.error)
      assertOk(timeline.error)
      assertOk(canvas.error)
      assertOk(links.error)
      return {
        board: boardFromRow(board.data as Row),
        timeline: (timeline.data ?? []).map(timelineFromRow),
        canvas: (canvas.data ?? []).map(canvasFromRow),
        links: (links.data ?? []).map(linkFromRow),
      }
    },

    async upsertTimeline(block) {
      assertOk((await client.from('timeline_blocks').upsert(timelineToRow(block))).error)
    },
    async deleteTimeline(id) {
      assertOk((await client.from('timeline_blocks').delete().eq('id', id)).error)
    },
    async upsertCanvas(block) {
      assertOk((await client.from('canvas_blocks').upsert(canvasToRow(block))).error)
    },
    async deleteCanvas(id) {
      assertOk((await client.from('canvas_blocks').delete().eq('id', id)).error)
    },
    async createLink(link) {
      assertOk((await client.from('block_links').upsert(linkToRow(link))).error)
    },
    async deleteLink(id) {
      assertOk((await client.from('block_links').delete().eq('id', id)).error)
    },
  }
}

/* ------------------------------------------------------------ local store -- */
/* Keeps the app fully usable before the SQL migration is run — and offline. */

/* Bumped when the default board shape changes. Older versions are left on
   disk untouched rather than migrated or deleted. */
const LS_KEY = 'itinerary.boards.v2'

type LocalDb = Record<string, Snapshot>

const readDb = (): LocalDb => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as LocalDb
  } catch {
    return {}
  }
}
const writeDb = (db: LocalDb) => localStorage.setItem(LS_KEY, JSON.stringify(db))

function mutate(boardId: string, fn: (snap: Snapshot) => void) {
  const db = readDb()
  const snap = db[boardId]
  if (!snap) return
  fn(snap)
  writeDb(db)
}

function createLocalStore(): ItineraryStore {
  return {
    mode: 'local',

    async listBoards() {
      return Object.values(readDb()).map((s) => s.board)
    },

    async createBoard(init) {
      const board: Board = { id: newId(), ...init }
      const db = readDb()
      db[board.id] = { board, timeline: [], canvas: [], links: [] }
      writeDb(db)
      return board
    },

    async updateBoard(board) {
      mutate(board.id, (s) => {
        s.board = board
      })
    },

    async deleteBoard(id) {
      const db = readDb()
      delete db[id]
      writeDb(db)
    },

    async loadBoard(id) {
      const snap = readDb()[id]
      if (!snap) throw new Error('Board not found')
      // Boards saved before the location fields existed are still on disk.
      // Fill the gaps on read — the cloud store gets the same for free from
      // its column defaults.
      return {
        ...snap,
        timeline: snap.timeline.map((b) => ({
          ...b,
          place: b.place ?? '',
          placeLabel: b.placeLabel ?? '',
          placeLat: b.placeLat ?? null,
          placeLng: b.placeLng ?? null,
          placeZoom: b.placeZoom ?? null,
          url: b.url ?? '',
        })),
      }
    },

    async upsertTimeline(block) {
      mutate(block.boardId, (s) => {
        const i = s.timeline.findIndex((b) => b.id === block.id)
        if (i === -1) s.timeline.push(block)
        else s.timeline[i] = block
      })
    },
    async deleteTimeline(id) {
      const db = readDb()
      for (const snap of Object.values(db)) {
        snap.timeline = snap.timeline.filter((b) => b.id !== id)
        snap.links = snap.links.filter((l) => l.sourceId !== id && l.targetId !== id)
      }
      writeDb(db)
    },
    async upsertCanvas(block) {
      mutate(block.boardId, (s) => {
        const i = s.canvas.findIndex((b) => b.id === block.id)
        if (i === -1) s.canvas.push(block)
        else s.canvas[i] = block
      })
    },
    async deleteCanvas(id) {
      const db = readDb()
      for (const snap of Object.values(db)) {
        snap.canvas = snap.canvas.filter((b) => b.id !== id)
        snap.links = snap.links.filter((l) => l.sourceId !== id && l.targetId !== id)
      }
      writeDb(db)
    },
    async createLink(link) {
      mutate(link.boardId, (s) => {
        if (!s.links.some((l) => l.id === link.id)) s.links.push(link)
      })
    },
    async deleteLink(id) {
      const db = readDb()
      for (const snap of Object.values(db)) {
        snap.links = snap.links.filter((l) => l.id !== id)
      }
      writeDb(db)
    },
  }
}

/* ---------------------------------------------------------------- resolve -- */

let resolved: Promise<ItineraryStore> | null = null

/**
 * Prefers Supabase, falls back to localStorage when the project is
 * unreachable or the migration hasn't been applied yet.
 */
export function resolveStore(): Promise<ItineraryStore> {
  resolved ??= (async () => {
    if (!supabase) return createLocalStore()
    try {
      const { error } = await supabase.from('boards').select('id').limit(1)
      if (error) throw new Error(error.message)
      return createCloudStore(supabase)
    } catch (err) {
      console.warn(
        '[itinerary] Supabase unavailable — falling back to local storage. ' +
          'Run supabase/schema.sql to enable sync.',
        err,
      )
      return createLocalStore()
    }
  })()
  return resolved
}
