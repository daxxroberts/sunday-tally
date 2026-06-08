// ─────────────────────────────────────────────────────────────────────────
// DASHBOARD DRILL-DOWN — metric series fetch (tasks #69 / #73).
// Plan: DASHBOARD_DRILLDOWN_PLAN.md.
//
// Clicking a dashboard value cell opens a drawer that shows EXACTLY what made up
// that number: a last-4-weeks grid broken into individual sittings, and a YTD
// line chart (current vs prior year) with a weekly grid.
//
// RECONCILIATION GUARANTEE: this module reuses dashboard.ts's own boundary math
// (buildBoundaries / weekOf / shiftDays) and the same per-occurrence views, with
// the same NULL-skip + sum-per-week + average-of-weeks rules. So the 4-week
// average / YTD average it reports equal the FourWin numbers on the cards.
//
// SCOPE (#73 extension):
//   - Giving fallback: when giving_per_week view is empty, fall back to
//     metric_entries GIVING (instance + period), EXACTLY as dashboard.ts does.
//   - volunteers-total: volunteers_per_occurrence view, mirrors volTotalWeekly.
//   - volunteers-ministry: metric_entries VOLUNTEERS filtered to a ministryTagId,
//     mirrors volWeeklyByTag (per-ministry sittings from metric_entries).
//   - stat: metric_entries RESPONSE_STAT for a given metricId,
//     mirrors statByMetric (per-occurrence sittings).
//   - ratio: window-aggregate ratio (num÷den×scale), mirrors ratioFourWin.
//     hasSittings=false; weekly grid shows per-week ratio value.
//
// Six DB Rules honored: status='active' enforced by views; NULL≠0 (null skipped);
// giving summed per week from giving_per_week view (with fallback).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/client'
import { buildBoundaries, weekOf, shiftDays, type Boundaries } from '@/lib/dashboard'

export type DrillWindow = 'w' | 'm4' | 'ytd' | 'priorYtd'

// The per-occurrence attendance view column a selector reads (mirrors
// dashboard.ts attendanceForRole: ADULT_SERVICE→adults, KIDS→kids, YOUTH→youth,
// OTHER→other; grand total→total).
export type AttendanceColumn =
  | 'total_attendance' | 'adults_attendance' | 'kids_attendance'
  | 'youth_attendance' | 'other_attendance'

// Ratio operand identifiers — mirror the weekly maps used by dashboard.ts ratioFourWin.
export type RatioOperand = 'attendance-total' | 'volunteers-total' | 'giving'

export type MetricSource =
  | { kind: 'attendance'; column: AttendanceColumn }
  | { kind: 'giving-weekly' }
  // #73 — new sources
  | { kind: 'volunteers-total' }
  | { kind: 'volunteers-ministry'; ministryTagId: string }
  | { kind: 'stat'; metricId: string }
  | { kind: 'ratio'; numerator: RatioOperand; denominator: RatioOperand; scale: number }

export interface MetricSelector {
  label: string          // e.g. "Experience · Attendance"
  prefix?: string         // '$' for giving
  suffix?: string
  source: MetricSource
}

export interface SittingValue {
  occurrenceId: string
  serviceDate: string     // YYYY-MM-DD
  label: string           // service template code (best-available name)
  value: number
}
export interface WeekDetail {
  weekStart: string       // Sunday, YYYY-MM-DD
  inProgress: boolean     // true for the current (incomplete) week row
  sittings: SittingValue[]
  weekTotal: number | null
}
export interface WeeklyPoint { weekStart: string; value: number | null }

export interface MetricSeries {
  selector: MetricSelector
  hasSittings: boolean    // false for giving-weekly and ratio (no per-occurrence breakdown)
  // 4-week grid (newest first): the 4 completed weeks that make up m4, plus the
  // current in-progress week at the top for context.
  weeks: WeekDetail[]
  fourWeekAvg: number | null   // == card "Last 4-Wk" (avg of the 4 completed weeks)
  // YTD chart + weekly grid
  current: WeeklyPoint[]       // current-year, Jan-1 week → current week (oldest→newest)
  prior: WeeklyPoint[]         // prior-year, Jan-1 week → same-week-last-year
  ytdAvg: number | null        // == card "Curr YTD"
  priorYtdAvg: number | null   // == card "Prior YTD"
}

