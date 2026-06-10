/**
 * Widget spec compiler — turns a validated WidgetSpec into a query against the
 * existing security_invoker views / metric_entries_readable, runs it under the
 * caller's RLS, and returns tidy rows. This is the deterministic, zero-AI replay
 * path (CONCEPT_AI_WIDGETS.md §2, §8).
 *
 * It MIRRORS the proven patterns in:
 *   - src/lib/ai/metrics.ts   — view reads, .eq('church_id', …), NULL skipping
 *                               (rule 4), the two-step occurrence-id pattern for
 *                               metric_entries, week bucketing via the Sunday anchor.
 *   - src/lib/dashboard.ts    — rolling-window date math (weekStartOf / shiftDays),
 *                               pagination past the 1,000-row PostgREST cap, the
 *                               null-safe ratio (denominator 0/NULL → null).
 *
 * SAFETY: church_id comes ONLY from the churchId argument, never from the spec
 * or the AI. RLS on the underlying tables is the real cross-church guard
 * (CONCEPT §5); the injected church_id is defense in depth + performance.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  WidgetSpec,
  Measure,
  Dimension,
  DateWindow,
  SpecExplainer,
  WidgetSource,
} from './spec'

// Convenience re-export so callers can import the spec types from the compiler
// alongside its functions. spec.ts remains the canonical definition home.
export type {
  WidgetSpec,
  WidgetSource,
  Measure,
  Dimension,
  DateWindow,
  VizConfig,
  SpecExplainer,
} from './spec'

// ─── Date helpers (mirror dashboard.ts exactly — Sunday-anchored weeks) ────────

/** Sunday (week-start) for a Date, matching dashboard.ts weekStartOf(). */
export function weekStartOf(d: Date): string {
  const day = d.getDay()
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - day)
  sunday.setHours(0, 0, 0, 0)
  return sunday.toISOString().split('T')[0]
}

/** Shift a YYYY-MM-DD by N days (noon anchor avoids DST edge slips). */
export function shiftDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/** YYYY-MM-DD for a Date in its local calendar day. */
function isoDay(d: Date): string {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  return x.toISOString().split('T')[0]
}

/** First day of the month that `d` falls in, as YYYY-MM-DD. */
function monthStartOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Jan 1 of the year `d` falls in, as YYYY-MM-DD. */
function yearStartOf(d: Date): string {
  return `${d.getFullYear()}-01-01`
}

/** Shift a YYYY-MM-DD back/forward by N whole months, clamped to month length. */
function shiftMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  const targetMonthIndex = d.getMonth() + months
  const y = d.getFullYear() + Math.floor(targetMonthIndex / 12)
  const m = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(y, m + 1, 0).getDate()
  const day = Math.min(d.getDate(), lastDay)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Shift a YYYY-MM-DD back/forward by N years (clamps Feb-29 → Feb-28). */
function shiftYears(dateStr: string, years: number): string {
  return shiftMonths(dateStr, years * 12)
}

// ─── resolveWindow — the heart of "tomorrow becomes the new today" ────────────

/**
 * Resolve a relative (or pinned) DateWindow against `now` (the server date).
 * Returns an inclusive { start, end } as ISO YYYY-MM-DD. PURE.
 *
 *   trailing{count,unit} → start = the first day `count-1` units back from now's
 *                          CURRENT bucket start; end = today. (trailing 12 months,
 *                          anchored on the 1st of the current month, spans 12
 *                          month-buckets inclusive — like dashboard's rolling math.)
 *   current{unit}        → start of the current unit → today.
 *   ytd                  → Jan 1 of now's year → today.
 *   prior_year           → the mirrored prior-year YTD (Jan 1 last year → the same
 *                          month/day last year). Standalone interpretation; a
 *                          paired vs-this-year comparison is composed one layer up.
 *   custom               → { start, end } verbatim.
 */
export function resolveWindow(w: DateWindow, now: Date): { start: string; end: string } {
  const today = isoDay(now)

  switch (w.window) {
    case 'custom':
      return { start: w.start, end: w.end }

    case 'ytd':
      return { start: yearStartOf(now), end: today }

    case 'prior_year': {
      // Mirror the YTD window one year back: Jan 1 last year → same M/D last year.
      const start = `${now.getFullYear() - 1}-01-01`
      const end = shiftYears(today, -1)
      return { start, end }
    }

    case 'current': {
      if (w.unit === 'week') return { start: weekStartOf(now), end: today }
      if (w.unit === 'month') return { start: monthStartOf(now), end: today }
      return { start: yearStartOf(now), end: today }
    }

    case 'trailing': {
      const count = Math.max(1, Math.floor(w.count))
      if (w.unit === 'week') {
        // Anchor on the current week's Sunday; go back count-1 whole weeks.
        const curWeek = weekStartOf(now)
        return { start: shiftDays(curWeek, -(count - 1) * 7), end: today }
      }
      if (w.unit === 'month') {
        // Anchor on the 1st of the current month; go back count-1 whole months.
        const curMonth = monthStartOf(now)
        return { start: shiftMonths(curMonth, -(count - 1)), end: today }
      }
      // year: anchor on Jan 1 of the current year; go back count-1 whole years.
      const curYear = yearStartOf(now)
      return { start: shiftYears(curYear, -(count - 1)), end: today }
    }
  }
}

// ─── validateSpec — reject anything the compiler can't safely run ─────────────

