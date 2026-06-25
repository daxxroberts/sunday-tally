'use server'

// ─────────────────────────────────────────────────────────────────────────
// T_TRACK server actions — /settings/track
// IRIS_TTRACK_ELEMENT_MAP contract. Owner/admin re-checked server-side on
// every mutating action.
//
// C2 GUARD: addCount() queries for an existing active canonical before
// inserting. Sets is_canonical=true ONLY when none exists for
// (church_id, ministry_tag_id, reporting_tag_id) — else false.
// The partial unique index `uq_metric_canonical` would throw otherwise.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { resolveMember, isOwnerAdmin } from '@/lib/supabase/auth-helpers'

// ── Types ────────────────────────────────────────────────────────────────

export type TagRole = 'ADULT_SERVICE' | 'KIDS_MINISTRY' | 'YOUTH_MINISTRY' | 'OTHER'

/** A metric is either typed at its node ('entry') or sums its children ('rollup'). */
export type MetricMode = 'entry' | 'rollup'
/** Aggregation a roll-up applies over the children that point at it. */
export type RollupOp = 'sum' | 'avg' | 'max'

export interface ActionResult<T = void> {
  ok: boolean
  data?: T
  error?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Slug a display name into an UPPERCASE code */
function slugifyCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Assert caller is owner or admin for the given church. Returns churchId or throws. */
async function requireOwnerAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const auth = await resolveMember(supabase)
  if (!auth.ok) {
    throw new Error(auth.reason === 'unauthenticated' ? 'Not authenticated' : 'No membership found')
  }
  if (!isOwnerAdmin(auth.member.role)) throw new Error('Forbidden')
  return auth.member.churchId
}

/**
 * Set of node ids that are ANCESTORS of `tagId` (walking parent_tag_id upward).
 * Server mirror of page.tsx's downward descendantIds. Cycle-guarded.
 */
async function ancestorTagIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  tagId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('service_tags')
    .select('id, parent_tag_id')
    .eq('church_id', churchId)
  const parentOf = new Map<string, string | null>()
  for (const r of (data ?? []) as { id: string; parent_tag_id: string | null }[]) {
    parentOf.set(r.id, r.parent_tag_id)
  }
  const out = new Set<string>()
  let cur = parentOf.get(tagId) ?? null
  while (cur && !out.has(cur)) {
    out.add(cur)
    cur = parentOf.get(cur) ?? null
  }
  return out
}

/**
 * Validate that an entry metric on (childTagId, childReportingTagId) may point at
 * roll-up `parentMetricId`. Returns an error message, or null if the link is valid.
 * Rules: parent is an active roll-up in the same church, of the SAME Kind, living
 * on an ANCESTOR node of the child. (These need a parent_tag_id walk, so they are
 * enforced here rather than in SQL.)
 */
async function validateParentLink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  childTagId: string,
  childReportingTagId: string,
  parentMetricId: string,
): Promise<string | null> {
  const { data: parent } = await supabase
    .from('metrics')
    .select('id, church_id, reporting_tag_id, ministry_tag_id, mode, is_active')
    .eq('id', parentMetricId)
    .eq('church_id', churchId)
    .maybeSingle()
  if (!parent) return 'That roll-up no longer exists.'
  if (!parent.is_active) return 'That roll-up has been removed.'
  if (parent.mode !== 'rollup') return 'You can only point a count at a roll-up.'
  if (parent.reporting_tag_id !== childReportingTagId) return 'A count can only roll up into the same kind.'
  const ancestors = await ancestorTagIds(supabase, churchId, childTagId)
  if (!ancestors.has(parent.ministry_tag_id as string)) {
    return 'A count can only roll up into a group above it.'
  }
  return null
}

/**
 * Self-heal roll-up links after a node moves. For the moved node and all its
 * descendants, clear any metric.parent_metric_id that no longer points to a
 * roll-up living on a (current) ancestor node. Prevents a dragged-out group from
 * silently keeping a roll-up pointer to a parent it's no longer under (the
 * integrity guard for Phase B summation). Returns how many links were cleared.
 */
