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
import type { KeyMetricCatalogEntry, KeyMetricGroup } from '@/lib/dashboardKeyMetrics'
import type { MetricSelector, DrillWindow } from '@/lib/dashboardDrilldown'

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
  label, sub, values, prefix, suffix, indent, hideComparisons, selector, onDrill, accentColor,
}: {
  label: string
  sub?: string
  values: FourWin
  prefix?: string
  suffix?: string
  indent?: boolean
  hideComparisons?: boolean
  // #69 — when a selector + handler are supplied, each value cell becomes a
  // button that opens the drill-down for that metric × window. Cells rendering a
  // dash (hideComparisons) are not clickable.
  selector?: MetricSelector | null
  onDrill?: (selector: MetricSelector, window: DrillWindow) => void
  // Ministry color (matches Setup/History) — renders a small bar before the
  // label so a row reads as "that ministry" at a glance. Omitted → no bar.
  accentColor?: string
}) {
  const dash = <span className="text-slate-300">—</span>
  const drillable = !!(selector && onDrill)

  // Wrap a cell's content as a drill button (when enabled + has data) or plain div.
  const Cell = ({ window, enabled, children }: { window: DrillWindow; enabled: boolean; children: React.ReactNode }) => {
    if (drillable && enabled) {
      return (
        <button
          type="button"
          onClick={() => onDrill!(selector!, window)}
          title="Show the detail behind this number"
          className="w-full cursor-pointer rounded-md px-1 text-right transition-colors duration-150 hover:bg-[#4F6EF7]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
        >{children}</button>
      )
    }
    return <div className="px-1 text-right">{children}</div>
  }

  return (
    <div className={`${GRID} items-start border-b border-slate-50 px-3 py-2 transition-colors duration-200 last:border-b-0 hover:bg-slate-50/60`}>
      <div className={`flex items-center gap-1.5 self-center text-[12px] font-medium leading-tight text-slate-600 ${indent ? 'pl-4' : 'pl-1'}`}>
        {accentColor && <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} aria-hidden />}
        <span>{label}{sub && <span className="ml-1 text-[10px] text-slate-400">{sub}</span>}</span>
      </div>
      <Cell window="w" enabled={values.w !== null}>
        <p className="font-num text-[14px] font-semibold leading-tight text-slate-900">{fmtVal(values.w, prefix, suffix)}</p>
        {!hideComparisons && <div className="mt-0.5"><DeltaBadge delta={values.delta_w_m4} /></div>}
      </Cell>
      <Cell window="m4" enabled={!hideComparisons && values.m4 !== null}>
        <p className="font-num text-[14px] font-semibold leading-tight text-slate-700">{hideComparisons ? dash : fmtVal(values.m4, prefix, suffix)}</p>
      </Cell>
      <Cell window="ytd" enabled={!hideComparisons && values.ytd !== null}>
        <p className="font-num text-[14px] font-semibold leading-tight text-slate-900">{hideComparisons ? dash : fmtVal(values.ytd, prefix, suffix)}</p>
        {!hideComparisons && <div className="mt-0.5"><DeltaBadge delta={values.delta_ytd_prior} /></div>}
      </Cell>
      <Cell window="priorYtd" enabled={!hideComparisons && values.priorYtd !== null}>
        <p className="font-num text-[14px] font-semibold leading-tight text-slate-700">{hideComparisons ? dash : fmtVal(values.priorYtd, prefix, suffix)}</p>
      </Cell>
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
  label, value, prefix, delta, prior, accentColor,
}: {
  label: string
  value: number
  prefix?: string
  delta: number | null
  prior: number
  // Ministry color (matches Setup/History) — thin top strip so the KPI reads as
  // that thing everywhere ("giving is green → green up here too").
  accentColor?: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {accentColor && <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accentColor }} aria-hidden />}
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
// #70: an owner/admin can set an all-time TARGET (pencil, top-right). When set,
// a comparison row shows Curr-Wk vs target — sage when met/above, amber when
// below (NO RED, DS-2). No target → nothing extra renders.
// #73: when drillSelector + onDrill are supplied the footer numbers become
// clickable and open the drill drawer. Non-drillable metrics stay plain.
export function KeyMetricCard({
  label, values, prefix, suffix, metricKey, target, canEdit, onSaveTarget,
  drillSelector, onDrill,
}: {
  label: string
  values: FourWin
  prefix?: string
  suffix?: string
  metricKey?: string
  target?: number | null
  canEdit?: boolean
  onSaveTarget?: (metricKey: string, value: number | null) => void
  drillSelector?: MetricSelector | null
  onDrill?: (selector: MetricSelector, window: DrillWindow) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const hasTarget = typeof target === 'number' && !Number.isNaN(target)

  const openEditor = () => {
    setDraft(hasTarget ? String(target) : '')
    setEditing(true)
  }
  const save = () => {
    if (!metricKey || !onSaveTarget) { setEditing(false); return }
    const trimmed = draft.trim()
    const parsed = trimmed === '' ? null : Number(trimmed)
    onSaveTarget(metricKey, parsed === null || Number.isNaN(parsed) ? null : parsed)
    setEditing(false)
  }
  const clear = () => {
    if (metricKey && onSaveTarget) onSaveTarget(metricKey, null)
    setEditing(false)
  }

  // Curr-Wk vs target comparison (KEY_METRICS_PLAN §9.1 — hero window = Curr Wk).
  const met = hasTarget && values.w !== null && values.w >= (target as number)
  const pctOfTarget = hasTarget && values.w !== null && (target as number) > 0
    ? Math.round((values.w / (target as number)) * 100)
    : null

  // #73 — drill helpers for footer cells.
  const drillable = !!(drillSelector && onDrill)
  const footerCell = (window: DrillWindow, windowValue: number | null, footerLabel: string) => {
    const inner = <span className="font-semibold text-slate-900">{fmtVal(windowValue, prefix, suffix)}</span>
    if (drillable && windowValue !== null) {
      return (
        <button
          type="button"
          onClick={() => onDrill!(drillSelector!, window)}
          title={`Show detail for ${footerLabel}`}
          aria-label={`Show detail for ${footerLabel} — ${label}`}
          className="cursor-pointer rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-[#4F6EF7]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
        >
          {footerLabel} {inner}
        </button>
      )
    }
    return <span>{footerLabel} {inner}</span>
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {canEdit && metricKey && !editing && (
          <button
            onClick={openEditor}
            title={hasTarget ? 'Edit target' : 'Set a target'}
            aria-label={hasTarget ? `Edit target for ${label}` : `Set a target for ${label}`}
            className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-300 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
          >
            <Ico.pencilFill className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        {drillable && values.w !== null ? (
          <button
            type="button"
            onClick={() => onDrill!(drillSelector!, 'w')}
            title="Show detail behind this number"
            aria-label={`Show detail for current week — ${label}`}
            className="cursor-pointer rounded-md font-num text-2xl font-bold leading-none tracking-tight text-slate-900 transition-colors duration-150 hover:bg-[#4F6EF7]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
          >
            {fmtVal(values.w, prefix, suffix)}
          </button>
        ) : (
          <p className="font-num text-2xl font-bold leading-none tracking-tight text-slate-900">{fmtVal(values.w, prefix, suffix)}</p>
        )}
        <DeltaBadge delta={values.delta_w_m4} />
      </div>
      <div className="mt-2 flex items-center justify-between font-num text-[11px] text-slate-400">
        {footerCell('m4', values.m4, '4-wk')}
        {footerCell('ytd', values.ytd, 'YTD')}
        {footerCell('priorYtd', values.priorYtd, 'Prior')}
      </div>

      {/* target editor (inline) */}
      {editing && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Target</label>
          <div className="flex items-center gap-1.5">
            {prefix && <span className="font-num text-[13px] text-slate-400">{prefix}</span>}
            <input
              type="number"
              inputMode="decimal"
              value={draft}
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="—"
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 font-num text-[13px] text-slate-800 outline-none focus:border-[#4F6EF7]"
            />
            {suffix && <span className="font-num text-[13px] text-slate-400">{suffix}</span>}
            <button onClick={save} className="ml-auto cursor-pointer rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style={{ background: '#4F6EF7' }}>Save</button>
            {hasTarget && <button onClick={clear} className="cursor-pointer rounded-lg px-2 py-1 text-[12px] font-medium text-slate-400 hover:text-slate-700">Clear</button>}
          </div>
        </div>
      )}

      {/* target comparison (when set, not editing) */}
      {hasTarget && !editing && (
        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 font-num text-[11px]">
          <span className="text-slate-400">Target <span className="font-semibold text-slate-700">{fmtVal(target as number, prefix, suffix)}</span></span>
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={met ? { background: 'rgba(34,197,94,.12)', color: '#15803D' } : { background: 'rgba(245,158,11,.14)', color: '#B45309' }}
            title={met ? 'At or above target' : 'Below target'}
          >
            {met ? <><Ico.check className="h-2.5 w-2.5" />met</> : pctOfTarget !== null ? `${pctOfTarget}% of target` : 'below'}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Zone E — Key Metrics picker (#70). Owner/admin promotes ANY dashboard metric
//    into the lane and reorders the featured set. Grouped catalog + checkboxes +
//    ↑/↓ reorder (a11y-friendly, no drag dep — KEY_METRICS_PLAN §5/§9.2). ───────
const KM_GROUP_ORDER: KeyMetricGroup[] = ['Totals', 'Per-Ministry', 'Ratios', 'Other']

// Sub-group Per-Ministry catalog entries by their owning ministry, preserving
// first-seen order, so the picker reads "Life Groups → [Attendance, Volunteers]".
function groupByMinistry(entries: KeyMetricCatalogEntry[]): { ministry: string; items: KeyMetricCatalogEntry[] }[] {
  const order: string[] = []
  const map = new Map<string, KeyMetricCatalogEntry[]>()
  for (const e of entries) {
    const m = e.ministryName ?? 'Other'
    if (!map.has(m)) { map.set(m, []); order.push(m) }
    map.get(m)!.push(e)
  }
  return order.map(m => ({ ministry: m, items: map.get(m)! }))
}

export function KeyMetricsPicker({
  catalog, selected, onSave, onClose,
}: {
  catalog: KeyMetricCatalogEntry[]
  selected: string[]                       // committed featured keys
  onSave: (next: string[]) => void         // commit on Save (not per-change)
  onClose: () => void                      // close without committing
}) {
  // Draft model (mirrors the include-in-total panel): edits stay local until
  // Save, so Cancel can discard and the church-wide write happens once.
  const [draft, setDraft] = useState<string[]>(() => selected)
  const draftSet = new Set(draft)
  const labelOf = (k: string) => catalog.find(e => e.key === k)?.label ?? k

  const toggle = (key: string) =>
    setDraft(d => (d.includes(key) ? d.filter(k => k !== key) : [...d, key]))
  const move = (idx: number, dir: -1 | 1) =>
    setDraft(d => {
      const next = [...d]
      const j = idx + dir
      if (j < 0 || j >= next.length) return d
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })

  const dirty = draft.length !== selected.length || draft.some((k, i) => k !== selected[i])

  const grouped = KM_GROUP_ORDER
    .map(g => ({ group: g, entries: catalog.filter(e => e.group === g) }))
    .filter(g => g.entries.length > 0)

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Choose Key Metrics</span>
        <span className="flex items-center gap-1.5">
          <button onClick={onClose} className="cursor-pointer rounded-lg px-3 py-1 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">Cancel</button>
          <button
            onClick={() => { onSave(draft); onClose() }}
            disabled={!dirty}
            title={dirty ? 'Save Key Metrics for the whole church' : 'No changes to save'}
            className="cursor-pointer rounded-lg px-3 py-1 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            style={{ background: '#4F6EF7' }}
          >Save</button>
        </span>
      </div>

      {/* featured order (reorderable) */}
      {draft.length > 0 && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Featured order</p>
          <div className="space-y-1.5">
            {draft.map((key, i) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                <span className="truncate text-[12px] font-semibold text-slate-700">{i + 1}. {labelOf(key)}</span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up" aria-label="Move up" className="flex h-6 w-6 items-center justify-center rounded text-slate-400 enabled:cursor-pointer enabled:hover:bg-slate-100 enabled:hover:text-slate-700 disabled:opacity-30"><Ico.arrowUp className="h-3 w-3" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === draft.length - 1} title="Move down" aria-label="Move down" className="flex h-6 w-6 items-center justify-center rounded text-slate-400 enabled:cursor-pointer enabled:hover:bg-slate-100 enabled:hover:text-slate-700 disabled:opacity-30"><Ico.arrowDown className="h-3 w-3" /></button>
                  <button onClick={() => toggle(key)} title="Remove" aria-label="Remove from Key Metrics" className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-700">✕</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* catalog (grouped checkboxes) */}
      <div className="max-h-80 overflow-y-auto px-4 py-3">
        {grouped.map(({ group, entries }) => (
          <div key={group} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
            {group === 'Per-Ministry' ? (
              <div className="space-y-2">
                {groupByMinistry(entries).map(({ ministry, items }) => (
                  <div key={ministry} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2">
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">{ministry}</p>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                      {items.map(e => (
                        <label key={e.key} className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-700">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#4F6EF7] focus:ring-[#4F6EF7]"
                            checked={draftSet.has(e.key)}
                            onChange={() => toggle(e.key)}
                          />
                          <span className="truncate">{e.subLabel ?? e.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {entries.map(e => (
                  <label key={e.key} className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-700">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-[#4F6EF7] focus:ring-[#4F6EF7]"
                      checked={draftSet.has(e.key)}
                      onChange={() => toggle(e.key)}
                    />
                    <span className="truncate">{e.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── section lane label (E-40) — plain accent bar + uppercase label (+ optional
//    right-edge control, e.g. the Key Metrics picker cog) ───────────────────────
export function LaneLabel({ label, accentClass, accentStyle, trailing }: { label: string; accentClass?: string; accentStyle?: React.CSSProperties; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      <span className={`h-4 w-1.5 shrink-0 rounded-full ${accentClass ?? ''}`} style={accentStyle} aria-hidden />
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">{label}</span>
      {trailing && <span className="ml-auto">{trailing}</span>}
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
