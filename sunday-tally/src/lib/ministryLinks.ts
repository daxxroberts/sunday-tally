// ─────────────────────────────────────────────────────────────────────────
// ministryLinks — orphan-ministry detection (TK2/TK4/S2,
// IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md §3).
//
// THE INVISIBLE-MINISTRY TRAP THIS SURFACES: Entries renders a ministry's
// metrics ONLY when the ministry is linked to a service via
// service_template_tags. A ministry with instance-scoped entry metrics and
// no link silently never appears anywhere ("I created Groups but no entry
// tab showed up"). This helper finds those, so both setup surfaces can say
// it out loud and offer the fix.
//
// NOT orphans:
//   • rollup-only nodes (their value is computed, never typed),
//   • period-scoped metrics (they live in the Stat Entries tab — no service
//     needed; e.g. weekly Giving),
//   • inactive tags/metrics/templates.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export interface OrphanMinistry {
  tag_id: string
  name: string
  tag_role: string | null
  /** Active canonical instance-scoped entry metrics that have nowhere to render. */
  metricCount: number
}

/** Active tags owning ≥1 active canonical mode='entry' scope='instance' metric
 *  with ZERO service_template_tags links to an ACTIVE template. */
export async function getOrphanMinistries(
  supabase: SupabaseClient,
  churchId: string,
): Promise<OrphanMinistry[]> {
  // 1. candidate metrics (the kind that need a service to render)
  const { data: metricRows } = await supabase
    .from('metrics')
    .select('ministry_tag_id')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .eq('is_canonical', true)
    .eq('mode', 'entry')
    .eq('scope', 'instance')
  const countByTag = new Map<string, number>()
  for (const m of ((metricRows ?? []) as { ministry_tag_id: string | null }[])) {
    if (!m.ministry_tag_id) continue
    countByTag.set(m.ministry_tag_id, (countByTag.get(m.ministry_tag_id) ?? 0) + 1)
  }
  if (countByTag.size === 0) return []

  // 2. links to ACTIVE templates (an inactive service doesn't count as a home)
  const { data: linkRows } = await supabase
    .from('service_template_tags')
    .select('ministry_tag_id, service_templates!inner(is_active)')
    .eq('church_id', churchId)
    .eq('service_templates.is_active', true)
    .in('ministry_tag_id', Array.from(countByTag.keys()))
  const linked = new Set(((linkRows ?? []) as { ministry_tag_id: string }[]).map(r => r.ministry_tag_id))

  const orphanIds = Array.from(countByTag.keys()).filter(id => !linked.has(id))
  if (orphanIds.length === 0) return []

  // 3. names for the survivors (active tags only)
  const { data: tagRows } = await supabase
    .from('service_tags')
    .select('id, name, tag_role')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .in('id', orphanIds)
    .order('display_order', { ascending: true })

  return ((tagRows ?? []) as { id: string; name: string; tag_role: string | null }[]).map(t => ({
    tag_id: t.id,
    name: t.name,
    tag_role: t.tag_role,
    metricCount: countByTag.get(t.id) ?? 0,
  }))
}
