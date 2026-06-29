import { describe, it, expect } from 'vitest'
import { estimateStageACents, tooLargeMessage } from '../costEstimate'
import type { NormalizedSource } from '../sources'

function src(cols: number, kind: NormalizedSource['kind'] = 'csv'): NormalizedSource {
  return {
    kind,
    name:       `s${cols}`,
    columns:    Array.from({ length: cols }, (_, i) => `c${i}`),
    sampleRows: [],
    rowCount:   0,
  }
}

describe('estimateStageACents', () => {
  it('a typical 1-tab import fits the $2 trial budget with wide margin', () => {
    const e = estimateStageACents([src(12)])
    expect(e.tabs).toBe(1)
    expect(e.columns).toBe(12)
    expect(e.cents).toBeGreaterThan(0)
    expect(e.cents).toBeLessThan(200)
  })

  it('ignores row count entirely (deep history is free)', () => {
    const small = src(10); small.rowCount = 50
    const huge  = src(10); huge.rowCount = 50_000
    expect(estimateStageACents([small]).cents).toBe(estimateStageACents([huge]).cents)
  })

  it('excludes text and failed sources from the tab/column count', () => {
    const text:   NormalizedSource = { kind: 'text', name: 't', columns: [], sampleRows: [], rowCount: 0, rawText: 'desc' }
    const failed: NormalizedSource = { kind: 'csv',  name: 'f', columns: [], sampleRows: [], rowCount: 0, error: 'parse' }
    const e = estimateStageACents([src(10), text, failed])
    expect(e.tabs).toBe(1)
    expect(e.columns).toBe(10)
  })

  it('3 typical tabs still fit $2', () => {
    expect(estimateStageACents([src(12), src(12), src(12)]).cents).toBeLessThan(200)
  })

  it('blocks an extreme multi-tab workbook (8 wide tabs > $2)', () => {
    const many = Array.from({ length: 8 }, () => src(12))
    expect(estimateStageACents(many).cents).toBeGreaterThan(200)
  })
})

describe('tooLargeMessage', () => {
  it('leads with tabs for a multi-tab workbook', () => {
    expect(tooLargeMessage({ cents: 300, tabs: 9, columns: 100 })).toMatch(/9 tabs/)
  })
  it('falls back to columns for a single wide sheet', () => {
    expect(tooLargeMessage({ cents: 300, tabs: 1, columns: 60 })).toMatch(/60 columns/)
  })
})