const SOURCES: WidgetSource[] = [
  'attendance_per_occurrence',
  'volunteers_per_occurrence',
  'giving_per_week',
  'metric_entries_readable',
]
const REPORTING_TAGS = ['ATTENDANCE', 'VOLUNTEERS', 'GIVING', 'RESPONSE_STAT']
const AGGS = ['sum', 'avg', 'weekly_avg']
const TIME_BUCKETS = ['week', 'month', 'year']
const DIM_FIELDS = ['ministry_tag', 'service_template', 'location', 'metric', 'service_group']
const VIZ_KINDS = ['line', 'bar', 'area', 'grid', 'pivot', 'metric_card']
const WINDOW_KINDS = ['trailing', 'current', 'ytd', 'prior_year', 'custom']
const WINDOW_UNITS = ['week', 'month', 'year']

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function validateMeasure(m: unknown, path: string, errors: string[]): void {
  if (!isObj(m)) {
    errors.push(`${path} must be an object`)
    return
  }
  if (!REPORTING_TAGS.includes(m.reporting_tag_code as string)) {
    errors.push(`${path}.reporting_tag_code must be one of ${REPORTING_TAGS.join('|')}`)
  }
  if (!AGGS.includes(m.agg as string)) {
    errors.push(`${path}.agg must be one of ${AGGS.join('|')}`)
  }
}

/**
 * Validate unknown input into a typed WidgetSpec, or return precise errors.
 * PURE. Rejects unknown source/field/enum values, >2 dimensions, and missing
 * required fields. (Range/semantic safety beyond shape is enforced at compile.)
 */
