import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Named metric registry for the analytics chat. Each metric runs a tightly
 * scoped query against a single church_id that the server injects — the AI
 * never provides it. No free-form SQL reaches the database.
 *
 * Unified schema (migrations 0022+): all data comes from the per-occurrence
 * views (attendance_per_occurrence, volunteers_per_occurrence, giving_per_week)
 * and metric_entries (VOLUNTEERS / RESPONSE_STAT / GIVING reporting_tag_code).
 * The dropped tables attendance_entries, volunteer_entries, volunteer_categories,
 * response_entries, response_categories, giving_entries, giving_sources are gone.
 *
 * Every metric:
 *   - filters status = 'active' (the views enforce this; metric_entries queries
 *     join service_instances!inner to enforce it there)
 *   - treats NULL attendance as "not entered" (never coalesced to 0 in averages)
 *   - returns a tidy array the AI can either reason over or pass to render_chart
 */

export type MetricId =
  | 'attendance_by_week'
  | 'attendance_by_template_month'
  | 'giving_by_week'
  | 'ytd_vs_prior'
  | 'volunteer_counts_month'
  | 'response_total_range'

export interface MetricContext {
  supabase: SupabaseClient
  churchId: string
}

export interface MetricDefinition {
  id:          MetricId
  description: string
  params:      Record<string, { type: string; description: string }>
}

export const METRICS: MetricDefinition[] = [
  {
    id:          'attendance_by_week',
    description: 'Weekly attendance totals (adults+kids+youth+other, NULLs skipped) over a date range. Optionally filter by tag code.',
    params: {
      start_date: { type: 'string', description: 'YYYY-MM-DD inclusive lower bound' },
      end_date:   { type: 'string', description: 'YYYY-MM-DD inclusive upper bound' },
      tag_code:   { type: 'string', description: 'Optional service_tags.code filter (e.g. MORNING). Call list_dimensions to find valid codes.' },
    },
  },
  {
    id:          'attendance_by_template_month',
    description: 'Per-service-template monthly attendance average for the given year.',
    params: {
      year: { type: 'integer', description: 'Calendar year, e.g. 2026' },
    },
  },
  {
    id:          'giving_by_week',
    description: 'Church-wide weekly giving totals over a date range (from the giving_per_week view). Note: per-source breakdown is not available in the unified schema.',
    params: {
      start_date: { type: 'string', description: 'YYYY-MM-DD inclusive' },
      end_date:   { type: 'string', description: 'YYYY-MM-DD inclusive' },
    },
  },
  {
    id:          'ytd_vs_prior',
    description: 'Year-to-date attendance compared against the same range one year prior.',
    params: {
      as_of_date: { type: 'string', description: 'YYYY-MM-DD — YTD is Jan 1 → as_of_date.' },
    },
  },
  {
    id:          'volunteer_counts_month',
    description: 'Monthly volunteer totals per metric/category (from metric_entries WHERE reporting_tag_code=VOLUNTEERS) over the date range.',
    params: {
      start_date: { type: 'string', description: 'YYYY-MM-DD inclusive' },
      end_date:   { type: 'string', description: 'YYYY-MM-DD inclusive' },
    },
  },
  {
    id:          'response_total_range',
    description: 'Sum of response/stat counts per metric/category (from metric_entries WHERE reporting_tag_code=RESPONSE_STAT) over the date range.',
    params: {
      start_date: { type: 'string', description: 'YYYY-MM-DD inclusive' },
      end_date:   { type: 'string', description: 'YYYY-MM-DD inclusive' },
    },
  },
]

export async function runMetric(
  ctx:    MetricContext,
  id:     MetricId,
  params: Record<string, unknown>,
): Promise<{ rows: unknown[]; shape: string; hint?: string; warning?: string }> {
  switch (id) {
    case 'attendance_by_week':           return attendanceByWeek(ctx, params)
    case 'attendance_by_template_month': return attendanceByTemplateMonth(ctx, params)
    case 'giving_by_week':               return givingByWeek(ctx, params)
    case 'ytd_vs_prior':                 return ytdVsPrior(ctx, params)
    case 'volunteer_counts_month':       return volunteerCountsMonth(ctx, params)
    case 'response_total_range':         return responseTotalRange(ctx, params)
    default:
      throw new Error(`Unknown metric: ${id}`)
  }
}