async function healRollupLinksForSubtree(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  movedNodeId: string,
): Promise<number> {
  const { data: tags } = await supabase
    .from('service_tags')
    .select('id, parent_tag_id')
    .eq('church_id', churchId)
  const parentOf = new Map<string, string | null>()
  const childrenOf = new Map<string, string[]>()
  for (const t of (tags ?? []) as { id: string; parent_tag_id: string | null }[]) {
    parentOf.set(t.id, t.parent_tag_id)
    if (t.parent_tag_id) {
      const a = childrenOf.get(t.parent_tag_id) ?? []
      a.push(t.id); childrenOf.set(t.parent_tag_id, a)
    }
  }

  // Subtree = moved node + all descendants
  const subtree = new Set<string>([movedNodeId])
  const stack = [movedNodeId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of childrenOf.get(cur) ?? []) {
      if (!subtree.has(c)) { subtree.add(c); stack.push(c) }
    }
  }

  const ancestorsOf = (tagId: string): Set<string> => {
    const out = new Set<string>()
    let cur = parentOf.get(tagId) ?? null
    while (cur && !out.has(cur)) { out.add(cur); cur = parentOf.get(cur) ?? null }
    return out
  }

  const { data: metrics } = await supabase
    .from('metrics')
    .select('id, ministry_tag_id, parent_metric_id')
    .eq('church_id', churchId)
    .eq('is_active', true)
  const nodeOfMetric = new Map<string, string>()
  for (const m of (metrics ?? []) as { id: string; ministry_tag_id: string }[]) nodeOfMetric.set(m.id, m.ministry_tag_id)

  const stale: string[] = []
  for (const m of (metrics ?? []) as { id: string; ministry_tag_id: string; parent_metric_id: string | null }[]) {
    if (!m.parent_metric_id) continue
    if (!subtree.has(m.ministry_tag_id)) continue            // only heal the moved subtree
    const parentNode = nodeOfMetric.get(m.parent_metric_id)
    if (!parentNode || !ancestorsOf(m.ministry_tag_id).has(parentNode)) stale.push(m.id)
  }

  if (stale.length > 0) {
    await supabase.from('metrics').update({ parent_metric_id: null }).in('id', stale).eq('church_id', churchId)
  }
  return stale.length
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

/**
 * Copy the NEAREST linked ancestor's service links onto a new child node
 * (links to ACTIVE templates only; idempotent on UNIQUE(template, tag)).
 * Walks parent_tag_id upward, cycle-guarded; first ancestor with links wins.
 */
async function autoLinkToNearestAncestorServices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  newTagId: string,
  parentTagId: string,
): Promise<void> {
  const { data: tagRows } = await supabase
    .from('service_tags').select('id, parent_tag_id').eq('church_id', churchId)
  const parentOf = new Map<string, string | null>()
  for (const t of (tagRows ?? []) as { id: string; parent_tag_id: string | null }[]) parentOf.set(t.id, t.parent_tag_id)

  const seen = new Set<string>()
  let cur: string | null = parentTagId
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const { data: links } = await supabase
      .from('service_template_tags')
      .select('service_template_id, service_templates!inner(is_active)')
      .eq('church_id', churchId)
      .eq('ministry_tag_id', cur)
      .eq('service_templates.is_active', true)
    const templateIds = Array.from(new Set(((links ?? []) as { service_template_id: string }[]).map(l => l.service_template_id)))
    if (templateIds.length > 0) {
      for (const tmplId of templateIds) {
        const { data: maxRow } = await supabase
          .from('service_template_tags')
          .select('sort_order')
          .eq('service_template_id', tmplId)
          .order('sort_order', { ascending: false })
          .limit(1)
        const nextSort = ((maxRow?.[0] as { sort_order?: number | null } | undefined)?.sort_order ?? -1) + 1
        // UNIQUE violation = already linked (race) — fine, ignore.
        await supabase.from('service_template_tags').insert({
          church_id: churchId,
          service_template_id: tmplId,
          ministry_tag_id: newTagId,
          sort_order: nextSort,
        })
      }
      return
    }
    cur = parentOf.get(cur) ?? null
  }
}

/**
 * Inherit a parent's roll-ups onto a brand-new child node. The child gets one
 * typed ('entry') count for EVERY thing its nearest container ancestor totals,
 * each wired to feed that roll-up. This keeps sibling groups homogeneous — they
 * all feed the same parent totals — and prevents the drift where one group
 * tracked extra counts the others were missing (the Roberts/Tabors case).
 * Returns the reporting codes that were seeded so the caller can avoid
 * double-seeding Attendance. The NEAREST ancestor with any roll-ups wins, and
 * ALL of that ancestor's roll-ups are inherited (including two of the same Kind,
 * e.g. two Volunteers roll-ups like "Dinner" and "Lunch").
 */