export function validateSpec(
  input: unknown,
): { ok: true; spec: WidgetSpec } | { ok: false; errors: string[] } {
  const errors: string[] = []

  if (!isObj(input)) {
    return { ok: false, errors: ['spec must be an object'] }
  }

  if (input.version !== 1) {
    errors.push('version must be 1')
  }

  if (!SOURCES.includes(input.source as WidgetSource)) {
    errors.push(`source must be one of ${SOURCES.join('|')}`)
  }

  validateMeasure(input.measure, 'measure', errors)

  // dimensions: 0..2
  if (!Array.isArray(input.dimensions)) {
    errors.push('dimensions must be an array')
  } else {
    if (input.dimensions.length > 2) {
      errors.push('dimensions: at most 2 allowed (2 enables a pivot)')
    }
    let timeCount = 0
    input.dimensions.forEach((d: unknown, i: number) => {
      if (!isObj(d)) {
        errors.push(`dimensions[${i}] must be an object`)
        return
      }
      if (d.field === 'time') {
        timeCount++
        if (!TIME_BUCKETS.includes(d.bucket as string)) {
          errors.push(`dimensions[${i}].bucket must be one of ${TIME_BUCKETS.join('|')}`)
        }
      } else if (DIM_FIELDS.includes(d.field as string)) {
        if (d.by !== 'code') {
          errors.push(`dimensions[${i}].by must be "code" (stable codes only, never display_name)`)
        }
      } else {
        errors.push(
          `dimensions[${i}].field must be one of time|${DIM_FIELDS.join('|')}`,
        )
      }
    })
    if (timeCount > 1) {
      errors.push('dimensions: at most one time dimension allowed')
    }
  }

  // filters (optional)
  if (input.filters !== undefined) {
    if (!isObj(input.filters)) {
      errors.push('filters must be an object')
    } else {
      const f = input.filters
      if (f.date !== undefined) validateWindow(f.date, errors)
      if (f.ministry_tag_codes !== undefined && !isStringArray(f.ministry_tag_codes)) {
        errors.push('filters.ministry_tag_codes must be an array of strings')
      }
      if (f.service_template_codes !== undefined && !isStringArray(f.service_template_codes)) {
        errors.push('filters.service_template_codes must be an array of strings')
      }
      if (f.metric_names !== undefined && !isStringArray(f.metric_names)) {
        errors.push('filters.metric_names must be an array of strings')
      }
      if (f.service_group_codes !== undefined && !isStringArray(f.service_group_codes)) {
        errors.push('filters.service_group_codes must be an array of strings')
      }
    }
  }

  // ratio (optional)
  if (input.ratio !== undefined) {
    if (!isObj(input.ratio)) {
      errors.push('ratio must be an object')
    } else {
      validateMeasure(input.ratio.numerator, 'ratio.numerator', errors)
      validateMeasure(input.ratio.denominator, 'ratio.denominator', errors)
      if (input.ratio.scale !== undefined && typeof input.ratio.scale !== 'number') {
        errors.push('ratio.scale must be a number')
      }
    }
  }

  // compare (optional)
  if (input.compare !== undefined && input.compare !== 'prior_year') {
    errors.push("compare must be 'prior_year' if set")
  }

  // viz (required)
  if (!isObj(input.viz)) {
    errors.push('viz must be an object')
  } else {
    if (!VIZ_KINDS.includes(input.viz.kind as string)) {
      errors.push(`viz.kind must be one of ${VIZ_KINDS.join('|')}`)
    }
    if (typeof input.viz.title !== 'string' || input.viz.title.length === 0) {
      errors.push('viz.title must be a non-empty string')
    }
    if (input.viz.xKey !== undefined && typeof input.viz.xKey !== 'string') {
      errors.push('viz.xKey must be a string')
    }
    if (input.viz.yKeys !== undefined && !isStringArray(input.viz.yKeys)) {
      errors.push('viz.yKeys must be an array of strings')
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, spec: input as unknown as WidgetSpec }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function validateWindow(w: unknown, errors: string[]): void {
  if (!isObj(w)) {
    errors.push('filters.date must be an object')
    return
  }
  if (!WINDOW_KINDS.includes(w.window as string)) {
    errors.push(`filters.date.window must be one of ${WINDOW_KINDS.join('|')}`)
    return
  }
  if (w.window === 'trailing') {
    if (typeof w.count !== 'number' || w.count < 1) {
      errors.push('filters.date.count must be a positive number for window=trailing')
    }
    if (!WINDOW_UNITS.includes(w.unit as string)) {
      errors.push(`filters.date.unit must be one of ${WINDOW_UNITS.join('|')} for window=trailing`)
    }
  } else if (w.window === 'current') {
    if (!WINDOW_UNITS.includes(w.unit as string)) {
      errors.push(`filters.date.unit must be one of ${WINDOW_UNITS.join('|')} for window=current`)
    }
  } else if (w.window === 'custom') {
    if (typeof w.start !== 'string' || !ISO_DATE.test(w.start)) {
      errors.push('filters.date.start must be YYYY-MM-DD for window=custom')
    }
    if (typeof w.end !== 'string' || !ISO_DATE.test(w.end)) {
      errors.push('filters.date.end must be YYYY-MM-DD for window=custom')
    }
  }
}

// ─── describeSpec — deterministic humanized facts for flip-to-explain ─────────

const MEASURE_NOUN: Record<Measure['reporting_tag_code'], string> = {
  ATTENDANCE: 'Attendance',
  VOLUNTEERS: 'Volunteers',
  GIVING: 'Giving',
  RESPONSE_STAT: 'Responses',
}

const BUCKET_ADJ: Record<'week' | 'month' | 'year', string> = {
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
}

function monthLabel(ymd: string): string {
  const [y, m] = ymd.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[Number(m) - 1]} ${y}`
}

function timeBucketOf(spec: WidgetSpec): 'week' | 'month' | 'year' | null {
  for (const d of spec.dimensions) {
    if (d.field === 'time') return d.bucket
  }
  return null
}

/**
 * Build the four deterministic explainer lines from a spec + its resolved range.
 * PURE — no AI. (The friendly narrative is stored separately, written once.)
 */
export function describeSpec(
  spec: WidgetSpec,
  resolved: { start: string; end: string },
): SpecExplainer {
  const tag = spec.measure.reporting_tag_code
  const noun = MEASURE_NOUN[tag]

  // summing — what the number is + how it's added up.
  let summing: string
  if (spec.ratio) {
    const num = MEASURE_NOUN[spec.ratio.numerator.reporting_tag_code]
    const den = MEASURE_NOUN[spec.ratio.denominator.reporting_tag_code]
    const pct = (spec.ratio.scale ?? 1) === 100 ? ', shown as a percentage' : ''
    summing = `${num} ÷ ${den}${pct}; blanks skipped, not zero; cancelled services excluded.`
  } else if (tag === 'ATTENDANCE') {
    const how = spec.measure.agg !== 'sum' ? 'averaged per week' : 'summed'
    summing = `Attendance = adults + kids + youth + other, ${how}; blanks skipped, not zero; cancelled services excluded.`
  } else if (tag === 'VOLUNTEERS') {
    const how = spec.measure.agg !== 'sum' ? 'averaged per week' : 'added together'
    summing = `Volunteers = every volunteer area ${how}; blanks skipped, not zero; cancelled services excluded.`
  } else if (tag === 'GIVING') {
    const how = spec.measure.agg !== 'sum' ? 'averaged per week' : 'totalled each week'
    summing = `Giving = all sources ${how}; blanks skipped, not zero; cancelled services excluded.`
  } else {
    const how = spec.measure.agg !== 'sum' ? 'averaged per week' : 'summed'
    summing = `${noun} = the recorded counts ${how}; blanks skipped, not zero; cancelled services excluded.`
  }

  // refresh — the rolling window in plain words.
  const win = spec.filters?.date
  let refresh: string
  if (!win || win.window === 'trailing') {
    if (win && win.window === 'trailing') {
      const unitWord = win.count === 1 ? win.unit : `${win.unit}s`
      refresh = `Rolling — always the last ${win.count} ${unitWord}.`
    } else {
      refresh = 'Rolling — updates to the latest data each time it loads.'
    }
  } else if (win.window === 'current') {
    refresh = `Rolling — the current ${win.unit} so far.`
  } else if (win.window === 'ytd') {
    refresh = 'Rolling — year so far, from January 1st.'
  } else if (win.window === 'prior_year') {
    refresh = 'Fixed window — the same stretch of last year.'
  } else {
    refresh = 'Pinned — a fixed date range that never moves.'
  }

  // currentlyShowing — the live resolved range + bucket.
  const bucket = timeBucketOf(spec)
  const rangeLabel = `${monthLabel(resolved.start)} – ${monthLabel(resolved.end)}`
  const currentlyShowing = bucket
    ? `${rangeLabel}, ${BUCKET_ADJ[bucket]}`
    : rangeLabel

  // included — ministries/services/groups scoped, or "all".
  const parts: string[] = []
  const mt = spec.filters?.ministry_tag_codes
  const st = spec.filters?.service_template_codes
  const mn = spec.filters?.metric_names
  const sg = spec.filters?.service_group_codes
  if (mn && mn.length > 0) parts.push(`metrics: ${mn.join(', ')}`)
  if (mt && mt.length > 0) parts.push(`ministries: ${mt.join(', ')}`)
  if (st && st.length > 0) parts.push(`services: ${st.join(', ')}`)
  if (sg && sg.length > 0) parts.push(`service groups: ${sg.join(', ')}`)
  const included = parts.length > 0 ? parts.join('; ') : 'All ministries and services.'

  return { summing, refresh, currentlyShowing, included }
}

// ─── explainQuery — the equivalent SQL, for "show me the query" proof ─────────

/**
 * Render the LOGICAL SQL a spec runs — the readable "SELECT … FROM … WHERE …"
 * proof a builder/AI can show the user. (The real path fetches from the view via
 * PostgREST and buckets/aggregates in TS, but this faithfully reflects the source,
 * measure family, filters, window, and grouping that produce the numbers.) PURE.
 */
export function explainQuery(spec: WidgetSpec, resolved: { start: string; end: string }): string {
  const { plan } = planFor(spec)
  const table = plan.table
  const dateCol = plan.dateCol
  const valueCol =
    table === 'metric_entries_readable' ? 'value'
    : table === 'attendance_per_occurrence' ? 'total_attendance'
    : table === 'volunteers_per_occurrence' ? 'total_volunteers'
    : 'total_giving'
  const weekly = spec.measure.agg === 'weekly_avg'
  const agg = weekly ? 'AVG' : spec.measure.agg.toUpperCase()

  const selectCols: string[] = []
  const groupCols: string[] = []
  const timeDim = spec.dimensions.find((d) => d.field === 'time') as { bucket: 'week' | 'month' | 'year' } | undefined
  if (timeDim) {
    const expr =
      timeDim.bucket === 'week' ? `date_trunc('week', ${dateCol})`
      : timeDim.bucket === 'month' ? `to_char(${dateCol}, 'YYYY-MM')`
      : `to_char(${dateCol}, 'YYYY')`
    selectCols.push(`${expr} AS bucket`)
    groupCols.push('bucket')
  }
  for (const d of spec.dimensions) {
    if (d.field === 'time') continue
    const col =
      d.field === 'ministry_tag' ? 'ministry_tag_code'
      : d.field === 'metric' ? 'metric_name'
      : d.field === 'service_template' ? 'service_template_id'
      : d.field === 'service_group' ? 'service_group_code'
      : 'location'
    selectCols.push(col)
    groupCols.push(col)
  }
  const valueExpr = weekly
    ? `AVG(weekly_sum)  -- weekly average: SUM(${valueCol}) per ISO week, then AVG the weeks`
    : `${agg}(${valueCol})`
  selectCols.push(spec.ratio ? `${valueExpr} -- ratio numerator/denominator, see note` : `${valueExpr} AS value`)

  const win: DateWindow = spec.filters?.date ?? { window: 'trailing', count: 12, unit: 'month' }
  const where: string[] = [`church_id = :church_id`, ...relativeDateClause(dateCol, win)]
  if (table === 'metric_entries_readable') {
    where.push(`reporting_tag_code = '${spec.measure.reporting_tag_code}'`)
    where.push(`is_not_applicable = false`)
    where.push(`value IS NOT NULL`)
    where.push(`(service_instance_id IS NULL OR instance_status = 'active')`)
  }
  const mn = spec.filters?.metric_names
  const mt = spec.filters?.ministry_tag_codes
  const sg = spec.filters?.service_group_codes
  if (mn && mn.length) where.push(`metric_name IN (${mn.map((v) => `'${v}'`).join(', ')})`)
  if (mt && mt.length) where.push(`ministry_tag_code IN (${mt.map((v) => `'${v}'`).join(', ')})`)
  if (sg && sg.length) where.push(`service_group_code IN (${sg.map((v) => `'${v}'`).join(', ')})`)

  let sql = `SELECT ${selectCols.join(', ')}\nFROM ${table}\nWHERE ${where.join('\n  AND ')}`
  if (groupCols.length) sql += `\nGROUP BY ${groupCols.join(', ')}\nORDER BY ${groupCols.join(', ')}`
  const header =
    (win.window !== 'custom'
      ? `-- ROLLING window — recalculated on every load · today it resolves to ${resolved.start} → ${resolved.end}\n`
      : `-- FIXED window — pinned dates, does NOT move as time passes\n`) +
    (spec.compare === 'prior_year' ? '-- + the same window one year earlier (prior-year comparison)\n' : '')
  if (spec.ratio) {
    sql =
      `-- ratio = ${spec.ratio.numerator.reporting_tag_code} ÷ ${spec.ratio.denominator.reporting_tag_code}` +
      ` × ${spec.ratio.scale ?? 1}\n` + sql
  }
  return header + sql + ';'
}

/** A widget is "rolling" (dynamic) unless it pins a custom absolute range. */
export function isRollingWindow(spec: WidgetSpec): boolean {
  return (spec.filters?.date?.window ?? 'trailing') !== 'custom'
}

/**
 * Date predicate rendered as readable RELATIVE SQL (CURRENT_DATE-based) so the
 * "show me the query" proof makes the rolling nature obvious — a YTD widget reads
 * `>= date_trunc('year', CURRENT_DATE)`, not a frozen literal date. Only a pinned
 * custom range renders literal dates.
 */
function relativeDateClause(dateCol: string, win: DateWindow): string[] {
  switch (win.window) {
    case 'custom':
      return [`${dateCol} BETWEEN '${win.start}' AND '${win.end}'`]
    case 'ytd':
      return [`${dateCol} >= date_trunc('year', CURRENT_DATE)`, `${dateCol} <= CURRENT_DATE`]
    case 'prior_year':
      return [
        `${dateCol} >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'`,
        `${dateCol} <= CURRENT_DATE - INTERVAL '1 year'`,
      ]
    case 'current':
      return [`${dateCol} >= date_trunc('${win.unit}', CURRENT_DATE)`, `${dateCol} <= CURRENT_DATE`]
    case 'trailing': {
      const n = Math.max(1, Math.floor(win.count)) - 1
      const interval = n > 0 ? ` - INTERVAL '${n} ${win.unit}${n === 1 ? '' : 's'}'` : ''
      return [`${dateCol} >= date_trunc('${win.unit}', CURRENT_DATE)${interval}`, `${dateCol} <= CURRENT_DATE`]
    }
  }
}

