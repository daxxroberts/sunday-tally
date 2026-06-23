'use client'

/**
 * Real widget renderers for the in-chat Dashboard surface (Track D).
 *
 * Promoted from src/app/mockup/widgets/ui.tsx — same Tremor-styled Recharts
 * charts, pivot table, metric card, and the flip-to-explain back panel — but
 * wired to the REPLAY contract (GET /api/dashboards/[id]) instead of the mockup's
 * hand-built PreviewWidget. The replay endpoint returns, per widget:
 *
 *   { id, title, kind, viz_config, layout, rows, resolved, explainerFacts, error }
 *
 * so this module reads `explainerFacts` (the templated four-line SpecExplainer)
 * for the flip panel, derives the Live/Fixed badge from `explainerFacts.refresh`,
 * and renders `prior`/`delta` when a compare:'prior_year' widget supplies them.
 *
 * DESIGN_SYSTEM: brand #4F6EF7, Fira numerals (.font-num / tabular-nums), NO RED
 * — errors + "remove" + the Fixed badge use amber (DS-2). Icons are inline SVG
 * (DS-14), never emoji/unicode glyphs.
 */
import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { AreaChart as StyledAreaChart } from '@/components/charts/AreaChart'
import { BarChart as StyledBarChart } from '@/components/charts/BarChart'
import type { SpecExplainer, VizConfig } from '@/lib/widgets/spec'

// ─── The replay widget contract (mirrors ReplayWidget in the [id] route) ───────

export type WidgetKind = VizConfig['kind']

export interface ReplayWidget {
  id: string
  title: string
  kind: WidgetKind
  viz_config: VizConfig | Record<string, unknown> | null
  layout: unknown
  rows: Record<string, unknown>[]
  resolved: { start: string; end: string } | null
  explainerFacts: SpecExplainer | null
  error?: string | null
  rowsCapped?: number   // original row count when rows were trimmed server-side
  agg?: string          // measure aggregation (sum | avg | weekly_avg) — drives headline math
}

const BRAND = '#4F6EF7'
const VIOLET = '#8b5cf6' // violet-500 — the prior-year (last year) overlay, matches StyledAreaChart
// Ministry/category accents (DS-1) for pivot columns; falls back to slate.
const PIVOT_COLORS: Record<string, string> = {
  EXPERIENCE: '#4F6EF7',
  LIFEKIDS: '#8B5CF6',
  MAIN: '#4F6EF7',
  KIDS: '#8B5CF6',
  YOUTH: '#06B6D4',
}

// ─── formatters ───────────────────────────────────────────────────────────────

function fmtNum(n: unknown): string {
  if (n === null || n === undefined) return '—'
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return x.toLocaleString(undefined, { maximumFractionDigits: x % 1 === 0 ? 0 : 1 })
}

function prettyCol(c: string): string {
  return c
    .split(/[_\s]+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

function fmtBucket(b: unknown): string {
  const s = String(b ?? '')
  if (/^\d{4}-\d{2}$/.test(s)) {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const [y, m] = s.split('-')
    return `${names[Number(m) - 1]} '${y.slice(2)}`
  }
  return s
}

// ─── derived view-state from the replay shape ─────────────────────────────────

/** Live (rolling) unless the explainer says the window is Fixed / Pinned (DS amber badge). */
function isRolling(facts: SpecExplainer | null): boolean {
  const r = facts?.refresh ?? ''
  return !/^(fixed|pinned)/i.test(r.trim())
}

/** Derive prefix (currency) and suffix (%) for a widget's unit of measure. */
function metricFormats(w: ReplayWidget): { prefix: string; suffix: string } {
  const summing = w.explainerFacts?.summing ?? ''
  if (/giving/i.test(w.title) || /^giving\s*[=:]/i.test(summing)) {
    return { prefix: '$', suffix: '' }
  }
  const viz = (w.viz_config ?? {}) as { yKeys?: unknown }
  const yKeys = Array.isArray(viz.yKeys) ? (viz.yKeys as string[]) : []
  if (yKeys.includes('ratio') || /%|percent|ratio|to attendance/i.test(w.title)) {
    return { prefix: '', suffix: '%' }
  }
  return { prefix: '', suffix: '' }
}

/** A row carries a prior-year value (compare:'prior_year' merge added `prior`). */
function hasPrior(rows: Record<string, unknown>[]): boolean {
  return rows.some((r) => r.prior !== undefined && r.prior !== null)
}

// ─── WidgetCard — the card shell (header + body + flip + edit/remove) ──────────

export function WidgetCard({
  w,
  onEdit,
  onRemove,
}: {
  w: ReplayWidget
  onEdit?: () => void
  onRemove?: () => void
}) {
  const [flipped, setFlipped] = useState(false)
  return (
    <div className="group/card flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-3">
        <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: BRAND }} />
        <h3 className="min-w-0 flex-1 truncate pl-1 text-sm font-bold text-slate-900">{w.title}</h3>
        {/* "Live" pill removed (unclear to users); keep only the "Fixed" warning
            for pinned widgets that silently won't update. */}
        {!isRolling(w.explainerFacts) && <WindowBadge rolling={false} />}
        {w.error && <DriftBadge error={w.error} />}
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Show chart' : 'Explain this widget'}
          title={flipped ? 'Show chart' : 'Explain this widget'}
          className="no-drag grid h-7 w-7 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#4F6EF7]"
        >
          {flipped ? <IconClose /> : <IconInfo />}
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit with AI"
            title="Edit with AI"
            className="no-drag grid h-7 w-7 place-items-center rounded-full text-slate-400 opacity-0 transition-colors hover:bg-slate-100 hover:text-[#4F6EF7] focus-visible:opacity-100 group-hover/card:opacity-100"
          >
            <IconEdit />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove widget"
            title="Remove from dashboard"
            className="no-drag grid h-7 w-7 place-items-center rounded-full text-slate-400 opacity-0 transition-colors hover:bg-amber-50 hover:text-amber-600 focus-visible:opacity-100 group-hover/card:opacity-100"
          >
            <IconTrash />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {flipped ? (
          <ExplainPanel w={w} />
        ) : w.error ? (
          <ErrorState message={w.error} />
        ) : (
          <WidgetBody w={w} />
        )}
      </div>
    </div>
  )
}

