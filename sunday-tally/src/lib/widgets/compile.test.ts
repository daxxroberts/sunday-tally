/**
 * Unit tests for the widget spec compiler (foundation logic).
 *
 * Covers the PURE functions only — resolveWindow, validateSpec, describeSpec.
 * compileAndRun is NOT tested here: it needs a live RLS-backed Supabase, so it is
 * covered by integration testing against the deployed schema (migrations 0033 + 0035).
 *
 * Timezone note: resolveWindow uses local-calendar primitives (matching
 * dashboard.ts weekStartOf). The fixed anchor below is noon-UTC on Mon 2026-06-08,
 * which stays on 2026-06-08 across all real runner offsets. Expectations are
 * derived from the same local-date helpers so the assertions check the CONTRACT
 * (trailing = N month-buckets ending today; Sunday-anchored weeks) rather than
 * hard-coded strings that would assume one timezone.
 */

import { describe, it, expect } from 'vitest'
import {
  resolveWindow,
  validateSpec,
  describeSpec,
  weeklyAvgByBucket,
  planMinistryFilter,
  compileAndRun,
  type MinistryTagRow,
} from './compile'
import type { WidgetSpec } from './spec'

const NOW = new Date('2026-06-08T12:00:00Z')

// Local-date helpers mirroring compile.ts, so expectations track the function's
// own calendar arithmetic regardless of the runner's timezone.
function localToday(d: Date): string {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  return x.toISOString().split('T')[0]
}
function localMonthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function localYearStart(d: Date): string {
  return `${d.getFullYear()}-01-01`
}
function localWeekStart(d: Date): string {
  const day = d.getDay()
  const sun = new Date(d)
  sun.setDate(d.getDate() - day)
  sun.setHours(0, 0, 0, 0)
  return sun.toISOString().split('T')[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveWindow
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveWindow', () => {
  it('trailing 12 months → first day 11 months back from current month start → today', () => {
    const r = resolveWindow({ window: 'trailing', count: 12, unit: 'month' }, NOW)
    // Current month start is June; 11 months back = July of the prior year.
    const ms = localMonthStart(NOW) // 2026-06-01
    const [y, m] = ms.split('-').map(Number)
    const startMonthIndex = m - 1 - 11 // back 11 months
    const sy = y + Math.floor(startMonthIndex / 12)
    const sm = ((startMonthIndex % 12) + 12) % 12
    const expectedStart = `${sy}-${String(sm + 1).padStart(2, '0')}-01`
    expect(r.start).toBe(expectedStart) // 2025-07-01
    expect(r.end).toBe(localToday(NOW)) // 2026-06-08
    // 12 inclusive month buckets: Jul'25 … Jun'26.
    expect(r.start.slice(5, 7)).toBe('07')
    expect(r.start.slice(0, 4)).toBe(String(y - 1))
  })

  it('trailing 1 month → current month start → today (count-1 = 0 steps back)', () => {
    const r = resolveWindow({ window: 'trailing', count: 1, unit: 'month' }, NOW)
    expect(r.start).toBe(localMonthStart(NOW))
    expect(r.end).toBe(localToday(NOW))
  })

  it('trailing 12 weeks → 11 weeks back from this Sunday → today', () => {
    const r = resolveWindow({ window: 'trailing', count: 12, unit: 'week' }, NOW)
    const thisSun = localWeekStart(NOW)
    const d = new Date(thisSun + 'T12:00:00')
    d.setDate(d.getDate() - 11 * 7)
    const expectedStart = d.toISOString().split('T')[0]
    expect(r.start).toBe(expectedStart)
    expect(r.end).toBe(localToday(NOW))
  })

  it('current month → 1st of current month → today', () => {
    const r = resolveWindow({ window: 'current', unit: 'month' }, NOW)
    expect(r.start).toBe(localMonthStart(NOW)) // 2026-06-01
    expect(r.end).toBe(localToday(NOW)) // 2026-06-08
  })

  it('current week → this Sunday → today', () => {
    const r = resolveWindow({ window: 'current', unit: 'week' }, NOW)
    expect(r.start).toBe(localWeekStart(NOW))
    expect(r.end).toBe(localToday(NOW))
  })

  it('ytd → Jan 1 of this year → today', () => {
    const r = resolveWindow({ window: 'ytd' }, NOW)
    expect(r.start).toBe(localYearStart(NOW)) // 2026-01-01
    expect(r.end).toBe(localToday(NOW))
  })

  it('prior_year → Jan 1 last year → same month/day last year', () => {
    const r = resolveWindow({ window: 'prior_year' }, NOW)
    expect(r.start).toBe(`${NOW.getFullYear() - 1}-01-01`) // 2025-01-01
    // end mirrors today one year back.
    const today = localToday(NOW)
    expect(r.end).toBe(`${Number(today.slice(0, 4)) - 1}${today.slice(4)}`) // 2025-06-08
  })

  it('custom → returns start/end verbatim', () => {
    const r = resolveWindow({ window: 'custom', start: '2024-01-01', end: '2024-12-31' }, NOW)
    expect(r).toEqual({ start: '2024-01-01', end: '2024-12-31' })
  })

  it('is pure — does not mutate the passed now', () => {
    const before = NOW.getTime()
    resolveWindow({ window: 'trailing', count: 6, unit: 'month' }, NOW)
    expect(NOW.getTime()).toBe(before)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// validateSpec
// ─────────────────────────────────────────────────────────────────────────────

const GOOD: WidgetSpec = {
  version: 1,
  source: 'attendance_per_occurrence',
  measure: { reporting_tag_code: 'ATTENDANCE', agg: 'avg' },
  dimensions: [{ field: 'time', bucket: 'month' }],
  filters: { date: { window: 'trailing', count: 12, unit: 'month' } },
  viz: { kind: 'line', xKey: 'bucket', yKeys: ['value'], title: 'Attendance — last 12 months' },
}

describe('validateSpec', () => {
  it('accepts a well-formed spec', () => {
    const res = validateSpec(GOOD)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.spec.source).toBe('attendance_per_occurrence')
  })

  it('accepts a two-dimension pivot spec', () => {
    const pivot: WidgetSpec = {
      version: 1,
      source: 'metric_entries_readable',
      measure: { reporting_tag_code: 'VOLUNTEERS', agg: 'sum' },
      dimensions: [
        { field: 'time', bucket: 'month' },
        { field: 'ministry_tag', by: 'code' },
      ],
      viz: { kind: 'pivot', title: 'Volunteers by ministry by month' },
    }
    const res = validateSpec(pivot)
    expect(res.ok).toBe(true)
  })

  it('accepts a ratio spec', () => {
    const ratio: WidgetSpec = {
      version: 1,
      source: 'metric_entries_readable',
      measure: { reporting_tag_code: 'VOLUNTEERS', agg: 'sum' },
      dimensions: [{ field: 'time', bucket: 'month' }],
      ratio: {
        numerator: { reporting_tag_code: 'VOLUNTEERS', agg: 'sum' },
        denominator: { reporting_tag_code: 'ATTENDANCE', agg: 'sum' },
        scale: 100,
      },
      viz: { kind: 'line', title: 'Volunteers per attendee %' },
    }
    expect(validateSpec(ratio).ok).toBe(true)
  })

  it('rejects a non-object', () => {
    const res = validateSpec(null)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors).toContain('spec must be an object')
  })

  it('rejects an unknown source', () => {
    const res = validateSpec({ ...GOOD, source: 'service_occurrences' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => e.startsWith('source must be one of'))).toBe(true)
  })

  it('rejects an unknown reporting_tag_code', () => {
    const res = validateSpec({ ...GOOD, measure: { reporting_tag_code: 'BAPTISMS', agg: 'sum' } })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => e.includes('reporting_tag_code'))).toBe(true)
  })

  it('rejects an unknown agg', () => {
    const res = validateSpec({ ...GOOD, measure: { reporting_tag_code: 'ATTENDANCE', agg: 'median' } })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => e.includes('.agg must be'))).toBe(true)
  })

  it('rejects more than 2 dimensions', () => {
    const res = validateSpec({
      ...GOOD,
      dimensions: [
        { field: 'time', bucket: 'month' },
        { field: 'ministry_tag', by: 'code' },
        { field: 'metric', by: 'code' },
      ],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => e.includes('at most 2'))).toBe(true)
  })

  it('rejects a categorical dimension grouped by something other than code', () => {
    const res = validateSpec({
      ...GOOD,
      dimensions: [{ field: 'ministry_tag', by: 'name' }],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => e.includes('must be "code"'))).toBe(true)
  })

  it('rejects an unknown dimension field', () => {
    const res = validateSpec({
      ...GOOD,
      dimensions: [{ field: 'campus_group', by: 'code' }],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => e.includes('.field must be one of'))).toBe(true)
  })

  it('rejects a custom window with a malformed date', () => {
    const res = validateSpec({
      ...GOOD,
      filters: { date: { window: 'custom', start: '01/01/2024', end: '2024-12-31' } },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => e.includes('start must be YYYY-MM-DD'))).toBe(true)
  })

  it('rejects a missing viz title', () => {
    const res = validateSpec({ ...GOOD, viz: { kind: 'line', title: '' } })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => e.includes('viz.title'))).toBe(true)
  })

  it('rejects a wrong version', () => {
    const res = validateSpec({ ...GOOD, version: 2 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors).toContain('version must be 1')
  })

  it('accumulates multiple errors at once', () => {
    const res = validateSpec({ version: 9, source: 'x', measure: {}, dimensions: 'no', viz: {} })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.length).toBeGreaterThan(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// describeSpec — "last 12 months, weekly avg, in month buckets"
// ─────────────────────────────────────────────────────────────────────────────

describe('describeSpec', () => {
  const spec: WidgetSpec = {
    version: 1,
    source: 'attendance_per_occurrence',
    measure: { reporting_tag_code: 'ATTENDANCE', agg: 'avg' },
    dimensions: [{ field: 'time', bucket: 'month' }],
    filters: { date: { window: 'trailing', count: 12, unit: 'month' } },
    viz: { kind: 'line', xKey: 'bucket', yKeys: ['value'], title: 'Attendance' },
  }
  const resolved = { start: '2025-07-01', end: '2026-06-08' }

  it('summing names the attendance breakout, averaging, NULL-skip + active-only', () => {
    const e = describeSpec(spec, resolved)
    expect(e.summing).toContain('adults + kids + youth + other')
    expect(e.summing).toContain('averaged per week')
    expect(e.summing.toLowerCase()).toContain('blanks skipped')
    expect(e.summing.toLowerCase()).toContain('cancelled services excluded')
  })

  it('refresh states the rolling 12-month window in plain words', () => {
    const e = describeSpec(spec, resolved)
    expect(e.refresh).toBe('Rolling — always the last 12 months.')
  })

  it('currentlyShowing renders the resolved range + monthly bucket', () => {
    const e = describeSpec(spec, resolved)
    expect(e.currentlyShowing).toBe('Jul 2025 – Jun 2026, monthly')
  })

  it('included defaults to "all" when no scope filters are set', () => {
    const e = describeSpec(spec, resolved)
    expect(e.included).toBe('All ministries and services.')
  })

  it('included lists ministry + service scope when filtered', () => {
    const scoped: WidgetSpec = {
      ...spec,
      filters: {
        date: { window: 'trailing', count: 12, unit: 'month' },
        ministry_tag_codes: ['EXPERIENCE', 'LIFEKIDS'],
        service_template_codes: ['1'],
      },
    }
    const e = describeSpec(scoped, resolved)
    expect(e.included).toContain('EXPERIENCE, LIFEKIDS')
    expect(e.included).toContain('services: 1')
  })

  it('ytd refresh + sum wording for a summed giving widget', () => {
    const giving: WidgetSpec = {
      version: 1,
      source: 'giving_per_week',
      measure: { reporting_tag_code: 'GIVING', agg: 'sum' },
      dimensions: [{ field: 'time', bucket: 'week' }],
      filters: { date: { window: 'ytd' } },
      viz: { kind: 'bar', title: 'Giving YTD' },
    }
    const e = describeSpec(giving, { start: '2026-01-01', end: '2026-06-08' })
    expect(e.refresh).toBe('Rolling — year so far, from January 1st.')
    expect(e.currentlyShowing).toBe('Jan 2026 – Jun 2026, weekly')
    expect(e.summing.toLowerCase()).toContain('giving')
  })

  it('ratio summing shows percentage wording when scale is 100', () => {
    const ratio: WidgetSpec = {
      version: 1,
      source: 'metric_entries_readable',
      measure: { reporting_tag_code: 'VOLUNTEERS', agg: 'sum' },
      dimensions: [{ field: 'time', bucket: 'month' }],
      ratio: {
        numerator: { reporting_tag_code: 'VOLUNTEERS', agg: 'sum' },
        denominator: { reporting_tag_code: 'ATTENDANCE', agg: 'sum' },
        scale: 100,
      },
      viz: { kind: 'line', title: 'Vol per attendee' },
    }
    const e = describeSpec(ratio, resolved)
    expect(e.summing).toContain('Volunteers ÷ Attendance')
    expect(e.summing).toContain('percentage')
  })
})

describe('weeklyAvgByBucket — multi-service Sunday roll-up', () => {
  // Minimal plan stub: value = row.v, date = row.d (other SourcePlan members unused).
  const plan = {
    valueOf: (r: Record<string, unknown>) => (r.v as number | null) ?? null,
    dateOf: (r: Record<string, unknown>) => (r.d as string | null) ?? null,
  } as unknown as Parameters<typeof weeklyAvgByBucket>[1]

  it('SUMS both Sunday services within a week before averaging the weeks (not a per-occurrence avg)', () => {
    const raw = [
      { d: '2026-05-03', v: 243 }, { d: '2026-05-03', v: 230 }, // week total 473
      { d: '2026-05-10', v: 269 }, { d: '2026-05-10', v: 242 }, // week total 511
    ]
    // Correct = avg(473, 511) = 492. The old bug averaged the 4 rows → ~246 (one service's worth).
    expect(weeklyAvgByBucket(raw, plan, 'month')).toEqual([['2026-05', (473 + 511) / 2]])
  })

  it('does not halve a week that had a single service', () => {
    const raw = [
      { d: '2026-05-03', v: 243 }, { d: '2026-05-03', v: 230 }, // 473
      { d: '2026-05-31', v: 250 },                               // 250 (one service that week)
    ]
    expect(weeklyAvgByBucket(raw, plan, 'month')).toEqual([['2026-05', (473 + 250) / 2]])
  })

  it('ignores null values when summing the week', () => {
    const raw = [
      { d: '2026-05-03', v: 243 }, { d: '2026-05-03', v: null },
      { d: '2026-05-10', v: 200 },
    ]
    expect(weeklyAvgByBucket(raw, plan, 'month')).toEqual([['2026-05', (243 + 200) / 2]])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// planMinistryFilter — container ministry (mirrored metrics, 0051)
// ─────────────────────────────────────────────────────────────────────────────

describe('planMinistryFilter', () => {
  // Kids is a container: its data lives in Crawlers + Walkers (children). Experience
  // is a plain ministry with no children.
  const tags: MinistryTagRow[] = [
    { id: 'k0', code: 'KIDS',       parent_tag_id: null, archived_at: null },
    { id: 'k1', code: 'CRAWLERS',   parent_tag_id: 'k0', archived_at: null },
    { id: 'k2', code: 'WALKERS',    parent_tag_id: 'k0', archived_at: null },
    { id: 'k3', code: 'OLD_GROUP',  parent_tag_id: 'k0', archived_at: '2026-01-01T00:00:00Z' },
    { id: 'e0', code: 'EXPERIENCE', parent_tag_id: null, archived_at: null },
  ]

  it('expands a container ministry to include its live child groups', () => {
    const r = planMinistryFilter(['KIDS'], tags)
    expect(r.codes.sort()).toEqual(['CRAWLERS', 'KIDS', 'WALKERS'])
    expect(r.containerCodes).toEqual(['KIDS'])
    expect(r.unknown).toBe(false)
  })

  it('does not include an archived child group in the expansion', () => {
    const r = planMinistryFilter(['KIDS'], tags)
    expect(r.codes).not.toContain('OLD_GROUP')
  })

  it('leaves a plain (childless) ministry untouched and unflagged', () => {
    const r = planMinistryFilter(['EXPERIENCE'], tags)
    expect(r.codes).toEqual(['EXPERIENCE'])
    expect(r.containerCodes).toEqual([])
  })

  it('does not flag a child group itself as a container', () => {
    const r = planMinistryFilter(['CRAWLERS'], tags)
    expect(r.codes).toEqual(['CRAWLERS'])
    expect(r.containerCodes).toEqual([])
  })

  it('reports unknown when no requested code matches a live tag', () => {
    const r = planMinistryFilter(['NOPE'], tags)
    expect(r.unknown).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// compileAndRun — container-ministry empty-result hint (0051)
//
// compileAndRun needs a Supabase client; the pure functions above are the primary
// coverage. Here we use a minimal chainable stub to prove the ONE new integration
// behavior: a ministry filter that resolves to a container and comes back empty
// returns an explanatory `error`, not silent "No data" rows.
// ─────────────────────────────────────────────────────────────────────────────

/** A thenable PostgREST-style query stub: every builder method returns `this`;
 *  awaiting it (or .range()) yields { data, error }. The service_tags read is
 *  awaited directly; the view read ends in .range(). */
function makeSupabaseStub(tagRows: unknown[], viewRows: unknown[]) {
  const make = (rows: unknown[]) => {
    const q: Record<string, unknown> = {}
    const passthrough = () => q
    for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'not', 'is']) q[m] = passthrough
    // range() resolves the view fetch.
    q.range = () => Promise.resolve({ data: rows, error: null })
    // Make the builder itself awaitable (service_tags read awaits without .range()).
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
    return q
  }
  return {
    from: (table: string) => make(table === 'service_tags' ? tagRows : viewRows),
  } as unknown as Parameters<typeof compileAndRun>[0]['supabase']
}

describe('compileAndRun — container-ministry hint', () => {
  const KIDS_TAGS = [
    { id: 'k0', code: 'KIDS',     parent_tag_id: null, archived_at: null },
    { id: 'k1', code: 'CRAWLERS', parent_tag_id: 'k0', archived_at: null },
    { id: 'k2', code: 'WALKERS',  parent_tag_id: 'k0', archived_at: null },
  ]
  const spec: WidgetSpec = {
    version: 1,
    source: 'metric_entries_readable',
    measure: { reporting_tag_code: 'ATTENDANCE', agg: 'sum' },
    dimensions: [],
    filters: {
      date: { window: 'trailing', count: 12, unit: 'month' },
      ministry_tag_codes: ['KIDS'],
    },
    viz: { kind: 'metric_card', title: 'Kids attendance' },
  }

  it('returns an explanatory error (not empty rows) for an empty container filter', async () => {
    const supabase = makeSupabaseStub(KIDS_TAGS, []) // container matched, but no entries in-window
    const res = await compileAndRun({ supabase, churchId: 'c1', spec, now: NOW })
    expect(res.rows).toEqual([])
    expect(res.error).toBeDefined()
    expect(res.error).toMatch(/KIDS/)
    expect(res.error).toMatch(/parent ministry|subgroups|roll-up/i)
  })

  it('does NOT emit the hint when the container filter returns data', async () => {
    const viewRows = [
      { effective_date: '2026-05-03', value: 40, is_not_applicable: false, reporting_tag_code: 'ATTENDANCE', ministry_tag_code: 'CRAWLERS', service_instance_id: null },
    ]
    const supabase = makeSupabaseStub(KIDS_TAGS, viewRows)
    const res = await compileAndRun({ supabase, churchId: 'c1', spec, now: NOW })
    expect(res.error).toBeUndefined()
    expect(res.rows).toEqual([{ value: 40 }])
  })
})