// ─── compileAndRun — resolve, query the view, bucket + aggregate in TS ─────────

const PAGE = 1000

/**
 * Which numeric column each source/measure reads, and the date column to filter.
 * The per-occurrence views are pre-pivoted (dashboard.ts); metric_entries_readable
 * is the firehose used for RESPONSE_STAT and code-grouped dimensions.
 */
interface SourcePlan {
  table: WidgetSource
  dateCol: string
  // pull these columns (always includes church_id-safe value + date)
  select: string
  // extract the numeric value from a row for the active measure
  valueOf: (row: Record<string, unknown>) => number | null
  // extract the YYYY-MM-DD date from a row
  dateOf: (row: Record<string, unknown>) => string | null
  // extract a categorical code for a dimension field, if available on this source
  codeOf: (row: Record<string, unknown>, field: string) => string | null
  // categorical dimension fields this source can group by
  supportedDims: string[]
}

function planFor(spec: WidgetSpec): { plan: SourcePlan; error?: string } {
  const measureTag = spec.measure.reporting_tag_code

  switch (spec.source) {
    case 'attendance_per_occurrence':
      return {
        plan: {
          table: 'attendance_per_occurrence',
          dateCol: 'service_date',
          select: 'service_date, service_template_id, total_attendance, service_group_code',
          valueOf: (r) => num(r.total_attendance),
          dateOf: (r) => str(r.service_date),
          codeOf: (r, f) =>
            f === 'service_template' ? str(r.service_template_id)
            : f === 'service_group' ? str(r.service_group_code)
            : null,
          supportedDims: ['service_template', 'service_group'],
        },
      }

    case 'volunteers_per_occurrence':
      return {
        plan: {
          table: 'volunteers_per_occurrence',
          dateCol: 'service_date',
          select: 'service_date, service_template_id, total_volunteers, service_group_code',
          valueOf: (r) => num(r.total_volunteers),
          dateOf: (r) => str(r.service_date),
          codeOf: (r, f) =>
            f === 'service_template' ? str(r.service_template_id)
            : f === 'service_group' ? str(r.service_group_code)
            : null,
          supportedDims: ['service_template', 'service_group'],
        },
      }

    case 'giving_per_week':
      return {
        plan: {
          table: 'giving_per_week',
          dateCol: 'week_start',
          select: 'week_start, total_giving',
          valueOf: (r) => num(r.total_giving),
          dateOf: (r) => str(r.week_start),
          codeOf: () => null, // giving is church-wide weekly — no categorical axis
          supportedDims: [],
        },
      }

    case 'metric_entries_readable':
      return {
        plan: {
          table: 'metric_entries_readable',
          dateCol: 'effective_date',
          select:
            'effective_date, value, is_not_applicable, instance_status, reporting_tag_code, ministry_tag_code, metric_name, service_instance_id, service_group_code',
          valueOf: (r) => {
            // firehose: honor N/A + active-only (rule 1 + 4); filter to the measure's tag.
            if (r.is_not_applicable === true) return null
            if (r.reporting_tag_code !== measureTag) return null
            // active-only: instance rows must be active; period rows have null status.
            if (r.service_instance_id != null && r.instance_status !== 'active') return null
            return num(r.value)
          },
          dateOf: (r) => str(r.effective_date),
          codeOf: (r, f) => {
            if (f === 'ministry_tag') return str(r.ministry_tag_code)
            if (f === 'metric') return str(r.metric_name)
            if (f === 'service_group') return str(r.service_group_code)
            return null
          },
          supportedDims: ['ministry_tag', 'metric', 'service_group'],
        },
      }
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v)
}

