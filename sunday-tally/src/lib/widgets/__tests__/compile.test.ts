// Guards added in the widget-builder P0 pass (2026-06-20):
// - WS1.1 metric-isolation: a RESPONSE_STAT widget on the firehose must isolate the
//   stat (metric_names or a metric dimension) or it silently sums every stat.
//   VOLUNTEERS is exempt (volunteers are additive — a real total).
// - WS5 backwards custom date range (start > end) is rejected.
// - empty metric_names [] is rejected.

import { describe, it, expect } from 'vitest'
import { validateSpec } from '../compile'

const card = { kind: 'metric_card', title: 'X' }

describe('validateSpec — RESPONSE_STAT metric-isolation guard (WS1.1)', () => {
  const base = {
    version: 1,
    source: 'metric_entries_readable',
    measure: { reporting_tag_code: 'RESPONSE_STAT', agg: 'sum' },
    dimensions: [],
    viz: card,
  }

  it('rejects RESPONSE_STAT on the firehose with no metric_names and no metric dimension', () => {
    const r = validateSpec(base)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/isolate the stat/i)
  })

  it('allows RESPONSE_STAT when metric_names isolates the stat', () => {
    expect(validateSpec({ ...base, filters: { metric_names: ['Salvations'] } }).ok).toBe(true)
  })

  it('allows RESPONSE_STAT when a {field:"metric"} dimension isolates per-stat', () => {
    expect(validateSpec({ ...base, dimensions: [{ field: 'metric', by: 'code' }] }).ok).toBe(true)
  })

  it('exempts VOLUNTEERS on the firehose (additive total — no isolation required)', () => {
    expect(validateSpec({
      ...base,
      measure: { reporting_tag_code: 'VOLUNTEERS', agg: 'sum' },
    }).ok).toBe(true)
  })
})

describe('validateSpec — filter + window guards', () => {
  it('rejects an empty metric_names array', () => {
    const r = validateSpec({
      version: 1,
      source: 'metric_entries_readable',
      measure: { reporting_tag_code: 'ATTENDANCE', agg: 'sum' },
      dimensions: [],
      filters: { metric_names: [] },
      viz: card,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/at least one metric name/i)
  })

  it('rejects a backwards custom date range (start after end) — WS5', () => {
    const r = validateSpec({
      version: 1,
      source: 'attendance_per_occurrence',
      measure: { reporting_tag_code: 'ATTENDANCE', agg: 'sum' },
      dimensions: [],
      filters: { date: { window: 'custom', start: '2026-06-01', end: '2026-04-01' } },
      viz: { kind: 'line', title: 'X' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/backwards range/i)
  })

  it('allows a forward custom date range', () => {
    expect(validateSpec({
      version: 1,
      source: 'attendance_per_occurrence',
      measure: { reporting_tag_code: 'ATTENDANCE', agg: 'sum' },
      dimensions: [],
      filters: { date: { window: 'custom', start: '2026-01-01', end: '2026-06-30' } },
      viz: { kind: 'line', title: 'X' },
    }).ok).toBe(true)
  })
})
