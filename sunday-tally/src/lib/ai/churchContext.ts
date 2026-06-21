import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Per-church structural & semantic context pack (AI_WIDGET_BUILDER_PLAN WS4).
 *
 * `list_dimensions` already hands the AI the raw NAMES + codes. This pack adds the
 * layer that tool can't cheaply give: how this specific church is WIRED — the
 * ministry tree (what nests under what), what each ministry actually tracks, which
 * giving/period stats are church-wide, and what's excluded from the grand total.
 * Injected into the builder system prompt so when a pastor uses their own words,
 * the model maps them to the right tags/metrics/rollups/total-rules for THIS church.
 *
 * Derived live on each build (no storage, no staleness). Fully defensive: any query
 * error yields '' so the builder still works without it.
 */

const ROLE_WORD: Record<string, string> = {
  ADULT_SERVICE: 'Adults',
  KIDS_MINISTRY:  'Kids',
  YOUTH_MINISTRY: 'Youth',
  OTHER:          'Other',
}

const REPORTING_WORD: Record<string, string> = {
  ATTENDANCE:    'Attendance',
  VOLUNTEERS:    'Volunteers',
  RESPONSE_STAT: 'Stats',
  GIVING:        'Giving',
}

export interface ContextTag {
  id: string; code: string; name: string; tag_role: string | null; parent_tag_id: string | null
}
export interface ContextMetric {
  name: string; ministry_tag_id: string | null; reporting_tag_code: string; scope: string | null
}
export interface ContextPackData {
  tags: ContextTag[]
  metrics: ContextMetric[]
  excludedTagIds: string[]
  givingCategories: string[]   // names of church-wide period giving metrics
}

/** Pure formatter — turns the church's structure into a concise prompt section.
 *  Returns '' when there's nothing meaningful to say. */
export function formatContextPack(d: ContextPackData): string {
  if (d.tags.length === 0) return ''
  const byId = new Map(d.tags.map(t => [t.id, t]))
  const roots = d.tags.filter(t => !t.parent_tag_id || !byId.has(t.parent_tag_id))
  const childrenOf = (id: string) => d.tags.filter(t => t.parent_tag_id === id)

  const lines: string[] = []
  lines.push("THIS CHURCH'S STRUCTURE — use it to map the pastor's own words to the right tags/metrics. Never invent a code; match to a NAME below and confirm with list_dimensions.")
  lines.push('')

  // Ministries + nesting + what each tracks.
  lines.push('Ministries (children roll up into their parent):')
  const metricsForTag = (tagId: string) => {
    const ms = d.metrics.filter(m => m.ministry_tag_id === tagId)
    if (ms.length === 0) return ''
    const byKind = new Map<string, string[]>()
    for (const m of ms) {
      const k = REPORTING_WORD[m.reporting_tag_code] ?? m.reporting_tag_code
      ;(byKind.get(k) ?? byKind.set(k, []).get(k)!).push(m.name)
    }
    return [...byKind.entries()].map(([k, names]) => `${k} (${names.join(', ')})`).join(' · ')
  }
  const renderTag = (t: ContextTag, depth: number) => {
    const indent = '  '.repeat(depth + 1)
    const role = t.tag_role ? ` · ${ROLE_WORD[t.tag_role] ?? t.tag_role}` : ''
    const tracks = metricsForTag(t.id)
    lines.push(`${indent}- ${t.name} (code ${t.code})${role}${tracks ? ` — tracks: ${tracks}` : ''}`)
    for (const c of childrenOf(t.id)) renderTag(c, depth + 1)
  }
  for (const r of roots) renderTag(r, 0)
  lines.push('')

  // Church-wide period giving.
  if (d.givingCategories.length > 0) {
    lines.push(`Counted once for the whole church each week (period giving, no service): ${d.givingCategories.join(', ')}.`)
  }

  // Total-inclusion rule.
  const excluded = d.excludedTagIds.map(id => byId.get(id)?.name).filter(Boolean) as string[]
  lines.push(
    excluded.length > 0
      ? `Grand total EXCLUDES: ${excluded.join(', ')} (do not fold these into a church-wide total).`
      : 'Grand total includes every ministry.',
  )

  return lines.join('\n')
}

/** Assemble the context pack for a church. Defensive: returns '' on any error. */
export async function buildChurchContextPack(supabase: SupabaseClient, churchId: string): Promise<string> {
  try {
    const [tagsRes, metricsRes, churchRes] = await Promise.all([
      supabase.from('service_tags')
        .select('id, code, name, tag_role, parent_tag_id, display_order')
        .eq('church_id', churchId).eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase.from('metrics')
        .select('name, ministry_tag_id, scope, reporting_tags!inner(code)')
        .eq('church_id', churchId).eq('is_active', true),
      supabase.from('churches').select('dashboard_prefs, grid_config').eq('id', churchId).maybeSingle(),
    ])

    const tags = (tagsRes.data ?? []) as ContextTag[]
    type MetricRow = { name: string; ministry_tag_id: string | null; scope: string | null; reporting_tags: { code: string } | { code: string }[] | null }
    const metrics: ContextMetric[] = ((metricsRes.data ?? []) as MetricRow[]).map(m => {
      const rt = Array.isArray(m.reporting_tags) ? m.reporting_tags[0] : m.reporting_tags
      return { name: m.name, ministry_tag_id: m.ministry_tag_id, scope: m.scope, reporting_tag_code: rt?.code ?? '' }
    })

    // Total-inclusion rule: dashboard_prefs.excludedTotalMinistries, with the
    // pre-0039 grid_config fallback (mirrors readChurchPrefs).
    const ch = (churchRes.data ?? {}) as { dashboard_prefs?: Record<string, unknown> | null; grid_config?: Record<string, unknown> | null }
    const prefs = (ch.dashboard_prefs && typeof ch.dashboard_prefs === 'object') ? ch.dashboard_prefs : (ch.grid_config ?? {})
    const rawExcluded = (prefs as Record<string, unknown>).excludedTotalMinistries
    const excludedTagIds = Array.isArray(rawExcluded) ? rawExcluded.filter((x): x is string => typeof x === 'string') : []

    const givingCategories = metrics.filter(m => m.reporting_tag_code === 'GIVING').map(m => m.name)

    return formatContextPack({ tags, metrics, excludedTagIds, givingCategories })
  } catch {
    return ''
  }
}
