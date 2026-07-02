'use client'

// ── Ministry card on an occurrence tab — extracted from entries/page.tsx (P4d) ──
//
// One card per MINISTRY, with its subgroups nested INSIDE it (never as their
// own floating cards) — a subgroup only ever exists inside the ministry it
// belongs to, so the entry screen should read that way too.

import type { GroupColor } from '@/components/history-grid/group-colors'
import {
  Dot, Field, Ico, groupStatus, hasEnterableMetrics, ministryStatus, roleLabel,
  type EntryMap, type Metric, type Ministry, type MinistryGroup,
} from '../ui'
import { VolunteersGroup } from './VolunteersGroup'

const FALLBACK_HEX: Record<string, string> = {
  KIDS_MINISTRY: '#8B5CF6',
  YOUTH_MINISTRY: '#06B6D4',
  ADULT_SERVICE: '#4F6EF7',
}

// One node's fields (Attendance → Volunteers → everything else). Used for both
// the root ministry's own counts and each subgroup's counts.
function NodeFields({ node, instId, entries, readOnly, onCommit, onToggleNA }: {
  node: Ministry
  instId: string
  entries: EntryMap
  readOnly: boolean
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleNA: (metric: Metric, instId: string, na: boolean) => Promise<void>
}) {
  const att = node.metrics.filter(m => m.reporting_tag_code === 'ATTENDANCE')
  const vols = node.metrics.filter(m => m.reporting_tag_code === 'VOLUNTEERS')
  const others = node.metrics.filter(m => m.reporting_tag_code !== 'ATTENDANCE' && m.reporting_tag_code !== 'VOLUNTEERS')
  return (
    <div className="space-y-1 px-3 py-2">
      {att.map(m => {
        const e = entries[`${m.id}|${instId}`]
        return (
          <Field key={m.id} fieldId={`f-${m.id}-${instId}`} label={m.name} value={e?.value ?? null}
            isNA={e?.is_not_applicable} readOnly={readOnly}
            onCommit={(v) => onCommit(m, instId, v)} onToggleNA={readOnly ? undefined : (na) => onToggleNA(m, instId, na)} />
        )
      })}
      {vols.length > 0 && (
        <VolunteersGroup vols={vols} instId={instId} entries={entries} readOnly={readOnly} onCommit={onCommit} onToggleNA={onToggleNA} />
      )}
      {others.map(m => {
        const e = entries[`${m.id}|${instId}`]
        return (
          <Field key={m.id} fieldId={`f-${m.id}-${instId}`} label={m.name} value={e?.value ?? null}
            isNA={e?.is_not_applicable} readOnly={readOnly}
            onCommit={(v) => onCommit(m, instId, v)} onToggleNA={readOnly ? undefined : (na) => onToggleNA(m, instId, na)} />
        )
      })}
    </div>
  )
}

// A subgroup's own block, nested inside the ministry card — a tinted inset
// section (not a separate bordered card) so it visually stays "inside".
function SubgroupBlock({ node, instId, entries, readOnly, tint, onCommit, onToggleDidntMeet, onToggleNA }: {
  node: Ministry
  instId: string
  entries: EntryMap
  readOnly: boolean
  tint: string
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleDidntMeet: (m: Ministry, instId: string, na: boolean) => Promise<void>
  onToggleNA: (metric: Metric, instId: string, na: boolean) => Promise<void>
}) {
  const na = node.metrics.length > 0 && node.metrics.every(mt => entries[`${mt.id}|${instId}`]?.is_not_applicable)
  const status = ministryStatus(node, instId, entries)
  return (
    <div className="mx-3 mb-2 overflow-hidden rounded-xl border border-slate-100">
      <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ backgroundColor: tint }}>
        <span className="text-[13px] font-bold text-slate-700">{node.name}</span>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button onClick={() => onToggleDidntMeet(node, instId, !na)} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-slate-400 transition-colors duration-200 hover:bg-white/70 hover:text-slate-700">
              <Ico.ban className="h-2.5 w-2.5" />{na ? 'Mark as met' : 'Didn’t meet?'}
            </button>
          )}
          {!na && <Dot s={status} />}
        </div>
      </div>
      {na ? (
        <div className="flex flex-col items-center gap-0.5 bg-white px-4 py-5 text-center">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[13px] font-semibold text-slate-500">N/A this week</span>
          <span className="text-[11px] text-slate-400">recorded as “did not meet” — not zero, not blank</span>
        </div>
      ) : (
        <div className="bg-white">
          <NodeFields node={node} instId={instId} entries={entries} readOnly={readOnly} onCommit={onCommit} onToggleNA={onToggleNA} />
        </div>
      )}
    </div>
  )
}

