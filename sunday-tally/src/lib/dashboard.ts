// D1 Full Dashboard — v2.0 four-column data layer.
// IRIS_D1_ELEMENT_MAP.md v2.0 · P14a/b/c/d/e/f/g · D-033 revised · D-041 revised · D-044 superseded · D-053/054/055
//
// Columns (left to right):
//   w        = Current Week          (P14a)
//   m4       = Last 4-Wk Avg         (P14b)
//   ytd      = Current YTD Avg       (P14c — weeks-with-occurrences denominator, N72)
//   priorYtd = Prior YTD Avg         (P14d — same-week window last year, same denominator rule, D-055)
//
// Deltas (D-053): w vs m4, ytd vs priorYtd. No delta m4↔ytd.

import { createClient } from '@/lib/supabase/client'

// ─── Shape helpers ────────────────────────────────────────────────────────────

export interface FourWin {
  w: number | null
  m4: number | null
  ytd: number | null
  priorYtd: number | null
  delta_w_m4: number | null         // percent
  delta_ytd_prior: number | null    // percent
}

export interface AudienceStatRow {
  category_id: string
  category_name: string
  category_code: string
  values: FourWin
}

export interface AudienceSection {
  attendance: FourWin
  volunteers: FourWin      // zeroed + null when church.tracks_volunteers = false (UI hides)
  stats: AudienceStatRow[] // empty when church.tracks_responses = false (UI hides)
}

export interface VolunteerBreakoutRow {
  category_id: string
  category_name: string
  audience_group_code: 'MAIN' | 'KIDS' | 'YOUTH'
  sort_order: number
  values: FourWin
}

export interface VolunteerBreakout {
  total: FourWin
  rows: VolunteerBreakoutRow[]
}

export interface OtherStatRow {
  key: string                // category_id + '|' + (tag_code ?? '')
  category_id: string
  category_name: string
  tag_code: string | null    // null for service-scope stats; set for period entries
  values: FourWin
}

export interface DashboardSummary {
  grandTotal: FourWin
  adults: FourWin
  kids: FourWin
  youth: FourWin
  volunteers: FourWin
  firstTimeDecisions: FourWin
  giving: FourWin
}

export interface DashboardHighlights {
  attendance: { current: number; prior: number }
  giving:     { current: number; prior: number }
  volunteers: { current: number; prior: number }
}

export interface DashboardData {
  summary: DashboardSummary
  adults: AudienceSection
  kids: AudienceSection
  youth: AudienceSection
  volunteerBreakout: VolunteerBreakout
  otherStats: OtherStatRow[]
  highlights: DashboardHighlights
  hasAnyData: boolean
  weeksWithData: number             // for the E10 one-week-state gate
}

// ─── Raw row shapes (as returned by the joined Supabase selects) ─────────────

interface AttRow     { main_attendance: number | null; kids_attendance: number | null; youth_attendance: number | null }
interface VolCatRow  { id: string; category_name: string; audience_group_code: 'MAIN' | 'KIDS' | 'YOUTH'; sort_order: number; is_active: boolean }
interface VolEntryRow { volunteer_count: number; is_not_applicable: boolean; volunteer_categories: VolCatRow | VolCatRow[] | null }
interface RespCatRow { id: string; category_name: string; category_code: string; stat_scope: 'audience' | 'service' | 'day' | 'week' | 'month'; display_order: number; is_active: boolean }
interface RespEntryRow { stat_value: number | null; is_not_applicable: boolean; audience_group_code: 'MAIN' | 'KIDS' | 'YOUTH' | null; response_categories: RespCatRow | RespCatRow[] | null }
interface GivingEntryRow { giving_amount: string }

interface OccRow {
  id: string
  service_date: string
  attendance_entries: AttRow | AttRow[] | null  // unique constraint → PostgREST returns object, not array
  volunteer_entries: VolEntryRow[]
  response_entries: RespEntryRow[]
  giving_entries: GivingEntryRow[]
}