// ---------- metric implementations ----------

// Reads attendance_per_occurrence view (unified schema replacement for the
// dropped attendance_entries table). The view already enforces status='active'.
async function attendanceByWeek(ctx: MetricContext, p: Record<string, unknown>) {
  const start   = String(p.start_date)
  const end     = String(p.end_date)
  const tagCode = p.tag_code ? String(p.tag_code) : null

  // Optional tag filter: resolve tag code → service_template_id list.
  // service_tags.code is the unified-schema column (was tag_code before 0022).
  let templateFilter: string[] | null = null
  if (tagCode) {
    const { data: tag } = await ctx.supabase
      .from('service_tags')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('code', tagCode)          // unified schema: code (not tag_code)
      .maybeSingle()
    if (!tag) {
      return {
        rows: [],
        shape: 'week_start: string; total: number',
        hint: `No tag found with code "${tagCode}". Call list_dimensions to find valid tag codes.`,
      }
    }
    const { data: templates } = await ctx.supabase
      .from('service_templates')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('primary_tag_id', tag.id)
    templateFilter = (templates ?? []).map((t: { id: string }) => t.id)
    if (templateFilter.length === 0) {
      return {
        rows: [],
        shape: 'week_start: string; total: number',
        hint: `No service templates found for tag "${tagCode}". Call list_dimensions to find valid tags.`,
      }
    }
  }

  // attendance_per_occurrence: service_instance_id, service_template_id,
  // service_date, total_attendance (and adults/kids/youth/other breakouts).
  // The view filters status='active' internally.
  let query = ctx.supabase
    .from('attendance_per_occurrence')
    .select('service_date, service_template_id, total_attendance')
    .eq('church_id', ctx.churchId)
    .gte('service_date', start)
    .lte('service_date', end)
    .order('service_date', { ascending: true })
  if (templateFilter) {
    query = query.in('service_template_id', templateFilter)
  }

  const { data, error } = await query
  if (error) throw new Error(`attendance_by_week: ${error.message}`)

  // Aggregate by Sunday of the week (NULL rows skipped per critical rule #4).
  const byWeek = new Map<string, number>()
  for (const row of (data ?? []) as { service_date: string; total_attendance: number | null }[]) {
    if (row.total_attendance === null) continue
    const key = sundayOf(row.service_date)
    byWeek.set(key, (byWeek.get(key) ?? 0) + row.total_attendance)
  }

  const rows = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week_start, total]) => ({ week_start, total }))

  if (rows.length === 0) {
    return {
      rows,
      shape: 'week_start: string; total: number',
      hint: `No attendance found for ${start}–${end}${tagCode ? ` with tag ${tagCode}` : ''}. Call probe_data to find the valid range.`,
    }
  }
  return { rows, shape: 'week_start: string; total: number' }
}

