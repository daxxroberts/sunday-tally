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

/**
 * Explicit classification of every count (single source of truth — never
 * derived from `mode`; deriving can't disambiguate two same-kind rollups on
 * one node). Backed by metrics.metric_role + CHECK chk_metric_role_mode
 * (template ⇔ mode='rollup'; the other three ⇔ mode='entry').
 *   • template      — legend on a MINISTRY; mirrors to every group; shows the sum.
 *   • ministry_only — entered at the ministry, not per group.
 *   • group_only    — entered only in one group; never mirrored/rolled up.
 *   • mirror        — the template as seen inside a group: ghosted/LOCKED,
 *                     edited only on the ministry (parent_metric_id → template).
 */
export type MetricRole = 'template' | 'ministry_only' | 'group_only' | 'mirror'

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
    .select('id, ministry_tag_id, parent_metric_id, metric_role')
    .eq('church_id', churchId)
    .eq('is_active', true)
  const nodeOfMetric = new Map<string, string>()
  for (const m of (metrics ?? []) as { id: string; ministry_tag_id: string }[]) nodeOfMetric.set(m.id, m.ministry_tag_id)

  const stale: string[] = []
  for (const m of (metrics ?? []) as { id: string; ministry_tag_id: string; parent_metric_id: string | null; metric_role: MetricRole }[]) {
    if (!m.parent_metric_id) continue
    // Never strand a mirror's template link (decision 7) — reparenting a group
    // that carries mirrors is blocked upstream, but guard here belt-and-braces.
    if (m.metric_role === 'mirror') continue
    if (!subtree.has(m.ministry_tag_id)) continue            // only heal the moved subtree
    const parentNode = nodeOfMetric.get(m.parent_metric_id)
    if (!parentNode || !ancestorsOf(m.ministry_tag_id).has(parentNode)) stale.push(m.id)
  }

  if (stale.length > 0) {
    await supabase.from('metrics').update({ parent_metric_id: null }).in('id', stale).eq('church_id', churchId)
  }
  return stale.length
}

// ── metric_role helpers (mirrored-metrics write-model) ─────────────────────

/**
 * Belt-and-braces depth guard, mirroring the DB trigger (0052:
 * enforce_service_tag_depth). Returns a friendly error string if `parentTagId`
 * itself already has a parent (which would make the new/moved node depth-3), or
 * null if the nesting is fine. The DB trigger is the real authority — this just
 * turns its raw P0001 exception into a graceful message before we ever insert.
 */
async function assertDepthOk(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  parentTagId: string | null | undefined,
): Promise<string | null> {
  if (!parentTagId) return null
  const { data: parent } = await supabase
    .from('service_tags')
    .select('parent_tag_id')
    .eq('id', parentTagId)
    .eq('church_id', churchId)
    .maybeSingle()
  // A non-null parentTagId that resolves to no row in THIS church is either a
  // typo or a cross-tenant id — parent_tag_id's FK isn't church-scoped, so
  // without this check a bad id would silently pass depth-OK and slip an
  // out-of-church parent into the insert/update below.
  if (!parent) return 'Parent group not found.'
  if ((parent as { parent_tag_id: string | null }).parent_tag_id) {
    return 'Groups can only be nested one level deep — a group can’t contain other groups.'
  }
  return null
}

/**
 * Mirror a ministry TEMPLATE down to every active, non-archived child group of
 * that template's ministry. Generalizes inheritRollupsFromParent: instead of
 * seeding a new child from all of a parent's roll-ups, this seeds all existing
 * children from ONE template. For each group missing a live mirror of the
 * template, insert a `mirror` metric (mode='entry', metric_role='mirror',
 * parent_metric_id=template.id, same reporting_tag_id, copied name +
 * counted_demographic), honoring the C2 canonical guard per group.
 * Idempotent: skips a group that already carries an active mirror of the template.
 * Returns how many mirrors were created, and any per-group insert errors
 * (review #48) so a caller can tell the difference between "all subgroups got
 * their mirror" and "some subgroups silently didn't."
 */
async function mirrorTemplateToClasses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  template: {
    id: string
    ministry_tag_id: string
    reporting_tag_id: string
    name: string
    counted_demographic: TagRole | null
  },
): Promise<{ created: number; errors: string[] }> {
  // Active, non-archived child groups of the template's ministry.
  const { data: groups } = await supabase
    .from('service_tags')
    .select('id')
    .eq('church_id', churchId)
    .eq('parent_tag_id', template.ministry_tag_id)
    .eq('is_active', true)
    .is('archived_at', null)
  const groupIds = ((groups ?? []) as { id: string }[]).map(g => g.id)
  if (groupIds.length === 0) return { created: 0, errors: [] }

  // Groups that already have a live mirror of THIS template — skip them.
  const { data: existingMirrors } = await supabase
    .from('metrics')
    .select('ministry_tag_id')
    .eq('church_id', churchId)
    .eq('parent_metric_id', template.id)
    .eq('metric_role', 'mirror')
    .eq('is_active', true)
    .in('ministry_tag_id', groupIds)
  const alreadyMirrored = new Set(
    ((existingMirrors ?? []) as { ministry_tag_id: string }[]).map(m => m.ministry_tag_id),
  )

  let created = 0
  const errors: string[] = []
  for (const groupId of groupIds) {
    if (alreadyMirrored.has(groupId)) continue
    const res = await insertMirror(supabase, churchId, template, groupId)
    if (res.id) created++
    else errors.push(res.error ?? 'Insert failed')
  }
  return { created, errors }
}

