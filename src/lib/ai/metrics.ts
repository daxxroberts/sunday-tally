import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Named metric registry for the analytics chat. Each metric runs a tightly
 * scoped SQL-over-Supabase query against a single church_id that the server
 * injects — the AI never provides it. No free-form SQL reaches the database.
 *
 * Every metric:
 *   - filters service_occurrences.status = 'active'
 *   - treats NULL attendance as "not entered" (never coalesced to 0 in averages)
 *   - returns a tidy array the AI can either reason over or pass to render_chart
 */

export type MetricId =
  | 'attendance_by_week'
  | 'attendance_by_template_month'
  | 'giving_by_source_month'
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
    description: 'Weekly attendance totals (MAIN+KIDS+YOUTH, NULLs skipped) over a date range.',
    params: {
      start_date: { type: 'string', description: 'YYYY-MM-DD inclusive lower bound' },
      end_date:   { type: 'string', description: 'YYYY-MM-DD inclusive upper bound' },
      tag_code:   { type: 'string', description: 'Optional primary_tag_code filter (e.g. MORNING).' },
    },
  },
  {
    id:          'attendance_by_template_month',
    description: 'Per-service-template monthly attendance average for the current year.',
    params: {
      year: { type: 'integer', description: 'Calendar year, e.g. 2026' },
    },
  },
  {
    id:          'giving_by_source_month',
    description: 'Giving totals per source, summed per month in the provided range.',
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
    description: 'Monthly volunteer totals per category over the date range.',
    params: {
      start_date: { type: 'string', description: 'YYYY-MM-DD inclusive' },
      end_date:   { type: 'string', description: 'YYYY-MM-DD inclusive' },
    },
  },
  {
    id:          'response_total_range',
    description: 'Sum of response/stat counts per category over the date range.',
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
): Promise<{ rows: unknown[]; shape: string }> {
  switch (id) {
    case 'attendance_by_week':           return attendanceByWeek(ctx, params)
    case 'attendance_by_template_month': return attendanceByTemplateMonth(ctx, params)
    case 'giving_by_source_month':       return givingBySourceMonth(ctx, params)
    case 'ytd_vs_prior':                 return ytdVsPrior(ctx, params)
    case 'volunteer_counts_month':       return volunteerCountsMonth(ctx, params)
    case 'response_total_range':         return responseTotalRange(ctx, params)
    default:
      throw new Error(`Unknown metric: ${id}`)
  }
}

// ---------- metric implementations ----------

async function attendanceByWeek(ctx: MetricContext, p: Record<string, unknown>) {
  const start = String(p.start_date)
  const end   = String(p.end_date)
  const tagCode = p.tag_code ? String(p.tag_code) : null

  let templateFilter: string[] | null = null
  if (tagCode) {
    const { data: tag } = await ctx.supabase
      .from('service_tags').select('id').eq('church_id', ctx.churchId).eq('tag_code', tagCode).maybeSingle()
    if (!tag) return { rows: [], shape: 'week_start: string; total: number' }
    const { data: templates } = await ctx.supabase
      .from('service_templates').select('id').eq('church_id', ctx.churchId).eq('primary_tag_id', tag.id)
    templateFilter = (templates ?? []).map(t => t.id)
    if (templateFilter.length === 0) return { rows: [], shape: 'week_start: string; total: number' }
  }

  let query = ctx.supabase
    .from('service_occurrences')
    .select('service_date, attendance_entries(main_attendance, kids_attendance, youth_attendance)')
    .eq('church_id', ctx.churchId)
    .eq('status', 'active')
    .gte('service_date', start)
    .lte('service_date', end)
    .order('service_date', { ascending: true })
  if (templateFilter) query = query.in('service_template_id', templateFilter)

  const { data, error } = await query
  if (error) throw new Error(`attendance_by_week: ${error.message}`)

  const byWeek = new Map<string, number>()
  for (const rawRow of data ?? []) {
    const row = rawRow as unknown as Record<string, unknown>
    const entry = pickEntry(row, 'attendance_entries') as Record<string, number | null> | undefined
    if (!entry) continue
    const total = (entry.main_attendance ?? 0) + (entry.kids_attendance ?? 0) + (entry.youth_attendance ?? 0)
    const key = isoWeekKey(String(row.service_date))
    byWeek.set(key, (byWeek.get(key) ?? 0) + total)
  }

  const rows = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week_start, total]) => ({ week_start, total }))

  return { rows, shape: 'week_start: string; total: number' }
}

