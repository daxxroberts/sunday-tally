'use server'

// ─────────────────────────────────────────────────────────────────────────
// Settings-local: create a new service_template + service_template_tags.
// G2 — /settings/services/new
//
// DOES NOT call apply_tag_to_occurrences — new templates have no occurrences.
// Schedule versioning is handled separately by the imported saveScheduleAction.
// Role gate: owner or admin only (mirrors T6 / T_SETTINGS role rules).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface CreateServiceInput {
  display_name: string        // required, trimmed
  location_id: string         // required
  primary_tag_id: string      // required — service_tags.id
  subtag_ids: string[]        // optional — service_tags ids for service_template_tags
}

/** Returns the new template id on success, or an error string. */
export async function createServiceAction(
  input: CreateServiceInput,
): Promise<{ templateId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Role gate — owner or admin only
  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return { error: 'No active church membership found.' }
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return { error: 'Only owners and admins can add services.' }
  }

  const churchId: string = membership.church_id
  const displayName = input.display_name.trim()
  if (!displayName) return { error: 'Service name is required.' }
  if (!input.location_id) return { error: 'Location is required.' }
  if (!input.primary_tag_id) return { error: 'Primary tag is required.' }

  // Derive next sort_order (max existing + 1)
  const { data: existing } = await supabase
    .from('service_templates')
    .select('sort_order')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextSort = ((existing?.[0] as { sort_order?: number | null } | undefined)?.sort_order ?? 0) + 1

  // Slugify service_code — unique per church
  const slug = displayName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 8)
  const service_code = `${slug}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`

  // INSERT service_template
  const { data: tmpl, error: tmplErr } = await supabase
    .from('service_templates')
    .insert({
      church_id: churchId,
      service_code,
      display_name: displayName,
      location_id: input.location_id,
      sort_order: nextSort,
      primary_tag_id: input.primary_tag_id,
      is_active: true,
    })
    .select('id')
    .single()

  if (tmplErr || !tmpl) {
    return { error: `Failed to create service: ${tmplErr?.message ?? 'unknown error'}` }
  }

  const templateId: string = tmpl.id

  // INSERT service_template_tags — the Services & Entries screens read ministry
  // composition ENTIRELY from service_template_tags (D-076: equal-peer ministries,
  // no "primary" badge). So the primary ministry MUST be written here too, not
  // only to the legacy service_templates.primary_tag_id column — otherwise the new
  // service shows zero ministries and never renders in Entries. Primary first
  // (sort_order 0), then subtags; de-duped so a subtag == primary isn't doubled.
  const ministryIds = [input.primary_tag_id, ...input.subtag_ids]
    .filter((id, i, arr) => !!id && arr.indexOf(id) === i)
  const tagRows = ministryIds.map((tagId, i) => ({
    church_id: churchId,
    service_template_id: templateId,
    ministry_tag_id: tagId,
    sort_order: i,
  }))
  const { error: tagsErr } = await supabase.from('service_template_tags').insert(tagRows)
  if (tagsErr) {
    // Non-fatal: template exists but composition failed — surface as a warning.
    return { templateId, error: `Service created but ministries could not be saved: ${tagsErr.message}` }
  }

  revalidatePath('/settings/services')
  return { templateId }
}

/** Load data needed by the new-service form. */
export async function getNewServiceFormData(): Promise<{
  locations: { id: string; name: string }[]
  tags: { id: string; name: string; code: string; tag_role: string }[]
  isMultiCampus: boolean
} | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return null
  if (membership.role !== 'owner' && membership.role !== 'admin') return null

  const churchId: string = membership.church_id

  const [locRes, tagRes] = await Promise.all([
    supabase
      .from('church_locations')
      .select('id, name, sort_order')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('service_tags')
      .select('id, name, code, tag_role')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ])

  const locations = (locRes.data ?? []) as { id: string; name: string; sort_order: number }[]
  const tags = (tagRes.data ?? []) as { id: string; name: string; code: string; tag_role: string }[]

  return {
    locations,
    tags,
    isMultiCampus: locations.length > 1,
  }
}
