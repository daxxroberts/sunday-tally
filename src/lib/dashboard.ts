// Dashboard query helpers — P14a, P14b, P14c
// D-033: three columns simultaneously | N72: YTD denominator = weeks with occurrences
// N73: delta = (current - prior) / prior × 100

import { createClient } from '@/lib/supabase/client'

interface OccRow {
  id: string
  service_date: string
  service_template_id: string
  attendance_entries: { main_attendance: number | null; kids_attendance: number | null; youth_attendance: number | null }[]
  volunteer_entries: { volunteer_count: number; is_not_applicable: boolean }[]
  response_entries: { stat_value: number | null; is_not_applicable: boolean }[]
  giving_entries: { giving_amount: string }[]
  service_occurrence_tags: {
    service_tag_id: string
    service_tags: { tag_code: string; tag_name: string; effective_start_date: string | null; effective_end_date: string | null }[]
  }[]
}

interface PeriodRow {
  service_tag_id: string
  response_category_id: string
  entry_period_type: string
  period_date: string
  stat_value: number | null
  is_not_applicable: boolean
}

export interface ComparisonValue {
  current: number | null
  prior: number | null
  delta: number | null   // percentage
}

export interface TagRow {
  tag_code: string
  tag_name: string
  attendance: { a: ComparisonValue; b: ComparisonValue; c: ComparisonValue }
  volunteers?: { a: ComparisonValue; b: ComparisonValue; c: ComparisonValue }
  stats?: { a: ComparisonValue; b: ComparisonValue; c: ComparisonValue }
  giving?: { a: ComparisonValue; b: ComparisonValue; c: ComparisonValue }
  dayStats?:   { a: ComparisonValue; b: ComparisonValue; c: ComparisonValue }
  weekStats?:  { a: ComparisonValue; b: ComparisonValue; c: ComparisonValue }
  monthStats?: { a: ComparisonValue; b: ComparisonValue; c: ComparisonValue }
}

function delta(current: number | null, prior: number | null): number | null {
  if (prior === null || prior === 0 || current === null) return null
  return Math.round(((current - prior) / prior) * 100)
}

function cv(current: number | null, prior: number | null): ComparisonValue {
  return { current, prior, delta: delta(current, prior) }
}

