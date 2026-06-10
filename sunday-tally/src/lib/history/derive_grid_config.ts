/**
 * derive_grid_config.ts — synthesize a GridConfig from existing church state.
 *
 * v3.1-roots (2026-06-10): top-level column groups are the ROOT MINISTRY NODES
 * of the What-we-track tree (Experience, LifeKids, Switch, Life Groups, …) —
 * NOT tag_role audience buckets. A metric lands under the root ancestor of its
 * ministry tag, so a child group (Tabors under Life Groups) shows inside the
 * "Life Groups" group, never inside "Experience" just because both are
 * adult-role. This makes History mirror Settings → What we track verbatim
 * (Builder 2026-06-10: "Tabors attendance falls under Experience — not correct").
 *
 * Carried over from v3.0-metrics:
 *   - Every data column is a metric; leaf IDs use `metric.<METRIC_CODE>`.
 *   - The reporting dimension (ATTENDANCE / VOLUNTEERS / RESPONSE_STAT) sub-groups
 *     within each root group; tracking flags gate dimensions (ATTENDANCE always on).
 *   - GIVING metrics render as their own weekly (WK) top-level group.
 *   - Roll-up metrics are computed (Phase B), never grid columns.
 *
 * Group IDs are `group_<root_code>` — exactly the shape group-colors.ts was
 * designed around (it derives the color key from the segment after `group_`),
 * so History group colors now key off the SAME roots as the track tree.
 *
 * Service templates populate the groups of the ministries actually LINKED to
 * them (service_template_tags), falling back to the primary tag's root.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GridConfig,
  DataColumn,
  ColumnGroup,
  MetricDefinition,
  ServiceTemplate,
} from '@/components/history-grid/grid-config-schema'

// ── Row types ──────────────────────────────────────────────────────────────────

interface ChurchRow {
  id:                 string
  tracks_volunteers:  boolean
  tracks_responses:   boolean
  tracks_giving:      boolean
}

interface TemplateRow {
  id:             string
  service_code:   string
  display_name:   string
  sort_order:     number | null
  primary_tag_id: string | null
}

type TagRole = 'ADULT_SERVICE' | 'KIDS_MINISTRY' | 'YOUTH_MINISTRY' | 'OTHER'

interface ServiceTagRow {
  id:             string
  code:           string
  name:           string
  tag_role:       TagRole | null
  parent_tag_id:  string | null
  display_order:  number | null
}

interface ReportingTagRow {
  id:         string
  code:       string
  name:       string
  unit_kind:  string | null
  agg_default: string | null
}

interface MetricRow {
  id:                string
  code:              string
  name:              string
  ministry_tag_id:   string | null
  reporting_tag_id:  string | null
  scope:             'instance' | 'period'
  is_canonical:      boolean
  is_active:         boolean
}

interface LinkRow {
  service_template_id: string
  ministry_tag_id:     string
}

// Reporting dimensions we sub-group by, in display order. GIVING is rendered as
// its own weekly (WK) top-level group, not inside a ministry group.
const ATTENDANCE = 'ATTENDANCE'
const VOLUNTEERS = 'VOLUNTEERS'
const RESPONSE_STAT = 'RESPONSE_STAT'
const GIVING = 'GIVING'

// Metrics whose tag is missing/unknown still need a home.
const FALLBACK_GROUP_ID = 'group_stats'
const FALLBACK_GROUP_LABEL = 'Stats'

// ── Main export ────────────────────────────────────────────────────────────────

export async function deriveGridConfigFromSchema(
  supabase: SupabaseClient,
  churchId: string,
): Promise<GridConfig | null> {
  const [churchRes, tmplRes, tagsRes, repRes, metricsRes, linksRes] = await Promise.all([
    supabase
      .from('churches')
      .select('id, tracks_volunteers, tracks_responses, tracks_giving')
      .eq('id', churchId)
      .single(),
    supabase
      .from('service_templates')
      .select('id, service_code, display_name, sort_order, primary_tag_id')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('service_tags')
      .select('id, code, name, tag_role, parent_tag_id, display_order')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('reporting_tags')
      .select('id, code, name, unit_kind, agg_default')
      .eq('church_id', churchId),
    supabase
      .from('metrics')
      .select('id, code, name, ministry_tag_id, reporting_tag_id, scope, is_canonical, is_active')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .neq('mode', 'rollup'),   // roll-up metrics are computed (Phase B), not grid columns
    supabase
      .from('service_template_tags')
      .select('service_template_id, ministry_tag_id')
      .eq('church_id', churchId),
  ])

  const church    = churchRes.data as ChurchRow | null
  const templates = (tmplRes.data    ?? []) as TemplateRow[]
  const tags      = (tagsRes.data    ?? []) as ServiceTagRow[]
  const repTags   = (repRes.data     ?? []) as ReportingTagRow[]
  const metrics   = (metricsRes.data ?? []) as MetricRow[]
  const links     = (linksRes.data   ?? []) as LinkRow[]

  if (!church || templates.length === 0) return null

  // ── Lookups ─────────────────────────────────────────────────────────────────
  const tagById = new Map<string, ServiceTagRow>()
  for (const t of tags) tagById.set(t.id, t)

  const repTagById = new Map<string, ReportingTagRow>()
  for (const r of repTags) repTagById.set(r.id, r)

  // Root ancestor of a ministry tag (walk parent_tag_id; cycle-guarded).
  // The track tree's top level IS the History grouping — same roots, same order.
  const rootOf = (tagId: string | null): ServiceTagRow | null => {
    if (!tagId) return null
    const seen = new Set<string>()
    let cur = tagById.get(tagId) ?? null
    while (cur && cur.parent_tag_id && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = tagById.get(cur.parent_tag_id) ?? cur
      if (seen.has(cur.id)) break
    }
    return cur
  }

  // Inner underscores stripped: extractRootKey (group-colors.ts) takes the
  // segment between `group_` and the next `_`, so LIFE_GROUPS must become
  // `group_lifegroups`, never `group_life_groups` (which would key as "life").
  const groupIdForRoot = (root: ServiceTagRow): string =>
    `group_${root.code.toLowerCase().replace(/_/g, '')}`

  // ── Tracking-flag gate per reporting dimension ───────────────────────────────
  // ATTENDANCE always on. The others gate on their church flag. Unknown/custom
  // reporting tags pass through (treated as always-on stats-like dimensions).
  const reportingDimEnabled = (reportingCode: string | null): boolean => {
    switch (reportingCode) {
      case VOLUNTEERS:    return church.tracks_volunteers ?? false
      case RESPONSE_STAT: return church.tracks_responses  ?? false
      case GIVING:        return church.tracks_giving      ?? false
      case ATTENDANCE:    return true
      default:            return true // custom reporting tag — always include
    }
  }

  // ── Classify metrics by ROOT ministry node ───────────────────────────────────
  interface ClassifiedMetric {
    code:          string
    name:          string
    reportingCode: string
    scope:         'instance' | 'period'
  }

  const givingMetrics: ClassifiedMetric[] = []
  // root group id → reportingCode → metrics[]  (insertion order = tags order =
  // display_order, so groups render in the same order as the track tree)
  const byGroupDim = new Map<string, Map<string, ClassifiedMetric[]>>()
  const groupLabelById = new Map<string, string>()

  for (const m of metrics) {
    const repCode = m.reporting_tag_id ? (repTagById.get(m.reporting_tag_id)?.code ?? null) : null
    if (!reportingDimEnabled(repCode)) continue

    const classified: ClassifiedMetric = {
      code:          m.code,
      name:          m.name,
      reportingCode: repCode ?? 'OTHER',
      scope:         m.scope,
    }

    if (repCode === GIVING) {
      givingMetrics.push(classified)
      continue
    }

    const root = rootOf(m.ministry_tag_id)
    const groupId = root ? groupIdForRoot(root) : FALLBACK_GROUP_ID
    if (!groupLabelById.has(groupId)) groupLabelById.set(groupId, root ? root.name : FALLBACK_GROUP_LABEL)

    const dimMap = byGroupDim.get(groupId) ?? new Map<string, ClassifiedMetric[]>()
    const arr = dimMap.get(classified.reportingCode) ?? []
    arr.push(classified)
    dimMap.set(classified.reportingCode, arr)
    byGroupDim.set(groupId, dimMap)
  }

  // Group order: roots in tags (display_order) order, then the fallback group.
  const orderedGroupIds: string[] = []
  for (const t of tags) {
    if (t.parent_tag_id !== null) continue
    const gid = groupIdForRoot(t)
    if (byGroupDim.has(gid) && !orderedGroupIds.includes(gid)) orderedGroupIds.push(gid)
  }
  for (const gid of byGroupDim.keys()) {
    if (!orderedGroupIds.includes(gid)) orderedGroupIds.push(gid)
  }

  // ── Build columns ─────────────────────────────────────────────────────────────
  const columns: (DataColumn | ColumnGroup)[] = []
  const serviceTemplates: ServiceTemplate[]   = []
  const weeklyMetrics: MetricDefinition[]     = []
  const existingGroups: string[]              = []

  const leafColId = (code: string) => `metric.${code}`

  // GIVING (weekly, WK scope) — one top-level group, one child per giving metric.
  if (givingMetrics.length > 0) {
    columns.push({
      type: 'group', id: 'group_giving', label: 'Giving', scope: 'WK',
      children: givingMetrics.map<DataColumn>(m => ({
        type: 'data', id: leafColId(m.code), label: m.name,
        scope: 'WK', editable: true, dataType: 'number',
      })),
    })
    existingGroups.push('group_giving')
    weeklyMetrics.push({ id: 'wk_giving', label: 'Giving', scope: 'WK', columnId: 'group_giving' })
  }

  // Reporting-dimension sub-group display order + labels within a ministry group.
  const DIM_ORDER: { code: string; label: string }[] = [
    { code: ATTENDANCE,    label: 'Attendance' },
    { code: VOLUNTEERS,    label: 'Volunteers' },
    { code: RESPONSE_STAT, label: 'Stats'      },
  ]

  const orderedDimsForGroup = (dimMap: Map<string, ClassifiedMetric[]>): { code: string; label: string }[] => {
    const present = new Set(dimMap.keys())
    const result: { code: string; label: string }[] = []
    for (const d of DIM_ORDER) {
      if (present.has(d.code)) { result.push(d); present.delete(d.code) }
    }
    for (const code of Array.from(present).sort()) {
      result.push({ code, label: code })
    }
    return result
  }

  // MINISTRY GROUPS — one per root node with metrics, in track-tree order.
  for (const groupId of orderedGroupIds) {
    const dimMap = byGroupDim.get(groupId)!
    const dims = orderedDimsForGroup(dimMap)
    if (dims.length === 0) continue

    const groupChildren: (DataColumn | ColumnGroup)[] = []

    for (const dim of dims) {
      const dimMetrics = dimMap.get(dim.code) ?? []
      if (dimMetrics.length === 0) continue

      if (dim.code === ATTENDANCE) {
        // Attendance metrics render as flat data columns inside the group.
        for (const m of dimMetrics) {
          groupChildren.push({
            type: 'data', id: leafColId(m.code), label: m.name,
            scope: 'SV', editable: true, dataType: 'number',
          })
        }
      } else {
        // Other dimensions render as a collapsible sub-group of metric columns.
        groupChildren.push({
          type: 'group', id: `${groupId}__${dim.code.toLowerCase()}`, label: dim.label,
          scope: 'SV', collapsible: true, defaultCollapsed: false,
          children: dimMetrics.map<DataColumn>(m => ({
            type: 'data', id: leafColId(m.code), label: m.name,
            scope: 'SV', editable: dim.code !== RESPONSE_STAT, dataType: 'number',
          })),
        })
      }
    }

    if (groupChildren.length > 0) {
      columns.push({
        type: 'group', id: groupId, label: groupLabelById.get(groupId) ?? groupId,
        scope: 'SV', children: groupChildren,
      })
      existingGroups.push(groupId)
    }
  }

  // ── Map Service Templates to Column Groups ───────────────────────────────────
  // A template populates the groups of the ministries actually counted at it
  // (service_template_tags → root). Fallback: primary tag's root, then the
  // first available group — a template must never end up group-less.
  const linksByTemplate = new Map<string, string[]>()
  for (const l of links) {
    const arr = linksByTemplate.get(l.service_template_id) ?? []
    arr.push(l.ministry_tag_id)
    linksByTemplate.set(l.service_template_id, arr)
  }

  for (const tmpl of templates) {
    const populates: string[] = []

    for (const tagId of linksByTemplate.get(tmpl.id) ?? []) {
      const root = rootOf(tagId)
      const gid = root ? groupIdForRoot(root) : FALLBACK_GROUP_ID
      if (existingGroups.includes(gid) && !populates.includes(gid)) populates.push(gid)
    }
    if (populates.length === 0 && tmpl.primary_tag_id) {
      const root = rootOf(tmpl.primary_tag_id)
      const gid = root ? groupIdForRoot(root) : FALLBACK_GROUP_ID
      if (existingGroups.includes(gid)) populates.push(gid)
    }
    if (populates.length === 0) {
      const firstSv = existingGroups.find(g => g !== 'group_giving')
      if (firstSv) populates.push(firstSv)
    }

    serviceTemplates.push({
      id:                    tmpl.service_code,
      displayName:           tmpl.display_name,
      dayOfWeek:             0, // Unused by Unified Pivot Grid — grouped by exact date
      populatesColumnGroups: populates,
    })
  }

  return {
    churchId:         church.id,
    version:          '3.1-roots',
    columns,
    serviceTemplates,
    monthlyMetrics:   [],
    weeklyMetrics,
    singleDayMetrics: [],
    serviceMetrics:   [],
  }
}