/** Bucket key for a date under a time bucket (Sunday-anchored weeks). */
function bucketKey(ymd: string, bucket: 'week' | 'month' | 'year'): string {
  if (bucket === 'week') return weekStartOf(new Date(ymd + 'T12:00:00'))
  if (bucket === 'month') return ymd.slice(0, 7)
  return ymd.slice(0, 4)
}

/** Aggregate a list of numeric values per the measure's agg (NULLs pre-filtered). */
function aggregate(values: number[], agg: 'sum' | 'avg' | 'weekly_avg'): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((s, x) => s + x, 0)
  // weekly_avg is computed specially (per ISO week) in the 0-dim / categorical
  // paths; in the per-bucket / pivot / ratio fallback it behaves like avg.
  return agg === 'sum' ? sum : sum / values.length
}

/** SundayTally weekly_avg: SUM the values within each ISO week, then AVG the weekly sums. */
function weeklyAvg(raw: Record<string, unknown>[], plan: SourcePlan): number | null {
  const byWeek = new Map<string, number>()
  for (const r of raw) {
    const v = plan.valueOf(r)
    const d = plan.dateOf(r)
    if (v === null || d === null) continue
    const wk = weekStartOf(new Date(d + 'T12:00:00'))
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + v)
  }
  const weeks = [...byWeek.values()]
  if (weeks.length === 0) return null
  return weeks.reduce((s, x) => s + x, 0) / weeks.length
}

