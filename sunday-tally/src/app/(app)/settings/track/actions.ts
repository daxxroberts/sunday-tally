'use server'

// ─────────────────────────────────────────────────────────────────────────
// T_TRACK server actions — /settings/track
// IRIS_TTRACK_ELEMENT_MAP contract. Owner/admin re-checked server-side on
// every mutating action. Mirrors settings/tags/actions.ts patterns.
//
// C2 GUARD: addCount() queries for an existing active canonical before
// inserting. Sets is_canonical=true ONLY when none exists for
// (church_id, ministry_tag_id, reporting_tag_id) — else false.
// The partial unique index `uq_metric_canonical` would throw otherwise.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'

// ── Types ────────────────────────────────────────────────────────────────

export type TagRole = 'ADULT_SERVICE' | 'KIDS_MINISTRY' | 'YOUTH_MINISTRY' | 'OTHER'

export interface ActionResult<T = void> {
  ok: boolean
  data?: T
  error?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Slug a display name into an UPPERCASE code; mirrors tags/page.tsx */
function slugifyCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Assert caller is owner or admin for the given church. Returns churchId or throws. */
async function requireOwnerAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('role, church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) throw new Error('No membership found')
  if (membership.role !== 'owner' && membership.role !== 'admin') throw new Error('Forbidden')
  return membership.church_id as string
}

// ── createMinistry ────────────────────────────────────────────────────────
// E-2 / IRIS contract: inserts a service_tags node then auto-seeds an
// Attendance metric (canonical guard applied) so the ministry is immediately
// enterable.

export interface MinistryNode {
  id: string
  code: string
  name: string
  tag_role: TagRole
  parent_tag_id: string | null
  display_order: number | null
  is_active: boolean
}

export async function createMinistry(params: {
  name: string
  tag_role: TagRole
  parent_tag_id?: string | null
}): Promise<ActionResult<MinistryNode>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const name = params.name.trim()
    if (!name) return { ok: false, error: 'Name is required' }

    // Generate a unique code per church (mirror tags/page.tsx slugifyCode logic)
    const base = slugifyCode(name) || 'MINISTRY'
    const { data: existingCodes } = await supabase
      .from('service_tags')
      .select('code')
      .eq('church_id', churchId)
    const have = new Set((existingCodes ?? []).map(r => r.code as string))
    let code = base
    let suffix = 1
    while (have.has(code)) { code = `${base}_${suffix}`; suffix++ }

    // Determine display_order (append)
    const { count: orderCount } = await supabase
      .from('service_tags')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId)
      .eq('is_active', true)
    const display_order = (orderCount ?? 0)

    const { data, error } = await supabase
      .from('service_tags')
      .insert({
        church_id: churchId,
        name,
        code,
        tag_role: params.tag_role,
        parent_tag_id: params.parent_tag_id ?? null,
        is_active: true,
        is_custom: true,
        display_order,
      })
      .select('id, code, name, tag_role, parent_tag_id, display_order, is_active')
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed' }
    const node = data as MinistryNode

    // Auto-seed Attendance count via addCount (respects C2 canonical guard)
    await addCount({
      ministryId: node.id,
      reportingTagCode: 'ATTENDANCE',
      name: `${name} Attendance`,
    })

    return { ok: true, data: node }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── updateMinistry ────────────────────────────────────────────────────────
// E-5: rename, change role, or reparent (Move under…)

