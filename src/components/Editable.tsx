import { useEffect, useRef } from 'react'

type Props = {
  value: string
  placeholder?: string
  editing: boolean
  multiline?: boolean
  className?: string
  /** Select the whole value when the editor opens. */
  selectAll?: boolean
  /** Double-click on the rendered text; opens this field for editing. */
  onOpen?: (e: React.MouseEvent) => void
  onCommit: (value: string) => void
  onDone: () => void
}

/**
 * Text that swaps to a textarea in place. Enter commits, Shift+Enter adds a
 * line (multiline only), Escape reverts, and anything else that closes the
 * editor keeps what you typed.
 */
export function Editable({ value, placeholder, editing, className, onOpen, ...rest }: Props) {
  if (!editing) {
    return (
      <div className={className} data-empty={value ? undefined : ''} onDoubleClick={onOpen}>
        {value || placeholder}
      </div>
    )
  }
  return <Editor className={className} value={value} placeholder={placeholder} {...rest} />
}

type EditorProps = Omit<Props, 'editing' | 'onOpen'>

/** Mounts only while editing, so the textarea is uncontrolled and cheap. */
function Editor({
  value,
  placeholder,
  multiline = false,
  className,
  selectAll = true,
  onCommit,
  onDone,
}: EditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const reverted = useRef(false)
  const settled = useRef(false)
  // The click that ends an edit usually tears the editor down before it can
  // blur — a pointerdown on the board clears the editing state first — so the
  // typed value is mirrored here and committed from whichever happens first.
  const draft = useRef(value)
  const commitRef = useRef(onCommit)
  useEffect(() => {
    commitRef.current = onCommit
  })

  /** Commit once, unless Escape asked for the old value back or nothing changed. */
  function settle() {
    if (settled.current) return
    settled.current = true
    const next = draft.current.trim()
    if (!reverted.current && next !== value) commitRef.current(next)
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    if (selectAll) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
  }, [selectAll])

  // Unmounted without blurring — save rather than drop it. The latch is reset
  // on mount because StrictMode runs this cleanup once before the real one.
  useEffect(() => {
    settled.current = false
    return settle
    // Listing `settle` would re-run this every render and commit mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <textarea
      ref={ref}
      className={className}
      data-editor=""
      defaultValue={value}
      placeholder={placeholder}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => (draft.current = e.target.value)}
      onBlur={() => {
        settle()
        onDone()
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          reverted.current = true
          e.currentTarget.blur()
        } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}
