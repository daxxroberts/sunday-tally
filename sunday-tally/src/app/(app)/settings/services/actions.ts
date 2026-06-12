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
import { resolveMember, isOwnerAdmin } from '@/lib/supabase/auth-helpers'
import { revalidatePath } from 'next/cache'

export interface CreateServiceInput {
  display_name: string        // required, trimmed
  location_id?: string        // one campus — required unless all_locations/church_wide
  all_locations?: boolean     // create the service at EVERY active campus (one template each)
  /** ONE template with location_id NULL (0036): a single shared count for the
   *  whole church, visible at every campus. Distinct from all_locations (which
   *  duplicates per campus, each with its own counts). Requires 0036 applied. */
  church_wide?: boolean
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
  // Role gate — owner or admin only
  const auth = await resolveMember(supabase)
  if (!auth.ok) {
    return { error: auth.reason === 'unauthenticated' ? 'Not authenticated' : 'No active church membership found.' }
  }
  if (!isOwnerAdmin(auth.member.role)) {
    return { error: 'Only owners and admins can add services.' }
  }

  const churchId: string = auth.member.churchId
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
  let locationIds: (string | null)[]
  if (input.church_wide) {
    // One shared, campus-less template (0036). NULL flows through the insert.
    locationIds = [null]
  } else if (input.all_locations) {
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

/** Everything the edit page needs, role-gated (owner/admin → null otherwise).
 *  reporting_group_id / show_in_entries / groups are 0036/0037 features —
 *  selected with a fallback so the page works (minus those rows) pre-apply. */
export async function getServiceEditData(templateId: string): Promise<{
  template: {
    id: string
    display_name: string
    location_id: string | null
    locationName: string | null
    primary_tag_id: string | null
    is_active: boolean
    reporting_group_id: string | null
    show_in_entries: boolean
  }
  instanceCount: number
  tags: { id: string; name: string; tag_role: string; parent_tag_id: string | null }[]
  /** Active campuses — lets the page offer a campus change when the service
   *  has no recorded weeks (history pins a campus; an empty service moves freely). */
  locations: { id: string; name: string }[]
  /** null = 0037 not applied (hide the group picker). */
  groups: { id: string; name: string; code: string }[] | null
  /** false = 0036 not applied (hide the show-in-entries toggle). */
  extrasSupported: boolean
} | null> {
  const supabase = await createClient()
  const auth = await resolveMember(supabase)
  if (!auth.ok) return null
  if (!isOwnerAdmin(auth.member.role)) return null
  const churchId: string = auth.member.churchId

  // Try the post-migration shape first; fall back to the base columns.
  let tmpl: Record<string, unknown> | null = null
  let extrasSupported = true
  {
    const withExtras = await supabase
      .from('service_templates')
      .select('id, display_name, location_id, primary_tag_id, is_active, reporting_group_id, show_in_entries, church_locations(name)')
      .eq('id', templateId)
      .eq('church_id', churchId)
      .maybeSingle()
    if (!withExtras.error) {
      tmpl = withExtras.data as Record<string, unknown> | null
    } else {
      extrasSupported = false
      const base = await supabase
        .from('service_templates')
        .select('id, display_name, location_id, primary_tag_id, is_active, church_locations(name)')
        .eq('id', templateId)
        .eq('church_id', churchId)
        .maybeSingle()
      tmpl = base.data as Record<string, unknown> | null
    }
  }
  if (!tmpl) return null

  // Reporting groups (0037) — table missing pre-apply → null (picker hidden).
  const groupsRes = await supabase
    .from('service_groups')
    .select('id, name, code')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  const groups = groupsRes.error ? null : ((groupsRes.data ?? []) as { id: string; name: string; code: string }[])

  const locEmbed = (tmpl as { church_locations?: { name: string } | { name: string }[] | null }).church_locations
  const locationName = (Array.isArray(locEmbed) ? locEmbed[0]?.name : locEmbed?.name) ?? null

  const [{ count: instanceCount }, tagRes, locRes] = await Promise.all([
    supabase
      .from('service_instances')
      .select('id', { count: 'exact', head: true })
      .eq('service_template_id', templateId),
    // parent_tag_id included so the page offers TOP-LEVEL ministries only as
    // the main ministry (a child group like Tabors isn't a sensible primary).
    supabase
      .from('service_tags')
      .select('id, name, tag_role, parent_tag_id')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('church_locations')
      .select('id, name')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])

  return {
    template: {
      id: tmpl.id as string,
      display_name: (tmpl.display_name as string) ?? '',
      location_id: (tmpl.location_id as string | null) ?? null,
      locationName,
      primary_tag_id: (tmpl.primary_tag_id as string | null) ?? null,
      is_active: !!tmpl.is_active,
      reporting_group_id: (tmpl.reporting_group_id as string | null) ?? null,
      show_in_entries: tmpl.show_in_entries === undefined ? true : !!tmpl.show_in_entries,
    },
    instanceCount: instanceCount ?? 0,
    tags: (tagRes.data ?? []) as { id: string; name: string; tag_role: string; parent_tag_id: string | null }[],
    locations: (locRes.data ?? []) as { id: string; name: string }[],
    groups,
    extrasSupported,
  }
}

/** Create a reporting group inline (SE5 "+ New group"). Requires 0037. */
export async function createServiceGroupAction(
  name: string,
): Promise<{ group?: { id: string; name: string; code: string }; error?: string }> {
  const supabase = await createClient()
  const auth = await resolveMember(supabase)
  if (!auth.ok) {
    return { error: auth.reason === 'unauthenticated' ? 'Not authenticated' : 'No active church membership found.' }
  }
  if (!isOwnerAdmin(auth.member.role)) {
    return { error: 'Only owners and admins can manage reporting groups.' }
  }
  const churchId: string = auth.member.churchId

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Group name is required.' }
  const code = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 24) || 'GROUP'

  // IDEMPOTENT: typing the name of a group that already exists just hands it
  // back (the picker selects it) — never a "duplicate" scolding. Reactivates a
  // soft-deleted group of the same code rather than colliding with it.
  const { data: existing } = await supabase
    .from('service_groups')
    .select('id, name, code, is_active')
    .eq('church_id', churchId)
    .eq('code', code)
    .maybeSingle()
  if (existing) {
    if (!(existing as { is_active: boolean }).is_active) {
      await supabase.from('service_groups').update({ is_active: true }).eq('id', existing.id)
    }
    return { group: { id: existing.id as string, name: existing.name as string, code: existing.code as string } }
  }

  const { count } = await supabase
    .from('service_groups').select('id', { count: 'exact', head: true }).eq('church_id', churchId)
  const { data, error } = await supabase
    .from('service_groups')
    .insert({ church_id: churchId, name: trimmed, code, sort_order: count ?? 0 })
    .select('id, name, code')
    .single()
  if (error || !data) return { error: error?.message ?? 'Could not create the group (is migration 0037 applied?).' }
  return { group: data as { id: string; name: string; code: string } }
}

export interface UpdateServiceInput {
  template_id: string
  display_name: string
  primary_tag_id: string
  /** SE5 (0037) — null clears the group; undefined = leave unchanged. */
  reporting_group_id?: string | null
  /** SE6 (0036) — undefined = leave unchanged. */
  show_in_entries?: boolean
  /** SE3 — campus change. ONLY allowed while the service has zero recorded
   *  weeks (history pins a campus); re-checked server-side. null = church-wide
   *  (0036). undefined = leave unchanged. */
  location_id?: string | null
}

/** Rename / change primary ministry. Changing the primary ALSO upserts the
 *  service_template_tags junction row (D-076: the primary is always part of
 *  the ministry composition Entries reads). */
export async function updateServiceAction(
  input: UpdateServiceInput,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const auth = await resolveMember(supabase)
  if (!auth.ok) {
    return { error: auth.reason === 'unauthenticated' ? 'Not authenticated' : 'No active church membership found.' }
  }
  if (!isOwnerAdmin(auth.member.role)) {
    return { error: 'Only owners and admins can edit services.' }
  }
  const churchId: string = auth.member.churchId

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

  const patch: Record<string, unknown> = { display_name: displayName, primary_tag_id: input.primary_tag_id }
  // 0036/0037 fields — included only when the caller (which knows column
  // support via getServiceEditData.extrasSupported/groups) provides them.
  if (input.reporting_group_id !== undefined) patch.reporting_group_id = input.reporting_group_id
  if (input.show_in_entries !== undefined) patch.show_in_entries = input.show_in_entries

  // SE3 campus change — only while the service has NO recorded weeks. History
  // pins a campus: past numbers belong where they happened, so a service with
  // instances never moves (create a new service at the other campus instead).
  if (input.location_id !== undefined) {
    const { count: instCount } = await supabase
      .from('service_instances')
      .select('id', { count: 'exact', head: true })
      .eq('service_template_id', input.template_id)
    if ((instCount ?? 0) > 0) {
      return { error: `This service has ${instCount} recorded ${instCount === 1 ? 'week' : 'weeks'} at its campus — it can't move. Create a new service at the other campus instead.` }
    }
    if (input.location_id !== null) {
      const { data: loc } = await supabase
        .from('church_locations')
        .select('id')
        .eq('id', input.location_id)
        .eq('church_id', churchId)
        .eq('is_active', true)
        .maybeSingle()
      if (!loc) return { error: 'That campus is not valid for this church.' }
    }
    patch.location_id = input.location_id
  }

  const { data: updated, error: updErr } = await supabase
    .from('service_templates')
    .update(patch)
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
  const auth = await resolveMember(supabase)
  if (!auth.ok) {
    return { error: auth.reason === 'unauthenticated' ? 'Not authenticated' : 'No active church membership found.' }
  }
  if (!isOwnerAdmin(auth.member.role)) {
    return { error: 'Only owners and admins can retire services.' }
  }

  const { data: updated, error } = await supabase
    .from('service_templates')
    .update({ is_active: false })
    .eq('id', templateId)
    .eq('church_id', auth.member.churchId)
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
  const auth = await resolveMember(supabase)
  if (!auth.ok) return null
  if (!isOwnerAdmin(auth.member.role)) return null

  const churchId: string = auth.member.churchId

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