// Per-service-template monthly average using attendance_per_occurrence view.
async function attendanceByTemplateMonth(ctx: MetricContext, p: Record<string, unknown>) {
  const year = Number(p.year)
  if (!Number.isInteger(year)) throw new Error('year must be an integer')

  const start = `${year}-01-01`
  const end   = `${year}-12-31`

  // Join service_templates for display_name; attendance_per_occurrence already
  // joins it internally as service_template_id. We join via PostgREST embed.
  const { data, error } = await ctx.supabase
    .from('attendance_per_occurrence')
    .select('service_date, service_template_id, total_attendance, service_templates!inner(display_name)')
    .eq('church_id', ctx.churchId)
    .gte('service_date', start)
    .lte('service_date', end)
  if (error) throw new Error(`attendance_by_template_month: ${error.message}`)

  // Monthly average per template (NULL rows skipped — critical rule #4).
  const agg = new Map<string, { sum: number; count: number; template_name: string; month: string }>()
  for (const rawRow of data ?? []) {
    const row = rawRow as {
      service_date: string
      service_template_id: string
      total_attendance: number | null
      service_templates: { display_name?: string } | { display_name?: string }[]
    }
    if (row.total_attendance === null) continue
    const m    = row.service_date.slice(0, 7)
    const st   = Array.isArray(row.service_templates) ? row.service_templates[0] : row.service_templates
    const name = st?.display_name ?? 'Unknown'
    const key  = `${row.service_template_id}|${m}`
    const a    = agg.get(key) ?? { sum: 0, count: 0, template_name: name, month: m }
    a.sum += row.total_attendance
    a.count += 1
    agg.set(key, a)
  }

  const rows = [...agg.values()].map(v => ({
    month:         v.month,
    template_name: v.template_name,
    avg:           v.count ? Math.round(v.sum / v.count) : 0,
  }))
  rows.sort((a, b) => (a.month + a.template_name).localeCompare(b.month + b.template_name))

  if (rows.length === 0) {
    return {
      rows,
      shape: 'month: string; template_name: string; avg: number',
      hint: `No attendance found for ${year}.`,
    }
  }
  return { rows, shape: 'month: string; template_name: string; avg: number' }
}

// Church-wide weekly giving from the giving_per_week view (unified schema
// replacement for the dropped giving_entries / giving_sources tables).
// Per-source breakdown is not available in the unified schema.
async function givingByWeek(ctx: MetricContext, p: Record<string, unknown>) {
  const start = String(p.start_date)
  const end   = String(p.end_date)

  const { data, error } = await ctx.supabase
    .from('giving_per_week')
    .select('week_start, total_giving')
    .eq('church_id', ctx.churchId)
    .gte('week_start', start)
    .lte('week_start', end)
    .order('week_start', { ascending: true })
  if (error) throw new Error(`giving_by_week: ${error.message}`)

  const rows = (data ?? [] as { week_start: string; total_giving: number | null }[])
    .filter((r: { week_start: string; total_giving: number | null }) => r.total_giving !== null)
    .map((r: { week_start: string; total_giving: number | null }) => ({
      week_start:   r.week_start,
      total_giving: Math.round(Number(r.total_giving) * 100) / 100,
    }))

  if (rows.length === 0) {
    return {
      rows,
      shape: 'week_start: string; total_giving: number',
      hint: `No giving data found for ${start}–${end}. Call probe_data to verify giving is tracked and the range is valid.`,
    }
  }
  return { rows, shape: 'week_start: string; total_giving: number' }
}

// YTD vs prior year using attendance_per_occurrence view.
// Sums total_attendance (NULL = not entered, excluded per critical rule #4).
async function ytdVsPrior(ctx: MetricContext, p: Record<string, unknown>) {
  const asOf = String(p.as_of_date)
  const year = Number(asOf.slice(0, 4))
  if (!Number.isInteger(year)) throw new Error('as_of_date must be YYYY-MM-DD')

  const currentStart = `${year}-01-01`
  const currentEnd   = asOf
  const priorStart   = `${year - 1}-01-01`
  const priorEnd     = asOf.replace(`${year}-`, `${year - 1}-`)

  async function sumRange(a: string, b: string) {
    const { data, error } = await ctx.supabase
      .from('attendance_per_occurrence')
      .select('service_date, total_attendance')
      .eq('church_id', ctx.churchId)
      .gte('service_date', a)
      .lte('service_date', b)
    if (error) throw new Error(`ytd_vs_prior: ${error.message}`)

    let sum = 0
    let weeks = 0
    const weekSet = new Set<string>()
    for (const row of (data ?? []) as { service_date: string; total_attendance: number | null }[]) {
      if (row.total_attendance === null) continue
      sum += row.total_attendance
      weekSet.add(sundayOf(row.service_date))
    }
    weeks = weekSet.size
    return { sum, weeks, avg: weeks ? Math.round(sum / weeks) : 0 }
  }

  const [current, prior] = await Promise.all([
    sumRange(currentStart, currentEnd),
    sumRange(priorStart,   priorEnd),
  ])

  const warning = (current.weeks === 0 || prior.weeks === 0)
    ? [
        current.weeks === 0 ? `${year} YTD has no logged attendance.` : '',
        prior.weeks   === 0 ? `${year - 1} YTD has no logged attendance.` : '',
      ].filter(Boolean).join(' ')
    : undefined

  return {
    rows: [
      { label: `${year} YTD`,     total: current.sum, avg: current.avg, weeks: current.weeks },
      { label: `${year - 1} YTD`, total: prior.sum,   avg: prior.avg,   weeks: prior.weeks },
    ],
    shape: 'label: string; total: number; avg: number; weeks: number',
    warning,
  }
}