/**
 * Insert one `mirror` metric for `template` on `groupId` (the shared insert used
 * by mirrorTemplateToClasses and createMinistry's child path). Applies the C2
 * canonical guard for (church, group, kind) and a church-wide unique code.
 * Returns { id } on success, or { id: null, error } on failure — callers should
 * surface `error` (at minimum as a partial-failure notice) rather than silently
 * treating a failed mirror insert as if nothing was owed here (review #48).
 *
 * Migration 0055 (NEEDS-APPROVAL, unapplied) adds a partial unique index on
 * (parent_metric_id, ministry_tag_id) for live mirrors, closing the race where
 * two concurrent calls both pass the "no live mirror yet" check above and both
 * insert (review #25). Until 0055 is applied that race is still open — this
 * function treats a unique-violation on that index (23505) the same as "someone
 * else already created it" and returns the existing mirror's id, so once the
 * index lands this becomes safe with no further code change.
 */
async function insertMirror(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  template: {
    id: string
    reporting_tag_id: string
    name: string
    counted_demographic: TagRole | null
  },
  groupId: string,
): Promise<{ id: string | null; error: string | null }> {
  // C2: is there already an active canonical for (church, group, kind)?
  const { data: existingCanonical } = await supabase
    .from('metrics')
    .select('id')
    .eq('church_id', churchId)
    .eq('ministry_tag_id', groupId)
    .eq('reporting_tag_id', template.reporting_tag_id)
    .eq('is_canonical', true)
    .eq('is_active', true)
    .maybeSingle()
  const isCanonical = !existingCanonical

  // Church-wide unique metric code (uq_metric_code is church_id+code).
  const { data: gtag } = await supabase
    .from('service_tags')
    .select('code')
    .eq('id', groupId)
    .eq('church_id', churchId)
    .maybeSingle()
  const tagCode = (gtag?.code as string | null) ?? 'GRP'
  const { data: existingMetrics } = await supabase
    .from('metrics')
    .select('code')
    .eq('church_id', churchId)
  const haveCodes = new Set((existingMetrics ?? []).map(m => m.code as string))
  const baseSuffix = slugifyCode(template.name) || 'COUNT'
  let metricCode = `${tagCode}_${baseSuffix}`
  let s = 1
  while (haveCodes.has(metricCode)) { metricCode = `${tagCode}_${baseSuffix}_${s}`; s++ }

  const { data, error } = await supabase
    .from('metrics')
    .insert({
      church_id: churchId,
      ministry_tag_id: groupId,
      reporting_tag_id: template.reporting_tag_id,
      scope: 'instance',
      code: metricCode,
      name: template.name,
      is_canonical: isCanonical,
      is_active: true,
      mode: 'entry',
      metric_role: 'mirror',
      rollup_op: null,
      parent_metric_id: template.id,
      counted_demographic: template.counted_demographic,
    })
    .select('id')
    .single()
  if (error || !data) {
    // 23505 = unique_violation. If it's our new partial index (0055, once
    // applied), a concurrent call already created this exact mirror — that's
    // not a real failure, fetch and return the row that won the race.
    if (error?.code === '23505') {
      const { data: winner } = await supabase
        .from('metrics')
        .select('id')
        .eq('church_id', churchId)
        .eq('parent_metric_id', template.id)
        .eq('ministry_tag_id', groupId)
        .eq('metric_role', 'mirror')
        .eq('is_active', true)
        .maybeSingle()
      if (winner) return { id: (winner as { id: string }).id, error: null }
    }
    return { id: null, error: error?.message ?? 'Insert failed' }
  }
  return { id: (data as { id: string }).id, error: null }
}

/** Propagate a template rename to all of its live mirrors. */
async function propagateRename(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  templateId: string,
  name: string,
): Promise<void> {
  await supabase
    .from('metrics')
    .update({ name })
    .eq('church_id', churchId)
    .eq('parent_metric_id', templateId)
    .eq('metric_role', 'mirror')
    .eq('is_active', true)
}

/** Propagate a template's demographic change to all of its live mirrors. */
async function propagateDemographic(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  templateId: string,
  demographic: TagRole | null,
): Promise<void> {
  await supabase
    .from('metrics')
    .update({ counted_demographic: demographic })
    .eq('church_id', churchId)
    .eq('parent_metric_id', templateId)
    .eq('metric_role', 'mirror')
    .eq('is_active', true)
}

/**
 * Propagate a template ARCHIVE to its live mirrors: set archived_at=now(),
 * keep is_active=true (so mirror history keeps rolling up — decision 9).
 * Frees each archived mirror's canonical slot and re-promotes a sibling.
 */
async function propagateDeactivate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  templateId: string,
): Promise<void> {
  const { data: mirrors } = await supabase
    .from('metrics')
    .select('id, ministry_tag_id, reporting_tag_id, is_canonical')
    .eq('church_id', churchId)
    .eq('parent_metric_id', templateId)
    .eq('metric_role', 'mirror')
    .eq('is_active', true)
    .is('archived_at', null)
  const rows = (mirrors ?? []) as {
    id: string; ministry_tag_id: string; reporting_tag_id: string; is_canonical: boolean
  }[]
  if (rows.length === 0) return

  await supabase
    .from('metrics')
    .update({ archived_at: new Date().toISOString(), is_canonical: false })
    .in('id', rows.map(r => r.id))
    .eq('church_id', churchId)

  // Re-promote a live sibling for any (group, kind) whose canonical we archived.
  for (const r of rows) {
    if (!r.is_canonical) continue
    await reassignCanonical(supabase, churchId, r.ministry_tag_id, r.reporting_tag_id)
  }
}

