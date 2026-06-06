'use client'

// ─────────────────────────────────────────────────────────────────────────
// DASHBOARD screen — shared UI primitives (DS-1..DS-25, IRIS_DASHBOARD_ELEMENT_MAP).
// This is the VISUAL redesign layer over the existing dashboard.ts data layer.
// Reuses Entries primitives (fmt, Ico, accentForRole, roleLabel) per the reuse
// contract; everything dashboard-shaped (4-col rows, delta badge, KPI/key-metric
// cards, section header) lives here so D1 (page.tsx) + D2 (viewer) never diverge.
// SVG icons only (DS-14) · NO RED — up=sage / down=amber (DS-2/E-83) · .font-num (DS-4).
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Ico, fmt, accentForRole, roleLabel } from '../entries/ui'
import type { FourWin } from '@/lib/dashboard'

// ── number / currency formatting (E-13 / O-2) ───────────────────────────────
// Per-capita giving: currency, 0–2 dp (Intl). Plain numbers via Entries `fmt`.
const currency0to2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function fmtVal(n: number | null, prefix?: string, suffix?: string): string {
  if (n === null) return '—'
  const body = prefix === '$' ? currency0to2.format(n) : fmt(n)
  return `${prefix ?? ''}${body}${suffix ?? ''}`
}

// ── E-83 / N-9 — delta badge. Arrow + sign + % so colour is never the only
//    signal (DS-18). NO RED: up = sage, down = amber, null = muted dash. ──────
export function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="font-num text-[10px] font-medium text-slate-300">—</span>
  const up = delta >= 0
  const Arrow = up ? Ico.arrowUp : Ico.arrowDown
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-num text-[10px] font-semibold"
      style={up ? { background: 'rgba(34,197,94,.12)', color: '#15803D' } : { background: 'rgba(245,158,11,.14)', color: '#B45309' }}
      title={up ? 'Up vs comparison window' : 'Down vs comparison window'}
    >
      <Arrow className="h-2.5 w-2.5" />
      {up ? '+' : '−'}{Math.abs(delta)}%
    </span>
  )
}

// ── E-20 — 4-column header row (Curr Wk · Last 4-Wk · Curr YTD · Prior YTD) ──
const GRID = 'grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-2'

