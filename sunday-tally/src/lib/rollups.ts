// ─────────────────────────────────────────────────────────────────────────
// Roll-up compute engine (Phase B).
//
// A roll-up metric (metrics.mode='rollup') has no entries of its own. Its value
// is OP(rollup_op) over the entries of the ENTRY metrics whose parent_metric_id
// chain reaches it (multi-level), computed per occurrence / per period, then
// rolled to weekly maps for the dashboard's 4-window math.
//
// Computed ON-READ in TypeScript (no SQL view, no trigger) — reuses weekOf from
// dashboard.ts. Pure data: never writes. Consumers:
//   • dashboard.ts  → feeds fourWinFromWeekly with `weekly`
//   • History grid  → reads `perInstance` / `perPeriod` for computed cells
//   • entry screen  → reads `perInstance` / `perPeriod` for read-only totals
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/client'
import { weekOf } from '@/lib/dashboard'

export type RollupOp = 'sum' | 'avg' | 'max'

interface MetricRow {
  id: string
  ministry_tag_id: string | null
  reporting_tag_id: string | null
  mode: 'entry' | 'rollup'
  rollup_op: RollupOp | null
  parent_metric_id: string | null
}

interface EntryRow {
  metric_id: string
  value: number | null
  service_instance_id: string | null
  period_anchor: string | null
  service_instances?:
    | { service_date: string; status: string }
    | { service_date: string; status: string }[]
    | null
}

export interface RollupValues {
  op: RollupOp
  /** week (Sunday ISO date) → rolled value, for fourWinFromWeekly */
  weekly: Map<string, number>
  /** service_instance_id → rolled value (instance-scoped cells) */
  perInstance: Map<string, number>
  /** period_anchor (Sunday) → rolled value (period-scoped cells) */
  perPeriod: Map<string, number>
  /** distinct descendant ministry nodes that contributed a value in range ("N groups") */
  groupCount: number
  /** the entry-metric ids that feed this roll-up (for History computedFrom / drill) */
  descendantEntryMetricIds: string[]
}

export interface RollupComputed {
  byRollupId: Map<string, RollupValues>
}

function firstRelated<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

/**
 * Compute every roll-up metric's values for a church over [fromDate, toDate]
 * (inclusive, ISO yyyy-mm-dd). Returns an empty map when no roll-ups exist.
 */
