'use client'

// ── Zone E — OCCURRENCE (E-20..E-25) — extracted from entries/page.tsx (P4d) ──

import type { EntryMap, Instance, Metric, Ministry } from '../ui'
import { MinistryCard } from './MinistryCard'

export function OccurrenceView({ inst, entries, readOnly, onCommit, onToggleDidntMeet }: {
  inst: Instance
  entries: EntryMap
  readOnly: boolean
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleDidntMeet: (m: Ministry, instId: string, na: boolean) => Promise<void>
}) {
  if (inst.ministries.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">No ministries are configured for this service yet.</div>
  }
  return (
    <div className="space-y-4">
      {inst.ministries.map(m => (
        <MinistryCard key={m.tag_id} ministry={m} instId={inst.id} entries={entries} readOnly={readOnly}
          onCommit={onCommit} onToggleDidntMeet={onToggleDidntMeet} />
      ))}
      <p className="px-1 text-[12px] leading-relaxed text-slate-400">Each ministry shows only its own metrics — they never share fields.</p>
    </div>
  )
}