interface PeRow {
  service_tag_id: string
  entry_period_type: string
  period_date: string
  stat_value: number | null
  is_not_applicable: boolean
  service_tags:        { tag_code: string } | { tag_code: string }[] | null
  response_categories: RespCatRow | RespCatRow[] | null
}

function firstRelated<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// ─── Delta + rounding ─────────────────────────────────────────────────────────

function delta(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null
  return Math.round(((current - prior) / prior) * 100)
}

function roundOrNull(n: number | null): number | null {
  return n === null ? null : Math.round(n)
}

// ─── Date boundaries ──────────────────────────────────────────────────────────

interface Boundaries {
  today: string
  thisWeekStart: string       // Sunday of current week (Sun→Sat buckets — church ops week)
  lastWeekEnd: string         // Saturday before thisWeekStart
  fourWksAgoStart: string     // Sunday 4 weeks before thisWeekStart
  yearStart: string           // Jan 1 of current year
  lastYearStart: string       // Jan 1 of prior year
  lastYearSameWeek: string    // Sunday of the same week, one year ago
}

// Sunday-starting week bucket. Sunday is both the start of the week AND the
// primary service day — a service on Sunday 4/12 lands in week starting 4/12,
// so viewing mid-week (Wed/Thu/Fri) shows that Sunday's numbers as Current Week.
function weekStartOf(d: Date): string {
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - day)
  sunday.setHours(0, 0, 0, 0)
  return sunday.toISOString().split('T')[0]
}

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function buildBoundaries(now: Date): Boundaries {
  const today = now.toISOString().split('T')[0]
  const thisWeekStart = weekStartOf(now)
  const lastWeekEnd = shiftDays(thisWeekStart, -1)
  const fourWksAgoStart = shiftDays(thisWeekStart, -28)
  const yearStart = `${now.getFullYear()}-01-01`
  const lastYearStart = `${now.getFullYear() - 1}-01-01`
  const priorYear = new Date(now)
  priorYear.setFullYear(priorYear.getFullYear() - 1)
  const lastYearSameWeek = weekStartOf(priorYear)
  return { today, thisWeekStart, lastWeekEnd, fourWksAgoStart, yearStart, lastYearStart, lastYearSameWeek }
}

function weekOf(dateStr: string): string {
  return weekStartOf(new Date(dateStr + 'T12:00:00'))
}

// ─── Core aggregation ─────────────────────────────────────────────────────────

/**
 * Given a Map of weekStart → value, assemble a FourWin across the time boundaries.
 * Rule 4 (NULL ≠ zero) is enforced by never inserting a bucket for a NULL metric
 * (callers must skip null values before calling set/update on the map).
 */
function fourWinFromWeekly(weekly: Map<string, number>, b: Boundaries): FourWin {
  // Col 1 — Current Week: the single bucket for thisWeekStart
  const w = weekly.has(b.thisWeekStart) ? weekly.get(b.thisWeekStart)! : null

  // Col 2 — Last 4-Wk Avg: weeks in [fourWksAgoStart, lastWeekEnd], weeks-with-data denominator (N72 extension)
  const last4: number[] = []
  for (const [wk, v] of weekly) {
    if (wk >= b.fourWksAgoStart && wk <= b.lastWeekEnd) last4.push(v)
  }
  const m4 = last4.length > 0 ? last4.reduce((s, x) => s + x, 0) / last4.length : null

  // Col 3 — Current YTD Avg: weeks in [yearStart, thisWeekStart], weeks-with-data denominator (N72)
  const ytdVals: number[] = []
  for (const [wk, v] of weekly) {
    if (wk >= b.yearStart && wk <= b.thisWeekStart) ytdVals.push(v)
  }
  const ytd = ytdVals.length > 0 ? ytdVals.reduce((s, x) => s + x, 0) / ytdVals.length : null

  // Col 4 — Prior YTD Avg: weeks in [lastYearStart, lastYearSameWeek], same denominator rule (D-055)
  const priorVals: number[] = []
  for (const [wk, v] of weekly) {
    if (wk >= b.lastYearStart && wk <= b.lastYearSameWeek) priorVals.push(v)
  }
  const priorYtd = priorVals.length > 0 ? priorVals.reduce((s, x) => s + x, 0) / priorVals.length : null

  const wR = roundOrNull(w)
  const m4R = roundOrNull(m4)
  const ytdR = roundOrNull(ytd)
  const priorR = roundOrNull(priorYtd)

  return {
    w: wR, m4: m4R, ytd: ytdR, priorYtd: priorR,
    delta_w_m4: delta(wR, m4R),
    delta_ytd_prior: delta(ytdR, priorR),
  }
}

