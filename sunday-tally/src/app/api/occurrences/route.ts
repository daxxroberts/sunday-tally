// POST /api/occurrences — D-052 server-side occurrence creation
// N104: client never writes service_occurrences directly
// Tags stamped at creation time (Rule 6)

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { service_template_id, service_date, location_id, church_id } = await req.json()

  // 1. Check for existing occurrence (handle concurrent creation — F6)
  const { data: existing } = await supabase
    .from('service_occurrences')
    .select('id')
    .eq('service_template_id', service_template_id)
    .eq('service_date', service_date)
    .eq('status', 'active')
    .single()

  if (existing) {
    return NextResponse.json({ occurrence_id: existing.id })
  }

  // 2. INSERT service_occurrences
  const { data: newOccurrence, error: occError } = await supabase
    .from('service_occurrences')
    .insert({
      church_id,
      service_template_id,
      location_id,
      service_date,
      status: 'active',
    })
    .select('id')
    .single()

  if (occError || !newOccurrence) {
    // Race condition — try fetching existing again
    const { data: raceExisting } = await supabase
      .from('service_occurrences')
      .select('id')
      .eq('service_template_id', service_template_id)
      .eq('service_date', service_date)
      .eq('status', 'active')
      .single()
    if (raceExisting) return NextResponse.json({ occurrence_id: raceExisting.id })
    return NextResponse.json({ error: 'Failed to create occurrence' }, { status: 500 })
  }

  // 3. Stamp active tags onto occurrence (N45 / Rule 6)
  const { data: templateTags } = await supabase
    .from('service_template_tags')
    .select('service_tag_id')
    .eq('service_template_id', service_template_id)

  // Also include primary tag
  const { data: template } = await supabase
    .from('service_templates')
    .select('primary_tag_id')
    .eq('id', service_template_id)
    .single()

  const tagIds = new Set<string>()
  if (template?.primary_tag_id) tagIds.add(template.primary_tag_id)
  templateTags?.forEach(t => tagIds.add(t.service_tag_id))

  if (tagIds.size > 0) {
    const occurrenceTags = Array.from(tagIds).map(tagId => ({
      service_occurrence_id: newOccurrence.id,
      service_tag_id: tagId,
    }))
    await supabase.from('service_occurrence_tags').insert(occurrenceTags)
  }

  return NextResponse.json({ occurrence_id: newOccurrence.id })
}
