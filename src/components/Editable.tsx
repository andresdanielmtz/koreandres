import { useEffect, useRef } from 'react'

type Props = {
  value: string
  placeholder?: string
  editing: boolean
  multiline?: boolean
  className?: string
  /** Select the whole value when the editor opens. */
  selectAll?: boolean
  onCommit: (value: string) => void
  onDone: () => void
}

/**
 * Text that swaps to a textarea in place. Enter commits, Shift+Enter adds a
 * line (multiline only), Escape reverts.
 */
export function Editable({ value, placeholder, editing, className, ...rest }: Props) {
  if (!editing) {
    return (
      <div className={className} data-empty={value ? undefined : ''}>
        {value || placeholder}
      </div>
    )
  }
  return <Editor className={className} value={value} placeholder={placeholder} {...rest} />
}

type EditorProps = Omit<Props, 'editing'>

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

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    if (selectAll) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
  }, [selectAll])

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
      onBlur={(e) => {
        if (!reverted.current) onCommit(e.target.value.trim())
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
