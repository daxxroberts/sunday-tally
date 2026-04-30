import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProbeInput {
  start_date?: string
  end_date?:   string
  tag_code?:   string
}

export interface ProbeResult {
  earliest_service: string | null
  latest_service:   string | null
  in_range?: {
    start:            string
    end:              string
    occurrences:      number
    with_attendance:  number
    with_giving:      number
    with_volunteers:  number
    with_responses:   number
  }
}

export async function probeData(
  supabase: SupabaseClient,
  churchId: string,
  input:    ProbeInput,
): Promise<ProbeResult> {
  const [earliest, latest] = await Promise.all([
    supabase
      .from('service_occurrences')
      .select('service_date')
      .eq('church_id', churchId)
      .eq('status', 'active')
      .order('service_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('service_occurrences')
      .select('service_date')
      .eq('church_id', churchId)
      .eq('status', 'active')
      .order('service_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const result: ProbeResult = {
    earliest_service: (earliest.data as { service_date: string } | null)?.service_date ?? null,
    latest_service:   (latest.data   as { service_date: string } | null)?.service_date ?? null,
  }

  const start = input.start_date
  const end   = input.end_date
  if (!start || !end) return result

  // Resolve optional tag_code → template IDs (same pattern as metrics.ts attendanceByWeek)
  let templateIds: string[] | null = null
  if (input.tag_code) {
    const { data: tag } = await supabase
      .from('service_tags')
      .select('id')
      .eq('church_id', churchId)
      .eq('tag_code', input.tag_code)
      .maybeSingle()
    if (!tag) {
      result.in_range = { start, end, occurrences: 0, with_attendance: 0, with_giving: 0, with_volunteers: 0, with_responses: 0 }
      return result
    }
    const { data: templates } = await supabase
      .from('service_templates')
      .select('id')
      .eq('church_id', churchId)
      .eq('primary_tag_id', tag.id)
    templateIds = (templates ?? []).map((t: { id: string }) => t.id)
    if (templateIds.length === 0) {
      result.in_range = { start, end, occurrences: 0, with_attendance: 0, with_giving: 0, with_volunteers: 0, with_responses: 0 }
      return result
    }
  }

  // Five parallel count queries — each starts with .select() so filter chains are valid
  function addFilters<T extends ReturnType<ReturnType<SupabaseClient['from']>['select']>>(q: T): T {
    let r = q.eq('church_id', churchId).eq('status', 'active').gte('service_date', start!).lte('service_date', end!) as T
    if (templateIds) r = (r as unknown as { in: (col: string, vals: string[]) => T }).in('service_template_id', templateIds) as T
    return r
  }

  const [base, att, giv, vol, resp] = await Promise.all([
    addFilters(supabase.from('service_occurrences').select('id',                                  { count: 'exact', head: true })),
    addFilters(supabase.from('service_occurrences').select('id, attendance_entries!inner(id)',  { count: 'exact', head: true })),
    addFilters(supabase.from('service_occurrences').select('id, giving_entries!inner(id)',      { count: 'exact', head: true })),
    addFilters(supabase.from('service_occurrences').select('id, volunteer_entries!inner(id)',   { count: 'exact', head: true })),
    addFilters(supabase.from('service_occurrences').select('id, response_entries!inner(id)',    { count: 'exact', head: true })),
  ])

  result.in_range = {
    start,
    end,
    occurrences:     base.count ?? 0,
    with_attendance: att.count  ?? 0,
    with_giving:     giv.count  ?? 0,
    with_volunteers: vol.count  ?? 0,
    with_responses:  resp.count ?? 0,
  }

  return result
}