/** Per-category weekly_avg: for each code, SUM per ISO week, then AVG the weeks. */
function weeklyAvgByCode(raw: Record<string, unknown>[], plan: SourcePlan, field: string): [string, number][] {
  const map = new Map<string, Map<string, number>>()
  for (const r of raw) {
    const v = plan.valueOf(r)
    const d = plan.dateOf(r)
    if (v === null || d === null) continue
    const code = plan.codeOf(r, field) ?? '—'
    const wk = weekStartOf(new Date(d + 'T12:00:00'))
    let inner = map.get(code)
    if (!inner) {
      inner = new Map()
      map.set(code, inner)
    }
    inner.set(wk, (inner.get(wk) ?? 0) + v)
  }
  return [...map.entries()].map(([code, weeks]) => {
    const ws = [...weeks.values()]
    return [code, ws.length ? ws.reduce((s, x) => s + x, 0) / ws.length : 0] as [string, number]
  })
}

function roundTidy(n: number | null): number | null {
  if (n === null) return null
  return Math.round(n * 100) / 100
}

type RunResult = { rows: Record<string, unknown>[]; resolved: { start: string; end: string }; shape: string; error?: string }

/**
 * Merge a current run with its prior-year run:
 *   - headline number ({ value })  → { value, prior, delta } (delta = % change)
 *   - time series (rows w/ bucket)  → each row gains a `prior` value (aligned by
 *                                     relative position: this-year[i] vs last-year[i])
 *   - any other shape               → returned unchanged (comparison not defined)
 */
function mergeCompare(cur: RunResult, prior: RunResult): RunResult {
  if (cur.error) return cur
  const first = cur.rows[0] ?? {}
  if (cur.rows.length === 1 && 'value' in first && !('bucket' in first)) {
    const c = num(first.value)
    const p = num((prior.rows[0] as Record<string, unknown> | undefined)?.value)
    const delta = c !== null && p !== null && p !== 0 ? roundTidy(((c - p) / p) * 100) : null
    return { rows: [{ value: c, prior: p, delta }], resolved: cur.resolved, shape: 'value: number; prior: number; delta: number (%)' }
  }
  if (cur.rows.length > 0 && 'bucket' in first) {
    const rows = cur.rows.map((r, i) => ({ ...r, prior: num((prior.rows[i] as Record<string, unknown> | undefined)?.value) }))
    return { rows, resolved: cur.resolved, shape: `${cur.shape}; prior: number` }
  }
  return cur
}

/**
 * Compile + run a spec. Resolves the window against `now`, queries the chosen
 * view under the caller's RLS (paginated past the 1,000-row cap), then buckets
 * and aggregates in TS exactly like metrics.ts / dashboard.ts. Returns tidy rows,
 * the resolved range, a `shape` string, and a graceful `error` — never throws on
 * empty data.
 *
 * Dimensions:
 *   - 0 dims              → a single { value } (metric-card shape)
 *   - 1 time dim          → rows of { bucket, value }
 *   - 1 categorical dim   → rows of { <field>, value }
 *   - 2 dims (pivot)      → rows of { <rowKey>, [colKey]: value, … }
 *
 * church_id is taken from `churchId` only (never the spec).
 */