// ─── WidgetBody — picks the renderer for the kind ─────────────────────────────

function WidgetBody({ w }: { w: ReplayWidget }) {
  if (w.rows.length === 0) return <Empty />

  const { prefix, suffix } = metricFormats(w)

  if (w.kind === 'metric_card') {
    const first = (w.rows[0] ?? {}) as Record<string, unknown>
    const value = first.value
    const prior = first.prior
    const delta = first.delta
    return (
      <div className="flex h-full flex-col items-start justify-center">
        <div className="flex items-baseline gap-2">
          <div className="font-num text-4xl font-extrabold tracking-tight text-slate-900">
            {prefix && <span className="mr-0.5 text-2xl text-slate-500">{prefix}</span>}
            {fmtNum(value)}
            {suffix && <span className="ml-1 text-2xl text-slate-400">{suffix}</span>}
          </div>
          {delta !== undefined && delta !== null && <DeltaBadge delta={Number(delta)} />}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {prior !== undefined && prior !== null ? (
            <span className="font-num">
              vs {prefix}
              {fmtNum(prior)}
              {suffix} last year
            </span>
          ) : (
            w.explainerFacts?.currentlyShowing ?? ''
          )}
        </div>
      </div>
    )
  }

  if (w.kind === 'pivot' || w.kind === 'grid') return (
    <>
      <PivotTable rows={w.rows} prefix={prefix} />
      {w.rowsCapped && <CapNotice total={w.rowsCapped} />}
    </>
  )

  // line / area / bar — fill the card height (no dead space). A compare widget
  // overlays a prior-year series (this year = blue, last year = violet) and gets
  // the Tremor-style headline legend (per-series window totals + delta badge).
  const withPrior = hasPrior(w.rows)
  const data = w.rows.map((r) => ({
    bucket: String(r.bucket ?? ''),
    value: r.value === null || r.value === undefined ? null : Number(r.value),
    ...(withPrior ? { prior: r.prior === null || r.prior === undefined ? null : Number(r.prior) } : {}),
  }))

  const compare = withPrior
    ? (() => {
        // Headline math must match the measure: SUM the buckets for a sum metric
        // (e.g. total giving / total attendance), but AVERAGE them for an average
        // metric (weekly_avg / avg) — otherwise a "weekly avg by month" widget would
        // sum the monthly averages into a meaningless number.
        const isSum = w.agg === 'sum'
        const rollup = (pick: (r: (typeof data)[number]) => number | null | undefined) => {
          const vals = data
            .map(pick)
            .filter((v): v is number => v !== null && v !== undefined)
          if (vals.length === 0) return 0
          const total = vals.reduce((s, x) => s + x, 0)
          return isSum ? total : total / vals.length
        }
        const thisTotal = rollup((r) => r.value)
        const priorTotal = rollup((r) => (r as { prior?: number | null }).prior)
        const delta = priorTotal
          ? Math.round(((thisTotal - priorTotal) / priorTotal) * 1000) / 10
          : NaN
        return { thisTotal, priorTotal, delta }
      })()
    : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {compare && (
        <CompareSummary
          thisTotal={compare.thisTotal}
          priorTotal={compare.priorTotal}
          delta={compare.delta}
          prefix={prefix}
          suffix={suffix}
        />
      )}
      <div className="min-h-0 flex-1">
        <TremorChart data={data} kind={w.kind} id={w.id} withPrior={withPrior} seriesLabel={w.title} prefix={prefix} suffix={suffix} />
      </div>
      {w.rowsCapped && <CapNotice total={w.rowsCapped} />}
    </div>
  )
}