async function inheritRollupsFromParent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  node: MinistryNode,
): Promise<Set<string>> {
  const seeded = new Set<string>()
  if (!node.parent_tag_id) return seeded

  const { data: tagRows } = await supabase
    .from('service_tags').select('id, parent_tag_id').eq('church_id', churchId)
  const parentOf = new Map<string, string | null>()
  for (const t of (tagRows ?? []) as { id: string; parent_tag_id: string | null }[]) parentOf.set(t.id, t.parent_tag_id)

  const { data: rtags } = await supabase
    .from('reporting_tags')
    .select('id, code')
    .or(`church_id.eq.${churchId},church_id.is.null`)
  const codeById = new Map<string, string>()
  for (const r of (rtags ?? []) as { id: string; code: string }[]) codeById.set(r.id, r.code)

  // Walk up from the parent; the first ancestor that has any active roll-ups is
  // the recipe. Inherit every one of its roll-ups (cycle-guarded).
  const seen = new Set<string>()
  let cur: string | null = node.parent_tag_id
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const { data: rollups } = await supabase
      .from('metrics')
      .select('id, reporting_tag_id, name')
      .eq('church_id', churchId)
      .eq('ministry_tag_id', cur)
      .eq('mode', 'rollup')
      .eq('is_active', true)
    const list = (rollups ?? []) as { id: string; reporting_tag_id: string; name: string }[]
    if (list.length > 0) {
      for (const r of list) {
        const code = codeById.get(r.reporting_tag_id)
        if (!code) continue
        // addCount validates the ancestor link + applies the C2 canonical guard.
        const res = await addCount({
          ministryId: node.id,
          reportingTagCode: code,
          name: r.name,
          parentMetricId: r.id,
        })
        if (res.ok) seeded.add(code)
      }
      return seeded
    }
    cur = parentOf.get(cur) ?? null
  }
  return seeded
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

    // ── Leaf-parent guard (creating a group INSIDE an existing ministry) ──────
    // A ministry is either COUNTED directly or a CONTAINER that totals its groups.
    //   • Parent already has numbers logged against its own counts → BLOCK:
    //     turning it into a container would strand that history. Sunset it and
    //     start a new one instead.
    //   • Parent has its own counts but nothing logged yet → safe-convert those
    //     counts to roll-ups so it becomes a clean container the child feeds.
    if (params.parent_tag_id) {
      const { data: ownEntryMetrics } = await supabase
        .from('metrics')
        .select('id')
        .eq('church_id', churchId)
        .eq('ministry_tag_id', params.parent_tag_id)
        .eq('mode', 'entry')
        .eq('is_active', true)
      const ownIds = ((ownEntryMetrics ?? []) as { id: string }[]).map(m => m.id)
      if (ownIds.length > 0) {
        const { count } = await supabase
          .from('metric_entries')
          .select('id', { count: 'exact', head: true })
          .in('metric_id', ownIds)
        if ((count ?? 0) > 0) {
          return {
            ok: false,
            error: "This ministry already has its own numbers recorded, so it can't hold groups. To split it up, remove it — its history stays in your reports — and add a new one going forward.",
          }
        }
        // No data yet → flip its own counts into roll-ups so the new group can
        // feed them (the child inherits these below).
        await supabase
          .from('metrics')
          .update({ mode: 'rollup', rollup_op: 'sum', parent_metric_id: null })
          .in('id', ownIds)
          .eq('church_id', churchId)
      }
    }

    // Generate a unique code per church via slugifyCode
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

    // AUTO-LINK (TK3 Door A default): a child created under a parent that is
    // counted at services inherits those service links, so its metrics render
    // in Entries immediately — the Roberts trap ("new group, no entry tab")
    // can't recur for children. Nearest linked ancestor wins; top-level nodes
    // inherit nothing (the wizard/orphan chip handles them).
    if (node.parent_tag_id) {
      await autoLinkToNearestAncestorServices(supabase, churchId, node.id, node.parent_tag_id)
    }

    // Inherit the parent's roll-ups: the new child gets one typed count for
    // every thing its parent totals, each wired to feed that total — so sibling
    // groups stay identical and the parent's combined number is never missing a
    // group. (Service links were inherited just above.)
    const seededCodes = node.parent_tag_id
      ? await inheritRollupsFromParent(supabase, churchId, node)
      : new Set<string>()

    // Always guarantee an Attendance count (respects the C2 canonical guard) —
    // for top-level ministries, and for children whose parent doesn't roll up
    // Attendance.
    if (!seededCodes.has('ATTENDANCE')) {
      await addCount({
        ministryId: node.id,
        reportingTagCode: 'ATTENDANCE',
        name: `${name} Attendance`,
      })
    }

    return { ok: true, data: node }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── updateMinistry ────────────────────────────────────────────────────────
