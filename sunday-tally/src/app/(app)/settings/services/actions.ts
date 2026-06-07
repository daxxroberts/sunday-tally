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
  location_id?: string        // one campus — required unless all_locations
  all_locations?: boolean     // create the service at EVERY active campus
  primary_tag_id: string      // required — service_tags.id
  subtag_ids: string[]        // optional — service_tags ids for service_template_tags
}

/**
 * Creates the service at one campus, or (all_locations) at every active campus —
 * one service_template per location, each with the same name + ministries.
 * Returns the new template ids (one per location created).
 */
export async function createServiceAction(
  input: CreateServiceInput,
): Promise<{ templateIds?: string[]; error?: string }> {
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
  if (!input.primary_tag_id) return { error: 'Primary tag is required.' }

  // Resolve the target locations server-side (authoritative — the client can't
  // pass arbitrary ids). all_locations = every active campus; else the one given.
  const { data: activeLocs } = await supabase
    .from('church_locations')
    .select('id')
    .eq('church_id', churchId)
    .eq('is_active', true)
  const activeLocIds = (activeLocs ?? []).map(l => l.id as string)
  let locationIds: string[]
  if (input.all_locations) {
    locationIds = activeLocIds
    if (locationIds.length === 0) return { error: 'No active locations to add the service to.' }
  } else {
    if (!input.location_id) return { error: 'Location is required.' }
    if (!activeLocIds.includes(input.location_id)) return { error: 'That location is not valid for this church.' }
    locationIds = [input.location_id]
  }

  // Next sort_order (max existing + 1), incremented per template created.
  const { data: existing } = await supabase
    .from('service_templates')
    .select('sort_order')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: false })
    .limit(1)
  let nextSort = ((existing?.[0] as { sort_order?: number | null } | undefined)?.sort_order ?? 0) + 1

  const slug = displayName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 8)

  // Primary ministry first (sort_order 0), then subtags; de-duped. service_template_tags
  // is the sole source of ministry composition the Services/Entries screens read
  // (D-076), so the primary MUST be written here, not just to primary_tag_id.
  const ministryIds = [input.primary_tag_id, ...input.subtag_ids]
    .filter((id, i, arr) => !!id && arr.indexOf(id) === i)

  const templateIds: string[] = []
  for (const locId of locationIds) {
    const service_code = `${slug}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    const { data: tmpl, error: tmplErr } = await supabase
      .from('service_templates')
      .insert({
        church_id: churchId,
        service_code,
        display_name: displayName,
        location_id: locId,
        sort_order: nextSort,
        primary_tag_id: input.primary_tag_id,
        is_active: true,
      })
      .select('id')
      .single()
    if (tmplErr || !tmpl) {
      return { templateIds, error: `Failed to create the service${templateIds.length ? ' at one or more locations' : ''}: ${tmplErr?.message ?? 'unknown error'}` }
    }
    nextSort++
    const templateId = tmpl.id as string
    templateIds.push(templateId)

    const tagRows = ministryIds.map((tagId, i) => ({
      church_id: churchId,
      service_template_id: templateId,
      ministry_tag_id: tagId,
      sort_order: i,
    }))
    const { error: tagsErr } = await supabase.from('service_template_tags').insert(tagRows)
    if (tagsErr) {
      return { templateIds, error: `Service created but ministries could not be saved: ${tagsErr.message}` }
    }
  }

  revalidatePath('/settings/services')
  return { templateIds }
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