// Monthly volunteer totals per metric (category) using metric_entries
// WHERE reporting_tag_code='VOLUNTEERS'. The metrics table provides the
// category name (metrics.name).
//
// Two-step pattern (mirrors dashboard.ts): first collect active service_instance
// IDs in range from volunteers_per_occurrence, then query metric_entries by
// those IDs. This avoids unreliable embedded-column filters in PostgREST.
async function volunteerCountsMonth(ctx: MetricContext, p: Record<string, unknown>) {
  const start = String(p.start_date)
  const end   = String(p.end_date)

  // Step 1: active occurrence IDs in range from the volunteers_per_occurrence view.
  const { data: volViewData, error: volViewErr } = await ctx.supabase
    .from('volunteers_per_occurrence')
    .select('service_instance_id, service_date')
    .eq('church_id', ctx.churchId)
    .gte('service_date', start)
    .lte('service_date', end)
  if (volViewErr) throw new Error(`volunteer_counts_month (view): ${volViewErr.message}`)

  // Also include any occurrence that has metric_entries but no volunteer total
  // in the view — use attendance_per_occurrence as the authoritative occurrence list.
  const { data: attViewData, error: attViewErr } = await ctx.supabase
    .from('attendance_per_occurrence')
    .select('service_instance_id, service_date')
    .eq('church_id', ctx.churchId)
    .gte('service_date', start)
    .lte('service_date', end)
  if (attViewErr) throw new Error(`volunteer_counts_month (att view): ${attViewErr.message}`)

  // Build occurrence ID → date map for quick lookups.
  const occDateMap = new Map<string, string>()
  for (const r of (volViewData ?? []) as { service_instance_id: string; service_date: string }[]) {
    occDateMap.set(r.service_instance_id, r.service_date)
  }
  for (const r of (attViewData ?? []) as { service_instance_id: string; service_date: string }[]) {
    if (!occDateMap.has(r.service_instance_id)) occDateMap.set(r.service_instance_id, r.service_date)
  }

  const inRangeIds = Array.from(occDateMap.keys())
  if (inRangeIds.length === 0) {
    return {
      rows: [],
      shape: 'month: string; category_name: string; total: number',
      hint: `No active services found for ${start}–${end}.`,
    }
  }

  // Step 2: VOLUNTEERS metric_entries for those occurrences, join metrics for name.
  // reporting_tag_code is denormalized on metric_entries (unified schema).
  const { data, error } = await ctx.supabase
    .from('metric_entries')
    .select('metric_id, value, is_not_applicable, service_instance_id, metrics!inner(name)')
    .eq('church_id', ctx.churchId)
    .eq('reporting_tag_code', 'VOLUNTEERS')
    .eq('is_not_applicable', false)
    .not('value', 'is', null)
    .in('service_instance_id', inRangeIds)
  if (error) throw new Error(`volunteer_counts_month: ${error.message}`)

  const agg = new Map<string, number>()
  for (const rawRow of data ?? []) {
    const row = rawRow as {
      metric_id: string
      value: number | null
      is_not_applicable: boolean
      service_instance_id: string
      metrics: { name: string } | { name: string }[]
    }
    if (row.is_not_applicable || row.value === null) continue
    const serviceDate = occDateMap.get(row.service_instance_id)
    if (!serviceDate) continue
    const m   = serviceDate.slice(0, 7)
    const met = Array.isArray(row.metrics) ? row.metrics[0] : row.metrics
    const name = met?.name ?? row.metric_id
    const key  = `${m}|${name}`
    agg.set(key, (agg.get(key) ?? 0) + Number(row.value))
  }

  const rows = [...agg.entries()].map(([key, total]) => {
    const [month, ...rest] = key.split('|')
    return { month, category_name: rest.join('|'), total }
  })
  rows.sort((a, b) => (a.month + a.category_name).localeCompare(b.month + b.category_name))

  if (rows.length === 0) {
    return {
      rows,
      shape: 'month: string; category_name: string; total: number',
      hint: `No volunteer entries found for ${start}–${end}. Call probe_data to check if volunteers are tracked.`,
    }
  }
  return { rows, shape: 'month: string; category_name: string; total: number' }
}

