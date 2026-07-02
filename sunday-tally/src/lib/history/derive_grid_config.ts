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
 *
 * Mirrored-metrics (2026-06-30, feat/track-mirrored-metrics — blast-radius item 4):
 *   A `metric_role='template'` count (mode='rollup') is the ministry "legend" that
 *   its groups mirror. `derive_grid_config` still emits the per-group MIRROR columns
 *   as editable data columns (unique codes, rooted to the top ancestor) — but now ALSO
 *   emits a READ-ONLY computed roll-up column per template whose `computedFrom` = the
 *   leaf ids of its mirror children. That computed column is the ministry total; the
 *   HistoryGrid sums the mirror cells live and never writes a metric_entries row for it
 *   (its id uses the `rollup.` prefix, so the save route can't resolve it, and its
 *   `editable:false` means the grid renders no input). The roll-up column is the
 *   DEFAULT-visible column; the per-subgroup mirror columns are shown only when the
 *   caller expands them (History "Show subgroups" toggle → `expandSubgroups`).
 *
 * ARCHIVE (decision 9): an archived metric/tag keeps `is_active=true`, so its history
 * still belongs in the grid — archived columns are still emitted with their data. But
 * an archived count accepts NO new entries, so its column is forced `editable:false`
 * (no new-entry affordance) while its historical cells still render.
 *
 * Group IDs are `group_<root_code>` — exactly the shape group-colors.ts was
 * designed around (it derives the color key from the segment after `group_`),
 * so History group colors now key off the SAME roots as the track tree.
 *
 * Service templates populate the groups of the ministries actually LINKED to
 * them (service_template_tags), falling back to the primary tag's root.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchActiveServiceTags } from '@/lib/service-tags'
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

type MetricRole = 'template' | 'ministry_only' | 'group_only' | 'mirror'

