// POST /api/occurrences — D-052 server-side occurrence creation
// N104: client never writes service_instances directly
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
    .from('service_instances')
    .select('id')
    .eq('service_template_id', service_template_id)
    .eq('service_date', service_date)
    .eq('status', 'active')
    .single()

  if (existing) {
    return NextResponse.json({ occurrence_id: existing.id })
  }

  // 1b. Create or get the parent Timeframe Occurrence (Weekly)
  // We use the Sunday of the service_date as the occurrence_date for 'weekly' timeframes
  const dateObj = new Date(service_date + 'T12:00:00')
  const day = dateObj.getDay()
  const sunday = new Date(dateObj)
  sunday.setDate(dateObj.getDate() - day)
  const sundayStr = sunday.toISOString().split('T')[0]

  let timeframeId: string | null = null

  const { data: tfExisting } = await supabase
    .from('occurrences')
    .select('id')
    .eq('church_id', church_id)
    .eq('location_id', location_id)
    .eq('timeframe_type', 'weekly')
    .eq('occurrence_date', sundayStr)
    .single()

  if (tfExisting) {
    timeframeId = tfExisting.id
  } else {
    const { data: tfNew } = await supabase
      .from('occurrences')
      .insert({
        church_id,
        location_id,
        timeframe_type: 'weekly',
        occurrence_date: sundayStr
      })
      .select('id')
      .single()
    if (tfNew) timeframeId = tfNew.id
  }

  // 2. INSERT service_instances
  const { data: newOccurrence, error: occError } = await supabase
    .from('service_instances')
    .insert({
      church_id,
      service_template_id,
      location_id,
      occurrence_id: timeframeId,
      service_date,
      status: 'active',
    })
    .select('id')
    .single()

  if (occError || !newOccurrence) {
    // Race condition — try fetching existing again
    const { data: raceExisting } = await supabase
      .from('service_instances')
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
      service_instance_id: newOccurrence.id,
      service_tag_id: tagId,
    }))
    await supabase.from('instance_tags').insert(occurrenceTags)
  }

  return NextResponse.json({ occurrence_id: newOccurrence.id })
}