/**
 * Build a weekly Map by summing `value(occ)` per week. Null values are skipped
 * (Rule 4) — they do not become 0 buckets and do not drag averages down.
 */
function buildWeekly(
  occurrences: OccRow[],
  value: (occ: OccRow) => number | null,
): Map<string, number> {
  const byWeek = new Map<string, number>()
  for (const occ of occurrences) {
    const v = value(occ)
    if (v === null) continue
    const wk = weekOf(occ.service_date)
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + v)
  }
  return byWeek
}

// ─── Per-occurrence metric extractors ─────────────────────────────────────────
// Rule 4: any NULL → return null (don't COALESCE to 0).

function attMain(occ: OccRow): number | null {
  const ae = firstRelated(occ.attendance_entries)
  if (!ae || ae.main_attendance === null) return null
  return ae.main_attendance
}
function attKids(occ: OccRow): number | null {
  const ae = firstRelated(occ.attendance_entries)
  if (!ae || ae.kids_attendance === null) return null
  return ae.kids_attendance
}
function attYouth(occ: OccRow): number | null {
  const ae = firstRelated(occ.attendance_entries)
  if (!ae || ae.youth_attendance === null) return null
  return ae.youth_attendance
}

function attGrandTotal(occ: OccRow, tracksMain: boolean): number | null {
  // Grand total (D-055): MAIN + KIDS + YOUTH per occurrence.
  // NULL-aware: if the primary tracked audience is null, treat as not entered.
  // Missing audiences (tracked = false) are treated as 0 contribution.
  const ae = firstRelated(occ.attendance_entries)
  if (!ae) return null
  if (tracksMain && ae.main_attendance === null) return null
  if (!tracksMain && ae.kids_attendance === null && ae.youth_attendance === null) return null
  return (tracksMain ? (ae.main_attendance ?? 0) : 0) + (ae.kids_attendance ?? 0) + (ae.youth_attendance ?? 0)
}

function volTotalForAudience(audience: 'MAIN' | 'KIDS' | 'YOUTH' | null, occ: OccRow): number | null {
  // audience = null → all audiences (total volunteers).
  // Rule 3: exclude is_not_applicable. Missing rows → null (not entered).
  const entries = occ.volunteer_entries ?? []
  const filtered = entries.filter(ve => {
    if (ve.is_not_applicable) return false
    if (audience === null) return true
    const cat = firstRelated(ve.volunteer_categories)
    return cat?.audience_group_code === audience
  })
  if (filtered.length === 0) return null
  return filtered.reduce((s, ve) => s + (ve.volunteer_count ?? 0), 0)
}

function givingTotal(occ: OccRow): number | null {
  // Rule 5: SUM giving_entries. Missing rows → null.
  const ge = occ.giving_entries ?? []
  if (ge.length === 0) return null
  return ge.reduce((s, g) => s + parseFloat(g.giving_amount ?? '0'), 0)
}