// E-5: rename, change role, or reparent (Move under…)

export async function updateMinistry(
  id: string,
  patch: { name?: string; tag_role?: TagRole; parent_tag_id?: string | null; color?: string | null }
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const update: Record<string, unknown> = {}
    if (patch.name !== undefined) update.name = patch.name.trim()
    if (patch.tag_role !== undefined) update.tag_role = patch.tag_role
    if ('parent_tag_id' in patch) update.parent_tag_id = patch.parent_tag_id ?? null
    // Ministry color (0040). Server-validated hex or null (= back to the palette).
    if ('color' in patch) {
      const c = patch.color
      if (c !== null && c !== undefined && !/^#[0-9a-fA-F]{6}$/.test(c)) {
        return { ok: false, error: 'Color must be a hex value like #4F6EF7.' }
      }
      update.color = c ?? null
    }

    if (Object.keys(update).length === 0) return { ok: true }

    const { error } = await supabase
      .from('service_tags')
      .update(update)
      .eq('id', id)
      .eq('church_id', churchId)

    if (error) return { ok: false, error: error.message }

    // A move can orphan roll-up links (a child dragged out from under a roll-up
    // it fed). Self-heal: clear any now-invalid parent_metric_id in the subtree.
    if ('parent_tag_id' in patch) {
      await healRollupLinksForSubtree(supabase, churchId, id)
    }
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
  mode: MetricMode
  rollup_op: RollupOp | null
  parent_metric_id: string | null
  /** 'instance' = per gathering (needs a service); 'period' = weekly/monthly
   *  church-wide (Stat Entries — e.g. Giving). Optional: defaults to instance. */
  scope?: 'instance' | 'period'
  cadence?: 'week' | 'month' | 'day' | null
}

const METRIC_SELECT = 'id, code, name, reporting_tag_id, is_canonical, is_active, mode, rollup_op, parent_metric_id'

