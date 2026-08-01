import { useEffect, useRef, useState } from 'react'
import type { BoardSummary } from '../lib/store'
import type { SaveStatus } from '../state/useItinerary'
import type { ThemeMode } from '../state/useTheme'
import type { Board } from '../lib/types'
import { IconCalendar, IconChevron, IconMinus, IconPlus, IconTarget, IconTrash } from './icons'
import { ThemeToggle } from './ThemeToggle'

type Props = {
  board: Board
  boards: BoardSummary[]
  mode: 'cloud' | 'local'
  status: SaveStatus
  zoom: number
  theme: ThemeMode
  onTheme: (mode: ThemeMode) => void
  onOpenBoard: (id: string) => void
  onNewBoard: () => void
  onDeleteBoard: (id: string) => void
  onPatchBoard: (patch: Partial<Board>) => void
  onZoom: (factor: number) => void
  onResetView: () => void
}

export function Toolbar({
  board,
  boards,
  mode,
  status,
  zoom,
  theme,
  onTheme,
  onOpenBoard,
  onNewBoard,
  onDeleteBoard,
  onPatchBoard,
  onZoom,
  onResetView,
}: Props) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', down)
    return () => window.removeEventListener('pointerdown', down)
  }, [open])

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <div className="brand">Koreandres</div>

        <div className="picker" ref={pickerRef}>
          <button type="button" className="btn picker-trigger" onClick={() => setOpen((v) => !v)}>
            <span className="picker-name">{board.title || 'Untitled'}</span>
            <IconChevron size={13} />
          </button>

          {open && (
            <div className="picker-menu">
              <div className="menu-label">Whiteboards</div>
              {boards.map((b) => (
                <div key={b.id} className="picker-row" data-active={b.id === board.id ? '' : undefined}>
                  <button
                    type="button"
                    className="picker-open"
                    onClick={() => {
                      onOpenBoard(b.id)
                      setOpen(false)
                    }}
                  >
                    <span>{b.title || 'Untitled'}</span>
                    <span className="picker-meta">{b.days}d</span>
                  </button>
                  {boards.length > 1 && (
                    <button
                      type="button"
                      className="picker-del"
                      aria-label={`Delete ${b.title}`}
                      onClick={() => {
                        if (confirm(`Delete “${b.title || 'Untitled'}” and everything on it?`))
                          onDeleteBoard(b.id)
                      }}
                    >
                      <IconTrash size={13} />
                    </button>
                  )}
                </div>
              ))}
              <div className="menu-sep" />
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  onNewBoard()
                  setOpen(false)
                }}
              >
                <span className="menu-icon">
                  <IconPlus size={13} />
                </span>
                <span className="menu-text">New whiteboard</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-group toolbar-center">
        <input
          className="title-input"
          value={board.title}
          placeholder="Untitled itinerary"
          spellCheck={false}
          onChange={(e) => onPatchBoard({ title: e.target.value })}
        />
        <label className="date-field">
          <IconCalendar size={13} />
          <input
            type="date"
            value={board.startDate}
            onChange={(e) => e.target.value && onPatchBoard({ startDate: e.target.value })}
          />
        </label>
        <div className="stepper">
          <button
            type="button"
            aria-label="Remove a day"
            disabled={board.days <= 1}
            onClick={() => onPatchBoard({ days: board.days - 1 })}
          >
            <IconMinus size={12} />
          </button>
          <span>{board.days} days</span>
          <button
            type="button"
            aria-label="Add a day"
            disabled={board.days >= 60}
            onClick={() => onPatchBoard({ days: board.days + 1 })}
          >
            <IconPlus size={12} />
          </button>
        </div>
      </div>

      <div className="toolbar-group">
        <span
          className="status"
          data-status={status}
          data-mode={mode}
          title={
            status === 'error'
              ? 'The last write to Supabase failed — see the browser console.'
              : mode === 'local'
                ? 'Saving to this browser only. Supabase is unreachable or supabase/schema.sql has not been run yet.'
                : 'Changes are being saved to Supabase.'
          }
        >
          <i className="status-dot" />
          {status === 'error'
            ? 'Save failed'
            : status === 'saving'
              ? 'Saving'
              : mode === 'cloud'
                ? 'Synced'
                : 'Local only'}
        </span>

        <div className="stepper">
          <button type="button" aria-label="Zoom out" onClick={() => onZoom(1 / 1.2)}>
            <IconMinus size={12} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => onZoom(1.2)}>
            <IconPlus size={12} />
          </button>
        </div>

        <button type="button" className="btn" onClick={onResetView} title="Reset view (0)">
          <IconTarget size={13} />
        </button>

        <ThemeToggle mode={theme} onChange={onTheme} />
      </div>
    </header>
  )
}