export async function updateMinistry(
  id: string,
  patch: { name?: string; tag_role?: TagRole; parent_tag_id?: string | null }
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const update: Record<string, unknown> = {}
    if (patch.name !== undefined) update.name = patch.name.trim()
    if (patch.tag_role !== undefined) update.tag_role = patch.tag_role
    if ('parent_tag_id' in patch) update.parent_tag_id = patch.parent_tag_id ?? null

    if (Object.keys(update).length === 0) return { ok: true }

    const { error } = await supabase
      .from('service_tags')
      .update(update)
      .eq('id', id)
      .eq('church_id', churchId)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── deactivateMinistry ───────────────────────────────────────────────────
// E-5: soft-delete. Blocked in UI if children exist — server checks too.

export async function deactivateMinistry(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    // Guard: don't deactivate if active children exist
    const { count } = await supabase
      .from('service_tags')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId)
      .eq('parent_tag_id', id)
      .eq('is_active', true)
    if ((count ?? 0) > 0) {
      return { ok: false, error: 'Move or remove child ministries first.' }
    }

    const { error } = await supabase
      .from('service_tags')
      .update({ is_active: false })
      .eq('id', id)
      .eq('church_id', churchId)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── addCount ──────────────────────────────────────────────────────────────
// E-7: creates a metrics row (scope='instance', Phase 1).
// C2 GUARD: checks for existing active canonical for (church, ministry, kind)
// before inserting. Sets is_canonical=true only when none found.

export interface MetricRow {
  id: string
  code: string
  name: string
  reporting_tag_id: string
  is_canonical: boolean
  is_active: boolean
  display_order: number | null
}

export async function addCount(params: {
  ministryId: string
  reportingTagCode: string   // 'ATTENDANCE' | 'VOLUNTEERS' | 'RESPONSE_STAT'
  name: string
}): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const name = params.name.trim()
    if (!name) return { ok: false, error: 'Name is required' }

    // Resolve reporting_tag id from code
    const { data: rtag } = await supabase
      .from('reporting_tags')
      .select('id')
      .eq('church_id', churchId)
      .eq('code', params.reportingTagCode)
      .maybeSingle()
    if (!rtag) return { ok: false, error: `Reporting tag ${params.reportingTagCode} not found` }

    const reportingTagId = rtag.id as string

    // C2: check for existing active canonical for (church, ministry, kind)
    const { data: existingCanonical } = await supabase
      .from('metrics')
      .select('id')
      .eq('church_id', churchId)
      .eq('ministry_tag_id', params.ministryId)
      .eq('reporting_tag_id', reportingTagId)
      .eq('is_canonical', true)
      .eq('is_active', true)
      .maybeSingle()
    const isCanonical = !existingCanonical

    // Generate unique metric code (ministry_code + suffix)
    const { data: mtag } = await supabase
      .from('service_tags')
      .select('code')
      .eq('id', params.ministryId)
      .eq('church_id', churchId)
      .maybeSingle()
    const tagCode = (mtag?.code as string | null) ?? 'MIN'

    const { data: existingMetrics } = await supabase
      .from('metrics')
      .select('code')
      .eq('church_id', churchId)
      .eq('ministry_tag_id', params.ministryId)
    const haveCodes = new Set((existingMetrics ?? []).map(m => m.code as string))

    const baseSuffix = slugifyCode(name) || 'COUNT'
    let metricCode = `${tagCode}_${baseSuffix}`
    let s = 1
    while (haveCodes.has(metricCode)) { metricCode = `${tagCode}_${baseSuffix}_${s}`; s++ }

    // display_order: append within this ministry+kind
    const { count: orderCount } = await supabase
      .from('metrics')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId)
      .eq('ministry_tag_id', params.ministryId)
      .eq('reporting_tag_id', reportingTagId)
      .eq('is_active', true)
    const display_order = (orderCount ?? 0)

    const { data, error } = await supabase
      .from('metrics')
      .insert({
        church_id: churchId,
        ministry_tag_id: params.ministryId,
        reporting_tag_id: reportingTagId,
        scope: 'instance',
        code: metricCode,
        name,
        is_canonical: isCanonical,
        is_active: true,
        display_order,
      })
      .select('id, code, name, reporting_tag_id, is_canonical, is_active, display_order')
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed' }
    return { ok: true, data: data as MetricRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── renameCount ───────────────────────────────────────────────────────────
// E-8: rename a metrics row

export async function renameCount(metricId: string, name: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'Name is required' }

    const { error } = await supabase
      .from('metrics')
      .update({ name: trimmed })
      .eq('id', metricId)
      .eq('church_id', churchId)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── deactivateCount ───────────────────────────────────────────────────────
// E-8: soft-delete a metrics row (is_active=false)

export async function deactivateCount(metricId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const { error } = await supabase
      .from('metrics')
      .update({ is_active: false })
      .eq('id', metricId)
      .eq('church_id', churchId)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── reorderCounts ─────────────────────────────────────────────────────────
// E-8 ▴▾: rewrite display_order for an ordered list of metric ids
// ids[] must be all metrics in the same kind section (caller responsibility)

export async function reorderCounts(ids: string[]): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    if (ids.length === 0) return { ok: true }

    const results = await Promise.all(
      ids.map((id, i) =>
        supabase
          .from('metrics')
          .update({ display_order: i })
          .eq('id', id)
          .eq('church_id', churchId)
      )
    )
    const failed = results.find(r => r.error)
    if (failed?.error) return { ok: false, error: failed.error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