async function attendanceByTemplateMonth(ctx: MetricContext, p: Record<string, unknown>) {
  const year = Number(p.year)
  if (!Number.isInteger(year)) throw new Error('year must be an integer')

  const start = `${year}-01-01`
  const end   = `${year}-12-31`

  const { data, error } = await ctx.supabase
    .from('service_occurrences')
    .select(`
      service_date,
      service_template_id,
      service_templates!inner(display_name),
      attendance_entries(main_attendance, kids_attendance, youth_attendance)
    `)
    .eq('church_id', ctx.churchId)
    .eq('status', 'active')
    .gte('service_date', start)
    .lte('service_date', end)
  if (error) throw new Error(`attendance_by_template_month: ${error.message}`)

  const agg = new Map<string, { sum: number; count: number; template_name: string; month: string }>()
  for (const rawRow of data ?? []) {
    const row = rawRow as unknown as Record<string, unknown>
    const entry = pickEntry(row, 'attendance_entries') as Record<string, number | null> | undefined
    if (!entry) continue
    const m = String(row.service_date).slice(0, 7)
    const st = pickJoined(row, 'service_templates') as { display_name?: string } | undefined
    const name = st?.display_name ?? 'Unknown'
    const key = `${String(row.service_template_id)}|${m}`
    const total = (entry.main_attendance ?? 0) + (entry.kids_attendance ?? 0) + (entry.youth_attendance ?? 0)
    const a = agg.get(key) ?? { sum: 0, count: 0, template_name: name, month: m }
    a.sum += total; a.count += 1
    agg.set(key, a)
  }
  const rows = [...agg.values()].map(v => ({
    month:         v.month,
    template_name: v.template_name,
    avg:           v.count ? Math.round(v.sum / v.count) : 0,
  }))
  rows.sort((a, b) => (a.month + a.template_name).localeCompare(b.month + b.template_name))
  return { rows, shape: 'month: string; template_name: string; avg: number' }
}

async function givingBySourceMonth(ctx: MetricContext, p: Record<string, unknown>) {
  const start = String(p.start_date)
  const end   = String(p.end_date)

  const { data, error } = await ctx.supabase
    .from('service_occurrences')
    .select(`
      service_date,
      giving_entries(giving_amount, giving_source_id, giving_sources(source_name))
    `)
    .eq('church_id', ctx.churchId)
    .eq('status', 'active')
    .gte('service_date', start)
    .lte('service_date', end)
  if (error) throw new Error(`giving_by_source_month: ${error.message}`)

  const agg = new Map<string, number>()
  for (const row of data ?? []) {
    const month = String((row as { service_date: string }).service_date).slice(0, 7)
    const giving = (row as { giving_entries?: unknown[] }).giving_entries ?? []
    for (const g of giving as { giving_amount: number; giving_sources?: { source_name?: string } }[]) {
      const name = g.giving_sources?.source_name ?? 'Unknown'
      const key = `${month}|${name}`
      agg.set(key, (agg.get(key) ?? 0) + Number(g.giving_amount ?? 0))
    }
  }
  const rows = [...agg.entries()].map(([key, total]) => {
    const [month, source_name] = key.split('|')
    return { month, source_name, total: Math.round(total * 100) / 100 }
  })
  rows.sort((a, b) => (a.month + a.source_name).localeCompare(b.month + b.source_name))
  return { rows, shape: 'month: string; source_name: string; total: number' }
}

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
      .from('service_occurrences')
      .select('attendance_entries(main_attendance, kids_attendance, youth_attendance)')
      .eq('church_id', ctx.churchId)
      .eq('status', 'active')
      .gte('service_date', a)
      .lte('service_date', b)
    if (error) throw new Error(`ytd_vs_prior: ${error.message}`)
    let sum = 0
    let weeks = 0
    for (const row of data ?? []) {
      const e = pickEntry(row, 'attendance_entries') as Record<string, number | null> | undefined
      if (!e) continue
      sum += (e.main_attendance ?? 0) + (e.kids_attendance ?? 0) + (e.youth_attendance ?? 0)
      weeks += 1
    }
    return { sum, weeks, avg: weeks ? Math.round(sum / weeks) : 0 }
  }

  const [current, prior] = await Promise.all([
    sumRange(currentStart, currentEnd),
    sumRange(priorStart,   priorEnd),
  ])

  return {
    rows: [
      { label: `${year} YTD`,     total: current.sum, avg: current.avg, weeks: current.weeks },
      { label: `${year - 1} YTD`, total: prior.sum,   avg: prior.avg,   weeks: prior.weeks },
    ],
    shape: 'label: string; total: number; avg: number; weeks: number',
  }
}

