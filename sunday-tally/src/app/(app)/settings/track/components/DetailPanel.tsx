'use client'

// ─────────────────────────────────────────────────────────────────────────
// DetailPanel
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import InlineEditField from '@/components/shared/InlineEditField'
import { Ico, roleLabel } from '@/app/(app)/entries/ui'
import type { GroupColor } from '@/components/history-grid/group-colors'
import type { TagRole, MetricMode, RollupOp } from '../actions'
import {
  ROLE_OPTIONS, SYSTEM_KINDS, KIND_LABEL, rolePillClasses,
  type KindCode, type Metric, type Ministry, type ReportingTag,
} from '../types'
import { AddMetricControl } from './AddMetricControl'
import { KindSection } from './KindSection'

export function DetailPanel({
  ministry, write, metricsForNode, childNodes, reportingTags, color,
  eligibleParentsFor, parentLabel, unreferencedRollupIds, childCountFor,
  onSelectChild, onAddGroupHere,
  onRename, onRoleChange, onColorChange, onDeactivate,
  onAddMetric, onRenameMetric, onRemoveMetric, onSetMode, onSetParent, onSetOp,
}: {
  ministry: Ministry
  write: boolean
  metricsForNode: Metric[]
  childNodes: Ministry[]
  reportingTags: ReportingTag[]
  color?: GroupColor
  eligibleParentsFor: (m: Metric) => Metric[]
  parentLabel: (m: Metric) => string
  unreferencedRollupIds: Set<string>
  childCountFor: (rollupId: string) => number
  onSelectChild: (id: string) => void
  onAddGroupHere: (name: string, role: TagRole) => void
  onRename: (name: string) => Promise<void>
  onRoleChange: (role: TagRole) => Promise<void>
  /** Ministry color (0040) — top-level nodes only; null = back to the palette. */
  onColorChange: (color: string | null) => Promise<void>
  onDeactivate: () => void
  onAddMetric: (kind: KindCode, name: string) => Promise<void>
  onRenameMetric: (metricId: string, name: string) => Promise<void>
  onRemoveMetric: (metricId: string) => Promise<void>
  onSetMode: (metricId: string, mode: MetricMode, op?: RollupOp) => Promise<void>
  onSetParent: (metricId: string, parentId: string | null) => Promise<void>
  onSetOp: (metricId: string, op: RollupOp) => Promise<void>
}) {
  const [addingGroup, setAddingGroup] = useState(false)
  const [gName, setGName] = useState('')
  const [gRole, setGRole] = useState<TagRole>(ministry.tag_role)

  const byKind = useMemo(() => {
    const map = new Map<string, Metric[]>()
    for (const m of metricsForNode) {
      const list = map.get(m.reporting_tag_id) ?? []
      list.push(m); map.set(m.reporting_tag_id, list)
    }
    return map
  }, [metricsForNode])

  const accent = color?.strong ?? '#4F6EF7'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
          <div className="flex-1 min-w-0">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 cursor-help"
              title={ministry.parent_tag_id
                ? 'A group lives inside a ministry. It can hold its own groups and counts, and roll its numbers up into its parent.'
                : 'A ministry is a top-level group. It reports on its own and can hold groups inside it. Everything you track lives under a ministry.'}
            >
              {ministry.parent_tag_id ? 'Group' : 'Ministry'}
            </span>
            {write ? (
              <InlineEditField value={ministry.name} onSave={onRename} aria-label="Ministry name" className="text-[17px] font-bold text-slate-900" inputClassName="text-[17px] font-bold" />
            ) : (
              <h2 className="text-[17px] font-bold text-slate-900">{ministry.name}</h2>
            )}
            <p className="mt-0.5 text-[12px] text-slate-400">Everything below belongs to {ministry.name}.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-semibold text-slate-400">Role</label>
            {write ? (
              <select value={ministry.tag_role} onChange={e => onRoleChange(e.target.value as TagRole)} aria-label="Ministry role" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30">
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            ) : (
              <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${rolePillClasses()}`}>{roleLabel(ministry.tag_role)}</span>
            )}
          </div>
          {/* Ministry color (0040) — top level only; groups inherit it everywhere */}
          {ministry.parent_tag_id === null && (
            <div className="flex items-center gap-2">
              <label className="text-[12px] font-semibold text-slate-400" htmlFor="ministry-color">Color</label>
              {write ? (
                <>
                  <input
                    id="ministry-color"
                    type="color"
                    value={ministry.color ?? (color?.strong ?? '#4F6EF7')}
                    onChange={e => void onColorChange(e.target.value)}
                    title="Pick this ministry's color. It shows everywhere this ministry appears."
                    className="h-7 w-9 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
                  />
                  {ministry.color && (
                    <button
                      onClick={() => void onColorChange(null)}
                      className="rounded text-[11px] font-medium text-slate-400 hover:text-slate-600"
                      title="Back to the automatic palette"
                    >
                      Reset
                    </button>
                  )}
                </>
              ) : (
                <span className="h-5 w-5 rounded-md border border-slate-200" style={{ backgroundColor: ministry.color ?? color?.strong ?? '#cbd5e1' }} aria-hidden />
              )}
            </div>
          )}
          {write && (
            <button onClick={onDeactivate} className="ml-auto rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-3 py-1.5 text-[12px] font-semibold text-[#B45309] transition-colors hover:bg-[#F59E0B]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/40">
              Remove ministry
            </button>
          )}
        </div>
      </div>

      {/* Groups inside this node */}
      {(childNodes.length > 0 || write) && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-600">Groups inside {ministry.name}</h3>
            <span className="font-num text-[12px] font-semibold text-slate-400">{childNodes.length}</span>
          </div>
          {childNodes.length > 0 && (
            <ul className="divide-y divide-slate-50">
              {childNodes.map(c => (
                <li key={c.id}>
                  <button onClick={() => onSelectChild(c.id)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-slate-50">
                    <Ico.chevron className="h-3.5 w-3.5 -rotate-90 text-slate-300" />
                    <span className="text-[14px] font-medium text-slate-700">{c.name}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${rolePillClasses()}`}>{roleLabel(c.tag_role)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {write && (
            <div className="border-t border-slate-100 px-5 py-3">
              {!addingGroup ? (
                <button onClick={() => { setAddingGroup(true); setGRole(ministry.tag_role) }} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[#3D5BD4] transition-colors hover:bg-slate-50">
                  <Ico.plus className="h-4 w-4" /> Add a group inside {ministry.name}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text" value={gName} onChange={e => setGName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && gName.trim()) { onAddGroupHere(gName, gRole); setGName(''); setAddingGroup(false) } if (e.key === 'Escape') { setAddingGroup(false); setGName('') } }}
                    placeholder="Group name (e.g. Tabors)" autoFocus
                    className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
                  />
                  <select value={gRole} onChange={e => setGRole(e.target.value as TagRole)} aria-label="Group role" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7]">
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={() => { if (gName.trim()) { onAddGroupHere(gName, gRole); setGName(''); setAddingGroup(false) } }} disabled={!gName.trim()} className="rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40">Add</button>
                  <button onClick={() => { setAddingGroup(false); setGName('') }} className="rounded-lg px-2 py-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-700">Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Metric Kind sections — only Kinds that have ≥1 metric here.
          System kinds first (Attendance, Volunteers, Stats, Giving), then ANY
          other kind with metrics on this node (custom kinds) so no metric is
          ever invisible here ("where do I edit Giving"). */}
      {[
        ...SYSTEM_KINDS.map(k => ({ code: k as string, label: KIND_LABEL[k as KindCode] })),
        ...reportingTags
          .filter(r => !SYSTEM_KINDS.includes(r.code as KindCode) && (byKind.get(r.id) ?? []).length > 0)
          .map(r => ({ code: r.code, label: r.name })),
      ].map(kind => {
        const rt = reportingTags.find(r => r.code === kind.code)
        if (!rt) return null
        const list = byKind.get(rt.id) ?? []
        if (list.length === 0) return null
        return (
          <KindSection
            key={kind.code}
            kindCode={kind.code}
            kindLabel={kind.label}
            metrics={list}
            write={write}
            eligibleParentsFor={eligibleParentsFor}
            parentLabel={parentLabel}
            unreferencedRollupIds={unreferencedRollupIds}
            childCountFor={childCountFor}
            onRenameMetric={onRenameMetric}
            onRemoveMetric={onRemoveMetric}
            onSetMode={onSetMode}
            onSetParent={onSetParent}
            onSetOp={onSetOp}
          />
        )
      })}

      {/* Add a metric */}
      {write && (
        <AddMetricControl
          reportingTags={reportingTags}
          onAdd={onAddMetric}
        />
      )}
    </div>
  )
}
