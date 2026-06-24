'use client'

// ── Zone D — TOTALS (E-10..E-13) — extracted from entries/page.tsx (P4d) ──

import { useEffect, useState } from 'react'
import { Ico, accentForRole, fmt, roleLabel, type GridPrefs, type Ministry } from '../ui'

export function TotalsView({ weekLabel, grandTotal, rollups, excluded, excludedMetrics, readOnly, onSavePrefs }: {
  weekLabel: string
  grandTotal: number
  rollups: { ministry: Ministry; rows: { label: string; value: number; sub?: string; reporting_tag_code: string }[]; attTotal: number; attVal: number; volVal: number }[]
  excluded: Set<string>
  excludedMetrics: Set<string>
  readOnly: boolean
  onSavePrefs: (next: GridPrefs) => void
}) {
  const [editTotals, setEditTotals] = useState(false)

  return (
    <div>
      <div className="mb-4 overflow-hidden rounded-2xl border text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #4F6EF7, #3D5BD4)' }}>
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/70">
              Total attendance · week of {weekLabel}
              {!readOnly && (
                <button
                  onClick={() => setEditTotals(e => !e)}
                  title="Edit what counts toward the grand total"
                  aria-label="Edit what counts toward the grand total"
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                >
                  <Ico.pencilFill className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            <div className="mt-0.5 font-num text-[11px] text-white/60">
              {editTotals ? 'Editing church-wide total preferences' : 'Configure what counts toward the grand total'}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-num text-5xl font-bold tracking-tight">{fmt(grandTotal)}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total</span>
          </div>
        </div>
      </div>

      {/* Include in grand total edit panel — mirror image of dashboard SummaryCard config */}
      {editTotals && !readOnly && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Include in grand total</p>
            <p className="mt-1 text-xs text-amber-600 font-medium bg-amber-50 rounded-md px-2 py-1.5 inline-flex items-center gap-1.5">
              <Ico.info className="h-3.5 w-3.5" />
              Church-Wide Setting: Changes made here update the official Grand Total for all team members and AI reports.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Attendance Column */}
            <div>
              <h4 className="mb-2 text-[13px] font-bold text-slate-800">Attendance</h4>
              <div className="space-y-1.5">
                {rollups.map(r => {
                  const hasAttendance = r.rows.some(row => row.reporting_tag_code === 'ATTENDANCE')
                  if (!hasAttendance) return null
                  const included = !excluded.has(r.ministry.tag_id) && !excludedMetrics.has(`${r.ministry.tag_id}|ATTENDANCE`)
                  return (
                    <button
                      key={`${r.ministry.tag_id}-att`}
                      onClick={() => {
                        const newExcluded = new Set(excludedMetrics)
                        const key = `${r.ministry.tag_id}|ATTENDANCE`
                        if (included) newExcluded.add(key)
                        else newExcluded.delete(key)
                        onSavePrefs({
                          excludedTotalMinistries: Array.from(excluded),
                          excludedTotalMetrics: Array.from(newExcluded)
                        })
                      }}
                      className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors duration-200 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors duration-200 ${included ? 'border-transparent' : 'border-slate-300'}`} style={included ? { background: '#4F6EF7' } : undefined}>
                          {included && <Ico.check className="h-2.5 w-2.5 text-white" />}
                        </span>
                        <span
                          className={`h-4 w-1.5 rounded-full ${accentForRole(r.ministry.tag_role)}`}
                          aria-hidden
                        />
                        <span className="text-[13px] font-semibold text-slate-800">{r.ministry.name}</span>
                      </span>
                      <span className="font-num text-[12px] text-slate-500">{fmt(r.attVal)}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Volunteers Column */}
            <div>
              <h4 className="mb-2 text-[13px] font-bold text-slate-800">Volunteers</h4>
              <div className="space-y-1.5">
                {rollups.map(r => {
                  const hasVolunteers = r.rows.some(row => row.reporting_tag_code === 'VOLUNTEERS')
                  if (!hasVolunteers) return null
                  const included = !excluded.has(r.ministry.tag_id) && !excludedMetrics.has(`${r.ministry.tag_id}|VOLUNTEERS`)
                  return (
                    <button
                      key={`${r.ministry.tag_id}-vol`}
                      onClick={() => {
                        const newExcluded = new Set(excludedMetrics)
                        const key = `${r.ministry.tag_id}|VOLUNTEERS`
                        if (included) newExcluded.add(key)
                        else newExcluded.delete(key)
                        onSavePrefs({
                          excludedTotalMinistries: Array.from(excluded),
                          excludedTotalMetrics: Array.from(newExcluded)
                        })
                      }}
                      className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors duration-200 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors duration-200 ${included ? 'border-transparent' : 'border-slate-300'}`} style={included ? { background: '#4F6EF7' } : undefined}>
                          {included && <Ico.check className="h-2.5 w-2.5 text-white" />}
                        </span>
                        <span
                          className={`h-4 w-1.5 rounded-full ${accentForRole(r.ministry.tag_role)}`}
                          aria-hidden
                        />
                        <span className="text-[13px] font-semibold text-slate-800">{r.ministry.name}</span>
                      </span>
                      <span className="font-num text-[12px] text-slate-500">{fmt(r.volVal)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-[11px] text-slate-400">Saved for the whole church · doesn’t change entered numbers</span>
            <button
              onClick={() => setEditTotals(false)}
              className="cursor-pointer rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-opacity duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
              style={{ background: '#4F6EF7' }}
            >Close</button>
          </div>
        </div>
      )}

      {rollups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">No services this week for this campus.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rollups.map(r => {
            const isExcludedEntirely = excluded.has(r.ministry.tag_id)
            return (
              <div key={r.ministry.tag_id} className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md ${isExcludedEntirely ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`h-5 w-1.5 rounded-full ${accentForRole(r.ministry.tag_role)}`} aria-hidden />
                  <h4 className="text-[15px] font-bold tracking-tight text-slate-900">{r.ministry.name}</h4>
                  <span className="text-[12px] font-medium text-slate-400">· {roleLabel(r.ministry.tag_role)}</span>
                  {isExcludedEntirely && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Not in total</span>}
                </div>
                <div className="space-y-2.5">
                  {r.rows.map((m, i) => {
                    const isRowExcluded = excludedMetrics.has(`${r.ministry.tag_id}|${m.reporting_tag_code}`) || isExcludedEntirely
                    return (
                      <div key={m.label} className={`flex items-baseline justify-between ${i === 0 ? 'border-b border-slate-100 pb-2.5' : ''}`}>
                        <span className="text-[12px] font-medium text-slate-500">
                          {m.label}{m.sub && <span className="ml-1 font-num text-[10px] text-slate-400">{m.sub}</span>}
                          {isRowExcluded && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-400">Excluded</span>}
                        </span>
                        <span className={`font-num font-bold tracking-tight ${isRowExcluded ? 'text-slate-400' : 'text-slate-900'} ${i === 0 ? 'text-2xl' : 'text-lg'}`}>{fmt(m.value)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-slate-400">
        Attendance sums each ministry across the week’s sittings. Derived from <span className="font-num">service + date</span> — never stored.
      </p>
    </div>
  )
}
