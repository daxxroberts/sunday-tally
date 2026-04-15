// Dashboard query helpers — P14a, P14b, P14c
// D-033: three columns simultaneously | N72: YTD denominator = weeks with occurrences
// N73: delta = (current - prior) / prior × 100

import { createClient } from '@/lib/supabase/client'

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

  // Get distinct primary tags that have occurrences
  const { data: tagRows } = await supabase
    .from('service_occurrence_tags')
    .select('service_tag_id, service_tags(tag_name, tag_code)')
    .eq('service_occurrences.church_id', churchId)
    .not('service_tag_id', 'is', null)

  // Get all occurrences with attendance, volunteers, stats, giving
  const { data: occurrences } = await supabase
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

  if (!occurrences) return []

  // Get unique primary tags
  const primaryTagMap = new Map<string, string>() // tag_code → tag_name
  for (const occ of occurrences) {
    // @ts-expect-error join
    for (const ot of (occ.service_occurrence_tags ?? [])) {
      // @ts-expect-error join
      const tag = ot.service_tags
      if (tag && !tag.effective_start_date && !tag.effective_end_date) {
        primaryTagMap.set(tag.tag_code, tag.tag_name)
      }
    }
  }

  function attTotal(occ: typeof occurrences[0]): number | null {
    // @ts-expect-error join
    const ae = occ.attendance_entries?.[0]
    if (!ae || ae.main_attendance === null) return null
    return (ae.main_attendance ?? 0) + (ae.kids_attendance ?? 0) + (ae.youth_attendance ?? 0)
  }

  function volTotal(occ: typeof occurrences[0]): number | null {
    // @ts-expect-error join
    const ve = occ.volunteer_entries?.filter((v: {is_not_applicable: boolean}) => !v.is_not_applicable) ?? []
    if (ve.length === 0) return null
    // @ts-expect-error join
    return ve.reduce((s: number, v: {volunteer_count: number}) => s + (v.volunteer_count ?? 0), 0)
  }

  function statsTotal(occ: typeof occurrences[0]): number | null {
    // @ts-expect-error join
    const re = occ.response_entries?.filter((r: {is_not_applicable: boolean}) => !r.is_not_applicable) ?? []
    if (re.length === 0) return null
    // @ts-expect-error join
    return re.reduce((s: number, r: {stat_value: number}) => s + (r.stat_value ?? 0), 0)
  }

  function givingTotal(occ: typeof occurrences[0]): number | null {
    // @ts-expect-error join
    const ge = occ.giving_entries ?? []
    if (ge.length === 0) return null
    // @ts-expect-error join
    return ge.reduce((s: number, g: {giving_amount: string}) => s + parseFloat(g.giving_amount ?? '0'), 0)
  }

  function hasTag(occ: typeof occurrences[0], tagCode: string): boolean {
    // @ts-expect-error join
    return (occ.service_occurrence_tags ?? []).some((ot: {service_tags: {tag_code: string}}) => ot.service_tags?.tag_code === tagCode)
  }

  function inRange(occ: typeof occurrences[0], from: string, to: string): boolean {
    return occ.service_date >= from && occ.service_date <= to
  }

  function weekOf(dateStr: string): string {
    return weekStart(new Date(dateStr + 'T12:00:00'))
  }

  // Aggregate weekly totals for a tag
  function weeklyTotals(tagCode: string, metric: (occ: typeof occurrences[0]) => number | null, from: string, to: string): number[] {
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

  function weekSum(tagCode: string, metric: (occ: typeof occurrences[0]) => number | null, from: string, to: string): number | null {
    let total = 0; let found = false
    for (const occ of occurrences) {
      if (!inRange(occ, from, to)) continue
      if (!hasTag(occ, tagCode)) continue
      const val = metric(occ)
      if (val !== null) { total += val; found = true }
    }
    return found ? total : null
  }

  const result: TagRow[] = []

  for (const [tagCode, tagName] of primaryTagMap) {
    function buildComparisons(metric: (occ: typeof occurrences[0]) => number | null) {
      // P14a: this week vs last week
      const thisWk = weekSum(tagCode, metric, thisWeekStart, todayStr)
      const lastWk = weekSum(tagCode, metric, lastWeekStart, lastWeekEnd)
      const a = cv(thisWk, lastWk)

      // P14b: 4-wk avg vs prior 4-wk avg
      const cur4 = avg(weeklyTotals(tagCode, metric, fourWeeksAgo, lastWeekEnd))
      const pri4 = avg(weeklyTotals(tagCode, metric, eightWeeksAgo, new Date(new Date(fourWeeksAgo).getTime() - 86400000).toISOString().split('T')[0]))
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

    result.push(row)
  }

  return result
}
