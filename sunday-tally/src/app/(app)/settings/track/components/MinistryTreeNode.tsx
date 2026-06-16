'use client'

// ─────────────────────────────────────────────────────────────────────────
// MinistryTreeNode — selectable tree row (expand/collapse).
// Drag-to-move and the "Move under…" menu were removed (2026-06): re-parenting
// an existing ministry caused more confusion than value, and we don't yet have
// a clean answer for what happens to a counted ministry's data when it becomes
// a container. The blessed way to nest is "Add a group inside" in the detail
// panel, which inherits the parent's counts.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Ico, roleLabel } from '@/app/(app)/entries/ui'
import type { GroupColor } from '@/components/history-grid/group-colors'
import { rolePillClasses, type Ministry } from '../types'

export function MinistryTreeNode({
  ministry, level, selectedId, onSelect,
  childrenOf, countSummary, colorForNode, hasUnreferenced, isOrphan, onFixOrphan,
}: {
  ministry: Ministry
  level: number
  selectedId: string | null
  onSelect: (id: string) => void
  childrenOf: (id: string | null) => Ministry[]
  countSummary: (id: string) => string
  colorForNode: (id: string) => GroupColor | undefined
  hasUnreferenced: (id: string) => boolean
  /** TK2 — instance metrics with no service to render on (the invisible-ministry trap). */
  isOrphan: (id: string) => boolean
  onFixOrphan: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const children = childrenOf(ministry.id)
  const hasChildren = children.length > 0
  const isSelected = selectedId === ministry.id
  const color = colorForNode(ministry.id)

  return (
    <li>
      <div
        className={`group flex cursor-pointer items-center gap-2 border-b border-slate-50 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 ${isSelected ? 'bg-[#4F6EF7]/8' : ''}`}
        style={{ paddingLeft: `${0.75 + level * 1.1}rem`, ...(isSelected ? { boxShadow: `inset 2px 0 0 ${color?.strong ?? '#4F6EF7'}` } : {}) }}
        onClick={() => onSelect(ministry.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ministry.id) } }}
      >
        {/* expand/collapse caret */}
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-700"
          >
            <Ico.chevron className={`h-4 w-4 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
          </button>
        ) : <span className="h-5 w-5 shrink-0" aria-hidden />}

        {/* accent + name */}
        <span className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: color?.strong ?? '#cbd5e1' }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-slate-800">{ministry.name}</span>
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${rolePillClasses()}`}>
              {roleLabel(ministry.tag_role)}
            </span>
            {hasUnreferenced(ministry.id) && (
              <span className="shrink-0 text-[11px] text-[#B45309]" title="A roll-up here has nothing pointing at it">⚠</span>
            )}
            {/* TK2 — orphan chip: counted nowhere → click opens "Where is this counted?" */}
            {isOrphan(ministry.id) && (
              <button
                onClick={e => { e.stopPropagation(); onFixOrphan(ministry.id) }}
                title="This ministry's counts have no service to appear on. Click to fix."
                className="shrink-0 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#B45309] transition-colors hover:bg-[#F59E0B]/10"
              >
                Not counted anywhere
              </button>
            )}
          </div>
          <div className="font-num mt-0.5 truncate text-[11px] text-slate-400">{countSummary(ministry.id)}</div>
        </div>
      </div>

      {hasChildren && expanded && (
        <ul>
          {children.map(child => (
            <MinistryTreeNode
              key={child.id}
              ministry={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              childrenOf={childrenOf}
              countSummary={countSummary}
              colorForNode={colorForNode}
              hasUnreferenced={hasUnreferenced}
              isOrphan={isOrphan}
              onFixOrphan={onFixOrphan}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