// Rendered INSIDE each 4-column card (under its CardHeader, above the rows) so the
// period labels stay in view while scrolling. Hover any header → tooltip with the
// full plain-English name + the exact date range that window covers (E-20).
type Win = { start: string; end: string }
function fmtRange(start: string, end: string): string {
  const f = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${f(start)} – ${f(end)}`
}
export function ColumnHeaders({ windows }: {
  windows?: { week: Win; last4: Win; ytd: Win; priorYtd: Win }
}) {
  const cols: { short: string; full: string; note: string; range?: Win }[] = [
    { short: 'Curr Wk',   full: 'Current Week',         note: '',               range: windows?.week },
    { short: 'Last 4-Wk', full: 'Last 4 Weeks',         note: 'weekly average', range: windows?.last4 },
    { short: 'Curr YTD',  full: 'Current Year-to-Date', note: 'weekly average', range: windows?.ytd },
    { short: 'Prior YTD', full: 'Prior Year-to-Date',   note: 'weekly average', range: windows?.priorYtd },
  ]
  // Tooltip is portaled to <body> with fixed positioning so it is never clipped by
  // the card's overflow-hidden (E-20). Anchored to the hovered cell's top-right corner.
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)
  const open = (e: React.MouseEvent | React.FocusEvent, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTip({ i, x: r.right, y: r.top })
  }
  const tc = tip ? cols[tip.i] : null
  return (
    <div className={`${GRID} border-b border-slate-100 bg-slate-50/50 px-4 pt-2 pb-1.5`}>
      <div />
      {cols.map((col, i) => (
        <div key={col.short} className="flex justify-end">
          <span
            tabIndex={0}
            onMouseEnter={e => open(e, i)}
            onMouseLeave={() => setTip(null)}
            onFocus={e => open(e, i)}
            onBlur={() => setTip(null)}
            className="cursor-help text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 decoration-dotted decoration-slate-300 underline-offset-2 outline-none hover:underline focus:underline"
          >{col.short}</span>
        </div>
      ))}
      {tc && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{ position: 'fixed', left: tip!.x, top: tip!.y - 8, transform: 'translate(-100%, -100%)' }}
          className="pointer-events-none z-[100] w-44 rounded-lg bg-slate-900 px-3 py-2 text-left shadow-xl"
        >
          <p className="text-[11px] font-bold text-white">{tc.full}</p>
          {tc.note && <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#67E8F9' }}>{tc.note}</p>}
          {tc.range && <p className="mt-1 font-num text-[10px] text-slate-300">{fmtRange(tc.range.start, tc.range.end)}</p>}
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── 4-window data row (E-31 / E-51..E-53). Curr-Wk bold + delta_w_m4 badge,
//    YTD + delta_ytd_prior badge. hideComparisons → only `w`, rest dashed. ─────
export function FourColRow({
  label, sub, values, prefix, suffix, indent, hideComparisons,
}: {
  label: string
  sub?: string
  values: FourWin
  prefix?: string
  suffix?: string
  indent?: boolean
  hideComparisons?: boolean
}) {
  const dash = <span className="text-slate-300">—</span>
  return (
    <div className={`${GRID} items-start border-b border-slate-50 px-4 py-2 transition-colors duration-200 last:border-b-0 hover:bg-slate-50/60`}>
      <div className={`text-[12px] font-medium leading-tight text-slate-600 ${indent ? 'pl-4' : ''}`}>
        {label}{sub && <span className="ml-1 text-[10px] text-slate-400">{sub}</span>}
      </div>
      <div className="text-right">
        <p className="font-num text-[14px] font-semibold leading-tight text-slate-900">{fmtVal(values.w, prefix, suffix)}</p>
        {!hideComparisons && <div className="mt-0.5"><DeltaBadge delta={values.delta_w_m4} /></div>}
      </div>
      <div className="text-right">
        <p className="font-num text-[14px] font-semibold leading-tight text-slate-700">{hideComparisons ? dash : fmtVal(values.m4, prefix, suffix)}</p>
      </div>
      <div className="text-right">
        <p className="font-num text-[14px] font-semibold leading-tight text-slate-900">{hideComparisons ? dash : fmtVal(values.ytd, prefix, suffix)}</p>
        {!hideComparisons && <div className="mt-0.5"><DeltaBadge delta={values.delta_ytd_prior} /></div>}
      </div>
      <div className="text-right">
        <p className="font-num text-[14px] font-semibold leading-tight text-slate-700">{hideComparisons ? dash : fmtVal(values.priorYtd, prefix, suffix)}</p>
      </div>
    </div>
  )
}

// ── card header row: left accent bar + label (+ optional role suffix) (DS-7) ──
export function CardHeader({
  label, role, accentClass, accentStyle, suffix, trailing,
}: {
  label: string
  role?: string | null            // when set → "· Adults/Kids/Youth" muted suffix (DS-8)
  accentClass?: string            // tailwind bg-class (e.g. accentForRole output)
  accentStyle?: React.CSSProperties // inline bg (e.g. brand / teal lane)
  suffix?: React.ReactNode        // e.g. "Not in total" marker
  trailing?: React.ReactNode      // right-edge action / control
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`h-5 w-1.5 shrink-0 rounded-full ${accentClass ?? ''}`} style={accentStyle} aria-hidden />
        <h3 className="truncate text-[14px] font-bold tracking-tight text-slate-900">{label}</h3>
        {role !== undefined && <span className="shrink-0 text-[12px] font-medium text-slate-400">· {roleLabel(role)}</span>}
        {suffix}
      </div>
      {trailing}
    </div>
  )
}

// ── "Not in total" muted marker (E-54) — mirrors the Entries Totals tag ───────
export function NotInTotalTag() {
  return <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Not in total</span>
}

// ── Zone B — highlight KPI card (E-10..E-13). Top accent bar by lane (DS-5). ──
export function KpiCard({
  label, value, prefix, delta, prior,
}: {
  label: string
  value: number
  prefix?: string
  delta: number | null
  prior: number
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="font-num text-3xl font-bold leading-none tracking-tight text-slate-900">{fmtVal(value, prefix)}</p>
        <DeltaBadge delta={delta} />
      </div>
      <p className="mt-2 font-num text-[11px] text-slate-400">vs {fmtVal(prior, prefix)} last week</p>
    </div>
  )
}

// ── Zone E — Key Metrics card (E-41..E-43). Big `w` + delta, small footer. ────
export function KeyMetricCard({
  label, values, prefix, suffix,
}: {
  label: string
  values: FourWin
  prefix?: string
  suffix?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="font-num text-2xl font-bold leading-none tracking-tight text-slate-900">{fmtVal(values.w, prefix, suffix)}</p>
        <DeltaBadge delta={values.delta_w_m4} />
      </div>
      <div className="mt-2 flex items-center justify-between font-num text-[11px] text-slate-400">
        <span>4-wk <span className="font-semibold text-slate-900">{fmtVal(values.m4, prefix, suffix)}</span></span>
        <span>YTD <span className="font-semibold text-slate-900">{fmtVal(values.ytd, prefix, suffix)}</span></span>
        <span>Prior <span className="font-semibold text-slate-900">{fmtVal(values.priorYtd, prefix, suffix)}</span></span>
      </div>
    </div>
  )
}

// ── section lane label (E-40) — plain accent bar + uppercase label ───────────
export function LaneLabel({ label, accentClass, accentStyle }: { label: string; accentClass?: string; accentStyle?: React.CSSProperties }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      <span className={`h-4 w-1.5 shrink-0 rounded-full ${accentClass ?? ''}`} style={accentStyle} aria-hidden />
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">{label}</span>
    </div>
  )
}

// ── shared header chrome — ST tile + eyebrow + church name + campus pill (E-1/E-2) ──
export function DashHeader({
  eyebrow, churchName, campusName, todayLabel, scope,
}: {
  eyebrow: string
  churchName: string
  campusName: string | null
  todayLabel: React.ReactNode  // string (D2) or an interactive date chip (D1, E-4)
  scope?: React.ReactNode      // E-3 scope toggle (D1 only)
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl font-num text-sm font-bold text-white shadow-sm" style={{ background: '#4F6EF7' }}>ST</span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>{eyebrow}</div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">{churchName}</h1>
              {campusName && (
                <span title="Campus is selected on the Locations page" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-600">
                  <Ico.pin className="h-3.5 w-3.5 text-[#4F6EF7]" />{campusName}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scope}
          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-num text-[11px] font-medium text-slate-500">{todayLabel}</span>
        </div>
      </div>
    </header>
  )
}

// ── empty state (E-81) — calm no-data card, SVG bar-chart icon (DS-14) ────────
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(79,110,247,.08)' }}>
        <Ico.barChart className="h-7 w-7 text-[#4F6EF7]" />
      </div>
      <p className="mb-1 font-semibold text-slate-900">No data yet</p>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}

// re-export the Entries primitives the pages also need, so they import one place
export { Ico, fmt, accentForRole, roleLabel }