function firstTimeDecisionsTotal(occ: OccRow): number | null {
  // Sum FIRST_TIME_DECISION stat_value across all audiences for this occurrence.
  // Null when no such entries exist OR all matching entries are N/A.
  const entries = occ.response_entries ?? []
  let sum = 0
  let found = false
  for (const re of entries) {
    if (re.is_not_applicable || re.stat_value === null) continue
    const cat = firstRelated(re.response_categories)
    if (cat?.category_code !== 'FIRST_TIME_DECISION') continue
    sum += re.stat_value
    found = true
  }
  return found ? sum : null
}

// ─── Main fetcher ─────────────────────────────────────────────────────────────

export async function fetchDashboardData(
  churchId: string,
  tracks: { tracks_main_attendance: boolean; tracks_volunteers: boolean; tracks_responses: boolean; tracks_giving: boolean },
): Promise<DashboardData> {
  const supabase = createClient()
  const b = buildBoundaries(new Date())

  // ── One deep-select pulls every occurrence-keyed fact for the last year+ ──
  // RLS already scopes to the caller's church(es); we still filter by churchId and active.
  const { data: rawOccurrences, error: occErr } = await supabase
    .from('service_occurrences')
    .select(`
      id, service_date,
      attendance_entries(main_attendance, kids_attendance, youth_attendance),
      volunteer_entries(
        volunteer_count, is_not_applicable,
        volunteer_categories(id, category_name, audience_group_code, sort_order, is_active)
      ),
      response_entries(
        stat_value, is_not_applicable, audience_group_code,
        response_categories(id, category_name, category_code, stat_scope, display_order, is_active)
      ),
      giving_entries(giving_amount)
    `)
    .eq('church_id', churchId)
    .eq('status', 'active')                   // Rule 1
    .gte('service_date', b.lastYearStart)
    .lte('service_date', b.today)
    .order('service_date')

  if (occErr) console.error('[dashboard] service_occurrences fetch failed:', occErr)

  const { data: rawPeriodEntries, error: peErr } = await supabase
    .from('church_period_entries')
    .select(`
      service_tag_id, entry_period_type, period_date, stat_value, is_not_applicable,
      service_tags(tag_code),
      response_categories(id, category_name, category_code, stat_scope, display_order, is_active)
    `)
    .eq('church_id', churchId)
    .gte('period_date', b.lastYearStart)
    .lte('period_date', b.today)

  if (peErr) console.error('[dashboard] church_period_entries fetch failed:', peErr)

  const occurrences = ((rawOccurrences ?? []) as unknown) as OccRow[]
  const periodEntries = ((rawPeriodEntries ?? []) as unknown) as PeRow[]

  // Empty-data short-circuit: still return a fully shaped object so UI can render empty state.
  const hasAnyData = occurrences.length > 0 || periodEntries.length > 0
  const weeksWithData = new Set<string>(occurrences.map(o => weekOf(o.service_date))).size

  // ── KPI highlight cards (v1.0 carry) — this week vs last week totals ──
  const lastWeekStart = shiftDays(b.thisWeekStart, -7)
  function rangeSum(metric: (occ: OccRow) => number | null, from: string, to: string): number {
    let total = 0
    for (const occ of occurrences) {
      if (occ.service_date < from || occ.service_date > to) continue
      const v = metric(occ)
      if (v !== null) total += v
    }
    return total
  }
  const highlights: DashboardHighlights = {
    attendance: {
      current: rangeSum((occ: OccRow) => attGrandTotal(occ, tracks.tracks_main_attendance), b.thisWeekStart, b.today),
      prior:   rangeSum((occ: OccRow) => attGrandTotal(occ, tracks.tracks_main_attendance), lastWeekStart, b.lastWeekEnd),
    },
    giving: {
      current: rangeSum(givingTotal, b.thisWeekStart, b.today),
      prior:   rangeSum(givingTotal, lastWeekStart, b.lastWeekEnd),
    },
    volunteers: {
      current: rangeSum(occ => volTotalForAudience(null, occ), b.thisWeekStart, b.today),
      prior:   rangeSum(occ => volTotalForAudience(null, occ), lastWeekStart, b.lastWeekEnd),
    },
  }

  // ── Summary Card rows ──
  const summary: DashboardSummary = {
    grandTotal:         fourWinFromWeekly(buildWeekly(occurrences, occ => attGrandTotal(occ, tracks.tracks_main_attendance)), b),
    adults:             fourWinFromWeekly(buildWeekly(occurrences, attMain), b),
    kids:               fourWinFromWeekly(buildWeekly(occurrences, attKids), b),
    youth:              fourWinFromWeekly(buildWeekly(occurrences, attYouth), b),
    volunteers:         fourWinFromWeekly(buildWeekly(occurrences, occ => volTotalForAudience(null, occ)), b),
    firstTimeDecisions: fourWinFromWeekly(buildWeekly(occurrences, firstTimeDecisionsTotal), b),
    giving:             fourWinFromWeekly(buildWeekly(occurrences, givingTotal), b),
  }

  // ── Audience sections (Adults / Kids / Youth) ──
  function audienceStats(audience: 'MAIN' | 'KIDS' | 'YOUTH'): AudienceStatRow[] {
    if (!tracks.tracks_responses) return []
    // Group response_entries by category_id within this audience.
    const byCat = new Map<string, { name: string; code: string; order: number; weekly: Map<string, number> }>()
    for (const occ of occurrences) {
      const wk = weekOf(occ.service_date)
      for (const re of occ.response_entries ?? []) {
        if (re.is_not_applicable || re.stat_value === null) continue
        if (re.audience_group_code !== audience) continue
        const cat = firstRelated(re.response_categories)
        if (!cat || !cat.is_active || cat.stat_scope !== 'audience') continue
        let entry = byCat.get(cat.id)
        if (!entry) {
          entry = { name: cat.category_name, code: cat.category_code, order: cat.display_order, weekly: new Map() }
          byCat.set(cat.id, entry)
        }
        entry.weekly.set(wk, (entry.weekly.get(wk) ?? 0) + re.stat_value)
      }
    }
    const entries = Array.from(byCat.entries())
      .map(([id, e]) => ({
        category_id: id,
        category_name: e.name,
        category_code: e.code,
        order: e.order,
        values: fourWinFromWeekly(e.weekly, b),
      }))
      .sort((x, y) => x.order - y.order || x.category_name.localeCompare(y.category_name))
    return entries.map(({ category_id, category_name, category_code, values }) => ({
      category_id, category_name, category_code, values,
    }))
  }

  function audienceSection(audience: 'MAIN' | 'KIDS' | 'YOUTH'): AudienceSection {
    const attrMetric = audience === 'MAIN' ? attMain : audience === 'KIDS' ? attKids : attYouth
    return {
      attendance: fourWinFromWeekly(buildWeekly(occurrences, attrMetric), b),
      volunteers: tracks.tracks_volunteers
        ? fourWinFromWeekly(buildWeekly(occurrences, occ => volTotalForAudience(audience, occ)), b)
        : emptyFourWin(),
      stats: audienceStats(audience),
    }
  }

  // ── Volunteer Breakout (E7) ──
  function volunteerBreakout(): VolunteerBreakout {
    if (!tracks.tracks_volunteers) {
      return { total: emptyFourWin(), rows: [] }
    }
    const total = fourWinFromWeekly(buildWeekly(occurrences, occ => volTotalForAudience(null, occ)), b)
    // Group by volunteer_category id.
    type BucketMeta = { name: string; audience: 'MAIN' | 'KIDS' | 'YOUTH'; sort_order: number; weekly: Map<string, number> }
    const byCat = new Map<string, BucketMeta>()
    for (const occ of occurrences) {
      const wk = weekOf(occ.service_date)
      for (const ve of occ.volunteer_entries ?? []) {
        if (ve.is_not_applicable) continue
        const cat = firstRelated(ve.volunteer_categories)
        if (!cat || !cat.is_active) continue
        let entry = byCat.get(cat.id)
        if (!entry) {
          entry = { name: cat.category_name, audience: cat.audience_group_code, sort_order: cat.sort_order, weekly: new Map() }
          byCat.set(cat.id, entry)
        }
        entry.weekly.set(wk, (entry.weekly.get(wk) ?? 0) + (ve.volunteer_count ?? 0))
      }
    }
    const audienceOrder = { MAIN: 0, KIDS: 1, YOUTH: 2 }
    const rows: VolunteerBreakoutRow[] = Array.from(byCat.entries())
      .map(([id, e]) => ({
        category_id: id,
        category_name: e.name,
        audience_group_code: e.audience,
        sort_order: e.sort_order,
        values: fourWinFromWeekly(e.weekly, b),
      }))
      .sort((a, c) =>
        audienceOrder[a.audience_group_code] - audienceOrder[c.audience_group_code] ||
        a.sort_order - c.sort_order ||
        a.category_name.localeCompare(c.category_name)
      )
    return { total, rows }
  }

  // ── Other Stats (E8) — service-scope + period entries ──
  function otherStats(): OtherStatRow[] {
    if (!tracks.tracks_responses) return []
    type Bucket = { category_id: string; category_name: string; tag_code: string | null; weekly: Map<string, number> }
    const buckets = new Map<string, Bucket>()

    // Service-scope response_entries (tag_code = null, no tag label shown)
    for (const occ of occurrences) {
      const wk = weekOf(occ.service_date)
      for (const re of occ.response_entries ?? []) {
        if (re.is_not_applicable || re.stat_value === null) continue
        const cat = firstRelated(re.response_categories)
        if (!cat || !cat.is_active || cat.stat_scope !== 'service') continue
        // D-055 — First-Time Decisions live in Summary/audience sections only.
        if (cat.category_code === 'FIRST_TIME_DECISION') continue
        const key = cat.id + '|'
        let bucket = buckets.get(key)
        if (!bucket) {
          bucket = { category_id: cat.id, category_name: cat.category_name, tag_code: null, weekly: new Map() }
          buckets.set(key, bucket)
        }
        bucket.weekly.set(wk, (bucket.weekly.get(wk) ?? 0) + re.stat_value)
      }
    }

    // church_period_entries (tag-keyed)
    for (const pe of periodEntries) {
      if (pe.is_not_applicable || pe.stat_value === null) continue
      const cat = firstRelated(pe.response_categories)
      if (!cat || !cat.is_active) continue
      if (cat.category_code === 'FIRST_TIME_DECISION') continue
      const tag = firstRelated(pe.service_tags)
      const tagCode = tag?.tag_code ?? null
      const key = cat.id + '|' + (tagCode ?? '')
      const wk = weekOf(pe.period_date)
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { category_id: cat.id, category_name: cat.category_name, tag_code: tagCode, weekly: new Map() }
        buckets.set(key, bucket)
      }
      bucket.weekly.set(wk, (bucket.weekly.get(wk) ?? 0) + pe.stat_value)
    }

    return Array.from(buckets.values())
      .map(bucket => ({
        key: bucket.category_id + '|' + (bucket.tag_code ?? ''),
        category_id: bucket.category_id,
        category_name: bucket.category_name,
        tag_code: bucket.tag_code,
        values: fourWinFromWeekly(bucket.weekly, b),
      }))
      .sort((a, c) =>
        a.category_name.localeCompare(c.category_name) ||
        (a.tag_code ?? '').localeCompare(c.tag_code ?? '')
      )
  }

  return {
    summary,
    adults: audienceSection('MAIN'),
    kids:   audienceSection('KIDS'),
    youth:  audienceSection('YOUTH'),
    volunteerBreakout: volunteerBreakout(),
    otherStats: otherStats(),
    highlights,
    hasAnyData,
    weeksWithData,
  }
}

export function emptyFourWin(): FourWin {
  return { w: null, m4: null, ytd: null, priorYtd: null, delta_w_m4: null, delta_ytd_prior: null }
}