export function MinistryCard({ group, instId, entries, readOnly, accent, onCommit, onToggleDidntMeet, onToggleNA }: {
  group: MinistryGroup
  instId: string
  entries: EntryMap
  readOnly: boolean
  /** Ministry accent color (0040) — same palette as Setup/History; undefined → role fallback. */
  accent?: GroupColor
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleDidntMeet: (m: Ministry, instId: string, na: boolean) => Promise<void>
  onToggleNA: (metric: Metric, instId: string, na: boolean) => Promise<void>
}) {
  const { root, children } = group

  // A rollup-only container ministry with no own metrics AND no subgroup with
  // metrics has nothing to enter here — don't render an empty card for it.
  if (!hasEnterableMetrics(root) && !children.some(hasEnterableMetrics)) return null

  const hex = accent?.strong ?? FALLBACK_HEX[root.tag_role ?? ''] ?? FALLBACK_HEX.ADULT_SERVICE
  const textColor = accent?.text ?? '#ffffff'
  const tint = /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}1f` : 'rgba(79,110,247,.12)'

  const rootHasMetrics = hasEnterableMetrics(root)
  const rootNA = rootHasMetrics && root.metrics.every(mt => entries[`${mt.id}|${instId}`]?.is_not_applicable)
  const cardStatus = groupStatus(group, instId, entries)

  // Parent roll-up totals (mirrored metrics): for a ministry that counts a kind
  // by SUBGROUP, the parent doesn't type that number — its groups do. Show the
  // parent's total as a READ-ONLY auto-sum of its subgroups so the card isn't
  // blank, and because it can't be typed into, the same people can never be
  // counted at both levels. Only the aggregate kinds roll up cleanly; stats keep
  // their own per-group fields. Gated on "the parent doesn't count this itself"
  // so a ministry with its own number (independent of its groups) is untouched.
  const ROLLUP_KINDS: { code: string; label: string }[] = [
    { code: 'ATTENDANCE', label: 'Attendance' },
    { code: 'VOLUNTEERS', label: 'Volunteers' },
  ]
  const rootKinds = new Set(root.metrics.map(m => m.reporting_tag_code))
  const rollupTotals = children.length === 0 ? [] : ROLLUP_KINDS.flatMap(({ code, label }) => {
    if (rootKinds.has(code)) return []
    if (!children.some(c => c.metrics.some(m => m.reporting_tag_code === code))) return []
    const vals: number[] = []
    const contributing = new Set<string>()
    for (const c of children) for (const m of c.metrics) {
      if (m.reporting_tag_code !== code) continue
      const e = entries[`${m.id}|${instId}`]
      if (e && !e.is_not_applicable && e.value !== null) { vals.push(e.value); contributing.add(c.tag_id) }
    }
    return [{ code, label, total: vals.length ? vals.reduce((a, b) => a + b, 0) : null, groupCount: contributing.size }]
  })

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: hex }}>
        <div className="flex items-center gap-3">
          <h3 className="text-[17px] font-bold tracking-tight" style={{ color: textColor }}>{root.name}</h3>
          <span className="text-[13px] font-medium opacity-80" style={{ color: textColor }}>· {roleLabel(root.tag_role)}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {!readOnly && rootHasMetrics && (
            <button onClick={() => onToggleDidntMeet(root, instId, !rootNA)} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors duration-200 hover:bg-white/15" style={{ color: textColor }}>
              <Ico.ban className="h-3 w-3" />{rootNA ? 'Mark as met' : 'Didn’t meet?'}
            </button>
          )}
          <Dot s={cardStatus} />
        </div>
      </div>

      {rollupTotals.length > 0 && (
        <div className="divide-y divide-slate-100 border-b border-slate-100">
          {rollupTotals.map(rt => (
            <div key={rt.code} className="flex items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <div>
                  <div className="text-[14px] font-medium text-slate-700">{rt.label}</div>
                  <div className="text-[11px] text-slate-400">Adds up from {rt.groupCount || children.length} {(rt.groupCount || children.length) === 1 ? 'group' : 'groups'} — nothing to type here</div>
                </div>
              </div>
              <div className="font-num text-[18px] font-bold text-slate-900" aria-label={`${rt.label} total`}>{rt.total ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      {rootHasMetrics && (
        rootNA ? (
          <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">N/A this week</span>
            <span className="text-[12px] text-slate-400">recorded as “did not meet” — not zero, not blank</span>
          </div>
        ) : (
          <NodeFields node={root} instId={instId} entries={entries} readOnly={readOnly} onCommit={onCommit} onToggleNA={onToggleNA} />
        )
      )}

      {children.length > 0 && (
        <div className={rootHasMetrics ? 'border-t border-slate-100 pt-2' : 'pt-2'}>
          {children.filter(hasEnterableMetrics).map(child => (
            <SubgroupBlock key={child.tag_id} node={child} instId={instId} entries={entries} readOnly={readOnly}
              tint={tint} onCommit={onCommit} onToggleDidntMeet={onToggleDidntMeet} onToggleNA={onToggleNA} />
          ))}
        </div>
      )}
    </section>
  )
}
