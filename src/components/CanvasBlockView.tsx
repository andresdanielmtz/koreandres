import type { CanvasBlock } from '../lib/types'
import { Editable } from './Editable'
import { IconExternal, IconNote, IconRoute } from './icons'
import { LinkPort } from './LinkPort'

export type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const CORNERS: ResizeDir[] = ['nw', 'ne', 'se', 'sw']
const EDGES: ResizeDir[] = ['n', 'e', 's', 'w']

type EditField = 'title' | 'body' | 'url' | null

type Props = {
  block: CanvasBlock
  selected: boolean
  editing: EditField
  targeted: boolean
  linking: boolean
  onGrab: (e: React.PointerEvent) => void
  onResize: (e: React.PointerEvent, dir: ResizeDir) => void
  onPort: (e: React.PointerEvent) => void
  onContext: (e: React.MouseEvent) => void
  onEdit: (field: Exclude<EditField, null>) => void
  onPatch: (patch: Partial<CanvasBlock>) => void
  onEditDone: () => void
}

export function CanvasBlockView({
  block,
  selected,
  editing,
  targeted,
  linking,
  onGrab,
  onResize,
  onPort,
  onContext,
  onEdit,
  onPatch,
  onEditDone,
}: Props) {
  const travel = block.kind === 'travel'

  /** Double-click a field to edit that field, rather than falling back to the title. */
  const open = (field: Exclude<EditField, null>) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit(field)
  }

  return (
    <div
      className="cblock"
      data-color={block.color}
      data-kind={block.kind}
      data-selected={selected ? '' : undefined}
      data-targeted={targeted ? '' : undefined}
      data-ref={`canvas:${block.id}`}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
      }}
      onPointerDown={onGrab}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onEdit('title')
      }}
      onContextMenu={onContext}
    >
      <div className="cblock-head">
        <span className="cblock-kind" title={travel ? 'Travel block' : 'Data block'}>
          {travel ? <IconRoute size={12} /> : <IconNote size={12} />}
        </span>
        <Editable
          className="cblock-title"
          value={block.title}
          placeholder={travel ? 'Travel leg' : 'Untitled data'}
          editing={editing === 'title'}
          onCommit={(title) => onPatch({ title })}
          onDone={onEditDone}
        />
      </div>

      <Editable
        className="cblock-body"
        value={block.body}
        placeholder={travel ? 'Line 2 → Hongik Univ · 24 min' : 'Notes, prices, hours…'}
        editing={editing === 'body'}
        multiline
        onOpen={open('body')}
        onCommit={(body) => onPatch({ body })}
        onDone={onEditDone}
      />

      {editing === 'url' ? (
        <Editable
          className="cblock-url-edit"
          value={block.url}
          placeholder="https://…"
          editing
          onCommit={(url) => onPatch({ url })}
          onDone={onEditDone}
        />
      ) : block.url ? (
        // The row runs the width of the block; double-clicking beside the pill
        // edits the URL, double-clicking the pill itself is left to the link.
        <div className="cblock-url-row" onDoubleClick={open('url')}>
          <a
            className="cblock-url"
            href={block.url}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <IconExternal size={11} />
            <span>{hostOf(block.url)}</span>
          </a>
        </div>
      ) : null}

      <div className="cblock-actions">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onEdit('body')}
        >
          Notes
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onEdit('url')}
        >
          Link
        </button>
      </div>

      {EDGES.map((dir) => (
        <div
          key={dir}
          className="resize-edge"
          data-dir={dir}
          onPointerDown={(e) => onResize(e, dir)}
        />
      ))}
      {CORNERS.map((dir) => (
        <div
          key={dir}
          className="resize-corner"
          data-dir={dir}
          onPointerDown={(e) => onResize(e, dir)}
        />
      ))}

      {!linking && <LinkPort visible={selected} onStart={onPort} />}
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
