// ─────────────────────────────────────────────────────────────────────────
// DASHBOARD DRILL-DOWN — metric series fetch (task #69).
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
// PHASE 1 SCOPE (honest): drill-down is wired for ATTENDANCE-backed cells (grand
// total, audience roles adults/kids/youth, per-ministry attendance via its role
// column, and the weekly-avg-attendance reporting metric) plus weekly GIVING.
// Volunteers, per-ministry stats, and the ratio metrics (vol/attendance,
// per-capita giving) are NOT clickable yet — their cells render as plain text.
// See FLAGS in the build report; they are a clean fast-follow.
//
// Six DB Rules honored: status='active' is enforced by the per-occurrence views;
// NULL≠0 (null values skipped, never coalesced); giving summed per week from the
// giving_per_week view.
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

export type MetricSource =
  | { kind: 'attendance'; column: AttendanceColumn }
  | { kind: 'giving-weekly' }

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
  hasSittings: boolean    // false for giving-weekly (no per-occurrence breakdown)
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

// ── main fetch ────────────────────────────────────────────────────────────────
export async function fetchMetricSeries(
  churchId: string,
  selector: MetricSelector,
  asOf?: Date,
): Promise<MetricSeries> {
  const supabase = createClient()
  const b: Boundaries = buildBoundaries(asOf ?? new Date())

  // Per-occurrence sitting values + the weekly-summed map, by source.
  const weekly = new Map<string, number>()
  const sittingsByWeek = new Map<string, SittingValue[]>()
  let hasSittings = true

  if (selector.source.kind === 'attendance') {
    const col = selector.source.column
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
  } else {
    // giving-weekly: church-wide weekly view; no per-occurrence breakdown.
    hasSittings = false
    const rows = await fetchPaged<GivingRow>((offset, limit) =>
      supabase
        .from('giving_per_week')
        .select('week_start, total_giving')
        .eq('church_id', churchId)
        .gte('week_start', b.lastYearStart)
        .lte('week_start', b.today)
        .order('week_start', { ascending: true })
        .range(offset, offset + limit - 1),
    )
    for (const r of rows) {
      if (r.total_giving === null || r.total_giving === undefined) continue
      const wk = weekOf(r.week_start)
      weekly.set(wk, (weekly.get(wk) ?? 0) + Number(r.total_giving))
    }
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

  // fourWeekAvg uses ONLY the 4 completed weeks (matches card m4 exactly).
  const fourWeekAvg = avgOfWeeks(weekly, b.fourWksAgoStart, b.lastWeekEnd)

  // ── YTD weekly series (current vs prior). ──
  const current: WeeklyPoint[] = enumerateWeeks(weekOf(b.yearStart), b.thisWeekStart)
    .map(wk => ({ weekStart: wk, value: weekly.has(wk) ? weekly.get(wk)! : null }))
  const prior: WeeklyPoint[] = enumerateWeeks(weekOf(b.lastYearStart), b.lastYearSameWeek)
    .map(wk => ({ weekStart: wk, value: weekly.has(wk) ? weekly.get(wk)! : null }))

  const ytdAvg = avgOfWeeks(weekly, b.yearStart, b.thisWeekStart)
  const priorYtdAvg = avgOfWeeks(weekly, b.lastYearStart, b.lastYearSameWeek)

  return { selector, hasSittings, weeks, fourWeekAvg, current, prior, ytdAvg, priorYtdAvg }
}
