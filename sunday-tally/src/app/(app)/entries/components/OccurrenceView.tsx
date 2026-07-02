'use client'

// ── Zone E — OCCURRENCE (E-20..E-25) — extracted from entries/page.tsx (P4d) ──

import type { GroupColor } from '@/components/history-grid/group-colors'
import { groupMinistryTree, type EntryMap, type Instance, type Metric, type Ministry } from '../ui'
import { MinistryCard } from './MinistryCard'

export function OccurrenceView({ inst, entries, readOnly, onCommit, onToggleDidntMeet, onToggleNA, colorForNode, isVisible }: {
  inst: Instance
  entries: EntryMap
  readOnly: boolean
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleDidntMeet: (m: Ministry, instId: string, na: boolean) => Promise<void>
  onToggleNA: (metric: Metric, instId: string, na: boolean) => Promise<void>
  colorForNode: (id: string) => GroupColor | undefined
  /** The "Ministries" screen filter — a ministry (and its subgroups) not passing this stays hidden. */
  isVisible: (tagId: string) => boolean
}) {
  if (inst.ministries.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">No ministries are configured for this service yet.</div>
  }
  // Subgroups nest INSIDE their ministry's card — one connected card per
  // ministry instead of a flat list of disconnected ones. The filter is applied
  // BEFORE grouping so a hidden root takes its subgroups with it.
  const visibleMinistries = inst.ministries.filter(m => isVisible(m.tag_id))
  const groups = groupMinistryTree(visibleMinistries)
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
        No ministries selected for this service — open “Ministries” above to show some.
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {groups.map(g => (
        <MinistryCard key={g.root.tag_id} group={g} instId={inst.id} entries={entries} readOnly={readOnly}
          onCommit={onCommit} onToggleDidntMeet={onToggleDidntMeet} onToggleNA={onToggleNA}
          accent={colorForNode(g.root.tag_id)} />
      ))}
      <p className="px-1 text-[12px] leading-relaxed text-slate-400">Each ministry shows only its own metrics — they never share fields.</p>
    </div>
  )
}
