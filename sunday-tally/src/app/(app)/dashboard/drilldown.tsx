'use client'

// ─────────────────────────────────────────────────────────────────────────
// DASHBOARD DRILL-DOWN drawer (task #69). Presentational only — consumes a
// MetricSeries (fetched by src/lib/dashboardDrilldown.ts) and renders:
//   • a last-4-weeks grid broken into individual sittings (+ the 4-week average
//     the user clicked), and
//   • a YTD line chart (current vs prior year, hand-rolled SVG — no chart dep,
//     full DESIGN_SYSTEM control) with a weekly grid below.
//
// DS: brand #4F6EF7 · NO RED · Fira numerals (.font-num) · SVG icons. Right-side
// drawer on desktop, bottom sheet on mobile. Portaled to <body> so it overlays
// everything and escapes the dashboard's scroll container.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtVal } from './ui'
import type { MetricSeries, DrillWindow } from '@/lib/dashboardDrilldown'

const CloseIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
)

const BRAND = '#4F6EF7'
const PRIOR = '#94A3B8'   // slate-400 — prior-year line (no red)

function fmtWeek(sunday: string): string {
  return new Date(sunday + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtWeekFull(sunday: string): string {
  return new Date(sunday + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── hand-rolled two-line SVG chart (current vs prior YTD) ─────────────────────
function YtdChart({ series, prefix, suffix }: { series: MetricSeries; prefix?: string; suffix?: string }) {
  const W = 520, H = 200, padL = 8, padR = 8, padT = 16, padB = 22
  const maxLen = Math.max(series.current.length, series.prior.length, 1)
  const allVals = [...series.current, ...series.prior].map(p => p.value).filter((v): v is number => v !== null)
  const maxVal = allVals.length ? Math.max(...allVals) : 0
  const yMax = maxVal > 0 ? maxVal * 1.1 : 1

  const xFor = (i: number) => padL + (maxLen <= 1 ? 0 : (i / (maxLen - 1)) * (W - padL - padR))
  const yFor = (v: number) => H - padB - (v / yMax) * (H - padT - padB)

  // Build a polyline over the non-null points (gaps simply connect through).
  const pointsOf = (pts: { value: number | null }[]) =>
    pts.map((p, i) => (p.value === null ? null : `${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`))
       .filter((s): s is string => s !== null)
       .join(' ')

  const curPts = pointsOf(series.current)
  const priPts = pointsOf(series.prior)
  const lastCur = [...series.current].reverse().find(p => p.value !== null)

  // Interactive hover — snap to the nearest week and surface its values.
  const [hover, setHover] = useState<number | null>(null)
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const vbX = ((e.clientX - rect.left) / rect.width) * W
    const t = maxLen <= 1 ? 0 : (vbX - padL) / (W - padL - padR)
    setHover(Math.max(0, Math.min(maxLen - 1, Math.round(t * (maxLen - 1)))))
  }
  const curAt = hover !== null ? (series.current[hover]?.value ?? null) : null
  const priAt = hover !== null ? (series.prior[hover]?.value ?? null) : null
  const hoverX = hover !== null ? xFor(hover) : 0
  const hoverWeek = hover !== null ? (series.current[hover]?.weekStart ?? series.prior[hover]?.weekStart ?? null) : null
  const tipW = 116, tipH = 46
  const tipX = Math.max(padL, Math.min(W - padR - tipW, hoverX - tipW / 2))
  const showTip = hover !== null && (curAt !== null || priAt !== null)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-3 rounded-full" style={{ background: BRAND }} />Current YTD</span>
          <span className="flex items-center gap-1.5 text-slate-400"><span className="h-2 w-3 rounded-full" style={{ background: PRIOR }} />Prior YTD</span>
        </div>
        <span className="font-num text-[11px] text-slate-400">peak {fmtVal(Math.round(maxVal), prefix, suffix)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Year-to-date weekly series, current versus prior year"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'crosshair' }}
      >
        {/* baseline */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#E2E8F0" strokeWidth={1} />
        {/* hover guide */}
        {showTip && (
          <line x1={hoverX} y1={padT} x2={hoverX} y2={H - padB} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {/* prior first (behind) — trimmer */}
        {priPts && <polyline points={priPts} fill="none" stroke={PRIOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />}
        {/* current on top — trimmer */}
        {curPts && <polyline points={curPts} fill="none" stroke={BRAND} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />}
        {/* last current marker (hidden while hovering) */}
        {lastCur && lastCur.value !== null && hover === null && (
          <circle cx={xFor(series.current.indexOf(lastCur))} cy={yFor(lastCur.value)} r={3} fill={BRAND} />
        )}
        {/* hover dots */}
        {hover !== null && priAt !== null && <circle cx={hoverX} cy={yFor(priAt)} r={3} fill={PRIOR} stroke="#fff" strokeWidth={1.5} />}
        {hover !== null && curAt !== null && <circle cx={hoverX} cy={yFor(curAt)} r={3.5} fill={BRAND} stroke="#fff" strokeWidth={1.5} />}
        {/* hover tooltip */}
        {showTip && (
          <g transform={`translate(${tipX.toFixed(1)}, ${padT})`} pointerEvents="none">
            <rect width={tipW} height={tipH} rx={6} fill="#0F172A" opacity={0.95} />
            {hoverWeek && <text x={8} y={14} fill="#CBD5E1" fontSize={9} fontWeight={600}>{fmtWeek(hoverWeek).toUpperCase()}</text>}
            <text x={8} y={28} fill="#FFFFFF" fontSize={11} fontWeight={700} className="font-num">{curAt !== null ? fmtVal(curAt, prefix, suffix) : '—'}<tspan fill="#94A3B8" fontSize={9} fontWeight={500}>  cur</tspan></text>
            <text x={8} y={40} fill="#CBD5E1" fontSize={10} fontWeight={600} className="font-num">{priAt !== null ? fmtVal(priAt, prefix, suffix) : '—'}<tspan fill="#94A3B8" fontSize={9} fontWeight={500}>  prior</tspan></text>
          </g>
        )}
      </svg>
      <div className="mt-1 flex justify-between font-num text-[9px] text-slate-400">
        <span>Jan</span><span>now</span>
      </div>
    </div>
  )
}

function StatPill({ label, value, prefix, suffix, strong }: { label: string; value: number | null; prefix?: string; suffix?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`font-num ${strong ? 'text-[18px] font-bold text-slate-900' : 'text-[15px] font-semibold text-slate-700'} leading-tight`}>{fmtVal(value, prefix, suffix)}</p>
    </div>
  )
}

export function DrillDownDrawer({
  open, loading, series, triggerWindow, onClose,
}: {
  open: boolean
  loading: boolean
  series: MetricSeries | null
  triggerWindow: DrillWindow | null
  onClose: () => void
}) {
  if (!open || typeof document === 'undefined') return null
  const prefix = series?.selector.prefix
  const suffix = series?.selector.suffix

  return createPortal(
    <div className="fixed inset-0 z-[120] flex justify-end" role="dialog" aria-modal="true" aria-label="Metric detail">
      {/* scrim */}
      <button aria-label="Close detail" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/30 backdrop-blur-[1px]" />
      {/* panel */}
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-slate-50 shadow-2xl sm:w-[28rem]" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>Detail</p>
            <h2 className="truncate text-[15px] font-extrabold tracking-tight text-slate-900">{series?.selector.label ?? 'Loading…'}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading || !series ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* headline stats */}
              <div className="grid grid-cols-3 gap-2">
                <StatPill label="Last 4-Wk" value={series.fourWeekAvg} prefix={prefix} suffix={suffix} strong={triggerWindow === 'm4' || triggerWindow === 'w'} />
                <StatPill label="Curr YTD" value={series.ytdAvg} prefix={prefix} suffix={suffix} strong={triggerWindow === 'ytd'} />
                <StatPill label="Prior YTD" value={series.priorYtdAvg} prefix={prefix} suffix={suffix} strong={triggerWindow === 'priorYtd'} />
              </div>

              {/* ── 4-week grid (sittings) ── */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                  <h3 className="text-[12px] font-bold tracking-tight text-slate-900">Last 4 weeks</h3>
                  <span className="font-num text-[11px] text-slate-400">avg <span className="font-semibold text-slate-700">{fmtVal(series.fourWeekAvg, prefix, suffix)}</span></span>
                </div>
                <div>
                  {series.weeks.map(wk => (
                    <div key={wk.weekStart} className="border-b border-slate-50 px-4 py-2 last:border-b-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-slate-700">
                          Wk of {fmtWeek(wk.weekStart)}
                          {wk.inProgress && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">in progress</span>}
                        </span>
                        <span className="font-num text-[13px] font-bold text-slate-900">{fmtVal(wk.weekTotal, prefix, suffix)}</span>
                      </div>
                      {series.hasSittings && wk.sittings.length > 0 && (
                        <div className="mt-1 space-y-0.5 pl-3">
                          {wk.sittings.map((sv, i) => (
                            <div key={sv.occurrenceId + i} className="flex items-center justify-between text-[11px] text-slate-500">
                              <span className="truncate">{sv.label} · {fmtDay(sv.serviceDate)}</span>
                              <span className="font-num text-slate-600">{fmtVal(sv.value, prefix, suffix)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {series.hasSittings && wk.sittings.length === 0 && !wk.inProgress && (
                        <p className="mt-0.5 pl-3 text-[11px] text-slate-300">No data this week</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* ── YTD chart + weekly grid ── */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-2.5">
                  <h3 className="text-[12px] font-bold tracking-tight text-slate-900">Year to date</h3>
                </div>
                <div className="px-4 py-3">
                  <YtdChart series={series} prefix={prefix} suffix={suffix} />
                </div>
                <div className="max-h-56 overflow-y-auto border-t border-slate-100">
                  {[...series.current].reverse().map(p => (
                    <div key={p.weekStart} className="flex items-center justify-between border-b border-slate-50 px-4 py-1.5 last:border-b-0">
                      <span className="text-[11px] text-slate-500">Wk of {fmtWeekFull(p.weekStart)}</span>
                      <span className="font-num text-[12px] font-semibold text-slate-800">{fmtVal(p.value, prefix, suffix)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <p className="px-1 text-[11px] leading-relaxed text-slate-400">
                Derived from your entries — weekly figures sum each week’s sittings; the 4-week and YTD figures are weekly averages, matching the dashboard cards.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
