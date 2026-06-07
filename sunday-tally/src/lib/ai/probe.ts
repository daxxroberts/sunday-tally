import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * probeData — tells the AI what data is actually logged for a church before it
 * calls run_metric with a time-bounded range.
 *
 * Unified schema (migrations 0022+): the dropped attendance_entries,
 * giving_entries, volunteer_entries, and response_entries tables are gone.
 * Presence is now checked via the per-occurrence views and metric_entries:
 *   - attendance  → attendance_per_occurrence (view, status='active' enforced)
 *   - giving      → giving_per_week (view, status='active' enforced)
 *   - volunteers  → metric_entries WHERE reporting_tag_code='VOLUNTEERS'
 *   - responses   → metric_entries WHERE reporting_tag_code='RESPONSE_STAT'
 *
 * service_tags.code is the unified-schema column (was tag_code before 0022).
 */

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
  // Overall service date range from service_instances (status='active').
  const [earliest, latest] = await Promise.all([
    supabase
      .from('service_instances')
      .select('service_date')
      .eq('church_id', churchId)
      .eq('status', 'active')
      .order('service_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('service_instances')
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

  // Optional tag filter: resolve service_tags.code → service_template_id list.
  // Uses service_tags.code (unified schema; was tag_code before migration 0022).
  let templateIds: string[] | null = null
  if (input.tag_code) {
    const { data: tag } = await supabase
      .from('service_tags')
      .select('id')
      .eq('church_id', churchId)
      .eq('code', input.tag_code)   // unified schema: code (not tag_code)
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

  // ── Base: active service_instances in range ──────────────────────────────────
  let baseQuery = supabase
    .from('service_instances')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .eq('status', 'active')
    .gte('service_date', start)
    .lte('service_date', end)
  if (templateIds) baseQuery = baseQuery.in('service_template_id', templateIds)
  const base = await baseQuery

  // ── Attendance: count service_instances that appear in the view ──────────────
  // attendance_per_occurrence only has rows where attendance was entered.
  // (status='active' is enforced by the view.) Filter by template if needed.
  let attQuery = supabase
    .from('attendance_per_occurrence')
    .select('service_instance_id', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .gte('service_date', start)
    .lte('service_date', end)
  if (templateIds) attQuery = attQuery.in('service_template_id', templateIds)
  const att = await attQuery

  // ── Giving: count weeks in giving_per_week in range ─────────────────────────
  // giving_per_week is church-wide (no template filter).
  const giv = await supabase
    .from('giving_per_week')
    .select('week_start', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .gte('week_start', start)
    .lte('week_start', end)

  // ── Volunteers + Responses: two-step (mirrors dashboard.ts) ─────────────────
  // Collect active occurrence IDs from the views first, then count metric_entries
  // by those IDs. This avoids unreliable embedded-column filters in PostgREST.
  const [volViewData, attViewData] = await Promise.all([
    supabase
      .from('volunteers_per_occurrence')
      .select('service_instance_id')
      .eq('church_id', churchId)
      .gte('service_date', start)
      .lte('service_date', end),
    supabase
      .from('attendance_per_occurrence')
      .select('service_instance_id')
      .eq('church_id', churchId)
      .gte('service_date', start)
      .lte('service_date', end),
  ])
  const inRangeIds = Array.from(new Set<string>([
    ...(volViewData.data ?? [] as { service_instance_id: string }[]).map((r: { service_instance_id: string }) => r.service_instance_id),
    ...(attViewData.data ?? [] as { service_instance_id: string }[]).map((r: { service_instance_id: string }) => r.service_instance_id),
  ]))

  let volCount = 0
  let respCount = 0
  if (inRangeIds.length > 0) {
    const [vol, resp] = await Promise.all([
      supabase
        .from('metric_entries')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .eq('reporting_tag_code', 'VOLUNTEERS')
        .eq('is_not_applicable', false)
        .not('value', 'is', null)
        .in('service_instance_id', inRangeIds),
      supabase
        .from('metric_entries')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .eq('reporting_tag_code', 'RESPONSE_STAT')
        .eq('is_not_applicable', false)
        .not('value', 'is', null)
        .in('service_instance_id', inRangeIds),
    ])
    volCount  = vol.count  ?? 0
    respCount = resp.count ?? 0
  }

  result.in_range = {
    start,
    end,
    occurrences:     base.count ?? 0,
    with_attendance: att.count  ?? 0,
    with_giving:     giv.count  ?? 0,
    with_volunteers: volCount,
    with_responses:  respCount,
  }

  return result
}