// ─── DeltaBadge — % change vs prior year (sage up / amber down, never red) ─────

function DeltaBadge({ delta }: { delta: number }) {
  if (!Number.isFinite(delta)) return null
  const up = delta >= 0
  return (
    <span
      className={`font-num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(delta)}% vs the same window last year`}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {Math.abs(delta)}%
    </span>
  )
}

// ─── CompareSummary — the "This year / Last year" headline legend ─────────────
// Mirrors Tremor's area-chart-06 block: a colored-dot legend where each series
// shows its window total beneath the label, plus the prior-year delta badge.
// Only rendered for compare:'prior_year' chart widgets.

function CompareSummary({
  thisTotal,
  priorTotal,
  delta,
  prefix,
  suffix,
}: {
  thisTotal: number
  priorTotal: number
  delta: number
  prefix: string
  suffix: string
}) {
  const fmt = (n: number) => `${prefix}${fmtNum(n)}${suffix}`
  return (
    <div className="mb-2 flex items-end gap-6">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="h-[3px] w-3.5 shrink-0 rounded-full bg-blue-500" aria-hidden />
          <span className="text-[13px] text-slate-500">This year</span>
        </div>
        <p className="font-num text-base font-semibold tabular-nums text-slate-900">{fmt(thisTotal)}</p>
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="h-[3px] w-3.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
          <span className="text-[13px] text-slate-500">Last year</span>
        </div>
        <p className="font-num text-base font-semibold tabular-nums text-slate-900">{fmt(priorTotal)}</p>
      </div>
      {Number.isFinite(delta) && (
        <div className="pb-0.5">
          <DeltaBadge delta={delta} />
        </div>
      )}
    </div>
  )
}

// ─── TremorChart — Recharts line/area/bar in the Tremor look ──────────────────

const TIP = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 4px 14px -4px rgba(0,0,0,0.15)',
} as const

type ChartDatum = { bucket: string; value: number | null; prior?: number | null }

