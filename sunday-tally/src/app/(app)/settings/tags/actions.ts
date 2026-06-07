'use server'

// Ministry metrics seeding (#metrics-blocker). A ministry only becomes enterable
// once it has `metrics` rows (Entries renders fields exclusively from metrics).
// Nothing in the product created metrics before this — so a fresh church could
// build ministries + services + schedules and still have zero fields to enter.
//
// seedMinistryMetrics creates the standard canonical metrics for a ministry,
// driven by the church's tracking flags:
//   • Attendance  — always (every ministry counts attendance)
//   • Volunteers  — if churches.tracks_volunteers
//   • Decisions   — if churches.tracks_responses (a RESPONSE_STAT / "Stats" metric)
// (Giving is church-wide weekly, seeded separately — not per ministry.)
//
// All instance-scope + canonical. Idempotent: skips any code already present for
// the ministry, so re-running (or editing then re-adding) never duplicates.
// Owner/admin only — metrics are church configuration.

import { createClient } from '@/lib/supabase/server'

export interface SeedResult { created: number; error?: string }

export async function seedMinistryMetrics(ministryTagId: string): Promise<SeedResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { created: 0, error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('role, church_id, churches(tracks_volunteers, tracks_responses)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return { created: 0, error: 'No church found' }
  if (membership.role !== 'owner' && membership.role !== 'admin') return { created: 0, error: 'Forbidden' }

  const churchId = membership.church_id as string
  const church = (Array.isArray(membership.churches) ? membership.churches[0] : membership.churches) as
    | { tracks_volunteers?: boolean; tracks_responses?: boolean }
    | null
  const tracksVolunteers = !!church?.tracks_volunteers
  const tracksResponses = !!church?.tracks_responses

  // Ministry name + code (for metric naming + code prefix), tenant-scoped.
  const { data: tag } = await supabase
    .from('service_tags')
    .select('name, code')
    .eq('id', ministryTagId)
    .eq('church_id', churchId)
    .maybeSingle()
  if (!tag) return { created: 0, error: 'Ministry not found' }

  // Resolve the church's reporting-tag ids by code (Attendance/Volunteers/Stats).
  const { data: rtags } = await supabase
    .from('reporting_tags')
    .select('id, code')
    .eq('church_id', churchId)
  const rtIdByCode = new Map((rtags ?? []).map(r => [r.code as string, r.id as string]))

  // Idempotency: don't recreate metric codes that already exist for this ministry.
  const { data: existing } = await supabase
    .from('metrics')
    .select('code')
    .eq('church_id', churchId)
    .eq('ministry_tag_id', ministryTagId)
  const have = new Set((existing ?? []).map(m => m.code as string))

  const want: Array<{ reportingCode: string; suffix: string; label: string; enabled: boolean }> = [
    { reportingCode: 'ATTENDANCE', suffix: 'ATTENDANCE', label: 'Attendance', enabled: true },
    { reportingCode: 'VOLUNTEERS', suffix: 'VOLUNTEERS', label: 'Volunteers', enabled: tracksVolunteers },
    { reportingCode: 'RESPONSE_STAT', suffix: 'DECISIONS', label: 'Decisions', enabled: tracksResponses },
  ]

  const rows: Array<Record<string, unknown>> = []
  for (const w of want) {
    if (!w.enabled) continue
    const reportingTagId = rtIdByCode.get(w.reportingCode)
    if (!reportingTagId) continue            // reporting tag missing for this church — skip rather than fail
    const code = `${tag.code}_${w.suffix}`
    if (have.has(code)) continue
    rows.push({
      church_id: churchId,
      ministry_tag_id: ministryTagId,
      reporting_tag_id: reportingTagId,
      scope: 'instance',
      code,
      name: `${tag.name} ${w.label}`,
      is_canonical: true,
      is_active: true,
    })
  }

  if (rows.length === 0) return { created: 0 }
  const { error } = await supabase.from('metrics').insert(rows)
  if (error) return { created: 0, error: error.message }
  return { created: rows.length }
}
