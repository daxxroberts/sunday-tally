// POST /api/occurrences — server-side occurrence (service_instances) get-or-create.
// D-052 / N104: the client never writes service_instances directly.
//
// Rebuilt for the post-cutover schema + the final role model:
//   • The legacy `occurrences` (timeframe parent) and `instance_tags` tables
//     were dropped in the tag-first cutover — this route no longer touches
//     them. Grouping is done via service_template_tags at read time, so no
//     per-instance tag stamping is needed.
//   • Occurrence creation is EDITOR-AND-ABOVE: materializing the occurrence is
//     part of entering the week's data (the editor's core job). This route
//     authorizes owner/admin/editor and returns a clean 403 for viewers.
//     (0032 makes the DB the authority too; this check holds even before 0032.)
//   • Idempotent get-or-create on (church_id, location_id, service_template_id,
//     service_date, status='active'); concurrent callers converge.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { service_template_id, service_date, location_id, church_id } = await req.json()
  if (!service_template_id || !service_date || !location_id || !church_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Editors and up may create occurrences — creating the occurrence is part of
  // entering the week's data, which is the editor's core job. (Viewers are
  // read-only.) This also enforces tenant scope: a caller with no active
  // membership in church_id is rejected here.
  const { data: membership } = await supabase
    .from('church_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('church_id', church_id)
    .eq('is_active', true)
    .maybeSingle()
  if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 1. Get — return the existing active occurrence if one is already there.
  const { data: existing } = await supabase
    .from('service_instances')
    .select('id')
    .eq('church_id', church_id)
    .eq('service_template_id', service_template_id)
    .eq('location_id', location_id)
    .eq('service_date', service_date)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) return NextResponse.json({ occurrence_id: existing.id })

  // 2. Create.
  const { data: created, error: occError } = await supabase
    .from('service_instances')
    .insert({
      church_id,
      service_template_id,
      location_id,
      service_date,
      status: 'active',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (occError || !created) {
    // Race: another request created it between our SELECT and INSERT. Re-read.
    const { data: raceExisting } = await supabase
      .from('service_instances')
      .select('id')
      .eq('church_id', church_id)
      .eq('service_template_id', service_template_id)
      .eq('location_id', location_id)
      .eq('service_date', service_date)
      .eq('status', 'active')
      .maybeSingle()
    if (raceExisting) return NextResponse.json({ occurrence_id: raceExisting.id })
    return NextResponse.json({ error: 'Failed to create occurrence' }, { status: 500 })
  }

  return NextResponse.json({ occurrence_id: created.id })
}