async function volunteerCountsMonth(ctx: MetricContext, p: Record<string, unknown>) {
  const start = String(p.start_date)
  const end   = String(p.end_date)

  const { data, error } = await ctx.supabase
    .from('service_occurrences')
    .select(`
      service_date,
      volunteer_entries(volunteer_count, is_not_applicable, volunteer_categories(category_name))
    `)
    .eq('church_id', ctx.churchId)
    .eq('status', 'active')
    .gte('service_date', start)
    .lte('service_date', end)
  if (error) throw new Error(`volunteer_counts_month: ${error.message}`)

  const agg = new Map<string, number>()
  for (const row of data ?? []) {
    const month = String((row as { service_date: string }).service_date).slice(0, 7)
    const vols = (row as { volunteer_entries?: unknown[] }).volunteer_entries ?? []
    for (const v of vols as { volunteer_count: number; is_not_applicable: boolean; volunteer_categories?: { category_name?: string } }[]) {
      if (v.is_not_applicable) continue
      const name = v.volunteer_categories?.category_name ?? 'Unknown'
      const key = `${month}|${name}`
      agg.set(key, (agg.get(key) ?? 0) + Number(v.volunteer_count ?? 0))
    }
  }
  const rows = [...agg.entries()].map(([key, total]) => {
    const [month, category_name] = key.split('|')
    return { month, category_name, total }
  })
  rows.sort((a, b) => (a.month + a.category_name).localeCompare(b.month + b.category_name))
  return { rows, shape: 'month: string; category_name: string; total: number' }
}

async function responseTotalRange(ctx: MetricContext, p: Record<string, unknown>) {
  const start = String(p.start_date)
  const end   = String(p.end_date)

  const { data, error } = await ctx.supabase
    .from('service_occurrences')
    .select(`
      response_entries(stat_value, is_not_applicable, response_categories(category_name))
    `)
    .eq('church_id', ctx.churchId)
    .eq('status', 'active')
    .gte('service_date', start)
    .lte('service_date', end)
  if (error) throw new Error(`response_total_range: ${error.message}`)

  const agg = new Map<string, number>()
  for (const row of data ?? []) {
    const entries = (row as { response_entries?: unknown[] }).response_entries ?? []
    for (const r of entries as { stat_value: number; is_not_applicable: boolean; response_categories?: { category_name?: string } }[]) {
      if (r.is_not_applicable) continue
      const name = r.response_categories?.category_name ?? 'Unknown'
      agg.set(name, (agg.get(name) ?? 0) + Number(r.stat_value ?? 0))
    }
  }
  const rows = [...agg.entries()].map(([category_name, total]) => ({ category_name, total }))
  rows.sort((a, b) => b.total - a.total)
  return { rows, shape: 'category_name: string; total: number' }
}

// ---------- helpers ----------

function pickEntry(row: unknown, key: string): Record<string, unknown> | undefined {
  const val = (row as Record<string, unknown>)[key]
  if (Array.isArray(val)) return val[0] as Record<string, unknown> | undefined
  return val as Record<string, unknown> | undefined
}

function pickJoined(row: unknown, key: string): Record<string, unknown> | undefined {
  const val = (row as Record<string, unknown>)[key]
  if (Array.isArray(val)) return val[0] as Record<string, unknown> | undefined
  return val as Record<string, unknown> | undefined
}

/** ISO week start (Monday) for a YYYY-MM-DD date. */
function isoWeekKey(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  const day = d.getUTCDay() || 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1))
  return d.toISOString().slice(0, 10)
}
