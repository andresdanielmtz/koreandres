import { formatDuration, formatTime } from '../lib/time'
import type { Rect, TimelineBlock } from '../lib/types'
import { Editable } from './Editable'
import { IconPin } from './icons'
import { LinkPort } from './LinkPort'

export type ResizeEdge = 'top' | 'bottom'

type Props = {
  block: TimelineBlock
  rect: Rect
  selected: boolean
  editing: boolean
  /** Currently under the cursor as a link drop target. */
  targeted: boolean
  /** A link is being dragged and this block isn't the one being dragged from. */
  linking: boolean
  onGrab: (e: React.PointerEvent) => void
  onResize: (e: React.PointerEvent, edge: ResizeEdge) => void
  onPort: (e: React.PointerEvent) => void
  onContext: (e: React.MouseEvent) => void
  onEdit: () => void
  onTitle: (value: string) => void
  onEditDone: () => void
}

export function TimelineBlockView({
  block,
  rect,
  selected,
  editing,
  targeted,
  linking,
  onGrab,
  onResize,
  onPort,
  onContext,
  onEdit,
  onTitle,
  onEditDone,
}: Props) {
  const duration = block.endMin - block.startMin
  const compact = rect.h < 46
  const tiny = rect.h < 26

  return (
    <div
      className="tblock"
      data-color={block.color}
      data-selected={selected ? '' : undefined}
      data-targeted={targeted ? '' : undefined}
      data-compact={compact ? '' : undefined}
      data-ref={`timeline:${block.id}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDown={onGrab}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onEdit()
      }}
      onContextMenu={onContext}
    >
      <div className="tblock-body">
        {!tiny && (
          <div className="tblock-meta">
            <span>
              {formatTime(block.startMin)} – {formatTime(block.endMin)}
            </span>
            {!compact && <span className="tblock-dur">{formatDuration(duration)}</span>}
          </div>
        )}
        <Editable
          className="tblock-title"
          value={block.title}
          placeholder="Untitled"
          editing={editing}
          onCommit={onTitle}
          onDone={onEditDone}
        />
        {/* A short block has no room for a third line, and clipping the title
            to fit the pin reads worse than leaving the location to the pane. */}
        {/* What the location resolved to, never the raw link that was pasted.
            An unresolved block simply shows nothing yet. */}
        {!compact && block.placeLabel && (
          <div className="tblock-place">
            <IconPin size={10} />
            <span>{block.placeLabel}</span>
          </div>
        )}
      </div>

      <div className="resize resize-top" onPointerDown={(e) => onResize(e, 'top')} />
      <div className="resize resize-bottom" onPointerDown={(e) => onResize(e, 'bottom')} />

      {!linking && <LinkPort visible={selected} onStart={onPort} />}
    </div>
  )
}