// Response/stat totals per metric (category) using metric_entries
// WHERE reporting_tag_code='RESPONSE_STAT'. The metrics table provides the
// category name (metrics.name).
//
// Same two-step pattern as volunteerCountsMonth: collect active occurrence IDs
// from the attendance view, then query metric_entries by those IDs.
async function responseTotalRange(ctx: MetricContext, p: Record<string, unknown>) {
  const start = String(p.start_date)
  const end   = String(p.end_date)

  // Step 1: active occurrence IDs in range.
  const { data: attViewData, error: attViewErr } = await ctx.supabase
    .from('attendance_per_occurrence')
    .select('service_instance_id')
    .eq('church_id', ctx.churchId)
    .gte('service_date', start)
    .lte('service_date', end)
  if (attViewErr) throw new Error(`response_total_range (view): ${attViewErr.message}`)

  const inRangeIds = Array.from(new Set(
    (attViewData ?? [] as { service_instance_id: string }[]).map((r: { service_instance_id: string }) => r.service_instance_id)
  ))
  if (inRangeIds.length === 0) {
    return {
      rows: [],
      shape: 'category_name: string; total: number',
      hint: `No active services found for ${start}–${end}.`,
    }
  }

  // Step 2: RESPONSE_STAT metric_entries for those occurrences, join metrics for name.
  const { data, error } = await ctx.supabase
    .from('metric_entries')
    .select('metric_id, value, is_not_applicable, metrics!inner(name)')
    .eq('church_id', ctx.churchId)
    .eq('reporting_tag_code', 'RESPONSE_STAT')
    .eq('is_not_applicable', false)
    .not('value', 'is', null)
    .in('service_instance_id', inRangeIds)
  if (error) throw new Error(`response_total_range: ${error.message}`)

  const agg = new Map<string, number>()
  for (const rawRow of data ?? []) {
    const row = rawRow as {
      metric_id: string
      value: number | null
      is_not_applicable: boolean
      metrics: { name: string } | { name: string }[]
    }
    if (row.is_not_applicable || row.value === null) continue
    const met  = Array.isArray(row.metrics) ? row.metrics[0] : row.metrics
    const name = met?.name ?? row.metric_id
    agg.set(name, (agg.get(name) ?? 0) + Number(row.value))
  }

  const rows = [...agg.entries()].map(([category_name, total]) => ({ category_name, total }))
  rows.sort((a, b) => b.total - a.total)

  if (rows.length === 0) {
    return {
      rows,
      shape: 'category_name: string; total: number',
      hint: `No response/stat entries found for ${start}–${end}. Call probe_data to check if responses are tracked.`,
    }
  }
  return { rows, shape: 'category_name: string; total: number' }
}

// ---------- helpers ----------

/**
 * Returns the Sunday (week-start, matching dashboard.ts convention) for a
 * YYYY-MM-DD service date. Mirrors weekStartOf() in dashboard.ts exactly.
 */
function sundayOf(ymd: string): string {
  const d   = new Date(`${ymd}T12:00:00`)
  const day = d.getDay()          // 0=Sun … 6=Sat
  d.setDate(d.getDate() - day)    // back to Sunday
  return d.toISOString().split('T')[0]
}
