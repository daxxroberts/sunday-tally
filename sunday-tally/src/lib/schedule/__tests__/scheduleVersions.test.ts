// FELIX gate (SAGE, 2026-06-19): the backwards-date hardening. Pins the rule
// that a superseded schedule version's end date is GREATEST(its own start, the
// new start) — never before its own start. This is the single source of truth
// shared by saveScheduleAction and the import writer; the integration test in
// import/__tests__/writers.test.ts proves the writer actually calls it.

import { describe, it, expect } from 'vitest'
import { clampScheduleEnd } from '../scheduleVersions'

describe('clampScheduleEnd — superseded schedule version end date', () => {
  it('forward edit: new version starts AFTER the old one → ends when the new one begins', () => {
    expect(clampScheduleEnd('2026-06-01', '2026-06-10')).toBe('2026-06-10')
  })

  it('same-day supersession: end equals start (zero-length, still valid end>=start)', () => {
    expect(clampScheduleEnd('2026-06-10', '2026-06-10')).toBe('2026-06-10')
  })

  it('THE BUG: new version backdated BEFORE the old one starts → end clamps up to the old start, never below it', () => {
    // Pre-fix this returned the new start (2026-06-07), producing end < start.
    const end = clampScheduleEnd('2026-06-14', '2026-06-07')
    expect(end).toBe('2026-06-14')
    expect(end >= '2026-06-14').toBe(true) // never an impossible range
  })

  it('never produces end < start, across a spread of orderings', () => {
    const cases: [string, string][] = [
      ['2026-01-01', '2026-12-31'],
      ['2026-12-31', '2026-01-01'],
      ['2026-06-15', '2026-06-15'],
      ['2025-02-28', '2026-02-28'],
      ['2026-02-28', '2025-02-28'],
    ]
    for (const [priorStart, newStart] of cases) {
      const end = clampScheduleEnd(priorStart, newStart)
      expect(end >= priorStart).toBe(true)
      // end is whichever of the two is later
      expect(end).toBe(priorStart > newStart ? priorStart : newStart)
    }
  })

  it('crosses year boundary correctly (lexical == chronological for ISO dates)', () => {
    expect(clampScheduleEnd('2025-12-31', '2026-01-01')).toBe('2026-01-01')
    expect(clampScheduleEnd('2026-01-01', '2025-12-31')).toBe('2026-01-01')
  })
})
