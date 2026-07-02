'use client'

// E-23 — Volunteers group with CALCULATED subtotal (never stored, rule #3 / DS-9)

import { useState } from 'react'
import { Field, Ico, type EntryMap, type Metric } from '../ui'

export function VolunteersGroup({ vols, instId, entries, readOnly, onCommit, onToggleNA }: {
  vols: Metric[]
  instId: string
  entries: EntryMap
  readOnly: boolean
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleNA?: (metric: Metric, instId: string, na: boolean) => Promise<void>
}) {
  const [open, setOpen] = useState(true)
  const total = vols.reduce((s, v) => {
    const e = entries[`${v.id}|${instId}`]
    return s + (e && !e.is_not_applicable && e.value !== null ? e.value : 0)
  }, 0)
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5">
      <button onClick={() => setOpen(o => !o)} className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors duration-200 hover:bg-white">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
          <Ico.chevron className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} /> Volunteers
        </span>
        <span className="flex items-center gap-2">
          <span className="font-num text-base font-semibold text-slate-900">{total}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">calculated</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 border-t border-slate-100 pt-1">
          {vols.map(v => {
            const e = entries[`${v.id}|${instId}`]
            return (
              <Field key={v.id} fieldId={`f-${v.id}-${instId}`} indent label={v.name} value={e?.value ?? null}
                isNA={e?.is_not_applicable} readOnly={readOnly} onCommit={(val) => onCommit(v, instId, val)}
                onToggleNA={readOnly || !onToggleNA ? undefined : (na) => onToggleNA(v, instId, na)} />
            )
          })}
        </div>
      )}
    </div>
  )
}