/**
 * If (ministryTagId, reportingTagId) currently has no active headline (★),
 * promote the oldest active + non-archived sibling so that kind keeps one.
 * Extracted from deactivateCount's sibling-promotion block for reuse.
 */
async function reassignCanonical(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  ministryTagId: string,
  reportingTagId: string,
): Promise<void> {
  const { data: current } = await supabase
    .from('metrics')
    .select('id')
    .eq('church_id', churchId)
    .eq('ministry_tag_id', ministryTagId)
    .eq('reporting_tag_id', reportingTagId)
    .eq('is_canonical', true)
    .eq('is_active', true)
    .maybeSingle()
  if (current) return // already has a headline

  const { data: sibling } = await supabase
    .from('metrics')
    .select('id')
    .eq('church_id', churchId)
    .eq('ministry_tag_id', ministryTagId)
    .eq('reporting_tag_id', reportingTagId)
    .eq('is_active', true)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (sibling) {
    await supabase.from('metrics').update({ is_canonical: true }).eq('id', sibling.id).eq('church_id', churchId)
  }
}

// ── createMinistry ────────────────────────────────────────────────────────
// E-2 / IRIS contract: inserts a service_tags node. A TOP-LEVEL ministry
// auto-seeds a ministry_only Attendance metric (canonical guard applied) so
// it's immediately enterable; a CHILD group instead inherits the parent
// ministry's templates as locked mirrors (no fresh Attendance seed).

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

    // Depth guard (decision 2/4). Belt-and-braces before the DB trigger:
    // a group can't be created inside another group. NO auto-conversion of the
    // parent's counts (decision 4 forbids it) — the parent's ministry_only counts
    // stay put; the child inherits the parent's TEMPLATE counts as mirrors below.
    const depthErr = await assertDepthOk(supabase, churchId, params.parent_tag_id)
    if (depthErr) return { ok: false, error: depthErr }

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

      // CHILD GROUP: inherit the parent MINISTRY's templates as locked mirrors,
      // so every group counts the same legend and the ministry's total is never
      // missing a group. NO fresh Attendance seed here (a group inherits the
      // ministry's mirrors, it doesn't invent its own), and the parent's existing
      // counts are NOT auto-promoted (decision 4).
      const { data: templates } = await supabase
        .from('metrics')
        .select('id, reporting_tag_id, name, counted_demographic')
        .eq('church_id', churchId)
        .eq('ministry_tag_id', node.parent_tag_id)
        .eq('metric_role', 'template')
        .eq('is_active', true)
        .is('archived_at', null)
      for (const t of (templates ?? []) as {
        id: string; reporting_tag_id: string; name: string; counted_demographic: TagRole | null
      }[]) {
        const mirrorRes = await insertMirror(supabase, churchId, {
          id: t.id,
          reporting_tag_id: t.reporting_tag_id,
          name: t.name,
          counted_demographic: t.counted_demographic,
        }, node.id)
        // The new node itself was created fine — don't fail createMinistry over
        // a mirror hiccup, but this must not vanish silently either (review #48).
        if (mirrorRes.error) {
          console.error(`createMinistry: failed to mirror template ${t.id} onto new group ${node.id}: ${mirrorRes.error}`)
        }
      }
    } else {
      // TOP-LEVEL MINISTRY: guarantee a plain ministry_only Attendance count
      // (respects the C2 canonical guard) so the ministry is immediately enterable.
      await addCount({
        ministryId: node.id,
        reportingTagCode: 'ATTENDANCE',
        name: `${name} Attendance`,
        role: 'ministry_only',
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

    // Reparent guards (before any write).
    if ('parent_tag_id' in patch && (patch.parent_tag_id ?? null) !== null) {
      // Depth (decision 2) — belt-and-braces before the DB trigger.
      const depthErr = await assertDepthOk(supabase, churchId, patch.parent_tag_id)
      if (depthErr) return { ok: false, error: depthErr }
      // A group that ITSELF has child groups can't be nested under another group
      // (that would make its children depth 3). The 0054 DB trigger enforces this;
      // surface a friendly message before hitting the raw P0001 exception.
      const { count: childCount } = await supabase
        .from('service_tags')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .eq('parent_tag_id', id)
        .eq('is_active', true)
      if ((childCount ?? 0) > 0) {
        return { ok: false, error: 'This group contains subgroups, so it can’t be moved under another group.' }
      }
      // Don't move a group that carries mirrors — its mirrors point at a template
      // on its current parent; relocating it would strand that roll-up link
      // (decision 7). Remove the mirrored counts first (on the ministry).
      const { count: mirrorCount } = await supabase
        .from('metrics')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .eq('ministry_tag_id', id)
        .eq('metric_role', 'mirror')
        .eq('is_active', true)
      if ((mirrorCount ?? 0) > 0) {
        // "subgroup" is the vocabulary the rest of the editor uses for this node
        // (DetailPanel/MetricRowItem); this app-level message has no DB-trigger
        // counterpart to stay verbatim-matched with, so align it (review #68).
        return { ok: false, error: 'This subgroup counts things mirrored from its ministry. Remove those counts (on the ministry) before moving it.' }
      }
    }

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
// E-5 / decision 9 — REMOVE a ministry or group = delete vs archive, over the
// WHOLE subtree (depth ≤ 2: the node + its child groups):
//   • subtree has ZERO metric_entries → HARD DELETE (metrics + tags, children
//     first). No "remove children first" block — the cascade handles them.
//   • subtree has entries → ARCHIVE every tag in the subtree (archived_at=now(),
//     KEEP is_active=true). Metrics keep is_active so their history still rolls
//     up + shows in History; the archived tags disappear from the editor + entry
//     screen (those reads add archived_at IS NULL).
//
// STOP-AND-FLAG (plan conflict, decision 9 vs the state-machine's "remove last
// group → revert templates to plain ministry entries"): removing a group here
// does NOT auto-revert the parent ministry's templates. Reverting a template to
// a plain entry while archived mirrors still point at it (parent_metric_id)
// would strand the roll-up chain. Left for a design micro-decision — see
// BUILD_FLAGS.md. This action only removes/archives the node + its own subtree.
//
// STOP-AND-FLAG (review finding #24): the hasData probe below and the HARD
// DELETE branch are check-then-act over separate REST round-trips, not one
// transaction. An entry saved on any subtree metric in the window between the
// metric_entries count and the metrics.delete() is silently destroyed by the
// ON DELETE CASCADE — no error, no trace. The anon client can't wrap this in a
// transaction; closing it for real needs a SECURITY DEFINER RPC that does the
// probe + delete/archive atomically server-side (same shape as
// _wipe_church_content, 0047). Left unfixed here — needs a design call on
// whether this narrow, admin-only, low-frequency race is worth a new RPC
// migration before shipping, or an acceptable known gap for v1.
export async function deactivateMinistry(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    // Subtree tags = this node + its child groups (max depth 2). Include INACTIVE
    // children too: a hard delete of `id` CASCADEs to every child tag regardless
    // of is_active, so the data probe below must see the whole cascade footprint.
    const { data: kids } = await supabase
      .from('service_tags')
      .select('id')
      .eq('church_id', churchId)
      .eq('parent_tag_id', id)
    const childIds = ((kids ?? []) as { id: string }[]).map(k => k.id)
    const subtreeTagIds = [id, ...childIds]

    // ALL metrics on the subtree — active OR NOT. Deleting the tags CASCADE-deletes
    // every metric on them (metrics.ministry_tag_id ON DELETE CASCADE) and their
    // metric_entries, so a legacy inactive-but-data-bearing count (old "remove"
    // set is_active=false + KEPT entries) must count toward hasData, or its
    // history would be silently, permanently wiped. (Review finding #2.)
    const { data: subtreeMetrics } = await supabase
      .from('metrics')
      .select('id')
      .eq('church_id', churchId)
      .in('ministry_tag_id', subtreeTagIds)
    const subtreeMetricIds = ((subtreeMetrics ?? []) as { id: string }[]).map(m => m.id)

    // Any entries anywhere in the subtree?
    let hasData = false
    if (subtreeMetricIds.length > 0) {
      const { count } = await supabase
        .from('metric_entries')
        .select('id', { count: 'exact', head: true })
        .in('metric_id', subtreeMetricIds)
      hasData = (count ?? 0) > 0
    }

    if (!hasData) {
      // HARD DELETE: metrics first (FK), then child tags, then the node.
      if (subtreeMetricIds.length > 0) {
        const { error } = await supabase.from('metrics').delete().in('id', subtreeMetricIds).eq('church_id', churchId)
        if (error) return { ok: false, error: error.message }
      }
      if (childIds.length > 0) {
        const { error } = await supabase.from('service_tags').delete().in('id', childIds).eq('church_id', churchId)
        if (error) return { ok: false, error: error.message }
      }
      const { error } = await supabase.from('service_tags').delete().eq('id', id).eq('church_id', churchId)
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    // ARCHIVE: hide the whole subtree's tags from editor + entry, keep history.
    const { error } = await supabase
      .from('service_tags')
      .update({ archived_at: new Date().toISOString() })
      .in('id', subtreeTagIds)
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
  /** Explicit classification (template | ministry_only | group_only | mirror).
   *  Single source of truth; kept consistent with `mode` by chk_metric_role_mode. */
  metric_role: MetricRole
  /** Archive marker (decision 9). NULL = live. Non-null = archived: the row keeps
   *  is_active=true so its history still rolls up, but it's hidden from the setup
   *  editor + entry screen and accepts no new data. */
  archived_at: string | null
  /** Who this count actually counts, independent of its ministry. null =
   *  inherit the ministry's tag_role (the default). Surfaced in the UI for
   *  ATTENDANCE / VOLUNTEERS counts only. */
  counted_demographic: TagRole | null
  /** 'instance' = per gathering (needs a service); 'period' = weekly/monthly
   *  church-wide (Stat Entries — e.g. Giving). Optional: defaults to instance. */
  scope?: 'instance' | 'period'
  cadence?: 'week' | 'month' | 'day' | null
}

const METRIC_SELECT = 'id, code, name, reporting_tag_id, is_canonical, is_active, mode, rollup_op, parent_metric_id, metric_role, archived_at, counted_demographic'

export async function addCount(params: {
  ministryId: string
  reportingTagCode: string   // 'ATTENDANCE' | 'VOLUNTEERS' | 'RESPONSE_STAT' | 'GIVING'
  name: string
  /** Which section this count is added under (sets its kind — decision 4).
   *  Defaults to 'ministry_only'. 'mirror' is internal (mirrorTemplateToClasses
   *  is the normal path); when passed here it still needs a valid parentMetricId. */
  role?: MetricRole
  parentMetricId?: string | null  // mirror only: the template this count mirrors
}): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const name = params.name.trim()
    if (!name) return { ok: false, error: 'Name is required' }

    // Verify the ministry/group tag actually belongs to this church before we
    // use ministryId anywhere below — RLS's WITH CHECK only confirms the ROW
    // WE INSERT carries this church_id, it never confirms ministryId itself
    // is one of this church's tags, so a cross-tenant id would otherwise sail
    // straight through into the metrics insert.
    const { data: ministryTag } = await supabase
      .from('service_tags')
      .select('id')
      .eq('id', params.ministryId)
      .eq('church_id', churchId)
      .maybeSingle()
    if (!ministryTag) return { ok: false, error: 'Ministry not found.' }

    const role: MetricRole = params.role ?? 'ministry_only'
    // template ⇔ rollup; the other three ⇔ entry (chk_metric_role_mode).
    const mode: MetricMode = role === 'template' ? 'rollup' : 'entry'

    // Resolve reporting_tag id from code
    const { data: rtag } = await supabase
      .from('reporting_tags')
      .select('id')
      .or(`church_id.eq.${churchId},church_id.is.null`)
      .eq('code', params.reportingTagCode)
      .maybeSingle()
    if (!rtag) return { ok: false, error: `Reporting tag ${params.reportingTagCode} not found` }

    const reportingTagId = rtag.id as string

    // Roll-up op only on a template; parent link only on a mirror (a template
    // may never carry parent_metric_id — chk_metric_parent_entry_only).
    const rollupOp: RollupOp | null = mode === 'rollup' ? 'sum' : null
    const parentMetricId: string | null = role === 'mirror' ? (params.parentMetricId ?? null) : null
    if (role === 'mirror' && !parentMetricId) {
      return { ok: false, error: 'A mirrored count must point at its template.' }
    }
    if (parentMetricId) {
      const err = await validateParentLink(supabase, churchId, params.ministryId, reportingTagId, parentMetricId)
      if (err) return { ok: false, error: err }
    }

    // Decision 8: on one node, a given kind can't be BOTH a template and a
    // ministry_only count. Reject the second-kind add either way.
    if (role === 'template' || role === 'ministry_only') {
      const conflictRole = role === 'template' ? 'ministry_only' : 'template'
      const { data: conflict } = await supabase
        .from('metrics')
        .select('id')
        .eq('church_id', churchId)
        .eq('ministry_tag_id', params.ministryId)
        .eq('reporting_tag_id', reportingTagId)
        .eq('metric_role', conflictRole)
        .eq('is_active', true)
        .is('archived_at', null)
        .maybeSingle()
      if (conflict) {
        return {
          ok: false,
          error: role === 'template'
            ? 'This ministry already counts that directly. Remove that count first if you want every group to count it instead.'
            : 'Every group already counts that. Remove it from the groups first if you want to count it just at the ministry.',
        }
      }
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
        metric_role: role,
        rollup_op: rollupOp,
        parent_metric_id: parentMetricId,
      })
      .select(METRIC_SELECT)
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed' }
    const created = data as MetricRow

    // A new template mirrors immediately to every existing group.
    if (role === 'template') {
      const mirrorRes = await mirrorTemplateToClasses(supabase, churchId, {
        id: created.id,
        ministry_tag_id: params.ministryId,
        reporting_tag_id: reportingTagId,
        name,
        counted_demographic: created.counted_demographic,
      })
      // The template itself was created fine — don't fail the whole action, but
      // a subgroup silently missing its mirror must not vanish without a trace
      // (review #48). Surface via error even though ok:true (some existing
      // callers alert() only in the else-branch and will miss this in-app; it's
      // at minimum visible in server logs for support/debugging).
      if (mirrorRes.errors.length > 0) {
        console.error(`addCount: ${mirrorRes.errors.length} subgroup mirror(s) failed for template ${created.id}: ${mirrorRes.errors.join('; ')}`)
        return {
          ok: true,
          data: created,
          error: `Created, but ${mirrorRes.errors.length} subgroup${mirrorRes.errors.length === 1 ? '' : 's'} didn't get this count mirrored. Try again from the ministry.`,
        }
      }
    }

    return { ok: true, data: created }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── setCountSection ─────────────────────────────────────────────────────────
// Move a MINISTRY count between "counted at the ministry" (ministry_only) and
// "counted in every group" (template). Replaces the old promote/demote toggle.
//   • → template:      require data-less (zero metric_entries — decision 3),
//                      then mode='rollup' + metric_role='template' and mirror to
//                      every group. A count with data stays put (remove + re-add
//                      it under the groups instead).
//   • → ministry_only: refuse if it still has active, non-archived mirrors
//                      (remove the groups' copies first); then mode='entry' +
//                      metric_role='ministry_only'.
// Mirror/group-only rows are never a valid target here.
export async function setCountSection(
  metricId: string,
  targetRole: 'ministry_only' | 'template',
): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const { data: metric } = await supabase
      .from('metrics')
      .select('id, ministry_tag_id, reporting_tag_id, name, mode, metric_role, counted_demographic, archived_at')
      .eq('id', metricId)
      .eq('church_id', churchId)
      .maybeSingle()
    if (!metric) return { ok: false, error: 'Count not found.' }
    const m = metric as {
      id: string; ministry_tag_id: string; reporting_tag_id: string; name: string
      mode: MetricMode; metric_role: MetricRole; counted_demographic: TagRole | null
      archived_at: string | null
    }
    // FLAG (review #51, GROVE/product call): copy previously said "Restore it
    // before moving it," but no restore/unarchive action exists anywhere in
    // this feature (grepped the whole track/ folder — archived_at is only ever
    // set, never cleared). Rewritten to not promise a path that doesn't exist.
    // If restore is actually intended, build it and revert this message.
    if (m.archived_at) return { ok: false, error: 'This count is archived and its numbers are kept for history — it can’t be moved.' }
    if (m.metric_role === 'mirror' || m.metric_role === 'group_only') {
      return { ok: false, error: 'Only a ministry count can move between “at the ministry” and “every subgroup”. Edit this on its ministry.' }
    }
    if (m.metric_role === targetRole) return { ok: true, data: await refetchMetric(supabase, churchId, metricId) }

    // Decision 8: the target role can't already exist for this kind on this node.
    const conflictRole = targetRole === 'template' ? 'ministry_only' : 'template'
    const { data: conflict } = await supabase
      .from('metrics')
      .select('id')
      .eq('church_id', churchId)
      .eq('ministry_tag_id', m.ministry_tag_id)
      .eq('reporting_tag_id', m.reporting_tag_id)
      .eq('metric_role', conflictRole)
      .eq('is_active', true)
      .is('archived_at', null)
      .neq('id', metricId)
      .maybeSingle()
    if (conflict) {
      return { ok: false, error: 'This ministry already counts that the other way. Remove that count first.' }
    }

    if (targetRole === 'template') {
      // FREE MOVE (Builder decision): a count that already has numbers may become
      // a per-subgroup template. Its legacy ministry-level entries STAY on this
      // metric and still count — computeRollups totals a template's OWN entries
      // plus its subgroups'. No double-count: the entry screen only offers one
      // level per count, so no week ever has both a ministry and a subgroup number.
      const { error } = await supabase
        .from('metrics')
        .update({ mode: 'rollup', metric_role: 'template', rollup_op: 'sum', parent_metric_id: null })
        .eq('id', metricId)
        .eq('church_id', churchId)
      if (error) return { ok: false, error: error.message }
      const mirrorRes = await mirrorTemplateToClasses(supabase, churchId, {
        id: m.id,
        ministry_tag_id: m.ministry_tag_id,
        reporting_tag_id: m.reporting_tag_id,
        name: m.name,
        counted_demographic: m.counted_demographic,
      })
      // The mode flip itself succeeded — don't fail the action, but a subgroup
      // silently missing its mirror must not vanish without a trace (review #48).
      if (mirrorRes.errors.length > 0) {
        console.error(`setCountSection: ${mirrorRes.errors.length} subgroup mirror(s) failed for template ${m.id}: ${mirrorRes.errors.join('; ')}`)
        return {
          ok: true,
          data: await refetchMetric(supabase, churchId, metricId),
          error: `Moved, but ${mirrorRes.errors.length} subgroup${mirrorRes.errors.length === 1 ? '' : 's'} didn't get this count mirrored. Try again from here.`,
        }
      }
    } else {
      // → ministry_only. Allowed when the subgroups' mirrors have NO data (we
      // delete those empty mirrors, then flip). If any mirror already has numbers,
      // refuse — collapsing to one ministry count would drop that per-subgroup
      // history. (Reverse of the free move; forward is always safe.)
      const { data: mirrors } = await supabase
        .from('metrics')
        .select('id')
        .eq('church_id', churchId)
        .eq('parent_metric_id', metricId)
        .eq('metric_role', 'mirror')
        .eq('is_active', true)
      const mirrorIds = ((mirrors ?? []) as { id: string }[]).map(r => r.id)
      if (mirrorIds.length > 0) {
        const { count: mData } = await supabase
          .from('metric_entries')
          .select('id', { count: 'exact', head: true })
          .in('metric_id', mirrorIds)
        if ((mData ?? 0) > 0) {
          return { ok: false, error: 'Your subgroups already have numbers for this — moving it back to one ministry count would drop that per-subgroup detail. Remove the subgroup numbers first, or keep it per-subgroup.' }
        }
        const { error: delErr } = await supabase.from('metrics').delete().in('id', mirrorIds).eq('church_id', churchId)
        if (delErr) return { ok: false, error: delErr.message }
      }
      const { error } = await supabase
        .from('metrics')
        .update({ mode: 'entry', metric_role: 'ministry_only', rollup_op: null, parent_metric_id: null })
        .eq('id', metricId)
        .eq('church_id', churchId)
      if (error) return { ok: false, error: error.message }
    }

    return { ok: true, data: await refetchMetric(supabase, churchId, metricId) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Load a metric's role (+ its owning ministry/kind/name/demographic) for the
 * lock guards (decision 7). Returns null if the metric doesn't exist in this
 * church. `mirror` rows are LOCKED — every direct mutator refuses them.
 */
async function loadMetricRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  metricId: string,
): Promise<{ metric_role: MetricRole; ministry_tag_id: string; reporting_tag_id: string } | null> {
  const { data } = await supabase
    .from('metrics')
    .select('metric_role, ministry_tag_id, reporting_tag_id')
    .eq('id', metricId)
    .eq('church_id', churchId)
    .maybeSingle()
  if (!data) return null
  return data as { metric_role: MetricRole; ministry_tag_id: string; reporting_tag_id: string }
}

/** Standard "this is a locked mirror" refusal (decision 7). */
// "subgroup" is the vocabulary the rest of the editor uses for this node
// (DetailPanel/MetricRowItem tooltips all say "every subgroup"); this string
// previously said "group", the one place in the file that drifted (review #68).
const MIRROR_LOCKED_MSG =
  'This count mirrors its ministry — edit it on the ministry and every subgroup updates together.'

/** Re-read a metric row with the standard select (post-mutation echo). */
async function refetchMetric(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  metricId: string,
): Promise<MetricRow> {
  const { data } = await supabase
    .from('metrics')
    .select(METRIC_SELECT)
    .eq('id', metricId)
    .eq('church_id', churchId)
    .single()
  return data as MetricRow
}

// ── setMetricMode ──────────────────────────────────────────────────────────
// Historically flipped a metric between 'entry' and 'rollup'. On the
// mirrored-metrics schema, chk_metric_role_mode ties mode='rollup' to
// metric_role='template' — the only legal way to become a roll-up is via
// setCountSection (which flips metric_role + mode + mirrors together). This
// action now only accepts mode='entry' (rejecting 'rollup' with a friendly
// pointer to setCountSection); a ministry_only/group_only row can never
// legitimately have parent-pointing children in the first place (a valid
// parent must be mode='rollup', which those roles never are). `rollupOp` is
// accepted but unused — kept for call-signature stability.
export async function setMetricMode(
  metricId: string,
  mode: MetricMode,
  _rollupOp?: RollupOp,
): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    // Decision 7 — locked rows. A raw mode flip would break chk_metric_role_mode
    // (role stays put while mode changes). The ministry_only ⇄ template move is
    // the job of setCountSection; a mirror is edited only on its ministry.
    const info = await loadMetricRole(supabase, churchId, metricId)
    if (!info) return { ok: false, error: 'Count not found.' }
    if (info.metric_role === 'mirror') return { ok: false, error: MIRROR_LOCKED_MSG }
    if (info.metric_role === 'template') {
      return { ok: false, error: 'To count this at the ministry instead of every subgroup, use “counted at the ministry”.' }
    }
    // chk_metric_role_mode requires (metric_role = 'template') = (mode = 'rollup').
    // Past this point metric_role is always 'ministry_only' or 'group_only', which
    // is ALWAYS mode='entry' on this schema — so mode='rollup' can never satisfy
    // the constraint here (it would hit the DB as a raw 23514 CHECK violation
    // instead of a friendly message). Becoming a roll-up ALWAYS means becoming a
    // template, which is setCountSection's job (it flips metric_role + mirrors
    // atomically) — this function has no valid rollup path of its own.
    if (mode === 'rollup') {
      return { ok: false, error: 'To turn this into a roll-up, use “counted in every subgroup” — it becomes the legend every subgroup totals up to.' }
    }

    // mode is 'entry' here, and a ministry_only/group_only row is already
    // 'entry' by construction — this is a same-state no-op update, kept so the
    // call still round-trips a fresh row (e.g. rollup_op reset) rather than
    // erroring on an otherwise-valid request.
    const update: Record<string, unknown> = { mode: 'entry', rollup_op: null }

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

// ── setCountDemographic ────────────────────────────────────────────────────
// Set who a count actually counts (independent of its ministry). null =
// inherit the ministry's tag_role. Surfaced in the UI for ATTENDANCE /
// VOLUNTEERS only; the column is harmless on other kinds, so the server
// doesn't gate by kind.
export async function setCountDemographic(
  metricId: string,
  demographic: TagRole | null,
): Promise<ActionResult<MetricRow>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    // Decision 7 — a mirror inherits its demographic locked; edit on the ministry.
    const info = await loadMetricRole(supabase, churchId, metricId)
    if (!info) return { ok: false, error: 'Count not found.' }
    if (info.metric_role === 'mirror') return { ok: false, error: MIRROR_LOCKED_MSG }

    const { data, error } = await supabase
      .from('metrics')
      .update({ counted_demographic: demographic })
      .eq('id', metricId)
      .eq('church_id', churchId)
      .select(METRIC_SELECT)
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Update failed' }

    // A template's demographic propagates to its mirrors (they stay in lock-step).
    if (info.metric_role === 'template') {
      await propagateDemographic(supabase, churchId, metricId, demographic)
    }
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
      .select('id, reporting_tag_id, ministry_tag_id, mode, metric_role')
      .eq('id', metricId)
      .eq('church_id', churchId)
      .maybeSingle()
    if (!child) return { ok: false, error: 'Count not found.' }
    // Decision 7 — a mirror's link is owned by its template; never re-point it
    // directly (that would strand the group's copy or double-count).
    if ((child.metric_role as MetricRole) === 'mirror') return { ok: false, error: MIRROR_LOCKED_MSG }
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

    // Decision 7 — a mirror is entry-mode and locked; only a template (rollup)
    // carries an op, and it's edited here on the ministry.
    const info = await loadMetricRole(supabase, churchId, metricId)
    if (!info) return { ok: false, error: 'Count not found.' }
    if (info.metric_role === 'mirror') return { ok: false, error: MIRROR_LOCKED_MSG }

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

    // Decision 7 — a mirror's name follows its template; rename on the ministry.
    const info = await loadMetricRole(supabase, churchId, metricId)
    if (!info) return { ok: false, error: 'Count not found.' }
    if (info.metric_role === 'mirror') return { ok: false, error: MIRROR_LOCKED_MSG }

    const { error } = await supabase
      .from('metrics')
      .update({ name: trimmed })
      .eq('id', metricId)
      .eq('church_id', churchId)

    if (error) return { ok: false, error: error.message }

    // A template's name propagates to every mirror (they read as one count).
    if (info.metric_role === 'template') {
      await propagateRename(supabase, churchId, metricId, trimmed)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── deactivateCount ───────────────────────────────────────────────────────
// E-8 / decision 9 — REMOVE a count = delete vs archive:
//   • ZERO metric_entries → HARD DELETE the row (gone from the DB).
//   • has entries → ARCHIVE (archived_at=now(), KEEP is_active=true) so its
//     history keeps rolling up + shows in History, but it's hidden from the
//     editor + entry screen and takes no new data.
// A TEMPLATE cascades to its mirrors: whole legend data-less → delete template
// + all mirrors; any mirror has data → archive template + all mirrors
// (propagateDeactivate). A MIRROR can't be removed directly (edit on ministry).
// Either way, re-promote a headline for the freed (ministry, kind).
export async function deactivateCount(metricId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    const { data: metric } = await supabase
      .from('metrics')
      .select('id, ministry_tag_id, reporting_tag_id, is_canonical, metric_role')
      .eq('id', metricId)
      .eq('church_id', churchId)
      .maybeSingle()
    if (!metric) return { ok: false, error: 'Count not found.' }
    const m = metric as {
      id: string; ministry_tag_id: string; reporting_tag_id: string
      is_canonical: boolean; metric_role: MetricRole
    }

    // Decision 7 — a mirror is removed by removing/archiving its template.
    if (m.metric_role === 'mirror') return { ok: false, error: MIRROR_LOCKED_MSG }

    if (m.metric_role === 'template') {
      // Live mirrors of this template + whether ANY of them (or the template,
      // though a rollup never has its own) carry entries. Need ministry_tag_id
      // per mirror (not just id) so the hard-delete branch below can re-promote
      // a canonical for EACH group that loses one, same as propagateDeactivate
      // does for the archive branch (review #26).
      const { data: mirrors } = await supabase
        .from('metrics')
        .select('id, ministry_tag_id')
        .eq('church_id', churchId)
        .eq('parent_metric_id', metricId)
        .eq('metric_role', 'mirror')
        .eq('is_active', true)
      const mirrorRows = (mirrors ?? []) as { id: string; ministry_tag_id: string }[]
      const mirrorIds = mirrorRows.map(r => r.id)
      const idsToProbe = [metricId, ...mirrorIds]
      const { count: dataCount } = await supabase
        .from('metric_entries')
        .select('id', { count: 'exact', head: true })
        .in('metric_id', idsToProbe)

      if ((dataCount ?? 0) === 0) {
        // Data-less legend → hard delete template + all its mirrors.
        if (mirrorIds.length > 0) {
          const { error: delM } = await supabase.from('metrics').delete().in('id', mirrorIds).eq('church_id', churchId)
          if (delM) return { ok: false, error: delM.message }
        }
        const { error: delT } = await supabase.from('metrics').delete().eq('id', metricId).eq('church_id', churchId)
        if (delT) return { ok: false, error: delT.message }
        // Re-promote a headline for the ministry AND for each group that just
        // lost its mirror — every deleted mirror could have been that group's
        // canonical for this kind, same as the ministry's template could have
        // been the ministry's.
        await reassignCanonical(supabase, churchId, m.ministry_tag_id, m.reporting_tag_id)
        for (const r of mirrorRows) {
          await reassignCanonical(supabase, churchId, r.ministry_tag_id, m.reporting_tag_id)
        }
        return { ok: true }
      }

      // Legend has history → archive template + all its mirrors (keep is_active).
      await propagateDeactivate(supabase, churchId, metricId)
      const { error: archT } = await supabase
        .from('metrics')
        .update({ archived_at: new Date().toISOString(), is_canonical: false })
        .eq('id', metricId)
        .eq('church_id', churchId)
      if (archT) return { ok: false, error: archT.message }
      await reassignCanonical(supabase, churchId, m.ministry_tag_id, m.reporting_tag_id)
      return { ok: true }
    }

    // ministry_only / group_only — a plain entry count.
    const { count } = await supabase
      .from('metric_entries')
      .select('id', { count: 'exact', head: true })
      .eq('metric_id', metricId)

    if ((count ?? 0) === 0) {
      const { error } = await supabase.from('metrics').delete().eq('id', metricId).eq('church_id', churchId)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase
        .from('metrics')
        .update({ archived_at: new Date().toISOString(), is_canonical: false })
        .eq('id', metricId)
        .eq('church_id', churchId)
      if (error) return { ok: false, error: error.message }
    }

    // If we freed the headline (★) for this (ministry, kind), promote a sibling.
    if (m.is_canonical) {
      await reassignCanonical(supabase, churchId, m.ministry_tag_id, m.reporting_tag_id)
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
 * CONTAINER REFUSAL (decision 4/9): a ministry that holds groups or carries
 * templates (a mirrored legend) can't be flipped church-wide — the per-group
 * mirrors would be orphaned. Mirror rows are never converted.
 */
export async function convertMinistryToWeekly(params: {
  tagId: string
  cadence: 'week' | 'month'
}): Promise<ActionResult<{ converted: number }>> {
  try {
    const supabase = await createClient()
    const churchId = await requireOwnerAdmin(supabase)

    // Refuse on a container: any active child group, or any template on the node.
    const { count: childCount } = await supabase
      .from('service_tags')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId)
      .eq('parent_tag_id', params.tagId)
      .eq('is_active', true)
    const { count: templateCount } = await supabase
      .from('metrics')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId)
      .eq('ministry_tag_id', params.tagId)
      .eq('metric_role', 'template')
      .eq('is_active', true)
    if ((childCount ?? 0) > 0 || (templateCount ?? 0) > 0) {
      return { ok: false, error: 'This ministry totals up its subgroups, so it can’t become a church-wide weekly count.' }
    }

    const { data: metricRows } = await supabase
      .from('metrics')
      .select('id')
      .eq('church_id', churchId)
      .eq('ministry_tag_id', params.tagId)
      .eq('is_active', true)
      .eq('mode', 'entry')
      .neq('metric_role', 'mirror')
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
