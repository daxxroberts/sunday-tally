'use client'

// ─────────────────────────────────────────────────────────────────────────
// KindSection
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Ico } from '@/app/(app)/entries/ui'
import type { MetricMode, RollupOp } from '../actions'
import type { Metric } from '../types'
import { MetricRowItem } from './MetricRowItem'

export function KindSection({
  kindCode, kindLabel, metrics, write,
  eligibleParentsFor, parentLabel, unreferencedRollupIds, childCountFor,
  onRenameMetric, onRemoveMetric, onSetMode, onSetParent, onSetOp,
}: {
  /** Phase-1 kind code OR any other reporting kind (GIVING / custom) — only
   *  drives the accent tint, so a plain string is safe. */
  kindCode: string
  kindLabel: string
  metrics: Metric[]
  write: boolean
  eligibleParentsFor: (m: Metric) => Metric[]
  parentLabel: (m: Metric) => string
  unreferencedRollupIds: Set<string>
  childCountFor: (rollupId: string) => number
  onRenameMetric: (metricId: string, name: string) => Promise<void>
  onRemoveMetric: (metricId: string) => Promise<void>
  onSetMode: (metricId: string, mode: MetricMode, op?: RollupOp) => Promise<void>
  onSetParent: (metricId: string, parentId: string | null) => Promise<void>
  onSetOp: (metricId: string, op: RollupOp) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(true)

  const kindAccent = kindCode === 'ATTENDANCE'
    ? 'bg-[#4F6EF7]/15 border-[#4F6EF7]/30'
    : kindCode === 'VOLUNTEERS'
    ? 'bg-[#22C55E]/15 border-[#22C55E]/30'
    : kindCode === 'GIVING'
    ? 'bg-[#F59E0B]/15 border-[#F59E0B]/30'
    : 'bg-[#8B5CF6]/15 border-[#8B5CF6]/30'

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(x => !x)}
        aria-expanded={expanded}
        className={`flex w-full items-center justify-between gap-3 border-b px-5 py-3 text-left transition-colors ${kindAccent}`}
      >
        <div className="flex items-center gap-2">
          <Ico.chevron className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-700">{kindLabel}</h3>
          <span
            className="text-[10px] font-medium text-slate-400 cursor-help"
            title={`"${kindLabel}" is a reporting type. It tells the dashboard how to handle these numbers. The counts you add here all report as ${kindLabel}.`}
          >
            reporting type
          </span>
        </div>
        <span className="font-num text-[12px] font-semibold text-slate-400">
          {metrics.length} count{metrics.length === 1 ? '' : 's'}
        </span>
      </button>
      {expanded && (
      <ul className="divide-y divide-slate-50">
        {metrics.map(m => (
          <MetricRowItem
            key={m.id}
            metric={m}
            write={write}
            eligibleParents={eligibleParentsFor(m)}
            parentLabel={parentLabel}
            unreferenced={unreferencedRollupIds.has(m.id)}
            childCount={childCountFor(m.id)}
            onRename={name => onRenameMetric(m.id, name)}
            onRemove={() => onRemoveMetric(m.id)}
            onSetMode={(mode, op) => onSetMode(m.id, mode, op)}
            onSetParent={pid => onSetParent(m.id, pid)}
            onSetOp={op => onSetOp(m.id, op)}
          />
        ))}
      </ul>
      )}
    </div>
  )
}
