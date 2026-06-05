// D1 Full Dashboard — v2.0 four-column data layer.
// Tag-first unified schema (migrations 0022–0027): reads the per-occurrence views
// (attendance_per_occurrence, volunteers_per_occurrence, giving_per_week) + metric_entries.
// Replaces the dropped attendance_entries / volunteer_* / response_* / giving_* /
// church_period_entries tables. The 4-window math + DashboardData output shape are
// PRESERVED verbatim — only the data source, the tag_role grouping, and the added
// reportingMetrics are new.

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

export interface OtherStatRow {
  key: string                // metric_id + '|' + (tag_code ?? '')
  category_id: string        // metric_id
  category_name: string      // metric name
  tag_code: string | null    // ministry tag code (e.g. EXPERIENCE / LIFEKIDS)
  values: FourWin
}

export interface TagSection {
  tag_id: string | 'UNASSIGNED'
  tag_name: string
  tag_code: string
  attendance: FourWin
  volunteers: FourWin
  stats: OtherStatRow[]
}

export interface VolunteerBreakoutRow {
  category_id: string        // metric_id
  category_name: string      // metric name
  tag_id: string | 'UNASSIGNED'
  sort_order: number
  values: FourWin
}

export interface VolunteerBreakout {
  total: FourWin
  rows: VolunteerBreakoutRow[]
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

// Builder's out-of-the-box reporting-tag metrics (#62). Each is a FourWin so it
// renders across the same 4 time columns. Null-safe ratios (NULL ≠ 0): a window
// whose denominator is null/0 returns null, never a divide-by-COALESCE(0).
export interface ReportingMetrics {
  volToAttendancePct: FourWin   // SUM(VOLUNTEERS) / SUM(ATTENDANCE) × 100
  perCapitaGiving: FourWin      // SUM(GIVING) / SUM(ATTENDANCE)  (currency)
  weeklyAvgAttendance: FourWin  // avg total attendance per active week
}

export interface DashboardHighlights {
  attendance: { current: number; prior: number }
  giving:     { current: number; prior: number }
  volunteers: { current: number; prior: number }
}

export interface DashboardData {
  summary: DashboardSummary
  tagSections: TagSection[]
  volunteerBreakout: VolunteerBreakout
  otherStats: OtherStatRow[]
  reportingMetrics: ReportingMetrics
  highlights: DashboardHighlights
  hasAnyData: boolean
  weeksWithData: number
}

// ─── Raw row shapes (as returned by the views / joined selects) ───────────────

type TagRole = 'ADULT_SERVICE' | 'KIDS_MINISTRY' | 'YOUTH_MINISTRY' | 'OTHER'

interface AttViewRow {
  service_instance_id: string
  service_template_id: string | null
  service_date: string
  adults_attendance: number | null
  kids_attendance: number | null
  youth_attendance: number | null
  other_attendance: number | null
  total_attendance: number | null
}

interface VolViewRow {
  service_instance_id: string
  service_date: string
  total_volunteers: number | null
}

interface GivingWeekRow {
  week_start: string
  total_giving: number | null
}

interface TagRow {
  id: string
  code: string
  name: string
  tag_role: TagRole
  parent_tag_id: string | null
  display_order: number | null
}

interface MetricRow {
  id: string
  code: string
  name: string
  ministry_tag_id: string | null
  reporting_tag_id: string
  scope: 'instance' | 'period'
}

// metric_entries joined to service_instances for the service_date (instance scope)
interface EntryRow {
  metric_id: string
  value: number | null
  is_not_applicable: boolean
  reporting_tag_code: string | null
  period_anchor: string | null
  service_instance_id: string | null
  service_instances: { service_date: string; status: string } | { service_date: string; status: string }[] | null
}

function firstRelated<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// ─── Delta + rounding (UNCHANGED) ──────────────────────────────────────────────

function delta(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null
  return Math.round(((current - prior) / prior) * 100)
}

function roundOrNull(n: number | null): number | null {
  return n === null ? null : Math.round(n)
}

// ─── Date boundaries (UNCHANGED) ───────────────────────────────────────────────

interface Boundaries {
  today: string
  thisWeekStart: string
  lastWeekEnd: string
  fourWksAgoStart: string
  yearStart: string
  lastYearStart: string
  lastYearSameWeek: string
}

function weekStartOf(d: Date): string {
  const day = d.getDay()
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

// ─── Core aggregation (UNCHANGED window/delta/YTD math — D-053, D-055) ─────────

function fourWinFromWeekly(weekly: Map<string, number>, b: Boundaries): FourWin {
  const w = weekly.has(b.thisWeekStart) ? weekly.get(b.thisWeekStart)! : null

  const last4: number[] = []
  for (const [wk, v] of weekly) {
    if (wk >= b.fourWksAgoStart && wk <= b.lastWeekEnd) last4.push(v)
  }
  const m4 = last4.length > 0 ? last4.reduce((s, x) => s + x, 0) / last4.length : null

  const ytdVals: number[] = []
  for (const [wk, v] of weekly) {
    if (wk >= b.yearStart && wk <= b.thisWeekStart) ytdVals.push(v)
  }
  const ytd = ytdVals.length > 0 ? ytdVals.reduce((s, x) => s + x, 0) / ytdVals.length : null

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

// Weekly map keyed by the week's Sunday, summing a per-occurrence numeric value.
// NULL values are skipped (NULL ≠ 0 — never coalesced). A week with only-null
// rows never gets an entry, so it is excluded from averages downstream.
function buildWeeklyFrom<T>(
  rows: T[],
  dateOf: (r: T) => string,
  value: (r: T) => number | null,
): Map<string, number> {
  const byWeek = new Map<string, number>()
  for (const r of rows) {
    const v = value(r)
    if (v === null) continue
    const wk = weekOf(dateOf(r))
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + v)
  }
  return byWeek
}

// fourWin from a weekly SUM-by-week map but where each window is an AVERAGE of the
// summed weekly values that fall in it (this is exactly fourWinFromWeekly's
// behavior — kept as a named alias for clarity at call sites).
const fourWinAvgOfWeeks = fourWinFromWeekly

// Window-level ratio: for each window, divide an aggregate built from the
// numerator weekly map by one from the denominator weekly map. The window
// aggregate (avg-of-weeks) matches the rest of the dashboard. Returns null when
// the denominator window is null or 0 (NULL ≠ 0; no divide-by-zero).
function ratioFourWin(
  numWeekly: Map<string, number>,
  denWeekly: Map<string, number>,
  b: Boundaries,
  scale: number,
): FourWin {
  const num = fourWinFromWeekly(numWeekly, b)
  const den = fourWinFromWeekly(denWeekly, b)
  const div = (n: number | null, d: number | null): number | null =>
    n === null || d === null || d === 0 ? null : (n / d) * scale
  const w = div(num.w, den.w)
  const m4 = div(num.m4, den.m4)
  const ytd = div(num.ytd, den.ytd)
  const priorYtd = div(num.priorYtd, den.priorYtd)
  return {
    w: roundOrNull(w),
    m4: roundOrNull(m4),
    ytd: roundOrNull(ytd),
    priorYtd: roundOrNull(priorYtd),
    delta_w_m4: delta(w, m4),
    delta_ytd_prior: delta(ytd, priorYtd),
  }
}

// ─── Paginated metric_entries fetch (PostgREST 1,000-row cap; see History #63) ─

const PAGE = 1000

async function fetchEntriesPaged(
  buildPage: (offset: number, limit: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<EntryRow[]> {
  const all: EntryRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await buildPage(offset, PAGE)
    if (error) { console.error('[dashboard] metric_entries page failed:', error); break }
    const rows = ((data ?? []) as unknown) as EntryRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

// ─── Main fetcher ─────────────────────────────────────────────────────────────

export async function fetchDashboardData(
  churchId: string,
  tracks: { tracks_volunteers: boolean; tracks_responses: boolean; tracks_giving: boolean },
): Promise<DashboardData> {
  const supabase = createClient()
  const b = buildBoundaries(new Date())

  // ── Tags (ministry axis) — group sections by these; tag_role drives the
  //    audience pivot. (Old tag_code/tag_name renamed → code/name; tag_role new.)
  const { data: tagsData, error: tagsErr } = await supabase
    .from('service_tags')
    .select('id, code, name, tag_role, parent_tag_id, display_order')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  if (tagsErr) console.error('[dashboard] service_tags fetch failed:', tagsErr)
  const tags: TagRow[] = (tagsData ?? []) as TagRow[]
  const tagByIdCode = new Map<string, string>()
  for (const t of tags) tagByIdCode.set(t.id, t.code)

  // ── Metrics (definition lookup) — metric_id → {name, ministry tag, reporting}
  const { data: metricsData, error: metricsErr } = await supabase
    .from('metrics')
    .select('id, code, name, ministry_tag_id, reporting_tag_id, scope')
    .eq('church_id', churchId)
    .eq('is_active', true)
  if (metricsErr) console.error('[dashboard] metrics fetch failed:', metricsErr)
  const metricById = new Map<string, MetricRow>()
  for (const m of (metricsData ?? []) as MetricRow[]) metricById.set(m.id, m)

  // ── Attendance — view, already pivoted by tag_role into adults/kids/youth/total.
  const { data: attData, error: attErr } = await supabase
    .from('attendance_per_occurrence')
    .select('service_instance_id, service_template_id, service_date, adults_attendance, kids_attendance, youth_attendance, other_attendance, total_attendance')
    .eq('church_id', churchId)
    .gte('service_date', b.lastYearStart)
    .lte('service_date', b.today)
    .order('service_date', { ascending: true })
  if (attErr) console.error('[dashboard] attendance_per_occurrence fetch failed:', attErr)
  const attRows: AttViewRow[] = (attData ?? []) as AttViewRow[]

  // ── Volunteer totals — view (per active occurrence).
  const { data: volData, error: volErr } = await supabase
    .from('volunteers_per_occurrence')
    .select('service_instance_id, service_date, total_volunteers')
    .eq('church_id', churchId)
    .gte('service_date', b.lastYearStart)
    .lte('service_date', b.today)
    .order('service_date', { ascending: true })
  if (volErr) console.error('[dashboard] volunteers_per_occurrence fetch failed:', volErr)
  const volRows: VolViewRow[] = (volData ?? []) as VolViewRow[]

  // ── Church-wide weekly giving — view.
  const { data: givingData, error: givingErr } = await supabase
    .from('giving_per_week')
    .select('week_start, total_giving')
    .eq('church_id', churchId)
    .gte('week_start', b.lastYearStart)
    .lte('week_start', b.today)
    .order('week_start', { ascending: true })
  if (givingErr) console.error('[dashboard] giving_per_week fetch failed:', givingErr)
  const givingWeeks: GivingWeekRow[] = (givingData ?? []) as GivingWeekRow[]

  // ── metric_entries — instance-scoped breakouts (VOLUNTEERS / RESPONSE_STAT /
  //    GIVING). Date-scoped to [lastYearStart, today] via the joined service_date
  //    and paginated past the 1,000-row cap. We can't filter on an embedded
  //    column in PostgREST, so we scope by the in-range active occurrence ids
  //    gathered from the attendance + volunteer views (their union covers every
  //    active occurrence in range that carries metric data).
  const SELECT = `
    metric_id, value, is_not_applicable, reporting_tag_code, period_anchor, service_instance_id,
    service_instances!inner ( service_date, status )
  `
  const inRangeOccIds = Array.from(new Set<string>([
    ...attRows.map(r => r.service_instance_id),
    ...volRows.map(r => r.service_instance_id),
  ]))

  // Instance-scoped breakout entries (volunteers + response stats + any
  // instance-scoped giving) for the in-range active occurrences.
  const instanceEntries: EntryRow[] = inRangeOccIds.length === 0 ? [] :
    await fetchEntriesPaged((offset, limit) =>
      supabase
        .from('metric_entries')
        .select(SELECT)
        .eq('church_id', churchId)
        .eq('is_not_applicable', false)
        .not('value', 'is', null)
        .in('reporting_tag_code', ['VOLUNTEERS', 'RESPONSE_STAT', 'GIVING'])
        .in('service_instance_id', inRangeOccIds)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1),
    )

  // Period-scoped giving entries (if any) — anchored by the week's Sunday.
  const periodGivingEntries: EntryRow[] = await fetchEntriesPaged((offset, limit) =>
    supabase
      .from('metric_entries')
      .select('metric_id, value, is_not_applicable, reporting_tag_code, period_anchor, service_instance_id, service_instances ( service_date, status )')
      .eq('church_id', churchId)
      .eq('is_not_applicable', false)
      .eq('reporting_tag_code', 'GIVING')
      .not('value', 'is', null)
      .not('period_anchor', 'is', null)
      .gte('period_anchor', b.lastYearStart)
      .lte('period_anchor', b.today)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1),
  )

  // Effective service_date for an instance-scoped entry (only active instances).
  const entryDate = (e: EntryRow): string | null => {
    const si = firstRelated(e.service_instances)
    if (!si || si.status !== 'active') return null
    return si.service_date
  }

  const volEntries = instanceEntries.filter(e => e.reporting_tag_code === 'VOLUNTEERS')
  const statEntries = instanceEntries.filter(e => e.reporting_tag_code === 'RESPONSE_STAT')
  const givingInstanceEntries = instanceEntries.filter(e => e.reporting_tag_code === 'GIVING')

  // ── Data presence ──
  const hasAnyData =
    attRows.length > 0 || volRows.length > 0 || givingWeeks.length > 0 ||
    instanceEntries.length > 0 || periodGivingEntries.length > 0
  const weeksWithData = new Set<string>(attRows.map(r => weekOf(r.service_date))).size

  // ── Weekly maps (reused by FourWin) ──
  const attTotalWeekly = buildWeeklyFrom(attRows, r => r.service_date, r => r.total_attendance)
  const attAdultsWeekly = buildWeeklyFrom(attRows, r => r.service_date, r => r.adults_attendance)
  const attKidsWeekly  = buildWeeklyFrom(attRows, r => r.service_date, r => r.kids_attendance)
  const attYouthWeekly = buildWeeklyFrom(attRows, r => r.service_date, r => r.youth_attendance)
  const volTotalWeekly = buildWeeklyFrom(volRows, r => r.service_date, r => r.total_volunteers)

  // Giving weekly: prefer the church-wide view; fall back to instance/period
  // metric_entries when the view is empty (so per-capita giving still works if
  // giving lands as metric_entries instead of the view).
  const givingFromView = buildWeeklyFrom(givingWeeks, r => r.week_start, r => r.total_giving)
  const givingWeekly: Map<string, number> = givingFromView.size > 0
    ? givingFromView
    : (() => {
        const m = new Map<string, number>()
        for (const e of givingInstanceEntries) {
          const d = entryDate(e)
          if (d === null || e.value === null) continue
          const wk = weekOf(d)
          m.set(wk, (m.get(wk) ?? 0) + Number(e.value))
        }
        for (const e of periodGivingEntries) {
          if (!e.period_anchor || e.value === null) continue
          const wk = weekOf(e.period_anchor)
          m.set(wk, (m.get(wk) ?? 0) + Number(e.value))
        }
        return m
      })()

  // First-time decisions: RESPONSE_STAT metrics whose code marks a first-time
  // decision (canonical code substring — schema no longer has category_code).
  const isFirstTimeDecision = (m: MetricRow | undefined): boolean => {
    if (!m) return false
    const c = m.code.toUpperCase()
    return c.includes('FIRST_TIME') || c.includes('DECISION') || c.includes('SALVATION')
  }
  const ftdWeekly = (() => {
    const m = new Map<string, number>()
    for (const e of statEntries) {
      const metric = metricById.get(e.metric_id)
      if (!isFirstTimeDecision(metric)) continue
      const d = entryDate(e)
      if (d === null || e.value === null) continue
      const wk = weekOf(d)
      m.set(wk, (m.get(wk) ?? 0) + Number(e.value))
    }
    return m
  })()

  // ── Highlights (current vs prior week sums) ──
  const lastWeekStart = shiftDays(b.thisWeekStart, -7)
  function rangeSumWeekly(weekly: Map<string, number>, from: string, to: string): number {
    let total = 0
    for (const [wk, v] of weekly) {
      if (wk >= from && wk <= to) total += v
    }
    return total
  }
  const highlights: DashboardHighlights = {
    attendance: {
      current: rangeSumWeekly(attTotalWeekly, b.thisWeekStart, b.today),
      prior:   rangeSumWeekly(attTotalWeekly, lastWeekStart, b.lastWeekEnd),
    },
    giving: {
      current: rangeSumWeekly(givingWeekly, b.thisWeekStart, b.today),
      prior:   rangeSumWeekly(givingWeekly, lastWeekStart, b.lastWeekEnd),
    },
    volunteers: {
      current: rangeSumWeekly(volTotalWeekly, b.thisWeekStart, b.today),
      prior:   rangeSumWeekly(volTotalWeekly, lastWeekStart, b.lastWeekEnd),
    },
  }

  // ── Summary ──
  const summary: DashboardSummary = {
    grandTotal:         fourWinAvgOfWeeks(attTotalWeekly, b),
    adults:             fourWinAvgOfWeeks(attAdultsWeekly, b),
    kids:               fourWinAvgOfWeeks(attKidsWeekly, b),
    youth:              fourWinAvgOfWeeks(attYouthWeekly, b),
    volunteers:         fourWinAvgOfWeeks(volTotalWeekly, b),
    firstTimeDecisions: fourWinAvgOfWeeks(ftdWeekly, b),
    giving:             fourWinAvgOfWeeks(givingWeekly, b),
  }

  // TagSection.attendance uses the view's tag_role pivot (attendanceForRole)
  // since each ministry tag carries a distinct role in this model.
  // Volunteer weekly maps per ministry tag + per metric.
  const volWeeklyByTag = new Map<string, Map<string, number>>()
  const volWeeklyByMetric = new Map<string, Map<string, number>>()
  for (const e of volEntries) {
    const metric = metricById.get(e.metric_id)
    const d = entryDate(e)
    if (!metric || d === null || e.value === null) continue
    const wk = weekOf(d)
    const tagKey = metric.ministry_tag_id ?? 'UNASSIGNED'
    let tm = volWeeklyByTag.get(tagKey)
    if (!tm) { tm = new Map(); volWeeklyByTag.set(tagKey, tm) }
    tm.set(wk, (tm.get(wk) ?? 0) + Number(e.value))
    let mm = volWeeklyByMetric.get(e.metric_id)
    if (!mm) { mm = new Map(); volWeeklyByMetric.set(e.metric_id, mm) }
    mm.set(wk, (mm.get(wk) ?? 0) + Number(e.value))
  }

  // RESPONSE_STAT weekly maps per metric (excluding first-time-decision, shown in summary).
  type StatMeta = { name: string; tagId: string | 'UNASSIGNED'; tagCode: string | null; weekly: Map<string, number> }
  const statByMetric = new Map<string, StatMeta>()
  if (tracks.tracks_responses) {
    for (const e of statEntries) {
      const metric = metricById.get(e.metric_id)
      if (!metric || isFirstTimeDecision(metric)) continue
      const d = entryDate(e)
      if (d === null || e.value === null) continue
      const wk = weekOf(d)
      const tagId = metric.ministry_tag_id ?? 'UNASSIGNED'
      const tagCode = metric.ministry_tag_id ? (tagByIdCode.get(metric.ministry_tag_id) ?? null) : null
      let s = statByMetric.get(e.metric_id)
      if (!s) {
        s = { name: metric.name, tagId, tagCode, weekly: new Map() }
        statByMetric.set(e.metric_id, s)
      }
      s.weekly.set(wk, (s.weekly.get(wk) ?? 0) + Number(e.value))
    }
  }

  // ── Tag Sections — group by ministry tag (tag_role drives audience attendance) ──
  function attendanceForRole(role: TagRole): Map<string, number> {
    if (role === 'ADULT_SERVICE') return attAdultsWeekly
    if (role === 'KIDS_MINISTRY') return attKidsWeekly
    if (role === 'YOUTH_MINISTRY') return attYouthWeekly
    return buildWeeklyFrom(attRows, r => r.service_date, r => r.other_attendance)
  }

  function buildTagSection(tag: TagRow): TagSection {
    const tagId = tag.id
    const stats: OtherStatRow[] = Array.from(statByMetric.entries())
      .filter(([, s]) => s.tagId === tagId)
      .map(([metricId, s]) => ({
        key: metricId + '|' + (s.tagCode ?? ''),
        category_id: metricId,
        category_name: s.name,
        tag_code: s.tagCode,
        values: fourWinFromWeekly(s.weekly, b),
      }))
      .sort((a, c) => a.category_name.localeCompare(c.category_name))

    return {
      tag_id: tagId,
      tag_name: tag.name,
      tag_code: tag.code,
      attendance: fourWinFromWeekly(attendanceForRole(tag.tag_role), b),
      volunteers: tracks.tracks_volunteers
        ? fourWinFromWeekly(volWeeklyByTag.get(tagId) ?? new Map(), b)
        : emptyFourWin(),
      stats,
    }
  }

  const tagSections: TagSection[] = tags.map(buildTagSection)

  // Unassigned section — stats / volunteers whose metric has no ministry tag.
  const unassignedStats: OtherStatRow[] = Array.from(statByMetric.entries())
    .filter(([, s]) => s.tagId === 'UNASSIGNED')
    .map(([metricId, s]) => ({
      key: metricId + '|',
      category_id: metricId,
      category_name: s.name,
      tag_code: null,
      values: fourWinFromWeekly(s.weekly, b),
    }))
    .sort((a, c) => a.category_name.localeCompare(c.category_name))
  const unassignedVol = volWeeklyByTag.get('UNASSIGNED')
  if (unassignedStats.length > 0 || (tracks.tracks_volunteers && unassignedVol && unassignedVol.size > 0)) {
    tagSections.push({
      tag_id: 'UNASSIGNED',
      tag_name: 'General (No Tag)',
      tag_code: 'UNASSIGNED',
      attendance: emptyFourWin(),
      volunteers: tracks.tracks_volunteers ? fourWinFromWeekly(unassignedVol ?? new Map(), b) : emptyFourWin(),
      stats: unassignedStats,
    })
  }

  // ── Volunteer Breakout — one row per VOLUNTEERS metric (the new "category"). ──
  function volunteerBreakout(): VolunteerBreakout {
    if (!tracks.tracks_volunteers) return { total: emptyFourWin(), rows: [] }
    const total = fourWinFromWeekly(volTotalWeekly, b)
    const rows: VolunteerBreakoutRow[] = Array.from(volWeeklyByMetric.entries())
      .map(([metricId, weekly]) => {
        const metric = metricById.get(metricId)
        return {
          category_id: metricId,
          category_name: metric?.name ?? metricId,
          tag_id: metric?.ministry_tag_id ?? 'UNASSIGNED',
          sort_order: 0,
          values: fourWinFromWeekly(weekly, b),
        }
      })
      .sort((a, c) => a.category_name.localeCompare(c.category_name))
    return { total, rows }
  }

  // ── Other Stats — RESPONSE_STAT metrics not bound to a rendered tag section.
  //    With the unified schema all RESPONSE_STAT metrics carry a ministry tag and
  //    surface inside their TagSection, so this list is the unassigned remainder
  //    (kept for shape parity + any future church-wide stats).
  function otherStats(): OtherStatRow[] {
    if (!tracks.tracks_responses) return []
    return unassignedStats
  }

  // ── Reporting metrics (#62 — Builder request) ──
  const reportingMetrics: ReportingMetrics = {
    // % volunteers to total attendance.
    volToAttendancePct: tracks.tracks_volunteers
      ? ratioFourWin(volTotalWeekly, attTotalWeekly, b, 100)
      : emptyFourWin(),
    // per-capita giving (currency). Null when giving absent (denominator-safe).
    perCapitaGiving: tracks.tracks_giving
      ? ratioFourWin(givingWeekly, attTotalWeekly, b, 1)
      : emptyFourWin(),
    // average weekly attendance (avg total attendance per active week).
    weeklyAvgAttendance: fourWinFromWeekly(attTotalWeekly, b),
  }

  return {
    summary,
    tagSections,
    volunteerBreakout: volunteerBreakout(),
    otherStats: otherStats(),
    reportingMetrics,
    highlights,
    hasAnyData,
    weeksWithData,
  }
}

export function emptyFourWin(): FourWin {
  return { w: null, m4: null, ytd: null, priorYtd: null, delta_w_m4: null, delta_ytd_prior: null }
}
