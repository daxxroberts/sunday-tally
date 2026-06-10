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

// ─────────────────────────────────────────────────────────────────────────
// Service EDIT (T6C — IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md §2).
// The previously-missing surface: rename, retag, retire. Location change is
// DISALLOWED when instances exist (repointing denormalized location_ids is a
// data migration, not an edit-form side effect) — the page renders it
// read-only with the instance count.
// ─────────────────────────────────────────────────────────────────────────

/** Everything the edit page needs, role-gated (owner/admin → null otherwise). */
export async function getServiceEditData(templateId: string): Promise<{
  template: {
    id: string
    display_name: string
    location_id: string | null
    locationName: string | null
    primary_tag_id: string | null
    is_active: boolean
  }
  instanceCount: number
  tags: { id: string; name: string; tag_role: string }[]
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

  const { data: tmpl } = await supabase
    .from('service_templates')
    .select('id, display_name, location_id, primary_tag_id, is_active, church_locations(name)')
    .eq('id', templateId)
    .eq('church_id', churchId)
    .maybeSingle()
  if (!tmpl) return null

  const locEmbed = (tmpl as { church_locations?: { name: string } | { name: string }[] | null }).church_locations
  const locationName = (Array.isArray(locEmbed) ? locEmbed[0]?.name : locEmbed?.name) ?? null

  const [{ count: instanceCount }, tagRes] = await Promise.all([
    supabase
      .from('service_instances')
      .select('id', { count: 'exact', head: true })
      .eq('service_template_id', templateId),
    supabase
      .from('service_tags')
      .select('id, name, tag_role')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ])

  return {
    template: {
      id: tmpl.id as string,
      display_name: (tmpl.display_name as string) ?? '',
      location_id: (tmpl.location_id as string | null) ?? null,
      locationName,
      primary_tag_id: (tmpl.primary_tag_id as string | null) ?? null,
      is_active: !!tmpl.is_active,
    },
    instanceCount: instanceCount ?? 0,
    tags: (tagRes.data ?? []) as { id: string; name: string; tag_role: string }[],
  }
}

export interface UpdateServiceInput {
  template_id: string
  display_name: string
  primary_tag_id: string
}

/** Rename / change primary ministry. Changing the primary ALSO upserts the
 *  service_template_tags junction row (D-076: the primary is always part of
 *  the ministry composition Entries reads). */
export async function updateServiceAction(
  input: UpdateServiceInput,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return { error: 'No active church membership found.' }
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return { error: 'Only owners and admins can edit services.' }
  }
  const churchId: string = membership.church_id

  const displayName = input.display_name.trim()
  if (!displayName) return { error: 'Service name is required.' }
  if (!input.primary_tag_id) return { error: 'Primary ministry is required.' }

  // Validate the tag belongs to this church (authoritative server-side check).
  const { data: tag } = await supabase
    .from('service_tags')
    .select('id')
    .eq('id', input.primary_tag_id)
    .eq('church_id', churchId)
    .eq('is_active', true)
    .maybeSingle()
  if (!tag) return { error: 'That ministry is not valid for this church.' }

  const { data: updated, error: updErr } = await supabase
    .from('service_templates')
    .update({ display_name: displayName, primary_tag_id: input.primary_tag_id })
    .eq('id', input.template_id)
    .eq('church_id', churchId)
    .select('id')
    .maybeSingle()
  if (updErr) return { error: updErr.message }
  if (!updated) return { error: 'Service not found (or no permission to edit it).' }

  // D-076: ensure the primary is linked in the junction (idempotent).
  const { data: existingLink } = await supabase
    .from('service_template_tags')
    .select('id')
    .eq('service_template_id', input.template_id)
    .eq('ministry_tag_id', input.primary_tag_id)
    .maybeSingle()
  if (!existingLink) {
    const { data: maxRow } = await supabase
      .from('service_template_tags')
      .select('sort_order')
      .eq('service_template_id', input.template_id)
      .order('sort_order', { ascending: false })
      .limit(1)
    const nextSort = ((maxRow?.[0] as { sort_order?: number | null } | undefined)?.sort_order ?? -1) + 1
    const { error: linkErr } = await supabase.from('service_template_tags').insert({
      church_id: churchId,
      service_template_id: input.template_id,
      ministry_tag_id: input.primary_tag_id,
      sort_order: nextSort,
    })
    // UNIQUE violation = raced an identical link — fine (idempotent).
    if (linkErr && !/duplicate|unique/i.test(linkErr.message)) return { error: `Saved, but the ministry link failed: ${linkErr.message}` }
  }

  revalidatePath('/settings/services')
  return { ok: true }
}

/** Retire a service. Soft-delete only: junction rows are KEPT (History grouping
 *  reads them); instances/entries untouched. It stops appearing in Entries +
 *  Services; History and Dashboards keep everything already logged. */
export async function deactivateServiceAction(
  templateId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return { error: 'No active church membership found.' }
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return { error: 'Only owners and admins can retire services.' }
  }

  const { data: updated, error } = await supabase
    .from('service_templates')
    .update({ is_active: false })
    .eq('id', templateId)
    .eq('church_id', membership.church_id)
    .select('id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!updated) return { error: 'Service not found (or no permission).' }

  revalidatePath('/settings/services')
  return { ok: true }
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