function TremorChart({
  data,
  kind,
  id,
  withPrior,
  seriesLabel,
  prefix = '',
  suffix = '',
}: {
  data: ChartDatum[]
  kind: 'line' | 'area' | 'bar'
  id: string
  withPrior: boolean
  seriesLabel: string
  prefix?: string
  suffix?: string
}) {
  const tickFmt = (n: number) => {
    const abs = Math.abs(n)
    const formatted = abs >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n)
    return `${prefix}${formatted}${suffix}`
  }
  const ax = { tick: { fontSize: 11, fill: '#94a3b8' }, tickLine: false, axisLine: false } as const
  const margin = { top: 6, right: 8, left: -14, bottom: 0 }
  // Friendly series names for the tooltip/legend instead of raw spec keys
  // ("value"/"prior"): compare → This year / Last year, single → the widget title.
  const categoryLabels: Record<string, string> = withPrior
    ? { value: 'This year', prior: 'Last year' }
    : { value: seriesLabel }
  const fmtVal = (v: unknown, name: unknown): [string, string] => [`${prefix}${fmtNum(v)}${suffix}`, categoryLabels[String(name)] ?? String(name)]
  // Adaptive x-axis density: aim for ~6 labels so the axis isn't bare (was showing
  // only first + last) but never crowded on a dense (weekly) series.
  const xInterval = Math.max(0, Math.ceil(data.length / 6) - 1)
  return (
    <ResponsiveContainer width="100%" height="100%">
      {kind === 'bar' ? (
        <StyledBarChart
          data={data as Record<string, unknown>[]}
          index="bucket"
          categories={withPrior ? ['prior', 'value'] : ['value']}
          colors={withPrior ? ['violet', 'blue'] : ['blue']}
          valueFormatter={(v) => `${prefix}${fmtNum(v)}${suffix}`}
          yAxisFormatter={tickFmt}
          xAxisFormatter={(v) => fmtBucket(v)}
          labelFormatter={(l) => fmtBucket(l)}
          categoryLabels={categoryLabels}
          xAxisInterval={xInterval}
          showYAxis
          yAxisWidth={42}
          showLegend={false}
          maxBarSize={26}
          className="h-full w-full"
        />
      ) : kind === 'area' ? (
        <StyledAreaChart
          data={data as Record<string, unknown>[]}
          index="bucket"
          categories={withPrior ? ['prior', 'value'] : ['value']}
          colors={withPrior ? ['violet', 'blue'] : ['blue']}
          valueFormatter={(v) => `${prefix}${fmtNum(v)}${suffix}`}
          yAxisFormatter={tickFmt}
          xAxisFormatter={(v) => fmtBucket(v)}
          labelFormatter={(l) => fmtBucket(l)}
          categoryLabels={categoryLabels}
          xAxisInterval={xInterval}
          showYAxis
          yAxisWidth={42}
          showLegend={false}
          fill={withPrior ? 'solid' : 'gradient'}
          connectNulls
          className="h-full w-full"
        />
      ) : (
        <LineChart data={data} margin={margin}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={(v) => fmtBucket(v)} {...ax} minTickGap={16} />
          <YAxis tickFormatter={tickFmt} width={34} {...ax} />
          <Tooltip cursor={{ stroke: '#cbd5e1' }} contentStyle={TIP} labelFormatter={(l) => fmtBucket(l)} formatter={fmtVal} />
          {withPrior && (
            <Line type="monotone" dataKey="prior" stroke={VIOLET} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />
          )}
          <Line type="monotone" dataKey="value" stroke={BRAND} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}

// ─── PivotTable — a flat grid / two-dimension pivot ───────────────────────────

function PivotTable({ rows, prefix = '' }: { rows: Record<string, unknown>[]; prefix?: string }) {
  // First column is the row axis (bucket for time, else the categorical field).
  const firstKey = Object.keys(rows[0] ?? {})[0] ?? 'bucket'
  const rowAxisIsTime = firstKey === 'bucket'
  const cols = Object.keys(rows[0] ?? {}).filter((k) => k !== firstKey)
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg ring-1 ring-slate-100">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="text-[11px] uppercase tracking-wide text-slate-400">
            <th className="bg-white px-3 py-2 text-left font-semibold">{rowAxisIsTime ? 'Period' : prettyCol(firstKey)}</th>
            {cols.map((c) => (
              <th key={c} className="bg-white px-3 py-2 text-right font-semibold" style={{ color: PIVOT_COLORS[c] ?? '#475569' }}>
                {prettyCol(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`${i % 2 ? 'bg-slate-50/60' : 'bg-white'} transition-colors hover:bg-[#4F6EF7]/5`}>
              <td className="px-3 py-1.5 font-medium text-slate-600">
                {rowAxisIsTime ? fmtBucket(r[firstKey]) : prettyCol(String(r[firstKey] ?? '—'))}
              </td>
              {cols.map((c) => (
                <td key={c} className="font-num px-3 py-1.5 text-right tabular-nums text-slate-900">
                  {prefix}{fmtNum(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── ExplainPanel — the flip-to-explain back of the card ──────────────────────

function ExplainPanel({ w }: { w: ReplayWidget }) {
  const f = w.explainerFacts
  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-auto text-sm">
      <p className="text-slate-700">
        A live look at <span className="font-semibold text-slate-900">{w.title.toLowerCase()}</span> for your church,
        built once and replayed for free every time this page loads.
      </p>
      <dl className="space-y-2">
        <Fact label="What's counted" value={f?.summing} />
        <Fact label="How it refreshes" value={f?.refresh} />
        <Fact label="Showing now" value={f?.currentlyShowing} />
        <Fact label="Included" value={f?.included} />
      </dl>
    </div>
  )
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  )
}

// ─── states ───────────────────────────────────────────────────────────────────

function DriftBadge({ error }: { error: string }) {
  const tip =
    error === 'widget_not_found'
      ? 'Data source removed — remove this widget to clean up'
      : 'This widget has a problem — flip for details'
  return (
    <span
      title={tip}
      className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
    >
      !
    </span>
  )
}

function ErrorState({ message }: { message: string }) {
  const friendly =
    message === 'widget_not_found'
      ? "This widget's data source was removed. Use the ✕ button to clean it up."
      : `This widget can't load: ${message}`
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-50 font-bold text-amber-600">!</span>
      <p className="text-xs text-amber-700">{friendly}</p>
    </div>
  )
}

function Empty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-slate-400">
      <span className="text-sm">No data in this window yet.</span>
    </div>
  )
}

function CapNotice({ total }: { total: number }) {
  return (
    <p className="mt-1 text-center text-[10px] text-slate-400">
      Showing first 2,000 of {total.toLocaleString()} rows
    </p>
  )
}

// ─── WindowBadge — Live (rolling) vs Fixed (pinned), amber for fixed ──────────

export function WindowBadge({ rolling }: { rolling?: boolean }) {
  if (rolling === false) {
    return (
      <span
        title="Pinned to fixed dates — this widget does NOT update as time passes"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Fixed
      </span>
    )
  }
  return (
    <span
      title="Rolling window — recalculates against today on every load"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
    </span>
  )
}

// ─── icons (inline SVG only — DS-14) ──────────────────────────────────────────

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  )
}
