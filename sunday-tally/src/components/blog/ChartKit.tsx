'use client'

/**
 * Blog chart kit — the SAME visual language as the in-app dashboard
 * (src/components/widgets/ui.tsx): white rounded-2xl cards, the #4F6EF7 accent
 * bar, Fira tabular numerals (.font-num), emerald-up / amber-down delta badges
 * (NEVER red), and the real Tremor-style AreaChart.
 *
 * MDX posts reference charts by a string id (<StatGroup id="..."/>,
 * <TrendChart id="..."/>) and the data is resolved from chartData.ts — string
 * attrs are the only props MDX reliably passes to client components here.
 */
import { AreaChart } from '@/components/charts/AreaChart'
import { colorHex } from '@/components/charts/chartUtils'
import { BLOG_STATS, BLOG_TRENDS, type StatCardData } from './chartData'

const BRAND = '#4F6EF7'

// ── delta badge (mirrors DeltaBadge in widgets/ui.tsx) ────────────────────────

function DeltaBadge({ delta }: { delta: number }) {
  if (!Number.isFinite(delta)) return null
  const up = delta >= 0
  const abs = Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 1 })
  return (
    <span
      className={`font-num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
      title={`${up ? 'Up' : 'Down'} ${abs}%`}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {abs}%
    </span>
  )
}

// ── StatCard — the dashboard's metric_card, for a single headline number ──────

function StatCard({ label, value, delta, sub, prefix = '', suffix = '' }: StatCardData) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: BRAND }} />
        <span className="text-sm font-bold text-slate-900">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="font-num text-4xl font-extrabold leading-none tracking-tight text-slate-900">
          {prefix && <span className="mr-0.5 text-2xl text-slate-500">{prefix}</span>}
          {typeof value === 'number' ? value.toLocaleString() : value}
          {suffix && <span className="ml-1 text-2xl text-slate-400">{suffix}</span>}
        </div>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      {sub && <div className="mt-1.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

/** A row of headline stat cards, resolved from the registry by id. */
export function StatGroup({ id }: { id: string }) {
  const cards = BLOG_STATS[id]
  if (!cards?.length) return null
  return (
    <div className="my-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c, i) => (
        <StatCard key={i} {...c} />
      ))}
    </div>
  )
}

// ── TrendChart — the dashboard's chart widget (card shell + AreaChart) ─────────

export function TrendChart({ id }: { id: string }) {
  const t = BLOG_TRENDS[id]
  if (!t) return null
  const prefix = t.prefix ?? ''
  const suffix = t.suffix ?? ''
  const fmt = (v: number) => `${prefix}${Number(v).toLocaleString()}${suffix}`
  const tick = (v: number) => {
    const abs = Math.abs(v)
    const s = abs >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v)
    return `${prefix}${s}${suffix}`
  }
  const colors = t.colors ?? ['blue']
  return (
    <div className="my-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {t.title && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-4 w-1.5 rounded-full" style={{ backgroundColor: BRAND }} />
          <span className="text-sm font-bold text-slate-900">{t.title}</span>
        </div>
      )}
      {/* Custom legend (the dashboard hides the built-in one to avoid overflow). */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {t.categories.map((c, i) => (
          <span key={c} className="flex items-center gap-1.5 text-[13px] text-slate-500">
            <span
              className="h-[3px] w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorHex(colors[i % colors.length]) }}
            />
            {c}
          </span>
        ))}
      </div>
      <div style={{ height: 280 }} className="w-full">
        <AreaChart
          data={t.data}
          index={t.index ?? 'month'}
          categories={t.categories}
          colors={colors}
          valueFormatter={fmt}
          yAxisFormatter={tick}
          showYAxis
          yAxisWidth={46}
          showLegend={false}
          fill={t.fill ?? 'gradient'}
          connectNulls
          className="h-full w-full"
        />
      </div>
      {t.caption && (
        <div className="mt-3 text-center text-xs text-slate-500">{t.caption}</div>
      )}
    </div>
  )
}
