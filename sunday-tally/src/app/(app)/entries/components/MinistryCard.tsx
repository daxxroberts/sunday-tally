'use client'

// ── Ministry card on an occurrence tab — extracted from entries/page.tsx (P4d) ──

import {
  Dot, Field, Ico, accentForRole, ministryStatus, roleLabel,
  type EntryMap, type Metric, type Ministry,
} from '../ui'
import { VolunteersGroup } from './VolunteersGroup'

export function MinistryCard({ ministry, instId, entries, readOnly, onCommit, onToggleDidntMeet }: {
  ministry: Ministry
  instId: string
  entries: EntryMap
  readOnly: boolean
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleDidntMeet: (m: Ministry, instId: string, na: boolean) => Promise<void>
}) {
  // N/A state derived from entries (any metric flagged is_not_applicable)
  const na = ministry.metrics.length > 0 && ministry.metrics.every(mt => entries[`${mt.id}|${instId}`]?.is_not_applicable)
  const status = ministryStatus(ministry, instId, entries)

  const att = ministry.metrics.filter(m => m.reporting_tag_code === 'ATTENDANCE')
  const vols = ministry.metrics.filter(m => m.reporting_tag_code === 'VOLUNTEERS')
  const others = ministry.metrics.filter(m => m.reporting_tag_code !== 'ATTENDANCE' && m.reporting_tag_code !== 'VOLUNTEERS')

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`h-7 w-1.5 rounded-full ${accentForRole(ministry.tag_role)}`} aria-hidden />
          <h3 className="text-[17px] font-bold tracking-tight text-slate-900">{ministry.name}</h3>
          <span className="text-[13px] font-medium text-slate-400">· {roleLabel(ministry.tag_role)}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {!readOnly && (
            <button onClick={() => onToggleDidntMeet(ministry, instId, !na)} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700">
              <Ico.ban className="h-3 w-3" />{na ? 'Mark as met' : 'Didn’t meet?'}
            </button>
          )}
          {!na && <Dot s={status} />}
        </div>
      </div>
      {na ? (
        <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">N/A this week</span>
          <span className="text-[12px] text-slate-400">recorded as “did not meet” — not zero, not blank</span>
        </div>
      ) : (
        <div className="space-y-1 px-3 py-2">
          {att.map(m => (
            <Field key={m.id} fieldId={`f-${m.id}-${instId}`} label={m.name} value={entries[`${m.id}|${instId}`]?.value ?? null}
              needs={m.is_canonical} readOnly={readOnly} onCommit={(v) => onCommit(m, instId, v)} />
          ))}
          {vols.length > 0 && (
            <VolunteersGroup vols={vols} instId={instId} entries={entries} readOnly={readOnly} onCommit={onCommit} />
          )}
          {others.map(m => (
            <Field key={m.id} fieldId={`f-${m.id}-${instId}`} label={m.name} value={entries[`${m.id}|${instId}`]?.value ?? null}
              needs={m.is_canonical} readOnly={readOnly} onCommit={(v) => onCommit(m, instId, v)} />
          ))}
        </div>
      )}
    </section>
  )
}
