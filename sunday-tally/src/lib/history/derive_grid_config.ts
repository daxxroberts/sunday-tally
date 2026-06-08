/**
 * derive_grid_config.ts — synthesize a GridConfig from existing church state.
 *
 * Rewritten for the unified tag-first ("metric-centric") schema (IMPORT_IR_V2.md,
 * decisions D-062…D-068). The grid is now built entirely from `service_templates`,
 * `service_tags`, `reporting_tags` and `metrics` — the old per-kind category/entry
 * tables (response_categories, volunteer_categories, giving_sources,
 * tag_relationships, attendance_entries) are GONE and are not queried.
 *
 * Key changes vs. the v2 (`2.0-pivot`) builder:
 *   - Audience bucketing derives from `service_tags.tag_role`
 *     (ADULT_SERVICE → adults, KIDS_MINISTRY → kids, YOUTH_MINISTRY → youth,
 *      OTHER → a misc/"Stats" group) — NOT from root-tag display order.
 *   - Every data column is a metric. Column leaf IDs use the new grammar
 *     `metric.<METRIC_CODE>` (the metric's `code`).
 *   - A metric's bucket = its ministry_tag's tag_role.
 *   - The reporting dimension (ATTENDANCE / VOLUNTEERS / GIVING / RESPONSE_STAT)
 *     is read from the metric's reporting_tag; tracking flags gate which
 *     reporting dimensions appear (ATTENDANCE always on).
 *
 * Output `GridConfig` shape is unchanged (see grid-config-schema.ts); only the
 * source queries and column-ID construction differ. `version` is `'3.0-metrics'`.
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

// ── Bucket configuration ─────────────────────────────────────────────────────
// Four buckets keyed by tag_role. Each renders one top-level column group whose
// children are sub-grouped by reporting dimension. OTHER → the misc/"Stats" group.
type Bucket = 'adults' | 'kids' | 'youth' | 'other'

const BUCKET_ORDER: Bucket[] = ['adults', 'kids', 'youth', 'other']

const ROLE_TO_BUCKET: Record<TagRole, Bucket> = {
  ADULT_SERVICE:  'adults',
  KIDS_MINISTRY:  'kids',
  YOUTH_MINISTRY: 'youth',
  OTHER:          'other',
}

const BUCKET_META: Record<Bucket, { groupId: string; defaultLabel: string }> = {
  adults: { groupId: 'group_adults', defaultLabel: 'Experience' },
  kids:   { groupId: 'group_kids',   defaultLabel: 'Kids'       },
  youth:  { groupId: 'group_youth',  defaultLabel: 'Youth'      },
  other:  { groupId: 'group_stats',  defaultLabel: 'Stats'      },
}

// Reporting dimensions we sub-group by, in display order. GIVING is rendered as
// its own weekly (WK) top-level group, not inside an audience bucket.
const ATTENDANCE = 'ATTENDANCE'
const VOLUNTEERS = 'VOLUNTEERS'
const RESPONSE_STAT = 'RESPONSE_STAT'
const GIVING = 'GIVING'

// ── Main export ────────────────────────────────────────────────────────────────

export async function deriveGridConfigFromSchema(
  supabase: SupabaseClient,
  churchId: string,
): Promise<GridConfig | null> {
  const [churchRes, tmplRes, tagsRes, repRes, metricsRes] = await Promise.all([
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
  ])

  const church    = churchRes.data as ChurchRow | null
  const templates = (tmplRes.data    ?? []) as TemplateRow[]
  const tags      = (tagsRes.data    ?? []) as ServiceTagRow[]
  const repTags   = (repRes.data     ?? []) as ReportingTagRow[]
  const metrics   = (metricsRes.data ?? []) as MetricRow[]

  if (!church || templates.length === 0) return null

  // ── Lookups ─────────────────────────────────────────────────────────────────
  const tagById = new Map<string, ServiceTagRow>()
  for (const t of tags) tagById.set(t.id, t)

  const repTagById = new Map<string, ReportingTagRow>()
  for (const r of repTags) repTagById.set(r.id, r)

  // tag_role of a ministry tag → bucket. Default OTHER if role missing.
  const tagIdToBucket = (tagId: string | null): Bucket => {
    if (!tagId) return 'other'
    const tag = tagById.get(tagId)
    const role = tag?.tag_role ?? 'OTHER'
    return ROLE_TO_BUCKET[role] ?? 'other'
  }

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

  // ── Dynamic bucket labels from a representative ministry tag per bucket ───────
  // Pick the lowest-display_order active tag of each role for the group label.
  const bucketLabel: Record<Bucket, string> = {
    adults: BUCKET_META.adults.defaultLabel,
    kids:   BUCKET_META.kids.defaultLabel,
    youth:  BUCKET_META.youth.defaultLabel,
    other:  BUCKET_META.other.defaultLabel,
  }
  const labelClaimed: Record<Bucket, boolean> = { adults: false, kids: false, youth: false, other: false }
  for (const t of tags) {
    const bucket = tagIdToBucket(t.id)
    if (bucket === 'other') continue // 'other' keeps the static "Stats" label
    if (!labelClaimed[bucket]) {
      bucketLabel[bucket] = t.name
      labelClaimed[bucket] = true
    }
  }

  // ── Classify metrics ─────────────────────────────────────────────────────────
  // GIVING metrics → weekly top-level group. All other metrics → audience bucket
  // sub-grouped by reporting dimension.
  interface ClassifiedMetric {
    code:          string
    name:          string
    bucket:        Bucket
    reportingCode: string
    scope:         'instance' | 'period'
  }

  const givingMetrics: ClassifiedMetric[] = []
  // bucket → reportingCode → metrics[]
  const byBucketDim = new Map<Bucket, Map<string, ClassifiedMetric[]>>()
  for (const b of BUCKET_ORDER) byBucketDim.set(b, new Map())

  for (const m of metrics) {
    const repCode = m.reporting_tag_id ? (repTagById.get(m.reporting_tag_id)?.code ?? null) : null
    if (!reportingDimEnabled(repCode)) continue

    const classified: ClassifiedMetric = {
      code:          m.code,
      name:          m.name,
      bucket:        tagIdToBucket(m.ministry_tag_id),
      reportingCode: repCode ?? 'OTHER',
      scope:         m.scope,
    }

    if (repCode === GIVING) {
      givingMetrics.push(classified)
      continue
    }

    const dimMap = byBucketDim.get(classified.bucket)!
    const arr = dimMap.get(classified.reportingCode) ?? []
    arr.push(classified)
    dimMap.set(classified.reportingCode, arr)
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

  // Reporting-dimension sub-group display order + labels within an audience bucket.
  const DIM_ORDER: { code: string; label: string }[] = [
    { code: ATTENDANCE,    label: 'Attendance' },
    { code: VOLUNTEERS,    label: 'Volunteers' },
    { code: RESPONSE_STAT, label: 'Stats'      },
  ]

  // Build the ordered set of reporting dimensions actually present for a bucket,
  // preferring the known order then any custom dimensions alphabetically.
  const orderedDimsForBucket = (dimMap: Map<string, ClassifiedMetric[]>): { code: string; label: string }[] => {
    const present = new Set(dimMap.keys())
    const result: { code: string; label: string }[] = []
    for (const d of DIM_ORDER) {
      if (present.has(d.code)) { result.push(d); present.delete(d.code) }
    }
    for (const code of Array.from(present).sort()) {
      // label for a custom reporting tag: its display name if known, else code
      result.push({ code, label: code })
    }
    return result
  }

  // AUDIENCE BUCKETS — adults / kids / youth / other(stats)
  for (const bucket of BUCKET_ORDER) {
    const dimMap = byBucketDim.get(bucket)!
    const dims = orderedDimsForBucket(dimMap)
    if (dims.length === 0) continue

    const meta = BUCKET_META[bucket]
    const groupChildren: (DataColumn | ColumnGroup)[] = []

    for (const dim of dims) {
      const dimMetrics = dimMap.get(dim.code) ?? []
      if (dimMetrics.length === 0) continue

      if (dim.code === ATTENDANCE) {
        // Attendance metrics render as flat data columns inside the bucket.
        for (const m of dimMetrics) {
          groupChildren.push({
            type: 'data', id: leafColId(m.code), label: m.name,
            scope: 'SV', editable: true, dataType: 'number',
          })
        }
      } else {
        // Other dimensions render as a collapsible sub-group of metric columns.
        groupChildren.push({
          type: 'group', id: `${meta.groupId}__${dim.code.toLowerCase()}`, label: dim.label,
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
        type: 'group', id: meta.groupId, label: bucketLabel[bucket],
        scope: 'SV', children: groupChildren,
      })
      existingGroups.push(meta.groupId)
    }
  }

  // ── Map Service Templates to Column Groups ───────────────────────────────────
  for (const tmpl of templates) {
    const populates: string[] = []

    const bucket = tagIdToBucket(tmpl.primary_tag_id)
    const primaryGroupId = BUCKET_META[bucket].groupId
    if (existingGroups.includes(primaryGroupId)) {
      populates.push(primaryGroupId)
      // Adult services commonly run alongside kids ministry — populate both.
      if (bucket === 'adults' && existingGroups.includes(BUCKET_META.kids.groupId)) {
        populates.push(BUCKET_META.kids.groupId)
      }
    } else {
      // primary bucket not present — fall to first available audience group.
      for (const b of BUCKET_ORDER) {
        const gid = BUCKET_META[b].groupId
        if (existingGroups.includes(gid)) { populates.push(gid); break }
      }
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
    version:          '3.0-metrics',
    columns,
    serviceTemplates,
    monthlyMetrics:   [],
    weeklyMetrics,
    singleDayMetrics: [],
    serviceMetrics:   [],
  }
}