// ── small helpers (mirror dashboard.ts averaging exactly) ─────────────────────
function avgOfWeeks(weekly: Map<string, number>, from: string, to: string): number | null {
  const vals: number[] = []
  for (const [wk, v] of weekly) if (wk >= from && wk <= to) vals.push(v)
  if (vals.length === 0) return null
  return Math.round(vals.reduce((s, x) => s + x, 0) / vals.length)
}

function enumerateWeeks(fromSunday: string, toSunday: string): string[] {
  const out: string[] = []
  let wk = fromSunday
  // guard against an inverted range (64 = a year of Sundays + headroom)
  for (let i = 0; i < 64 && wk <= toSunday; i++) {
    out.push(wk)
    wk = shiftDays(wk, 7)
  }
  return out
}

const PAGE = 1000
async function fetchPaged<T>(
  buildPage: (offset: number, limit: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await buildPage(offset, PAGE)
    if (error) { console.error('[drilldown] page failed:', error); break }
    const rows = ((data ?? []) as unknown) as T[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

interface AttRow {
  service_instance_id: string
  service_template_id: string | null
  service_date: string
  [col: string]: unknown
}
interface GivingRow { week_start: string; total_giving: number | null }

// #73 — volunteer view row (volunteers_per_occurrence)
interface VolOccRow {
  service_instance_id: string
  service_date: string
  total_volunteers: number | null
}

// #73 — metric_entries row (volunteers-ministry / stat / giving fallback)
interface MetricEntryRow {
  metric_id: string
  value: number | null
  is_not_applicable: boolean
  reporting_tag_code: string | null
  period_anchor: string | null
  service_instance_id: string | null
  service_instances: { service_date: string; status: string } | { service_date: string; status: string }[] | null
}

// #73 — metric definition (to resolve ministry_tag_id on VOLUNTEER entries)
interface MetricDefRow {
  id: string
  ministry_tag_id: string | null
}

function firstRelated<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function entryActiveDate(e: MetricEntryRow): string | null {
  const si = firstRelated(e.service_instances)
  if (!si || si.status !== 'active') return null
  return si.service_date
}

// ── Build a weekly-sum map from metric_entries rows (mirrors dashboard.ts buildWeeklyFrom) ─
function buildWeeklyFromEntries(
  entries: MetricEntryRow[],
  dateOf: (e: MetricEntryRow) => string | null,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) {
    if (e.value === null) continue
    const d = dateOf(e)
    if (d === null) continue
    const wk = weekOf(d)
    m.set(wk, (m.get(wk) ?? 0) + Number(e.value))
  }
  return m
}

// ── Build sittings from metric_entries rows (for volunteers-ministry + stat) ──
function buildSittingsFromEntries(
  entries: MetricEntryRow[],
  codeById: Map<string, string>,
): Map<string, SittingValue[]> {
  const byWeek = new Map<string, SittingValue[]>()
  for (const e of entries) {
    if (e.value === null || !e.service_instance_id) continue
    const d = entryActiveDate(e)
    if (d === null) continue
    const wk = weekOf(d)
    const arr = byWeek.get(wk) ?? []
    arr.push({
      occurrenceId: e.service_instance_id,
      serviceDate: d,
      label: codeById.get(e.service_instance_id) || '—',
      value: Number(e.value),
    })
    byWeek.set(wk, arr)
  }
  return byWeek
}

// ── Ratio helpers: mirror dashboard.ts ratioFourWin exactly (divide window
//    aggregates, NOT average of weekly ratios). hasSittings=false; weekly grid
//    shows the per-week ratio at that week's point.  NaN-safe: null when
//    denominator is null/0 for any window. ──────────────────────────────────────
function ratioWeekly(
  numWeekly: Map<string, number>,
  denWeekly: Map<string, number>,
  scale: number,
): Map<string, number> {
  // Build a weekly ratio map for the chart/grid: for each week present in numerator,
  // compute num/den×scale if denominator is non-null and non-zero.
  const out = new Map<string, number>()
  for (const [wk, nv] of numWeekly) {
    const dv = denWeekly.get(wk)
    if (dv === undefined || dv === 0) continue
    out.set(wk, (nv / dv) * scale)
  }
  return out
}

// avgOfWeeks variant that does NOT round (used inside ratio window computation
// to stay close to dashboard.ts ratioFourWin's behaviour of dividing avg-of-weeks).
function avgOfWeeksRaw(weekly: Map<string, number>, from: string, to: string): number | null {
  const vals: number[] = []
  for (const [wk, v] of weekly) if (wk >= from && wk <= to) vals.push(v)
  if (vals.length === 0) return null
  return vals.reduce((s, x) => s + x, 0) / vals.length
}

// For ratio metrics, compute fourWeekAvg / ytdAvg / priorYtdAvg by dividing
// window aggregates (mirrors ratioFourWin exactly — not average of weekly ratios).
function ratioWindowAvg(
  numWeekly: Map<string, number>,
  denWeekly: Map<string, number>,
  scale: number,
  from: string,
  to: string,
): number | null {
  // FELIX #73 Finding 1 — dashboard.ts ratioFourWin divides the ROUNDED window
  // aggregates (fourWinFromWeekly rounds num & den before dividing), then rounds
  // the result. Mirror that rounding ORDER exactly, or the drawer can disagree
  // with the card by ~1 at boundary cases.
  const nRaw = avgOfWeeksRaw(numWeekly, from, to)
  const dRaw = avgOfWeeksRaw(denWeekly, from, to)
  const n = nRaw === null ? null : Math.round(nRaw)
  const d = dRaw === null ? null : Math.round(dRaw)
  if (n === null || d === null || d === 0) return null
  return Math.round((n / d) * scale)
}

// ── Fetch giving weekly map with fallback (mirrors dashboard.ts givingWeekly) ──
async function fetchGivingWeekly(
  supabase: ReturnType<typeof createClient>,
  churchId: string,
  b: Boundaries,
): Promise<{ weekly: Map<string, number> }> {
  // Primary: church-wide view
  const viewRows = await fetchPaged<GivingRow>((offset, limit) =>
    supabase
      .from('giving_per_week')
      .select('week_start, total_giving')
      .eq('church_id', churchId)
      .gte('week_start', b.lastYearStart)
      .lte('week_start', b.today)
      .order('week_start', { ascending: true })
      .range(offset, offset + limit - 1),
  )

  const fromView = new Map<string, number>()
  for (const r of viewRows) {
    if (r.total_giving === null) continue
    const wk = weekOf(r.week_start)
    fromView.set(wk, (fromView.get(wk) ?? 0) + Number(r.total_giving))
  }

  if (fromView.size > 0) return { weekly: fromView }

  // Fallback: metric_entries GIVING (instance + period), exactly as dashboard.ts
  const SELECT_INST = `metric_id, value, is_not_applicable, reporting_tag_code, period_anchor, service_instance_id, service_instances!inner ( service_date, status )`

  const instanceGiving = await fetchPaged<MetricEntryRow>((offset, limit) =>
    supabase
      .from('metric_entries')
      .select(SELECT_INST)
      .eq('church_id', churchId)
      .eq('is_not_applicable', false)
      .eq('reporting_tag_code', 'GIVING')
      .not('value', 'is', null)
      .not('service_instance_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1),
  )

  const periodGiving = await fetchPaged<MetricEntryRow>((offset, limit) =>
    supabase
      .from('metric_entries')
      .select('metric_id, value, is_not_applicable, reporting_tag_code, period_anchor, service_instance_id, service_instances ( service_date, status )')
      .eq('church_id', churchId)
      .eq('is_not_applicable', false)
      .eq('reporting_tag_code', 'GIVING')
      .not('value', 'is', null)
      .not('period_anchor', 'is', null)
      .gte('period_anchor', b.lastYearStart)
      .lte('period_anchor', b.today)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1),
  )

  const fallback = new Map<string, number>()
  for (const e of instanceGiving) {
    const d = entryActiveDate(e)
    if (d === null || e.value === null) continue
    const wk = weekOf(d)
    fallback.set(wk, (fallback.get(wk) ?? 0) + Number(e.value))
  }
  for (const e of periodGiving) {
    if (!e.period_anchor || e.value === null) continue
    const wk = weekOf(e.period_anchor)
    fallback.set(wk, (fallback.get(wk) ?? 0) + Number(e.value))
  }

  return { weekly: fallback }
}

// ── main fetch ────────────────────────────────────────────────────────────────
export async function fetchMetricSeries(
  churchId: string,
  selector: MetricSelector,
  asOf?: Date,
): Promise<MetricSeries> {
  const supabase = createClient()
  const b: Boundaries = buildBoundaries(asOf ?? new Date())

  // Per-occurrence sitting values + the weekly-summed map, by source.
  let weekly = new Map<string, number>()
  let sittingsByWeek = new Map<string, SittingValue[]>()
  let hasSittings = true

  // Ratio-specific: separate numerator + denominator weekly maps (built lazily).
  let numWeekly: Map<string, number> | null = null
  let denWeekly: Map<string, number> | null = null
  let ratioScale = 1

  const src = selector.source

  if (src.kind === 'attendance') {
    const col = src.column
    const rows = await fetchPaged<AttRow>((offset, limit) =>
      supabase
        .from('attendance_per_occurrence')
        .select(`service_instance_id, service_template_id, service_date, ${col}`)
        .eq('church_id', churchId)
        .gte('service_date', b.lastYearStart)
        .lte('service_date', b.today)
        .order('service_date', { ascending: true })
        .range(offset, offset + limit - 1),
    )

    // Template code labels (best-available name for a sitting).
    const tmplRows = await fetchPaged<{ id: string; service_code: string }>((offset, limit) =>
      supabase
        .from('service_templates')
        .select('id, service_code')
        .eq('church_id', churchId)
        .range(offset, offset + limit - 1),
    )
    const codeById = new Map<string, string>()
    for (const t of tmplRows) codeById.set(t.id, t.service_code)

    for (const r of rows) {
      const raw = r[col]
      if (raw === null || raw === undefined) continue   // NULL ≠ 0
      const value = Number(raw)
      if (Number.isNaN(value)) continue
      const wk = weekOf(r.service_date)
      weekly.set(wk, (weekly.get(wk) ?? 0) + value)
      const arr = sittingsByWeek.get(wk) ?? []
      arr.push({
        occurrenceId: r.service_instance_id,
        serviceDate: r.service_date,
        label: (r.service_template_id && codeById.get(r.service_template_id)) || '—',
        value,
      })
      sittingsByWeek.set(wk, arr)
    }

  } else if (src.kind === 'giving-weekly') {
    // giving-weekly: church-wide weekly view with fallback; no per-occurrence breakdown.
    hasSittings = false
    const { weekly: givingWeekly } = await fetchGivingWeekly(supabase, churchId, b)
    weekly = givingWeekly

  } else if (src.kind === 'volunteers-total') {
    // #73 — total volunteers: volunteers_per_occurrence view, mirrors volTotalWeekly.
    // Per-occurrence sittings with service_code labels via service_instance_id.
    const volRows = await fetchPaged<VolOccRow>((offset, limit) =>
      supabase
        .from('volunteers_per_occurrence')
        .select('service_instance_id, service_date, total_volunteers')
        .eq('church_id', churchId)
        .gte('service_date', b.lastYearStart)
        .lte('service_date', b.today)
        .order('service_date', { ascending: true })
        .range(offset, offset + limit - 1),
    )

    // Template code labels via service_instance_id → service_template_id → service_code.
    // Join via the instances table.
    const instRows = await fetchPaged<{ id: string; service_template_id: string | null }>((offset, limit) =>
      supabase
        .from('service_instances')
        .select('id, service_template_id')
        .eq('church_id', churchId)
        .gte('service_date', b.lastYearStart)
        .lte('service_date', b.today)
        .range(offset, offset + limit - 1),
    )
    const tmplIdByInst = new Map<string, string | null>()
    for (const r of instRows) tmplIdByInst.set(r.id, r.service_template_id)

    const tmplRows = await fetchPaged<{ id: string; service_code: string }>((offset, limit) =>
      supabase
        .from('service_templates')
        .select('id, service_code')
        .eq('church_id', churchId)
        .range(offset, offset + limit - 1),
    )
    const codeByTmpl = new Map<string, string>()
    for (const t of tmplRows) codeByTmpl.set(t.id, t.service_code)

    for (const r of volRows) {
      if (r.total_volunteers === null) continue
      const value = Number(r.total_volunteers)
      const wk = weekOf(r.service_date)
      weekly.set(wk, (weekly.get(wk) ?? 0) + value)
      const arr = sittingsByWeek.get(wk) ?? []
      const tmplId = tmplIdByInst.get(r.service_instance_id)
      arr.push({
        occurrenceId: r.service_instance_id,
        serviceDate: r.service_date,
        label: (tmplId && codeByTmpl.get(tmplId)) || '—',
        value,
      })
      sittingsByWeek.set(wk, arr)
    }

  } else if (src.kind === 'volunteers-ministry') {
    // #73 — per-ministry volunteers: metric_entries VOLUNTEERS filtered to ministryTagId.
    // Mirrors volWeeklyByTag[tagId]. Sittings = per active occurrence.
    const SELECT_ME = `metric_id, value, is_not_applicable, reporting_tag_code, period_anchor, service_instance_id, service_instances!inner ( service_date, status )`

    // Fetch metric ids whose ministry_tag_id matches this ministry.
    const metricRows = await fetchPaged<MetricDefRow>((offset, limit) =>
      supabase
        .from('metrics')
        .select('id, ministry_tag_id')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .neq('mode', 'rollup')
        .eq('ministry_tag_id', src.ministryTagId)
        .range(offset, offset + limit - 1),
    )
    const metricIds = metricRows.map(m => m.id)

    const entries: MetricEntryRow[] = metricIds.length === 0 ? [] :
      await fetchPaged<MetricEntryRow>((offset, limit) =>
        supabase
          .from('metric_entries')
          .select(SELECT_ME)
          .eq('church_id', churchId)
          .eq('is_not_applicable', false)
          .eq('reporting_tag_code', 'VOLUNTEERS')
          .not('value', 'is', null)
          .in('metric_id', metricIds)
          .order('id', { ascending: true })
          .range(offset, offset + limit - 1),
      )

    // Label sittings by service_code via service_instance_id → service_template.
    // Collect distinct instance ids to look up template codes efficiently.
    const instIds = [...new Set(entries.map(e => e.service_instance_id).filter((id): id is string => !!id))]
    const instRows: { id: string; service_template_id: string | null }[] = instIds.length === 0 ? [] :
      await fetchPaged<{ id: string; service_template_id: string | null }>((offset, limit) =>
        supabase
          .from('service_instances')
          .select('id, service_template_id')
          .in('id', instIds)
          .range(offset, offset + limit - 1),
      )
    const tmplIdByInst = new Map<string, string | null>()
    for (const r of instRows) tmplIdByInst.set(r.id, r.service_template_id)

    const tmplRows = await fetchPaged<{ id: string; service_code: string }>((offset, limit) =>
      supabase
        .from('service_templates')
        .select('id, service_code')
        .eq('church_id', churchId)
        .range(offset, offset + limit - 1),
    )
    const codeByTmpl = new Map<string, string>()
    for (const t of tmplRows) codeByTmpl.set(t.id, t.service_code)

    // Build sitting label: service_code via template
    const codeByInstId = new Map<string, string>()
    for (const [instId, tmplId] of tmplIdByInst) {
      if (tmplId) codeByInstId.set(instId, codeByTmpl.get(tmplId) ?? '—')
    }

    weekly = buildWeeklyFromEntries(entries, entryActiveDate)
    sittingsByWeek = buildSittingsFromEntries(entries, codeByInstId)

  } else if (src.kind === 'stat') {
    // #73 — per-metric RESPONSE_STAT: metric_entries for a given metricId.
    // Mirrors statByMetric[metricId]. Sittings = per active occurrence.
    const SELECT_ME = `metric_id, value, is_not_applicable, reporting_tag_code, period_anchor, service_instance_id, service_instances!inner ( service_date, status )`

    const entries = await fetchPaged<MetricEntryRow>((offset, limit) =>
      supabase
        .from('metric_entries')
        .select(SELECT_ME)
        .eq('church_id', churchId)
        .eq('is_not_applicable', false)
        .eq('reporting_tag_code', 'RESPONSE_STAT')
        .eq('metric_id', src.metricId)
        .not('value', 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1),
    )

    const instIds = [...new Set(entries.map(e => e.service_instance_id).filter((id): id is string => !!id))]
    const instRows: { id: string; service_template_id: string | null }[] = instIds.length === 0 ? [] :
      await fetchPaged<{ id: string; service_template_id: string | null }>((offset, limit) =>
        supabase
          .from('service_instances')
          .select('id, service_template_id')
          .in('id', instIds)
          .range(offset, offset + limit - 1),
      )
    const tmplIdByInst = new Map<string, string | null>()
    for (const r of instRows) tmplIdByInst.set(r.id, r.service_template_id)

    const tmplRows = await fetchPaged<{ id: string; service_code: string }>((offset, limit) =>
      supabase
        .from('service_templates')
        .select('id, service_code')
        .eq('church_id', churchId)
        .range(offset, offset + limit - 1),
    )
    const codeByTmpl = new Map<string, string>()
    for (const t of tmplRows) codeByTmpl.set(t.id, t.service_code)

    const codeByInstId = new Map<string, string>()
    for (const [instId, tmplId] of tmplIdByInst) {
      if (tmplId) codeByInstId.set(instId, codeByTmpl.get(tmplId) ?? '—')
    }

    weekly = buildWeeklyFromEntries(entries, entryActiveDate)
    sittingsByWeek = buildSittingsFromEntries(entries, codeByInstId)

  } else {
    // src.kind === 'ratio'
    // #73 — ratio metrics: volToAttendancePct + perCapitaGiving.
    // hasSittings=false; weekly grid shows per-week ratio value.
    hasSittings = false
    ratioScale = src.scale

    // Helper: fetch a named operand's weekly map.
    const fetchOperand = async (op: RatioOperand): Promise<Map<string, number>> => {
      if (op === 'attendance-total') {
        const rows = await fetchPaged<AttRow>((offset, limit) =>
          supabase
            .from('attendance_per_occurrence')
            .select('service_instance_id, service_template_id, service_date, total_attendance')
            .eq('church_id', churchId)
            .gte('service_date', b.lastYearStart)
            .lte('service_date', b.today)
            .order('service_date', { ascending: true })
            .range(offset, offset + limit - 1),
        )
        const m = new Map<string, number>()
        for (const r of rows) {
          const raw = r['total_attendance']
          if (raw === null || raw === undefined) continue
          const v = Number(raw)
          if (Number.isNaN(v)) continue
          const wk = weekOf(r.service_date)
          m.set(wk, (m.get(wk) ?? 0) + v)
        }
        return m
      } else if (op === 'volunteers-total') {
        const rows = await fetchPaged<VolOccRow>((offset, limit) =>
          supabase
            .from('volunteers_per_occurrence')
            .select('service_instance_id, service_date, total_volunteers')
            .eq('church_id', churchId)
            .gte('service_date', b.lastYearStart)
            .lte('service_date', b.today)
            .order('service_date', { ascending: true })
            .range(offset, offset + limit - 1),
        )
        const m = new Map<string, number>()
        for (const r of rows) {
          if (r.total_volunteers === null) continue
          const wk = weekOf(r.service_date)
          m.set(wk, (m.get(wk) ?? 0) + Number(r.total_volunteers))
        }
        return m
      } else {
        // 'giving'
        const { weekly: gw } = await fetchGivingWeekly(supabase, churchId, b)
        return gw
      }
    }

    const [nMap, dMap] = await Promise.all([fetchOperand(src.numerator), fetchOperand(src.denominator)])
    numWeekly = nMap
    denWeekly = dMap

    // weekly = per-week ratio values (for the chart/grid); use separate maps for window avgs.
    weekly = ratioWeekly(nMap, dMap, ratioScale)
  }

  // ── 4-week grid: current (in-progress) week + the 4 completed weeks of m4. ──
  const completedWeeks = enumerateWeeks(b.fourWksAgoStart, b.lastWeekEnd) // 4 Sundays
  const gridWeekStarts = [b.thisWeekStart, ...completedWeeks].sort((a, c) => (a < c ? 1 : -1)) // newest first
  const weeks: WeekDetail[] = gridWeekStarts.map(wk => {
    const sittings = (sittingsByWeek.get(wk) ?? []).sort((a, c) =>
      a.serviceDate === c.serviceDate ? a.label.localeCompare(c.label) : a.serviceDate.localeCompare(c.serviceDate),
    )
    const weekTotal = weekly.has(wk) ? weekly.get(wk)! : null
    return { weekStart: wk, inProgress: wk === b.thisWeekStart, sittings, weekTotal }
  })

  // ── fourWeekAvg / ytdAvg / priorYtdAvg — mirrors dashboard.ts exactly. ──────
  // For ratio sources: divide window aggregates (matches ratioFourWin), NOT the
  // average of weekly ratio values. For all other sources: avgOfWeeks on weekly map.
  let fourWeekAvg: number | null
  let ytdAvg: number | null
  let priorYtdAvg: number | null

  if (numWeekly !== null && denWeekly !== null) {
    // ratio — divide window aggregates
    fourWeekAvg  = ratioWindowAvg(numWeekly, denWeekly, ratioScale, b.fourWksAgoStart, b.lastWeekEnd)
    ytdAvg       = ratioWindowAvg(numWeekly, denWeekly, ratioScale, b.yearStart, b.thisWeekStart)
    priorYtdAvg  = ratioWindowAvg(numWeekly, denWeekly, ratioScale, b.lastYearStart, b.lastYearSameWeek)
  } else {
    fourWeekAvg  = avgOfWeeks(weekly, b.fourWksAgoStart, b.lastWeekEnd)
    ytdAvg       = avgOfWeeks(weekly, b.yearStart, b.thisWeekStart)
    priorYtdAvg  = avgOfWeeks(weekly, b.lastYearStart, b.lastYearSameWeek)
  }

  // ── YTD weekly series (current vs prior). ──
  const current: WeeklyPoint[] = enumerateWeeks(weekOf(b.yearStart), b.thisWeekStart)
    .map(wk => ({ weekStart: wk, value: weekly.has(wk) ? weekly.get(wk)! : null }))
  const prior: WeeklyPoint[] = enumerateWeeks(weekOf(b.lastYearStart), b.lastYearSameWeek)
    .map(wk => ({ weekStart: wk, value: weekly.has(wk) ? weekly.get(wk)! : null }))

  return { selector, hasSittings, weeks, fourWeekAvg, current, prior, ytdAvg, priorYtdAvg }
}
