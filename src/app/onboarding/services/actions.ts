'use server'

// T6 service template actions
// E2e: primary tag required | D-042 | D-046 | apply_tag_to_occurrences on subtag assign

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
      const { data, error } = await supabase
        .from('service_templates')
        .insert({
          church_id: churchId,
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

    // Stamp primary tag onto occurrences (Rule 6 / D-040)
    await supabase.rpc('apply_tag_to_occurrences', {
      p_tag_id: tmpl.primary_tag_id,
      p_template_id: templateId,
    })

    // Handle subtags (E2f)
    if (tmpl.subtag_ids.length > 0) {
      // Remove old subtags
      await supabase
        .from('service_template_tags')
        .delete()
        .eq('service_template_id', templateId)

      // Insert new subtags
      const subtags = tmpl.subtag_ids.map(tagId => ({
        service_template_id: templateId,
        service_tag_id: tagId,
      }))
      await supabase.from('service_template_tags').insert(subtags)

      // Stamp each subtag
      for (const tagId of tmpl.subtag_ids) {
        await supabase.rpc('apply_tag_to_occurrences', {
          p_tag_id: tagId,
          p_template_id: templateId,
        })
      }
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
    supabase.from('service_tags').select('id, tag_name, tag_code, effective_start_date, effective_end_date').eq('church_id', churchId).eq('is_active', true),
    supabase.from('service_templates').select('id, display_name, location_id, sort_order, primary_tag_id').eq('church_id', churchId).eq('is_active', true).order('sort_order'),
  ])

  return {
    churchId,
    locations: locResult.data ?? [],
    tags: tagResult.data ?? [],
    templates: tmplResult.data ?? [],
  }
}
