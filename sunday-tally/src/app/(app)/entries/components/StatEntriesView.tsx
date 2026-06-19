'use client'

// ── Zone F — STAT ENTRIES (E-30..E-32) — extracted from entries/page.tsx (P4d) ──

import { Dot, Field, toDateStr, type EntryMap, type Metric, type Stat } from '../ui'

function cadenceLabel(c: Metric['cadence']) {
  if (c === 'day') return 'Daily'
  if (c === 'month') return 'Monthly'
  return 'Weekly'
}

// Sub-group church-wide period metrics by reporting dimension so the panel scales:
// Giving stays under "Giving", future church-wide stats (parking, operations) land
// under "Stats", etc. — mirrors the History grid's dimension grouping.
const DIM_LABEL: Record<string, string> = {
  GIVING:        'Giving',
  RESPONSE_STAT: 'Stats',
  VOLUNTEERS:    'Volunteers',
  ATTENDANCE:    'Attendance',
}
const DIM_ORDER = ['GIVING', 'RESPONSE_STAT', 'VOLUNTEERS', 'ATTENDANCE']
function dimLabel(code: string) {
  return DIM_LABEL[code]
    ?? (code ? code.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) : 'Other')
}

export function StatEntriesView({ metrics, entries, weekStart, weekStartStr, readOnly, status, onCommit }: {
  metrics: Metric[]
  entries: EntryMap
  weekStart: Date
  weekStartStr: string
  readOnly: boolean
  status: Stat
  onCommit: (metric: Metric, anchor: string, value: number | null) => Promise<void>
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="h-7 w-1.5 rounded-full" style={{ background: '#4F6EF7' }} aria-hidden />
          <h3 className="text-[17px] font-bold tracking-tight text-slate-900">Stat Entries</h3>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(79,110,247,.1)', color: '#3D5BD4' }}>period totals · church-wide</span>
        </div>
        {metrics.length > 0 && <Dot s={status} />}
      </div>
      {metrics.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
          <span className="text-sm font-semibold text-slate-600">No church-wide stats configured yet</span>
          <span className="text-[12px] text-slate-400">Period stats (giving, baptisms, prayer requests…) appear here once configured in Settings.</span>
        </div>
      ) : (
        <>
          <div className="space-y-3 px-3 py-2">
            {(() => {
              const byDim = new Map<string, Metric[]>()
              for (const m of metrics) {
                const k = m.reporting_tag_code ?? 'OTHER'
                const list = byDim.get(k) ?? []
                list.push(m); byDim.set(k, list)
              }
              const keys = [
                ...DIM_ORDER.filter(k => byDim.has(k)),
                ...[...byDim.keys()].filter(k => !DIM_ORDER.includes(k)),
              ]
              const multi = keys.length > 1
              return keys.map(dimKey => (
                <div key={dimKey} className="space-y-1">
                  {multi && (
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{dimLabel(dimKey)}</p>
                  )}
                  {byDim.get(dimKey)!.map(m => {
                    // TODO(N-4): cadence-aware controls — 'day' should render 7 per-day boxes (Mon–Sun)
                    const anchor = m.cadence === 'month'
                      ? toDateStr(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1))
                      : weekStartStr // 'week' and (MVP) 'day' anchor to the week's Sunday
                    const e = entries[`${m.id}|${anchor}`]
                    const isGiving = m.reporting_tag_code === 'GIVING'
                    return (
                      <Field key={m.id} fieldId={`p-${m.id}`} label={m.name} value={e?.value ?? null}
                        cadence={cadenceLabel(m.cadence)} prefix={isGiving ? '$' : undefined} needs readOnly={readOnly}
                        onCommit={(v) => onCommit(m, anchor, v)} />
                    )
                  })}
                </div>
              ))
            })()}
          </div>
          <p className="px-4 pb-4 pt-1 text-[12px] leading-relaxed text-slate-400">Church-wide stats, each entered on its own cadence — not tied to any single service or ministry.</p>
        </>
      )}
    </section>
  )
}