export async function compileAndRun(args: {
  supabase: SupabaseClient
  churchId: string
  spec: WidgetSpec
  now: Date
  /**
   * Campus scope applied on top of the spec (the dashboard's per-user campus
   * filter — e.g. the signed-in user's default_location_id). Filters every
   * source that carries a campus EXCEPT giving (church-wide). Omit / empty = all
   * campuses. Requires migration 0035 (location_id on the views).
   */
  locationIds?: string[]
  /**
   * Dashboard-level date override (the global date filter). When set, it replaces
   * the widget's own window for this run — every widget on the dashboard reports
   * the same range. Omit to use each widget's stored (relative) window.
   */
  windowOverride?: DateWindow
}): Promise<{
  rows: Record<string, unknown>[]
  resolved: { start: string; end: string }
  shape: string
  error?: string
}> {
  const { supabase, churchId, spec, now, locationIds, windowOverride } = args

  // 0. Prior-year comparison — re-run the SAME relative window against now − 1 year,
  //    then merge. One level of recursion (inner runs clear `compare`).
  if (spec.compare === 'prior_year') {
    const base: WidgetSpec = { ...spec, compare: undefined }
    const priorNow = new Date(now)
    priorNow.setFullYear(priorNow.getFullYear() - 1)
    const [cur, prior] = await Promise.all([
      compileAndRun({ supabase, churchId, spec: base, now, locationIds, windowOverride }),
      compileAndRun({ supabase, churchId, spec: base, now: priorNow, locationIds, windowOverride }),
    ])
    return mergeCompare(cur, prior)
  }

  // 1. Resolve the window (relative → absolute, against the server's now). A
  //    dashboard-level windowOverride (the global date filter) wins over the
  //    widget's stored window so every widget reports the same range.
  const window = windowOverride ?? spec.filters?.date ?? { window: 'trailing' as const, count: 12, unit: 'month' as const }
  const resolved = resolveWindow(window, now)

  // 2. Choose the source plan + reject unsupported categorical dims for this view.
  const { plan, error: planErr } = planFor(spec)
  if (planErr) {
    return { rows: [], resolved, shape: 'value: number', error: planErr }
  }

  const catDims = spec.dimensions.filter((d) => d.field !== 'time') as Extract<
    Dimension,
    { by: 'code' }
  >[]
  for (const d of catDims) {
    if (!plan.supportedDims.includes(d.field)) {
      return {
        rows: [],
        resolved,
        shape: 'value: number',
        error: `Source ${spec.source} cannot group by ${d.field}. Supported here: ${plan.supportedDims.join(', ') || 'time only'}.`,
      }
    }
  }

  // 2b. Categorical filters — apply where the source supports them; decline clearly otherwise.
  const colFilters: { col: string; values: string[] }[] = []
  const ff = spec.filters
  if (ff?.ministry_tag_codes && ff.ministry_tag_codes.length > 0) {
    if (spec.source !== 'metric_entries_readable') {
      return {
        rows: [],
        resolved,
        shape: 'value: number',
        error: `Filtering by ministry needs source 'metric_entries_readable' (the ${spec.source} view has no ministry column).`,
      }
    }
    colFilters.push({ col: 'ministry_tag_code', values: ff.ministry_tag_codes })
  }
  if (ff?.metric_names && ff.metric_names.length > 0) {
    if (spec.source !== 'metric_entries_readable') {
      return {
        rows: [],
        resolved,
        shape: 'value: number',
        error: `Filtering by metric needs source 'metric_entries_readable'.`,
      }
    }
    colFilters.push({ col: 'metric_name', values: ff.metric_names })
  }
  if (ff?.service_template_codes && ff.service_template_codes.length > 0) {
    return {
      rows: [],
      resolved,
      shape: 'value: number',
      error: `Filtering by service_template code isn't supported yet (the views key service by UUID, not code). Use a ministry filter on metric_entries_readable instead.`,
    }
  }
  if (ff?.service_group_codes && ff.service_group_codes.length > 0) {
    if (spec.source === 'giving_per_week') {
      return {
        rows: [],
        resolved,
        shape: 'value: number',
        error: `Giving is church-wide weekly — it can't be filtered by service group.`,
      }
    }
    colFilters.push({ col: 'service_group_code', values: ff.service_group_codes })
  }

  // Campus scope (the dashboard's per-user filter) — applies to every source
  // that carries a campus; giving is church-wide so it's left unfiltered.
  // (Requires 0035: location_id on the views.)
  if (locationIds && locationIds.length > 0 && spec.source !== 'giving_per_week') {
    colFilters.push({ col: 'location_id', values: locationIds })
  }

  // 3. Fetch rows from the view, scoped to church + date range + filters, paginated.
  let raw: Record<string, unknown>[]
  try {
    raw = await fetchPaged(supabase, plan, churchId, resolved, colFilters)
  } catch (e) {
    return {
      rows: [],
      resolved,
      shape: 'value: number',
      error: e instanceof Error ? e.message : 'query failed',
    }
  }

  // 4. Optional ratio: build numerator/denominator series per bucket key, divide.
  if (spec.ratio) {
    return runRatio(spec, plan, raw, resolved, now)
  }

  // 5. Group + aggregate by the chosen dimensions.
  const timeBucket = timeDimBucket(spec)
  const catFields = catDims.map((d) => d.field)

  // 0 dimensions → single scalar (metric card).
  if (spec.dimensions.length === 0) {
    if (spec.measure.agg === 'weekly_avg') {
      return { rows: [{ value: roundTidy(weeklyAvg(raw, plan)) }], resolved, shape: 'value: number (weekly avg)' }
    }
    const vals: number[] = []
    for (const r of raw) {
      const v = plan.valueOf(r)
      if (v === null) continue
      vals.push(v)
    }
    const value = roundTidy(aggregate(vals, spec.measure.agg))
    return { rows: [{ value }], resolved, shape: 'value: number', error: undefined }
  }

  // 1 dimension (time OR categorical).
  if (spec.dimensions.length === 1) {
    if (timeBucket) {
      const byBucket = new Map<string, number[]>()
      for (const r of raw) {
        const v = plan.valueOf(r)
        const d = plan.dateOf(r)
        if (v === null || d === null) continue
        const key = bucketKey(d, timeBucket)
        const arr = byBucket.get(key) ?? []
        arr.push(v)
        byBucket.set(key, arr)
      }
      const rows = [...byBucket.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([bucket, vals]) => ({ bucket, value: roundTidy(aggregate(vals, spec.measure.agg)) }))
      return { rows, resolved, shape: 'bucket: string; value: number' }
    }
    // single categorical
    const field = catFields[0]
    if (spec.measure.agg === 'weekly_avg') {
      const rows = weeklyAvgByCode(raw, plan, field)
        .map(([code, value]) => ({ [field]: code, value: roundTidy(value) }))
        .sort((a, b) => String(a[field]).localeCompare(String(b[field])))
      return { rows, resolved, shape: `${field}: string; value: number (weekly avg)` }
    }
    const byCode = new Map<string, number[]>()
    for (const r of raw) {
      const v = plan.valueOf(r)
      if (v === null) continue
      const code = plan.codeOf(r, field) ?? '—'
      const arr = byCode.get(code) ?? []
      arr.push(v)
      byCode.set(code, arr)
    }
    const rows = [...byCode.entries()]
      .map(([code, vals]) => ({ [field]: code, value: roundTidy(aggregate(vals, spec.measure.agg)) }))
      .sort((a, b) => String(a[field]).localeCompare(String(b[field])))
    return { rows, resolved, shape: `${field}: string; value: number` }
  }

  // 2 dimensions → pivot. Row axis = first non-time dim if present else time;
  // Col axis = the other. (AXIOM's pivot stress case.)
  const dims = spec.dimensions
  const rowDim = dims[0]
  const colDim = dims[1]

  const keyOf = (r: Record<string, unknown>, dim: Dimension): string | null => {
    if (dim.field === 'time') {
      const d = plan.dateOf(r)
      return d === null ? null : bucketKey(d, dim.bucket)
    }
    return plan.codeOf(r, dim.field) ?? '—'
  }

  // rowKey → (colKey → values[])
  const pivot = new Map<string, Map<string, number[]>>()
  const colKeys = new Set<string>()
  for (const r of raw) {
    const v = plan.valueOf(r)
    if (v === null) continue
    const rk = keyOf(r, rowDim)
    const ck = keyOf(r, colDim)
    if (rk === null || ck === null) continue
    colKeys.add(ck)
    let inner = pivot.get(rk)
    if (!inner) {
      inner = new Map()
      pivot.set(rk, inner)
    }
    const arr = inner.get(ck) ?? []
    arr.push(v)
    inner.set(ck, arr)
  }

  const rowLabel = rowDim.field === 'time' ? 'bucket' : rowDim.field
  const sortedCols = [...colKeys].sort()
  const rows = [...pivot.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([rk, inner]) => {
      const out: Record<string, unknown> = { [rowLabel]: rk }
      for (const ck of sortedCols) {
        out[ck] = roundTidy(aggregate(inner.get(ck) ?? [], spec.measure.agg))
      }
      return out
    })

  return {
    rows,
    resolved,
    shape: `${rowLabel}: string; <colKey>: number (pivot over ${colDim.field === 'time' ? 'time' : colDim.field})`,
  }
}

