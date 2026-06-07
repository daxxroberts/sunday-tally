'use server'

// T6 service template actions
// E2e: primary tag required | D-042 | D-046

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface TemplateInput {
  id: string | null
  display_name: string
  location_id: string
  sort_order: number
  primary_tag_id: string
  subtag_ids: string[]
}

export async function saveTemplatesAction(templates: TemplateInput[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return { error: 'No church found' }
  const churchId = membership.church_id

  for (const tmpl of templates) {
    let templateId = tmpl.id

    if (templateId) {
      const { error } = await supabase
        .from('service_templates')
        .update({
          display_name: tmpl.display_name.trim(),
          location_id: tmpl.location_id,
          sort_order: tmpl.sort_order,
          primary_tag_id: tmpl.primary_tag_id,
        })
        .eq('id', templateId)
        .eq('church_id', churchId)
      if (error) return { error: 'Failed to save service.' }
    } else {
      const service_code = tmpl.display_name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').substring(0, 8) + '_' + Math.random().toString(36).substring(2, 6).toUpperCase()
      const { data, error } = await supabase
        .from('service_templates')
        .insert({
          church_id: churchId,
          service_code,
          display_name: tmpl.display_name.trim(),
          location_id: tmpl.location_id,
          sort_order: tmpl.sort_order,
          primary_tag_id: tmpl.primary_tag_id,
          is_active: true,
        })
        .select('id')
        .single()
      if (error || !data) return { error: 'Failed to create service.' }
      templateId = data.id
    }

    // Write ministry composition to service_template_tags. The Services & Entries
    // screens read composition ENTIRELY from this table (D-076: equal-peer
    // ministries, no "primary" badge), so the primary ministry MUST be written
    // here too — not only to service_templates.primary_tag_id — or the service
    // shows zero ministries and never renders in Entries. Replace-all: primary
    // first (sort_order 0), then subtags, de-duped. Tags are read at query time;
    // no per-occurrence stamping in the unified schema.
    const ministryIds = [tmpl.primary_tag_id, ...tmpl.subtag_ids]
      .filter((id, i, arr) => !!id && arr.indexOf(id) === i)
    await supabase
      .from('service_template_tags')
      .delete()
      .eq('church_id', churchId)
      .eq('service_template_id', templateId)
    if (ministryIds.length > 0) {
      const rows = ministryIds.map((tagId, i) => ({
        church_id: churchId,
        service_template_id: templateId,
        ministry_tag_id: tagId,
        sort_order: i,
      }))
      await supabase.from('service_template_tags').insert(rows)
    }
  }

  revalidatePath('/onboarding/services')
  return {}
}

export async function getChurchData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return null
  const churchId = membership.church_id

  const [locResult, tagResult, tmplResult] = await Promise.all([
    supabase.from('church_locations').select('id, name, sort_order').eq('church_id', churchId).eq('is_active', true).order('sort_order'),
    supabase.from('service_tags').select('id, name, code, tag_role').eq('church_id', churchId).eq('is_active', true),
    supabase.from('service_templates').select('id, display_name, location_id, sort_order, primary_tag_id').eq('church_id', churchId).eq('is_active', true).order('sort_order'),
  ])

  return {
    churchId,
    locations: locResult.data ?? [],
    tags: tagResult.data ?? [],
    templates: tmplResult.data ?? [],
  }
}