export async function computeRollups(
  supabase: ReturnType<typeof createClient>,
  churchId: string,
  fromDate: string,
  toDate: string,
): Promise<RollupComputed> {
  // 1. All active metrics (incl. roll-ups) — definitions only.
  const { data: metricsData } = await supabase
    .from('metrics')
    .select('id, ministry_tag_id, reporting_tag_id, mode, rollup_op, parent_metric_id')
    .eq('church_id', churchId)
    .eq('is_active', true)
  const metrics = (metricsData ?? []) as MetricRow[]
  const rollups = metrics.filter(m => m.mode === 'rollup')
  if (rollups.length === 0) return { byRollupId: new Map() }

  const metricById = new Map(metrics.map(m => [m.id, m]))
  const childrenOf = new Map<string, string[]>()
  for (const m of metrics) {
    if (m.parent_metric_id) {
      const a = childrenOf.get(m.parent_metric_id) ?? []
      a.push(m.id); childrenOf.set(m.parent_metric_id, a)
    }
  }

  // Descendant ENTRY metric ids for a roll-up (multi-level, cycle-guarded).
  function descendants(rollupId: string): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    const stack = [...(childrenOf.get(rollupId) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const m = metricById.get(id)
      if (!m) continue
      if (m.mode === 'entry') out.push(id)
      for (const c of childrenOf.get(id) ?? []) stack.push(c)
    }
    return out
  }

  const descById = new Map<string, Set<string>>()
  // sumIds = the entry descendants PLUS the roll-up's OWN id. A template that used
  // to be a ministry_only count keeps its legacy ministry-level entries on itself,
  // so its total = own legacy entries + its subgroups' entries (Builder-approved
  // free move). No double-count: the entry screen only offers one level per count,
  // so no occurrence ever has both a ministry and a subgroup number. A freshly-
  // created template has no own entries, so this adds nothing there.
  const sumById = new Map<string, Set<string>>()
  const allEntryIds = new Set<string>()
  for (const r of rollups) {
    const d = descendants(r.id)
    descById.set(r.id, new Set(d))
    const sum = new Set([...d, r.id])
    sumById.set(r.id, sum)
    for (const id of sum) allEntryIds.add(id)
  }

  const out: RollupComputed = { byRollupId: new Map() }
  if (allEntryIds.size === 0) {
    for (const r of rollups) {
      out.byRollupId.set(r.id, {
        op: r.rollup_op ?? 'sum', weekly: new Map(), perInstance: new Map(),
        perPeriod: new Map(), groupCount: 0, descendantEntryMetricIds: [],
      })
    }
    return out
  }

  // 2. metric_entries for the descendant entry metrics (paginated past 1k cap).
  const ids = Array.from(allEntryIds)
  const entries: EntryRow[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('metric_entries')
      .select('metric_id, value, service_instance_id, period_anchor, service_instances ( service_date, status )')
      .eq('church_id', churchId)
      .eq('is_not_applicable', false)
      .not('value', 'is', null)
      .in('metric_id', ids)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('[rollups] metric_entries page failed:', error); break }
    const rows = (data ?? []) as EntryRow[]
    entries.push(...rows)
    if (rows.length < PAGE) break
  }

  const applyOp = (op: RollupOp, vals: number[]): number =>
    vals.length === 0 ? 0
    : op === 'max' ? Math.max(...vals)
    : op === 'avg' ? vals.reduce((s, x) => s + x, 0) / vals.length
    : vals.reduce((s, x) => s + x, 0)   // sum (default)

  // 3. Per roll-up: group descendant entries by occurrence/period, apply OP,
  //    then build the weekly map (sum of rolled values per week).
  for (const r of rollups) {
    const op = r.rollup_op ?? 'sum'
    const desc = descById.get(r.id) ?? new Set<string>()
    const sum = sumById.get(r.id) ?? new Set<string>([r.id])

    // Keep the roll-up's OWN legacy entries and its subgroup (descendant) entries
    // in SEPARATE buckets per occurrence. Subgroup entries SUPERSEDE the own
    // legacy entry for the same occurrence — we never sum both. This is the guard
    // behind sumById: a "flip week" (a ministry_only count converted to a template
    // mid-history) can legitimately have BOTH a ministry-level number and fresh
    // subgroup numbers on the same still-open instance; summing them double-counts
    // (e.g. 50 + 20 + 30 = 100 instead of 50). Prefer the subgroups when present.
    const perInstanceOwn = new Map<string, number[]>()
    const perInstanceDesc = new Map<string, number[]>()
    const perPeriodOwn = new Map<string, number[]>()
    const perPeriodDesc = new Map<string, number[]>()
    const instanceDate = new Map<string, string>()
    const contributingNodes = new Set<string>()

    for (const e of entries) {
      if (!sum.has(e.metric_id) || e.value === null) continue
      const val = Number(e.value)
      const isDesc = desc.has(e.metric_id)
      const node = metricById.get(e.metric_id)?.ministry_tag_id ?? null
      if (e.service_instance_id) {
        const si = firstRelated(e.service_instances)
        if (!si || si.status !== 'active') continue
        const d = si.service_date
        if (d < fromDate || d > toDate) continue
        instanceDate.set(e.service_instance_id, d)
        const bucket = isDesc ? perInstanceDesc : perInstanceOwn
        const arr = bucket.get(e.service_instance_id) ?? []
        arr.push(val); bucket.set(e.service_instance_id, arr)
      } else if (e.period_anchor) {
        if (e.period_anchor < fromDate || e.period_anchor > toDate) continue
        const bucket = isDesc ? perPeriodDesc : perPeriodOwn
        const arr = bucket.get(e.period_anchor) ?? []
        arr.push(val); bucket.set(e.period_anchor, arr)
      } else continue
      // Only subgroup (descendant) entries count toward "how many subgroups
      // contribute" — the roll-up's own legacy entries don't add a subgroup.
      if (node && isDesc) contributingNodes.add(node)
    }

    // Merge per occurrence: descendants win when they exist, else the own legacy value.
    const pickVals = (own: Map<string, number[]>, dsc: Map<string, number[]>) => {
      const merged = new Map<string, number[]>()
      for (const k of new Set([...own.keys(), ...dsc.keys()])) {
        const d = dsc.get(k)
        merged.set(k, d && d.length ? d : (own.get(k) ?? []))
      }
      return merged
    }
    const perInstanceVals = pickVals(perInstanceOwn, perInstanceDesc)
    const perPeriodVals = pickVals(perPeriodOwn, perPeriodDesc)

    const perInstance = new Map<string, number>()
    for (const [k, vals] of perInstanceVals) perInstance.set(k, applyOp(op, vals))
    const perPeriod = new Map<string, number>()
    for (const [k, vals] of perPeriodVals) perPeriod.set(k, applyOp(op, vals))

    const weekly = new Map<string, number>()
    for (const [occId, v] of perInstance) {
      const wk = weekOf(instanceDate.get(occId)!)
      weekly.set(wk, (weekly.get(wk) ?? 0) + v)
    }
    for (const [anchor, v] of perPeriod) {
      const wk = weekOf(anchor)
      weekly.set(wk, (weekly.get(wk) ?? 0) + v)
    }

    out.byRollupId.set(r.id, {
      op, weekly, perInstance, perPeriod,
      groupCount: contributingNodes.size,
      descendantEntryMetricIds: Array.from(desc),
    })
  }

  return out
}
