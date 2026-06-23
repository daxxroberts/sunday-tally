import { describe, it, expect } from 'vitest'
import {
  resolveTotals,
  primaryTotal,
  describeTotalRule,
  DEFAULT_TOTALS,
  type TotalRule,
} from './totals'

describe('resolveTotals', () => {
  it('returns the seeded default when nothing is saved', () => {
    expect(resolveTotals(null)).toEqual(resolveTotals({}))
    const def = resolveTotals(undefined)
    expect(def.map((r) => r.id)).toEqual(['total_attendance', 'total_present'])
    expect(def.find((r) => r.id === 'total_present')?.reportingTypes).toEqual(['ATTENDANCE', 'VOLUNTEERS'])
  })

  it('exactly one rule is primary in the default set', () => {
    expect(resolveTotals({}).filter((r) => r.isPrimary)).toHaveLength(1)
  })

  it('returns saved rules when present and valid', () => {
    const saved: TotalRule[] = [
      { id: 'a', name: 'Adults only', reportingTypes: ['ATTENDANCE'], ministries: ['t1'], rollup: 'sum', isPrimary: true },
    ]
    expect(resolveTotals({ totals: saved })).toEqual(saved)
  })

  it('drops malformed rules and falls back to default if none survive', () => {
    const out = resolveTotals({ totals: [{ id: 'x' }, { name: 'no types', reportingTypes: [] }] })
    expect(out).toEqual(DEFAULT_TOTALS.map((r, i) => ({ ...r, isPrimary: i === 0 })))
  })

  it('forces a single primary when saved rules have zero or many', () => {
    const many: TotalRule[] = [
      { id: 'a', name: 'A', reportingTypes: ['ATTENDANCE'], ministries: 'all', rollup: 'sum', isPrimary: true },
      { id: 'b', name: 'B', reportingTypes: ['VOLUNTEERS'], ministries: 'all', rollup: 'sum', isPrimary: true },
    ]
    const out = resolveTotals({ totals: many })
    expect(out.filter((r) => r.isPrimary)).toHaveLength(1)
    expect(out[0].isPrimary).toBe(true) // first flagged wins
  })

  it('rejects an unknown reporting type', () => {
    const out = resolveTotals({ totals: [{ id: 'a', name: 'A', reportingTypes: ['BOGUS'], ministries: 'all', rollup: 'sum' }] })
    expect(out.map((r) => r.id)).toEqual(['total_attendance', 'total_present']) // fell back to default
  })
})

describe('primaryTotal / describeTotalRule', () => {
  it('picks the primary rule', () => {
    expect(primaryTotal(resolveTotals({}))?.id).toBe('total_attendance')
  })

  it('describes a rule in plain language', () => {
    const present = DEFAULT_TOTALS.find((r) => r.id === 'total_present')!
    expect(describeTotalRule(present)).toBe('Total Present = Attendance + Volunteers, all included ministries, weekly average')
  })
})
