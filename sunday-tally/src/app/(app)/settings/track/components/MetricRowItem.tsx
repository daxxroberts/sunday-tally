'use client'

// ─────────────────────────────────────────────────────────────────────────
// MetricRowItem — name + mode toggle + (entry: rolls-up-into) / (rollup: op)
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import InlineEditField from '@/components/shared/InlineEditField'
import { Ico } from '@/app/(app)/entries/ui'
import type { MetricMode, RollupOp } from '../actions'
import { OP_LABEL, type Metric } from '../types'

export function MetricRowItem({
  metric, write, eligibleParents, parentLabel, unreferenced, childCount,
  onRename, onRemove, onSetMode, onSetParent, onSetOp,
}: {
  metric: Metric
  write: boolean
  eligibleParents: Metric[]
  parentLabel: (m: Metric) => string
  unreferenced: boolean
  childCount: number
  onRename: (name: string) => Promise<void>
  onRemove: () => void
  onSetMode: (mode: MetricMode, op?: RollupOp) => void
  onSetParent: (parentId: string | null) => void
  onSetOp: (op: RollupOp) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const isRollup = metric.mode === 'rollup'
  // Period = weekly/monthly church-wide (Stat Entries; e.g. Giving). Shown with
  // a cadence badge; service-bound controls (mode/rolls-up-into) don't apply.
  const isPeriod = metric.scope === 'period'

  return (
    <li className="group px-5 py-3 transition-colors duration-200 hover:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {write ? (
            <InlineEditField value={metric.name} onSave={onRename} aria-label={metric.name} className="text-[14px] font-medium text-slate-800" />
          ) : (
            <span className="text-[14px] font-medium text-slate-800">{metric.name}</span>
          )}
          {isPeriod && (
            <span className="shrink-0 rounded-md bg-[#4F6EF7]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3D5BD4]" title="One number for the whole church, once a week. You set the schedule in Services and Occurrences.">
              {metric.cadence === 'month' ? 'Monthly' : 'Weekly'} · church-wide
            </span>
          )}
        </div>

        {write && (
          <div className="flex shrink-0 items-center gap-1">
            {/* mode toggle (service-bound metrics only) */}
            {!isPeriod && (
            <div className="flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-semibold">
              <button
                onClick={() => onSetMode('entry')}
                title="You count this and type it in every week."
                className={`px-2 py-1 transition-colors ${!isRollup ? 'bg-[#4F6EF7] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >Entry</button>
              <button
                onClick={() => onSetMode('rollup', metric.rollup_op ?? 'sum')}
                title="The math is done for you. This one adds up other counts automatically — you never type it."
                className={`whitespace-nowrap px-2 py-1 transition-colors ${isRollup ? 'bg-[#4F6EF7] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >Roll up sub-entries</button>
            </div>
            )}
            {confirmRemove ? (
              <span className="flex items-center gap-1">
                <button onClick={() => { onRemove(); setConfirmRemove(false) }} className="rounded-lg px-2 py-1 text-[12px] font-semibold text-[#B45309] transition-colors hover:bg-[#F59E0B]/10">Confirm</button>
                <button onClick={() => setConfirmRemove(false)} className="rounded-lg px-2 py-1 text-[12px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmRemove(true)} aria-label={`Remove ${metric.name}`} className="ml-1 flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus-visible:opacity-100">
                <Ico.trash className="h-3.5 w-3.5" />Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* second line — only shown when there's something meaningful to display:
          period → schedule note; rollup → op + child count; entry + parent set → rolls up into.
          Plain entry with no parent chosen: row stays collapsed (no second line). */}
      {(isPeriod || isRollup || metric.parent_metric_id || (write && !isRollup && eligibleParents.length > 0 && metric.parent_metric_id)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-0 text-[12px] text-slate-500">
          {isPeriod ? (
            <span className="text-slate-400">
              How often this is counted is set on its schedule in Services and Occurrences.
            </span>
          ) : isRollup ? (
            <>
              <span className="text-slate-400">Combines its children:</span>
              {write ? (
                <select value={metric.rollup_op ?? 'sum'} onChange={e => onSetOp(e.target.value as RollupOp)} aria-label="Roll-up operation" className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[12px] text-slate-700 outline-none focus:border-[#4F6EF7]">
                  {(['sum', 'avg', 'max'] as RollupOp[]).map(op => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                </select>
              ) : (
                <span className="font-medium text-slate-600">{OP_LABEL[metric.rollup_op ?? 'sum']}</span>
              )}
              {unreferenced ? (
                <span className="rounded-md bg-[#F59E0B]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#B45309]">⚠ Nothing points up to this yet</span>
              ) : (
                <span className="font-num text-[11px] text-slate-400">{childCount} pointing up</span>
              )}
            </>
          ) : metric.parent_metric_id ? (
            <>
              <span className="text-slate-400">Rolls up into:</span>
              {write ? (
                <select
                  value={metric.parent_metric_id}
                  onChange={e => onSetParent(e.target.value || null)}
                  aria-label="Rolls up into"
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[12px] text-slate-700 outline-none focus:border-[#4F6EF7]"
                >
                  <option value="">— stays local —</option>
                  {eligibleParents.map(p => <option key={p.id} value={p.id}>{parentLabel(p)}</option>)}
                </select>
              ) : (
                <span className="font-medium text-slate-600">
                  {(() => { const p = eligibleParents.find(x => x.id === metric.parent_metric_id); return p ? parentLabel(p) : 'a parent roll-up' })()}
                </span>
              )}
            </>
          ) : null}
        </div>
      )}
    </li>
  )
}
