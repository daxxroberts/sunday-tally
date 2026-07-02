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
    // Kids ministry with two child groups — the mirrored-metrics shape (0051).
    { id: 'k0', code: 'KIDS',        name: 'Kids',        tag_role: 'KIDS_MINISTRY',  parent_tag_id: null },
    { id: 'k1', code: 'CRAWLERS',    name: 'Crawlers',    tag_role: 'KIDS_MINISTRY',  parent_tag_id: 'k0' },
    { id: 'k2', code: 'WALKERS',     name: 'Walkers',     tag_role: 'KIDS_MINISTRY',  parent_tag_id: 'k0' },
  ],
  metrics: [
    { name: 'Experience Adult Attendance', ministry_tag_id: 't1', reporting_tag_code: 'ATTENDANCE',    scope: 'instance', metric_role: 'ministry_only' },
    { name: 'Baptisms',                    ministry_tag_id: 't1', reporting_tag_code: 'RESPONSE_STAT', scope: 'instance', metric_role: 'ministry_only' },
    { name: 'Offerings / Tithes',          ministry_tag_id: 't5', reporting_tag_code: 'GIVING',        scope: 'period',   metric_role: 'ministry_only' },
    // Template on Kids (legend), plus one mirror per group sharing its name.
    { name: 'Kids Attendance', ministry_tag_id: 'k0', reporting_tag_code: 'ATTENDANCE', scope: 'instance', metric_role: 'template' },
    { name: 'Kids Attendance', ministry_tag_id: 'k1', reporting_tag_code: 'ATTENDANCE', scope: 'instance', metric_role: 'mirror', parent_metric_id: 'kt' },
    { name: 'Kids Attendance', ministry_tag_id: 'k2', reporting_tag_code: 'ATTENDANCE', scope: 'instance', metric_role: 'mirror', parent_metric_id: 'kt' },
    // A count that lives only on one group and does NOT roll up.
    { name: 'Snacks Served', ministry_tag_id: 'k1', reporting_tag_code: 'RESPONSE_STAT', scope: 'instance', metric_role: 'group_only' },
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

  // ── mirrored-metrics role awareness (0051) ──────────────────────────────────

  it('presents a template ONCE on the ministry, annotated as rolling up', () => {
    // "Kids Attendance" appears once on the Kids line, flagged as a roll-up.
    expect(out).toMatch(/Kids Attendance — rolls up across groups/)
  })

  it('suppresses the per-group mirror copies (no phantom N+1 metrics)', () => {
    // The template's name must NOT reappear as a tracked count under a group.
    const crawlers = out.split('\n').find(l => l.includes('Crawlers (code CRAWLERS)')) ?? ''
    expect(crawlers).not.toContain('Kids Attendance')
    // And it appears exactly once in the whole pack (on the Kids ministry line).
    expect(out.match(/Kids Attendance/g)?.length ?? 0).toBe(1)
  })

  it('labels a group_only count as local (does not roll up)', () => {
    const crawlers = out.split('\n').find(l => l.includes('Crawlers (code CRAWLERS)')) ?? ''
    expect(crawlers).toMatch(/Snacks Served — local, does not roll up/)
  })

  it('treats a metric with no metric_role as ministry_only (pre-0051 rows)', () => {
    const legacy = formatContextPack({
      tags: [{ id: 'a', code: 'A', name: 'Alpha', tag_role: 'ADULT_SERVICE', parent_tag_id: null }],
      metrics: [{ name: 'Head Count', ministry_tag_id: 'a', reporting_tag_code: 'ATTENDANCE', scope: 'instance' }],
      excludedTagIds: [],
      givingCategories: [],
    })
    // Rendered as a plain count — no roll-up / local annotation.
    expect(legacy).toMatch(/Attendance \(Head Count\)/)
    expect(legacy).not.toContain('rolls up')
    expect(legacy).not.toContain('does not roll up')
  })

  it('annotates a per-count demographic override', () => {
    const withDemo = formatContextPack({
      tags: [{ id: 'a', code: 'A', name: 'Alpha', tag_role: 'ADULT_SERVICE', parent_tag_id: null }],
      metrics: [{ name: 'Serve Team', ministry_tag_id: 'a', reporting_tag_code: 'VOLUNTEERS', scope: 'instance', metric_role: 'ministry_only', counted_demographic: 'YOUTH_MINISTRY' }],
      excludedTagIds: [],
      givingCategories: [],
    })
    expect(withDemo).toMatch(/Serve Team \[counts Youth\]/)
  })
})