export async function addCount(params: {
  ministryId: string
  reportingTagCode: string   // 'ATTENDANCE' | 'VOLUNTEERS' | 'RESPONSE_STAT'
  name: string
  mode?: MetricMode          // default 'entry'
  rollupOp?: RollupOp        // used when mode='rollup' (default 'sum')
  parentMetricId?: string | null  // entry only: the roll-up this count feeds
}): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const name = params.name.trim()
    if (!name) return { ok: false, error: 'Name is required' }

    const mode: MetricMode = params.mode ?? 'entry'

    // Resolve reporting_tag id from code
    const { data: rtag } = await supabase
      .from('reporting_tags')
      .select('id')
      .or(`church_id.eq.${churchId},church_id.is.null`)
      .eq('code', params.reportingTagCode)
      .maybeSingle()
    if (!rtag) return { ok: false, error: `Reporting tag ${params.reportingTagCode} not found` }

    const reportingTagId = rtag.id as string

    // Roll-up fields. Only entry metrics may point up; roll-ups carry an op.
    const rollupOp: RollupOp | null = mode === 'rollup' ? (params.rollupOp ?? 'sum') : null
    const parentMetricId: string | null = mode === 'entry' ? (params.parentMetricId ?? null) : null
    if (parentMetricId) {
      const err = await validateParentLink(supabase, churchId, params.ministryId, reportingTagId, parentMetricId)
      if (err) return { ok: false, error: err }
    }

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

    // Church-wide code uniqueness (uq_metric_code is on church_id+code, not
    // per-ministry) — check ALL the church's metric codes so the suffix loop
    // can't generate a code that collides with another ministry's metric.
    const { data: existingMetrics } = await supabase
      .from('metrics')
      .select('code')
      .eq('church_id', churchId)
    const haveCodes = new Set((existingMetrics ?? []).map(m => m.code as string))

    const baseSuffix = slugifyCode(name) || 'COUNT'
    let metricCode = `${tagCode}_${baseSuffix}`
    let s = 1
    while (haveCodes.has(metricCode)) { metricCode = `${tagCode}_${baseSuffix}_${s}`; s++ }

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
        mode,
        rollup_op: rollupOp,
        parent_metric_id: parentMetricId,
      })
      .select(METRIC_SELECT)
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed' }
    return { ok: true, data: data as MetricRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── setMetricMode ──────────────────────────────────────────────────────────
// Flip a metric between 'entry' (typed) and 'rollup' (sums children).
//  • entry → rollup: set rollup_op (default 'sum'), clear parent_metric_id.
//  • rollup → entry: blocked while active children still point at it.
export async function setMetricMode(
  metricId: string,
  mode: MetricMode,
  rollupOp?: RollupOp,
): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const update: Record<string, unknown> = { mode }
    if (mode === 'rollup') {
      update.rollup_op = rollupOp ?? 'sum'
      update.parent_metric_id = null
    } else {
      // rollup → entry: refuse if children still reference it
      const { count } = await supabase
        .from('metrics')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .eq('parent_metric_id', metricId)
        .eq('is_active', true)
      if ((count ?? 0) > 0) {
        return { ok: false, error: 'Detach the counts pointing at this first.' }
      }
      update.rollup_op = null
    }

    const { data, error } = await supabase
      .from('metrics')
      .update(update)
      .eq('id', metricId)
      .eq('church_id', churchId)
      .select(METRIC_SELECT)
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Update failed' }
    return { ok: true, data: data as MetricRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── setMetricParent ──────────────────────────────────────────────────────────
// Point an entry metric at a roll-up (or pass null to unwire / "stays local").
export async function setMetricParent(
  metricId: string,
  parentMetricId: string | null,
): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const { data: child } = await supabase
      .from('metrics')
      .select('id, reporting_tag_id, ministry_tag_id, mode')
      .eq('id', metricId)
      .eq('church_id', churchId)
      .maybeSingle()
    if (!child) return { ok: false, error: 'Count not found.' }
    if (child.mode !== 'entry') return { ok: false, error: 'Only a typed count can roll up.' }

    if (parentMetricId) {
      const err = await validateParentLink(
        supabase, churchId,
        child.ministry_tag_id as string,
        child.reporting_tag_id as string,
        parentMetricId,
      )
      if (err) return { ok: false, error: err }
    }

    const { data, error } = await supabase
      .from('metrics')
      .update({ parent_metric_id: parentMetricId })
      .eq('id', metricId)
      .eq('church_id', churchId)
      .select(METRIC_SELECT)
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Update failed' }
    return { ok: true, data: data as MetricRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── setRollupOp ──────────────────────────────────────────────────────────────
// Change a roll-up's aggregation operation (sum / avg / max).
export async function setRollupOp(metricId: string, rollupOp: RollupOp): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const { data, error } = await supabase
      .from('metrics')
      .update({ rollup_op: rollupOp })
      .eq('id', metricId)
      .eq('church_id', churchId)
      .eq('mode', 'rollup')
      .select(METRIC_SELECT)
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Update failed' }
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

    // Load first so we can free / transfer the canonical slot. The partial
    // unique index uq_metric_canonical ignores is_active, so a removed row that
    // keeps is_canonical=true would block re-adding the same kind — clear it.
    const { data: metric } = await supabase
      .from('metrics')
      .select('id, ministry_tag_id, reporting_tag_id, is_canonical')
      .eq('id', metricId)
      .eq('church_id', churchId)
      .maybeSingle()

    const { error } = await supabase
      .from('metrics')
      .update({ is_active: false, is_canonical: false })
      .eq('id', metricId)
      .eq('church_id', churchId)
    if (error) return { ok: false, error: error.message }

    // If we removed the headline (★) metric and active siblings remain for the
    // same (ministry, kind), promote the oldest so that kind keeps a headline.
    if (metric?.is_canonical) {
      const { data: sibling } = await supabase
        .from('metrics')
        .select('id')
        .eq('church_id', churchId)
        .eq('ministry_tag_id', metric.ministry_tag_id as string)
        .eq('reporting_tag_id', metric.reporting_tag_id as string)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (sibling) {
        await supabase.from('metrics').update({ is_canonical: true }).eq('id', sibling.id).eq('church_id', churchId)
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}


// ─────────────────────────────────────────────────────────────────────────
// "Where is this counted?" — the two doors (TK5,
// IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md §3). Door A links a ministry to
// services (its instance metrics render there in Entries). Door B converts
// its entry metrics to weekly/monthly church-wide (Stat Entries tab — no
// service; the Giving model: "convert, never link").
// ─────────────────────────────────────────────────────────────────────────

/** Door A — count this ministry at the given services (idempotent). */
export async function linkMinistryToServices(params: {
  tagId: string
  templateIds: string[]
}): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)
    if (params.templateIds.length === 0) return { ok: false, error: 'Pick at least one service.' }

    // Validate ownership: tag + templates must belong to this church + be active.
    const { data: tag } = await supabase
      .from('service_tags').select('id')
      .eq('id', params.tagId).eq('church_id', churchId).eq('is_active', true).maybeSingle()
    if (!tag) return { ok: false, error: 'Ministry not found.' }

    const { data: tmpls } = await supabase
      .from('service_templates').select('id')
      .eq('church_id', churchId).eq('is_active', true)
      .in('id', params.templateIds)
    const validIds = new Set(((tmpls ?? []) as { id: string }[]).map(t => t.id))
    if (validIds.size === 0) return { ok: false, error: 'No valid services selected.' }

    for (const tmplId of validIds) {
      const { data: existing } = await supabase
        .from('service_template_tags').select('id')
        .eq('service_template_id', tmplId).eq('ministry_tag_id', params.tagId).maybeSingle()
      if (existing) continue
      const { data: maxRow } = await supabase
        .from('service_template_tags')
        .select('sort_order')
        .eq('service_template_id', tmplId)
        .order('sort_order', { ascending: false })
        .limit(1)
      const nextSort = ((maxRow?.[0] as { sort_order?: number | null } | undefined)?.sort_order ?? -1) + 1
      const { error } = await supabase.from('service_template_tags').insert({
        church_id: churchId,
        service_template_id: tmplId,
        ministry_tag_id: params.tagId,
        sort_order: nextSort,
      })
      // UNIQUE violation = raced an identical link — idempotent, ignore.
      if (error && !/duplicate|unique/i.test(error.message)) return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Door B — convert a ministry's active instance-scoped ENTRY metrics to
 * period-scoped (weekly/monthly church-wide; renders in Stat Entries).
 * GUARD: blocked when any of those metrics already has instance-bound
 * entries — converting them is a data migration (see
 * scripts/data-fixes/giving_to_weekly.sql for the pattern), not a click.
 */
export async function convertMinistryToWeekly(params: {
  tagId: string
  cadence: 'week' | 'month'
}): Promise<ActionResult<{ converted: number }>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const { data: metricRows } = await supabase
      .from('metrics')
      .select('id')
      .eq('church_id', churchId)
      .eq('ministry_tag_id', params.tagId)
      .eq('is_active', true)
      .eq('mode', 'entry')
      .eq('scope', 'instance')
    const metricIds = ((metricRows ?? []) as { id: string }[]).map(m => m.id)
    if (metricIds.length === 0) return { ok: false, error: 'Nothing to convert — no instance-scoped entry metrics on this ministry.' }

    // Guard: any instance-bound data already logged?
    const { count } = await supabase
      .from('metric_entries')
      .select('id', { count: 'exact', head: true })
      .in('metric_id', metricIds)
      .not('service_instance_id', 'is', null)
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `This ministry already has ${count} logged ${count === 1 ? 'entry' : 'entries'} at services — converting it needs a data fix (ask your admin), not a toggle.`,
      }
    }

    const { error } = await supabase
      .from('metrics')
      .update({ scope: 'period', cadence: params.cadence })
      .eq('church_id', churchId)
      .in('id', metricIds)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { converted: metricIds.length } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── updateMetricCadence ───────────────────────────────────────────────────────
// Change a period metric's cadence (week ↔ month). Only applies to
// scope='period' rows — the .eq('scope','period') guard prevents accidental
// mutation of service-bound metrics.
export async function updateMetricCadence(
  metricId: string,
  cadence: 'week' | 'month',
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const { error } = await supabase
      .from('metrics')
      .update({ cadence })
      .eq('id', metricId)
      .eq('church_id', churchId)
      .eq('scope', 'period')

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