function timeDimBucket(spec: WidgetSpec): 'week' | 'month' | 'year' | null {
  for (const d of spec.dimensions) if (d.field === 'time') return d.bucket
  return null
}

/** Page through a view, church + date scoped, ordered by the date column. */
async function fetchPaged(
  supabase: SupabaseClient,
  plan: SourcePlan,
  churchId: string,
  resolved: { start: string; end: string },
  colFilters: { col: string; values: string[] }[] = [],
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from(plan.table)
      .select(plan.select)
      .eq('church_id', churchId)
      .gte(plan.dateCol, resolved.start)
      .lte(plan.dateCol, resolved.end)
    for (const f of colFilters) q = q.in(f.col, f.values)
    const { data, error } = await q
      .order(plan.dateCol, { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`${plan.table}: ${error.message}`)
    const rows = ((data ?? []) as unknown) as Record<string, unknown>[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

/**
 * Ratio path: builds numerator + denominator bucketed series over the same time
 * bucket (or a single overall bucket when there is no time dim), divides null-safe
 * (denominator null/0 → null, mirroring dashboard.ts ratioFourWin), applies scale.
 */
function runRatio(
  spec: WidgetSpec,
  plan: SourcePlan,
  raw: Record<string, unknown>[],
  resolved: { start: string; end: string },
  _now: Date,
): {
  rows: Record<string, unknown>[]
  resolved: { start: string; end: string }
  shape: string
  error?: string
} {
  const ratio = spec.ratio!
  const scale = ratio.scale ?? 1
  const bucket = timeDimBucket(spec)

  // For a ratio the firehose (metric_entries_readable) is required so both tags
  // are present; the pre-pivoted views carry only one measure.
  const valueForTag = (r: Record<string, unknown>, tag: Measure['reporting_tag_code']): number | null => {
    if (plan.table !== 'metric_entries_readable') {
      // Single-measure view: only the view's own measure is available.
      return tag === spec.measure.reporting_tag_code ? plan.valueOf(r) : null
    }
    if (r.is_not_applicable === true) return null
    if (r.reporting_tag_code !== tag) return null
    if (r.service_instance_id != null && r.instance_status !== 'active') return null
    return num(r.value)
  }

  const numByBucket = new Map<string, number[]>()
  const denByBucket = new Map<string, number[]>()
  const overall = '__all__'
  for (const r of raw) {
    const d = plan.dateOf(r)
    const key = bucket && d ? bucketKey(d, bucket) : overall
    const nv = valueForTag(r, ratio.numerator.reporting_tag_code)
    const dv = valueForTag(r, ratio.denominator.reporting_tag_code)
    if (nv !== null) {
      const a = numByBucket.get(key) ?? []
      a.push(nv)
      numByBucket.set(key, a)
    }
    if (dv !== null) {
      const a = denByBucket.get(key) ?? []
      a.push(dv)
      denByBucket.set(key, a)
    }
  }

  const div = (n: number | null, d: number | null): number | null =>
    n === null || d === null || d === 0 ? null : (n / d) * scale

  if (!bucket) {
    const n = aggregate(numByBucket.get(overall) ?? [], ratio.numerator.agg)
    const d = aggregate(denByBucket.get(overall) ?? [], ratio.denominator.agg)
    return {
      rows: [{ value: roundTidy(div(n, d)) }],
      resolved,
      shape: 'value: number (ratio)',
    }
  }

  const keys = new Set<string>([...numByBucket.keys(), ...denByBucket.keys()])
  const rows = [...keys]
    .sort()
    .map((k) => {
      const n = aggregate(numByBucket.get(k) ?? [], ratio.numerator.agg)
      const d = aggregate(denByBucket.get(k) ?? [], ratio.denominator.agg)
      return { bucket: k, value: roundTidy(div(n, d)) }
    })
  return { rows, resolved, shape: 'bucket: string; value: number (ratio)' }
}
