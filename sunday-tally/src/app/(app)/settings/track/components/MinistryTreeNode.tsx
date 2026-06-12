'use client'

// ─────────────────────────────────────────────────────────────────────────
// MinistryTreeNode — draggable + droppable
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Ico, roleLabel } from '@/app/(app)/entries/ui'
import type { GroupColor } from '@/components/history-grid/group-colors'
import { rolePillClasses, type Ministry } from '../types'
import { MoveMenu } from './MoveMenu'

export function MinistryTreeNode({
  ministry, level, selectedId, onSelect,
  childrenOf, countSummary, colorForNode, hasUnreferenced, isOrphan, onFixOrphan, write,
  onReparent, validParentsFor,
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
  write: boolean
  onReparent: (id: string, parentId: string | null) => void
  validParentsFor: (m: Ministry) => Ministry[]
}) {
  const [expanded, setExpanded] = useState(true)
  const [movePos, setMovePos] = useState<{ top: number; left: number } | null>(null)
  const children = childrenOf(ministry.id)
  const hasChildren = children.length > 0
  const isSelected = selectedId === ministry.id
  const color = colorForNode(ministry.id)

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: ministry.id })
  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({ id: ministry.id })

  return (
    <li>
      <div
        ref={setDropRef}
        className={`group flex cursor-pointer items-center gap-2 border-b border-slate-50 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 ${isSelected ? 'bg-[#4F6EF7]/8' : ''} ${isOver ? 'bg-[#4F6EF7]/20 ring-2 ring-inset ring-[#4F6EF7]' : ''} ${isDragging ? 'opacity-30' : ''}`}
        style={{ paddingLeft: `${0.75 + level * 1.1}rem`, ...(isSelected ? { boxShadow: `inset 2px 0 0 ${color?.strong ?? '#4F6EF7'}` } : {}) }}
        onClick={() => onSelect(ministry.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ministry.id) } }}
      >
        {/* drag handle (owner/admin) */}
        {write ? (
          <button
            ref={setDragRef}
            {...attributes}
            {...listeners}
            onClick={e => e.stopPropagation()}
            aria-label="Drag to move"
            className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>
          </button>
        ) : <span className="h-5 w-4 shrink-0" aria-hidden />}

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

        {/* Move under… portaled menu (keyboard/click fallback) */}
        {write && (
          <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={(e) => {
                if (movePos) { setMovePos(null); return }
                const r = e.currentTarget.getBoundingClientRect()
                setMovePos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 200) })
              }}
              aria-label="Move under…"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.chevron className="h-4 w-4" />
            </button>
            {movePos && (
              <MoveMenu
                pos={movePos}
                validParents={validParentsFor(ministry)}
                onPick={(pid) => { onReparent(ministry.id, pid); setMovePos(null) }}
                onClose={() => setMovePos(null)}
              />
            )}
          </div>
        )}
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
              write={write}
              onReparent={onReparent}
              validParentsFor={validParentsFor}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