// Fetch all dashboard data for a church
export async function fetchDashboardData(churchId: string, includeVolunteers: boolean): Promise<TagRow[]> {
  const supabase = createClient()

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  // Week boundaries (Monday-based weeks via ISO)
  function weekStart(d: Date): string {
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    return monday.toISOString().split('T')[0]
  }

  const thisWeekStart = weekStart(now)
  const lastWeekStart = weekStart(new Date(now.getTime() - 7 * 86400000))
  const lastWeekEnd = new Date(new Date(thisWeekStart).getTime() - 86400000).toISOString().split('T')[0]
  const fourWeeksAgo = weekStart(new Date(now.getTime() - 28 * 86400000))
  const eightWeeksAgo = weekStart(new Date(now.getTime() - 56 * 86400000))
  const yearStart = `${now.getFullYear()}-01-01`
  const lastYearStart = `${now.getFullYear() - 1}-01-01`
  const lastYearSameWeek = weekStart(new Date(now.getTime() - 365 * 86400000))
  const fourWeeksAgoMinus1 = new Date(new Date(fourWeeksAgo).getTime() - 86400000).toISOString().split('T')[0]

  // Get distinct primary tags that have occurrences
  const { data: tagRows } = await supabase
    .from('service_occurrence_tags')
    .select('service_tag_id, service_tags(tag_name, tag_code), service_occurrences!inner(church_id)')
    .eq('service_occurrences.church_id', churchId)
    .not('service_tag_id', 'is', null)

  // Get all occurrences with attendance, volunteers, stats, giving
  const { data: rawOccurrences } = await supabase
    .from('service_occurrences')
    .select(`
      id, service_date, service_template_id,
      attendance_entries(main_attendance, kids_attendance, youth_attendance),
      volunteer_entries(volunteer_count, is_not_applicable),
      response_entries(stat_value, is_not_applicable),
      giving_entries(giving_amount),
      service_occurrence_tags(service_tag_id, service_tags(tag_code, tag_name, effective_start_date, effective_end_date))
    `)
    .eq('church_id', churchId)
    .eq('status', 'active')
    .gte('service_date', lastYearStart)
    .lte('service_date', todayStr)
    .order('service_date')

  // Get period entries (day/week/month stats — keyed by tag + period)
  const { data: rawPeriodEntries } = await supabase
    .from('church_period_entries')
    .select('service_tag_id, response_category_id, entry_period_type, period_date, stat_value, is_not_applicable')
    .eq('church_id', churchId)
    .gte('period_date', lastYearStart)
    .lte('period_date', todayStr)

  if (!rawOccurrences) return []
  const occurrences = (rawOccurrences as any) as OccRow[]
  const periodEntries = (rawPeriodEntries ?? []) as PeriodRow[]

  // Build tag_code → tag_id map from tagRows (for period entry lookup)
  const tagIdMap = new Map<string, string>()
  for (const tr of (tagRows ?? [])) {
    const tag = (tr.service_tags as any)?.[0]
    if (tag) tagIdMap.set(tag.tag_code, tr.service_tag_id)
  }

  // Get unique primary tags
  const primaryTagMap = new Map<string, string>() // tag_code → tag_name
  for (const occ of occurrences) {
    for (const ot of (occ.service_occurrence_tags ?? [])) {
      const tag = ot.service_tags?.[0]
      if (tag && !tag.effective_start_date && !tag.effective_end_date) {
        primaryTagMap.set(tag.tag_code, tag.tag_name)
      }
    }
  }

  function attTotal(occ: OccRow): number | null {
    const ae = occ.attendance_entries?.[0]
    if (!ae || ae.main_attendance === null) return null
    return (ae.main_attendance ?? 0) + (ae.kids_attendance ?? 0) + (ae.youth_attendance ?? 0)
  }

  function volTotal(occ: OccRow): number | null {
    const ve = occ.volunteer_entries?.filter(v => !v.is_not_applicable) ?? []
    if (ve.length === 0) return null
    return ve.reduce((s, v) => s + (v.volunteer_count ?? 0), 0)
  }

  function statsTotal(occ: OccRow): number | null {
    const re = occ.response_entries?.filter(r => !r.is_not_applicable) ?? []
    if (re.length === 0) return null
    return re.reduce((s, r) => s + (r.stat_value ?? 0), 0)
  }

  function givingTotal(occ: OccRow): number | null {
    const ge = occ.giving_entries ?? []
    if (ge.length === 0) return null
    return ge.reduce((s, g) => s + parseFloat(g.giving_amount ?? '0'), 0)
  }

  function hasTag(occ: OccRow, tagCode: string): boolean {
    return (occ.service_occurrence_tags ?? []).some(ot => ot.service_tags?.[0]?.tag_code === tagCode)
  }

  function inRange(occ: OccRow, from: string, to: string): boolean {
    return occ.service_date >= from && occ.service_date <= to
  }

  function weekOf(dateStr: string): string {
    return weekStart(new Date(dateStr + 'T12:00:00'))
  }

  // Aggregate weekly totals for a tag (from occurrence-keyed entries)
  function weeklyTotals(tagCode: string, metric: (occ: OccRow) => number | null, from: string, to: string): number[] {
    const byWeek = new Map<string, number>()
    for (const occ of occurrences) {
      if (!inRange(occ, from, to)) continue
      if (!hasTag(occ, tagCode)) continue
      const val = metric(occ)
      if (val === null) continue
      const wk = weekOf(occ.service_date)
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + val)
    }
    return Array.from(byWeek.values())
  }

  function avg(vals: number[]): number | null {
    if (vals.length === 0) return null
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
  }

  function weekSum(tagCode: string, metric: (occ: OccRow) => number | null, from: string, to: string): number | null {
    let total = 0; let found = false
    for (const occ of occurrences) {
      if (!inRange(occ, from, to)) continue
      if (!hasTag(occ, tagCode)) continue
      const val = metric(occ)
      if (val !== null) { total += val; found = true }
    }
    return found ? total : null
  }

  // Period entry helpers (for day/week/month stats)
  function periodWeeklyTotals(tagId: string, periodType: string, from: string, to: string): number[] {
    const byWeek = new Map<string, number>()
    for (const pe of periodEntries) {
      if (pe.service_tag_id !== tagId) continue
      if (pe.entry_period_type !== periodType) continue
      if (pe.is_not_applicable || pe.stat_value === null) continue
      if (pe.period_date < from || pe.period_date > to) continue
      const wk = weekOf(pe.period_date)
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + pe.stat_value)
    }
    return Array.from(byWeek.values())
  }

  function periodWeekSum(tagId: string, periodType: string, from: string, to: string): number | null {
    let total = 0; let found = false
    for (const pe of periodEntries) {
      if (pe.service_tag_id !== tagId) continue
      if (pe.entry_period_type !== periodType) continue
      if (pe.is_not_applicable || pe.stat_value === null) continue
      if (pe.period_date < from || pe.period_date > to) continue
      total += pe.stat_value; found = true
    }
    return found ? total : null
  }

  const result: TagRow[] = []

  for (const [tagCode, tagName] of primaryTagMap) {
    function buildComparisons(metric: (occ: OccRow) => number | null) {
      // P14a: this week vs last week
      const thisWk = weekSum(tagCode, metric, thisWeekStart, todayStr)
      const lastWk = weekSum(tagCode, metric, lastWeekStart, lastWeekEnd)
      const a = cv(thisWk, lastWk)

      // P14b: 4-wk avg vs prior 4-wk avg
      const cur4 = avg(weeklyTotals(tagCode, metric, fourWeeksAgo, lastWeekEnd))
      const pri4 = avg(weeklyTotals(tagCode, metric, eightWeeksAgo, fourWeeksAgoMinus1))
      const b = cv(cur4, pri4)

      // P14c: YTD avg vs prior YTD avg (N72: weeks with occurrences denominator)
      const ytdWeeks = weeklyTotals(tagCode, metric, yearStart, todayStr)
      const priorWeeks = weeklyTotals(tagCode, metric, lastYearStart, lastYearSameWeek)
      const c = cv(avg(ytdWeeks), avg(priorWeeks))

      return { a, b, c }
    }

    const row: TagRow = {
      tag_code: tagCode,
      tag_name: tagName,
      attendance: buildComparisons(attTotal),
    }
    if (includeVolunteers) row.volunteers = buildComparisons(volTotal)
    row.stats = buildComparisons(statsTotal)
    row.giving = buildComparisons(givingTotal)

    // Period stats (day/week/month — from church_period_entries)
    const tagId = tagIdMap.get(tagCode) ?? ''
    if (tagId) {
      function buildPeriodComparisons(periodType: string) {
        const thisWk = periodWeekSum(tagId, periodType, thisWeekStart, todayStr)
        const lastWk = periodWeekSum(tagId, periodType, lastWeekStart, lastWeekEnd)
        const a = cv(thisWk, lastWk)

        const cur4 = avg(periodWeeklyTotals(tagId, periodType, fourWeeksAgo, lastWeekEnd))
        const pri4 = avg(periodWeeklyTotals(tagId, periodType, eightWeeksAgo, fourWeeksAgoMinus1))
        const b = cv(cur4, pri4)

        const ytdWeeks   = periodWeeklyTotals(tagId, periodType, yearStart, todayStr)
        const priorWeeks = periodWeeklyTotals(tagId, periodType, lastYearStart, lastYearSameWeek)
        const c = cv(avg(ytdWeeks), avg(priorWeeks))
        return { a, b, c }
      }

      if (periodEntries.some(pe => pe.service_tag_id === tagId && pe.entry_period_type === 'day'))
        row.dayStats = buildPeriodComparisons('day')
      if (periodEntries.some(pe => pe.service_tag_id === tagId && pe.entry_period_type === 'week'))
        row.weekStats = buildPeriodComparisons('week')
      if (periodEntries.some(pe => pe.service_tag_id === tagId && pe.entry_period_type === 'month'))
        row.monthStats = buildPeriodComparisons('month')
    }

    result.push(row)
  }

  return result
}
