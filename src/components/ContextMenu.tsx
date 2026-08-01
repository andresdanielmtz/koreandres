import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLORS, COLOR_LABEL } from '../lib/constants'
import type { ColorName } from '../lib/types'

export type MenuEntry =
  | { kind: 'item'; label: string; hint?: string; icon?: React.ReactNode; danger?: boolean; onSelect: () => void }
  | { kind: 'colors'; value: ColorName; onPick: (c: ColorName) => void }
  | { kind: 'label'; text: string }
  | { kind: 'separator' }

type Props = {
  x: number
  y: number
  entries: MenuEntry[]
  onClose: () => void
}

export function ContextMenu({ x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - height - 8),
    })
  }, [x, y, entries.length])

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // `capture` so the menu closes before the canvas reacts to the click.
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) => {
        if (entry.kind === 'separator') return <div key={i} className="menu-sep" />
        if (entry.kind === 'label')
          return (
            <div key={i} className="menu-label">
              {entry.text}
            </div>
          )
        if (entry.kind === 'colors')
          return (
            <div key={i} className="menu-colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  data-color={c}
                  data-active={c === entry.value ? '' : undefined}
                  title={COLOR_LABEL[c]}
                  aria-label={COLOR_LABEL[c]}
                  onClick={() => {
                    entry.onPick(c)
                    onClose()
                  }}
                />
              ))}
            </div>
          )
        return (
          <button
            key={i}
            type="button"
            className="menu-item"
            data-danger={entry.danger ? '' : undefined}
            onClick={() => {
              entry.onSelect()
              onClose()
            }}
          >
            <span className="menu-icon">{entry.icon}</span>
            <span className="menu-text">{entry.label}</span>
            {entry.hint && <kbd className="menu-hint">{entry.hint}</kbd>}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
