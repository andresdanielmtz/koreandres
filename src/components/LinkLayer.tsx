import { anchorFor, arrowHead, linkPath, rectCenter } from '../lib/geometry'
import type { ColorName, Link, Rect, Ref } from '../lib/types'

export type Draft = { from: Rect; to: { x: number; y: number }; color: ColorName }

type Props = {
  links: Link[]
  rectFor: (ref: Ref) => Rect | null
  colorFor: (ref: Ref) => ColorName
  selected: string | null
  onSelect: (id: string) => void
  onContext: (e: React.MouseEvent, id: string) => void
  draft: Draft | null
}

export function LinkLayer({ links, rectFor, colorFor, selected, onSelect, onContext, draft }: Props) {
  return (
    <svg className="links" width="1" height="1" overflow="visible">
      {links.map((link) => {
        const source: Ref = { kind: link.sourceKind, id: link.sourceId }
        const target: Ref = { kind: link.targetKind, id: link.targetId }
        const a = rectFor(source)
        const b = rectFor(target)
        if (!a || !b) return null

        const from = anchorFor(a, rectCenter(b))
        const to = anchorFor(b, rectCenter(a))
        const d = linkPath(from, to)
        const isSelected = selected === link.id

        return (
          <g
            key={link.id}
            className="link"
            data-color={colorFor(source)}
            data-selected={isSelected ? '' : undefined}
          >
            <path
              d={d}
              className="link-hit"
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelect(link.id)
              }}
              onContextMenu={(e) => onContext(e, link.id)}
            />
            <path d={d} className="link-line" vectorEffect="non-scaling-stroke" />
            <path d={arrowHead(to)} className="link-arrow" />
          </g>
        )
      })}

      {draft && <DraftLink draft={draft} />}
    </svg>
  )
}

function DraftLink({ draft }: { draft: Draft }) {
  const from = anchorFor(draft.from, draft.to)
  const to = { x: draft.to.x, y: draft.to.y, side: draft.to.x >= from.x ? 'left' : 'right' } as const
  return (
    <g className="link link-draft" data-color={draft.color}>
      <path d={linkPath(from, to)} className="link-line" vectorEffect="non-scaling-stroke" />
      <path d={arrowHead(to)} className="link-arrow" />
    </g>
  )
}
