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

// percent change of `cur` vs `base` (null-safe; null when no base / divide-by-zero)
function pct(cur: number | null, base: number | null): number | null {
  if (cur === null || base === null || base === 0) return null
  return Math.round(((cur - base) / base) * 100)
}

// ▲/▼ delta chip — sage up, amber down (DS-2: no red)
function DeltaBadge({ delta, note }: { delta: number | null; note?: string }) {
  if (delta === null) return null
  const up = delta >= 0
  return (
    <span className="mt-0.5 flex items-center gap-1">
      <span className={`font-num text-[10px] font-bold ${up ? 'text-[#059669]' : 'text-[#B45309]'}`}>{up ? '▲' : '▼'} {Math.abs(delta)}%</span>
      {note && <span className="text-[8px] uppercase tracking-wide text-slate-300">{note}</span>}
    </span>
  )
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

function StatPill({ label, value, prefix, suffix, strong, delta, deltaNote }: { label: string; value: number | null; prefix?: string; suffix?: string; strong?: boolean; delta?: number | null; deltaNote?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`font-num ${strong ? 'text-[18px] font-bold text-slate-900' : 'text-[15px] font-semibold text-slate-700'} leading-tight`}>{fmtVal(value, prefix, suffix)}</p>
      {delta !== undefined && <DeltaBadge delta={delta} note={deltaNote} />}
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
  const [range, setRange] = useState<'ytd' | '12w'>('ytd')
  if (!open || typeof document === 'undefined') return null
  const prefix = series?.selector.prefix
  const suffix = series?.selector.suffix

  // #4 range — slice the already-fetched weeks (no extra fetch). #5 best/lowest
  // computed over the full current year regardless of the zoom.
  const sliced = <T,>(pts: T[]): T[] => (range === '12w' ? pts.slice(-12) : pts)
  const shownSeries = series ? { ...series, current: sliced(series.current), prior: sliced(series.prior) } : series
  const nonNull = series ? series.current.filter((p): p is { weekStart: string; value: number } => p.value !== null) : []
  const best = nonNull.length ? nonNull.reduce((a, b) => (b.value > a.value ? b : a)) : null
  const low = nonNull.length ? nonNull.reduce((a, b) => (b.value < a.value ? b : a)) : null

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
              {/* headline stats — with trend deltas (#1) */}
              <div className="grid grid-cols-3 gap-2">
                <StatPill label="Last 4-Wk" value={series.fourWeekAvg} prefix={prefix} suffix={suffix} strong={triggerWindow === 'm4' || triggerWindow === 'w'} delta={pct(series.fourWeekAvg, series.ytdAvg)} deltaNote="vs YTD" />
                <StatPill label="Curr YTD" value={series.ytdAvg} prefix={prefix} suffix={suffix} strong={triggerWindow === 'ytd'} delta={pct(series.ytdAvg, series.priorYtdAvg)} deltaNote="YoY" />
                <StatPill label="Prior YTD" value={series.priorYtdAvg} prefix={prefix} suffix={suffix} strong={triggerWindow === 'priorYtd'} />
              </div>

              {/* ── trend chart + weekly grid (range-toggle #4, best/lowest #5) ── */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                  <h3 className="text-[12px] font-bold tracking-tight text-slate-900">{range === '12w' ? 'Last 12 weeks' : 'Year to date'}</h3>
                  <div className="flex overflow-hidden rounded-lg border border-slate-200 text-[10px] font-semibold">
                    <button onClick={() => setRange('ytd')} className={`px-2 py-1 transition-colors ${range === 'ytd' ? 'bg-[#4F6EF7] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Year</button>
                    <button onClick={() => setRange('12w')} className={`px-2 py-1 transition-colors ${range === '12w' ? 'bg-[#4F6EF7] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>12 wks</button>
                  </div>
                </div>
                <div className="px-4 py-3">
                  {shownSeries && <YtdChart series={shownSeries} prefix={prefix} suffix={suffix} />}
                </div>
                {(best || low) && (
                  <div className="flex flex-wrap gap-2 px-4 pb-3 text-[10px] font-semibold">
                    {best && <span className="rounded-md bg-[#059669]/10 px-2 py-0.5 text-[#047857]">Best · {fmtWeek(best.weekStart)} · <span className="font-num">{fmtVal(best.value, prefix, suffix)}</span></span>}
                    {low && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-500">Lowest · {fmtWeek(low.weekStart)} · <span className="font-num">{fmtVal(low.value, prefix, suffix)}</span></span>}
                  </div>
                )}
                <div className="max-h-56 overflow-y-auto border-t border-slate-100">
                  {[...(shownSeries?.current ?? [])].reverse().map(p => (
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