interface MetricRow {
  id:                string
  code:              string
  name:              string
  ministry_tag_id:   string | null
  reporting_tag_id:  string | null
  scope:             'instance' | 'period'
  is_canonical:      boolean
  is_active:         boolean
  mode:              'entry' | 'rollup'
  metric_role:       MetricRole | null
  parent_metric_id:  string | null
  archived_at:       string | null
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

// Computed roll-up column ids use this prefix (NOT `metric.`) so the History
// save route's `metric.<CODE>` resolver can never match one and try to write a
// metric_entries row for it. It is a READ-ONLY column whose value the grid sums
// live from its mirror children (computedFrom).
const ROLLUP_COL_PREFIX = 'rollup.'

// ── Main export ────────────────────────────────────────────────────────────────

export async function deriveGridConfigFromSchema(
  supabase: SupabaseClient,
  churchId: string,
  includeDeactivated: boolean = false,
  // Mirrored-metrics "Show subgroups" toggle. false (default) → for a templated
  // ministry, show ONLY the read-only ministry roll-up total column and hide its
  // per-group mirror columns. true → also emit the per-group mirror columns
  // alongside the total. Ministries WITHOUT a template are unaffected either way.
  expandSubgroups: boolean = false,
): Promise<GridConfig | null> {
  let tmplQuery = supabase
    .from('service_templates')
    .select('id, service_code, display_name, sort_order, primary_tag_id, is_active, location_id, church_locations(is_active)')
    .eq('church_id', churchId)
    .order('sort_order', { ascending: true })
    
  if (!includeDeactivated) {
    tmplQuery = tmplQuery.eq('is_active', true)
  }

  const [churchRes, tmplRes, tagsRes, repRes, metricsRes, linksRes, tagArchiveRes] = await Promise.all([
    supabase
      .from('churches')
      .select('id, tracks_volunteers, tracks_responses, tracks_giving')
      .eq('id', churchId)
      .single(),
    tmplQuery,
    // Canonical palette order lives in fetchActiveServiceTags — group order
    // feeds the positional color palette shared with track page + dashboard.
    fetchActiveServiceTags(supabase, churchId),
    supabase
      .from('reporting_tags')
      .select('id, code, name, unit_kind, agg_default')
      .eq('church_id', churchId),
    // NOTE: rollup metrics are now INCLUDED (mirrored-metrics). A template
    // (mode='rollup', metric_role='template') never becomes a data column — it
    // has no entries of its own — but it drives a READ-ONLY computed roll-up
    // column below whose computedFrom = its mirror children's leaf ids. Mirror
    // metrics (mode='entry') still render as normal per-group data columns.
    supabase
      .from('metrics')
      .select('id, code, name, ministry_tag_id, reporting_tag_id, scope, is_canonical, is_active, mode, metric_role, parent_metric_id, archived_at')
      .eq('church_id', churchId)
      .eq('is_active', true)
      // Stable column order: without this, Postgres may return rows in a
      // different order across loads, so a ministry's columns (and its mirror
      // subgroups) would shuffle position on every refresh. is_canonical first
      // (canonical metric leads its group), then created_at, then id as a final
      // deterministic tiebreaker.
      .order('is_canonical', { ascending: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from('service_template_tags')
      .select('service_template_id, ministry_tag_id')
      .eq('church_id', churchId),
    // Tag-level archive state (decision 9): a metric whose ministry tag is
    // archived accepts no new entries even if the metric row itself isn't
    // archived. archived_at is 0051 — selecting it pre-apply errors, so tolerate
    // failure and treat every tag as un-archived in that case.
    supabase
      .from('service_tags')
      .select('id, archived_at')
      .eq('church_id', churchId),
  ])

  const church    = churchRes.data as ChurchRow | null
  const tags      = tagsRes.rows as unknown as ServiceTagRow[]
  const repTags   = (repRes.data     ?? []) as ReportingTagRow[]
  const metrics   = (metricsRes.data ?? []) as MetricRow[]
  const links     = (linksRes.data   ?? []) as LinkRow[]

  // tag id → archived (true when service_tags.archived_at IS NOT NULL).
  const tagArchivedById = new Map<string, boolean>()
  for (const t of (tagArchiveRes.data ?? []) as { id: string; archived_at: string | null }[]) {
    tagArchivedById.set(t.id, t.archived_at != null)
  }

  // Filter out templates linked to a deactivated location if !includeDeactivated
  const rawTemplates = (tmplRes.data ?? []) as (TemplateRow & { church_locations?: { is_active?: boolean } | { is_active?: boolean }[] | null })[]
  const templates = rawTemplates.filter(t => {
    if (includeDeactivated) return true
    
    // If not including deactivated, filter out those where the location is inactive
    // Note: one-to-one join might be an object or array depending on PostgREST shape
    const loc = Array.isArray(t.church_locations) ? t.church_locations[0] : t.church_locations
    if (loc && loc.is_active === false) return false
    
    return true
  })

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

  // Archive test (decision 9): a count is archived when its own archived_at is
  // set OR its ministry tag's archived_at is set. Archived counts keep
  // is_active=true so their HISTORY still renders — but they accept no NEW
  // entries, so their column is forced read-only (no input affordance).
  const isMetricArchived = (m: MetricRow): boolean =>
    m.archived_at != null || (m.ministry_tag_id ? tagArchivedById.get(m.ministry_tag_id) === true : false)

  // ── Classify metrics by ROOT ministry node ───────────────────────────────────
  interface ClassifiedMetric {
    id:            string
    code:          string
    name:          string
    reportingCode: string
    scope:         'instance' | 'period'
    // false when the count is archived (history shows, no new entries).
    editable:      boolean
    // metric_role='mirror' → its template's metric id (the roll-up parent).
    parentMetricId: string | null
    // Name of the metric's own ministry tag (its subgroup, e.g. "Tabors"). Every
    // mirror of the same template shares `name` (the template's legend name), so
    // expanded mirror columns need this to disambiguate which subgroup a column
    // belongs to (finding #33).
    subgroupName:  string | null
  }

  const givingMetrics: ClassifiedMetric[] = []
  // root group id → reportingCode → metrics[]  (insertion order = tags order =
  // display_order, so groups render in the same order as the track tree)
  const byGroupDim = new Map<string, Map<string, ClassifiedMetric[]>>()
  const groupLabelById = new Map<string, string>()

  // Templates (metric_role='template', mode='rollup') captured for the computed
  // roll-up columns. A template is NOT itself a data column (it owns no entries);
  // it drives a read-only computed column whose computedFrom = its mirrors' leaf
  // ids. Keyed by template metric id → { id, name } (label for the total column).
  // `code` is needed so the roll-up total can also fold in the TEMPLATE'S OWN
  // legacy entries (kept on the template metric after a free move) via its
  // `metric.<code>` leaf — otherwise a ministry's pre-split weeks vanish from the
  // History total (review finding #12).
  interface TemplateInfo { id: string; name: string; code: string }
  const templatesById = new Map<string, TemplateInfo>()

  for (const m of metrics) {
    const repCode = m.reporting_tag_id ? (repTagById.get(m.reporting_tag_id)?.code ?? null) : null
    if (!reportingDimEnabled(repCode)) continue

    const root = rootOf(m.ministry_tag_id)
    const groupId = root ? groupIdForRoot(root) : FALLBACK_GROUP_ID
    if (!groupLabelById.has(groupId)) groupLabelById.set(groupId, root ? root.name : FALLBACK_GROUP_LABEL)

    // TEMPLATE (roll-up legend): capture it, but do NOT emit it as a data column.
    // (mode/role are kept consistent by the 0051 CHECK, so either signal works;
    // we key off metric_role, the single source of truth, falling back to mode.)
    if (m.metric_role === 'template' || m.mode === 'rollup') {
      templatesById.set(m.id, { id: m.id, name: m.name, code: m.code })
      continue
    }

    const classified: ClassifiedMetric = {
      id:             m.id,
      code:           m.code,
      name:           m.name,
      reportingCode:  repCode ?? 'OTHER',
      scope:          m.scope,
      editable:       !isMetricArchived(m),
      parentMetricId: m.parent_metric_id,
      subgroupName:   m.ministry_tag_id ? (tagById.get(m.ministry_tag_id)?.name ?? null) : null,
    }

    // Giving is a peer kind, not a church-wide special case (occurrence model).
    // PERIOD-scoped giving (weekly/monthly church-wide) renders as its own
    // top-level WK block below. INSTANCE-scoped giving rides its service
    // occurrence, so it falls through to the normal per-root-ministry grouping
    // and shows as editable SV columns under its ministry (e.g. under
    // Experience), exactly like Attendance.
    if (repCode === GIVING && m.scope === 'period') {
      givingMetrics.push(classified)
      continue
    }

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

  // CHURCH-WIDE giving (period-scoped) — one top-level WK group, one child per
  // metric. Skipped when a top-level ministry literally coded GIVING already
  // owns the `group_giving` id (it would render its own SV columns via the
  // ministry loop); only one block can claim that id.
  if (givingMetrics.length > 0 && !orderedGroupIds.includes('group_giving')) {
    columns.push({
      type: 'group', id: 'group_giving', label: 'Giving', scope: 'WK',
      children: givingMetrics.map<DataColumn>(m => ({
        type: 'data', id: leafColId(m.code), label: m.name,
        scope: 'WK', editable: m.editable, dataType: 'number',
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
    { code: GIVING,        label: 'Giving'     },
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

  const rollupColId = (templateId: string) => `${ROLLUP_COL_PREFIX}${templateId}`

  // Turn one dimension's metrics into ordered leaf columns, folding mirrors under
  // their template's read-only roll-up total.
  //
  //   • A mirror (parentMetricId → a captured template) is grouped under that
  //     template. For each such template we emit a READ-ONLY computed column
  //     (the ministry total, computedFrom = its mirrors' leaf ids) and — only
  //     when expandSubgroups is on — the per-group mirror columns after it.
  //   • A non-mirror metric (ministry_only / group_only, or a mirror whose
  //     template was gated out by the reporting-dimension flag) renders as a
  //     normal editable data column, unaffected by the toggle.
  //
  // Insertion order preserves the incoming metric order (tag/display order): the
  // roll-up total is emitted at the position of the template's FIRST mirror.
  const buildDimColumns = (dimCode: string, dimMetrics: ClassifiedMetric[]): DataColumn[] => {
    const out: DataColumn[] = []
    const emittedRollupFor = new Set<string>()
    const baseEditable = dimCode !== RESPONSE_STAT  // stats are read-only historically

    for (const m of dimMetrics) {
      const template = m.parentMetricId ? templatesById.get(m.parentMetricId) : undefined

      if (template) {
        // Emit the ministry roll-up total once, at the first mirror's position.
        if (!emittedRollupFor.has(template.id)) {
          emittedRollupFor.add(template.id)
          const mirrorLeafIds = dimMetrics
            .filter(x => x.parentMetricId === template.id)
            .map(x => leafColId(x.code))
          // Fold in the template's OWN legacy entries (weeks before the ministry
          // was split into subgroups live on the template metric itself, keyed by
          // its own code) so pre-split history isn't dropped from the total
          // (review finding #12). Its leaf isn't a rendered column — computedFrom
          // just reads the loaded cell value — and it contributes 0 when absent.
          out.push({
            type: 'data',
            id: rollupColId(template.id),
            label: template.name,
            scope: 'SV',
            editable: false,                 // computed — never writes an entry
            dataType: 'number',
            computedFrom: [leafColId(template.code), ...mirrorLeafIds],
          })
        }
        // The per-group mirror column only shows when subgroups are expanded.
        // Every mirror of the same template shares m.name (the template's legend
        // name), so label with the subgroup name instead — otherwise expanded
        // columns are indistinguishable (finding #33).
        if (expandSubgroups) {
          out.push({
            type: 'data', id: leafColId(m.code), label: m.subgroupName ?? m.name,
            scope: 'SV', editable: m.editable && baseEditable, dataType: 'number',
          })
        }
      } else {
        // Standalone count (no template) — always visible, toggle-independent.
        out.push({
          type: 'data', id: leafColId(m.code), label: m.name,
          scope: 'SV', editable: m.editable && baseEditable, dataType: 'number',
        })
      }
    }
    return out
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

      const leaves = buildDimColumns(dim.code, dimMetrics)
      if (leaves.length === 0) continue

      if (dim.code === ATTENDANCE) {
        // Attendance metrics render as flat data columns inside the group.
        groupChildren.push(...leaves)
      } else {
        // Other dimensions render as a collapsible sub-group of metric columns.
        groupChildren.push({
          type: 'group', id: `${groupId}__${dim.code.toLowerCase()}`, label: dim.label,
          scope: 'SV', collapsible: true, defaultCollapsed: false,
          children: leaves,
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
