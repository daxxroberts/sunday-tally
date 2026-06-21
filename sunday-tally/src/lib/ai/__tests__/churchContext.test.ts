// WS4 — per-church structural/semantic context pack. The async assembler hits
// Supabase; the pure formatter is what we lock here (nesting, per-ministry tracks,
// church-wide giving, total-inclusion rule).

import { describe, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { formatContextPack, type ContextPackData } from '../churchContext'

const data: ContextPackData = {
  tags: [
    { id: 't1', code: 'EXPERIENCE',  name: 'Experience',  tag_role: 'ADULT_SERVICE',  parent_tag_id: null },
    { id: 't2', code: 'LIFEKIDS',    name: 'LifeKids',    tag_role: 'KIDS_MINISTRY',  parent_tag_id: null },
    { id: 't3', code: 'GROUPS',      name: 'Life Groups', tag_role: 'ADULT_SERVICE',  parent_tag_id: null },
    { id: 't4', code: 'TABORS',      name: 'Tabors',      tag_role: 'ADULT_SERVICE',  parent_tag_id: 't3' },
    { id: 't5', code: 'CHURCH_WIDE', name: 'Church-Wide', tag_role: 'OTHER',          parent_tag_id: null },
  ],
  metrics: [
    { name: 'Experience Adult Attendance', ministry_tag_id: 't1', reporting_tag_code: 'ATTENDANCE',    scope: 'instance' },
    { name: 'Baptisms',                    ministry_tag_id: 't1', reporting_tag_code: 'RESPONSE_STAT', scope: 'instance' },
    { name: 'Offerings / Tithes',          ministry_tag_id: 't5', reporting_tag_code: 'GIVING',        scope: 'period' },
  ],
  excludedTagIds: ['t5'],
  givingCategories: ['Offerings / Tithes'],
}

describe('formatContextPack', () => {
  const out = formatContextPack(data)

  it('renders a ministry with its code and audience word', () => {
    expect(out).toMatch(/Experience \(code EXPERIENCE\) · Adults/)
  })

  it('nests a child ministry under its parent (deeper indent)', () => {
    expect(out).toContain('Tabors (code TABORS)')
    const groupsLine = out.split('\n').findIndex(l => l.includes('Life Groups (code GROUPS)'))
    const taborsLine = out.split('\n').findIndex(l => l.includes('Tabors (code TABORS)'))
    expect(taborsLine).toBeGreaterThan(groupsLine)
    // child is indented further than its parent
    const indent = (l: string) => l.length - l.trimStart().length
    expect(indent(out.split('\n')[taborsLine])).toBeGreaterThan(indent(out.split('\n')[groupsLine]))
  })

  it('lists what a ministry tracks, grouped by reporting kind', () => {
    expect(out).toMatch(/Attendance \(Experience Adult Attendance\)/)
    expect(out).toMatch(/Stats \(Baptisms\)/)
  })

  it('calls out church-wide period giving', () => {
    expect(out).toMatch(/Counted once for the whole church each week.*Offerings \/ Tithes/)
  })

  it('states the total-inclusion rule with the excluded ministry name', () => {
    expect(out).toMatch(/Grand total EXCLUDES: Church-Wide/)
  })

  it('says all-included when nothing is excluded', () => {
    expect(formatContextPack({ ...data, excludedTagIds: [] })).toMatch(/Grand total includes every ministry/)
  })

  it('returns empty string when the church has no tags', () => {
    expect(formatContextPack({ tags: [], metrics: [], excludedTagIds: [], givingCategories: [] })).toBe('')
  })
})
