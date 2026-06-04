import { useMemo, useState } from 'react'
import { HistoryGrid } from '@/components/history-grid/HistoryGrid'
import { buildGrid } from '@/components/history-grid/grid-builder'
import type { GridConfig, DataColumn, ColumnGroup, ServiceTemplate, MetricDefinition } from '@/components/history-grid/grid-config-schema'
import { buildGroupColorMap } from '@/components/history-grid/group-colors'
import { GroupFilterPills } from '@/components/history-grid/GroupFilterPills'
import type {
  ProposedSetup,
  ProposedMinistryTag,
  ProposedMetric,
  ProposedServiceTemplate,
} from '@/lib/import/stageA_validate'

/**
 * Preview-only renderer of the IR v2 (metric-centric) proposed_setup. Mirrors the
 * production `deriveGridConfigFromSchema` (derive_grid_config.ts) so the preview the
 * user confirms matches the grid they'll get post-import:
 *   - ministry_tags bucket by tag_role → adults / kids / youth / other(Stats)
 *   - metrics group by reporting_tag within each bucket
 *   - GIVING metrics become one top-level weekly (WK) group
 *   - leaf column IDs use the `metric.<METRIC_CODE>` grammar
 *
 * preview NUMBERS are deferred (IMPORT_IR_V2.md): when preview_sample is empty the
 * grid renders an empty (placeholder "—") week without crashing.
 */

// preview_sample is keyed by metric.<CODE> now; tolerate the legacy shape too.
interface PreviewSample {
  date:        string
  /** templateId → { "metric.<CODE>": value } */
  by_template?: Record<string, Record<string, number>>
  /** church-wide / period metrics → { "metric.<CODE>": value } */
  period?:     Record<string, number>
}

interface Props {
  proposedSetup:  ProposedSetup | null | undefined
  previewSample?: PreviewSample | null
}

type TagRole = 'ADULT_SERVICE' | 'KIDS_MINISTRY' | 'YOUTH_MINISTRY' | 'OTHER'
type Bucket  = 'adults' | 'kids' | 'youth' | 'other'

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

const ATTENDANCE    = 'ATTENDANCE'
const VOLUNTEERS    = 'VOLUNTEERS'
const RESPONSE_STAT = 'RESPONSE_STAT'
const GIVING        = 'GIVING'

const DIM_ORDER: { code: string; label: string }[] = [
  { code: ATTENDANCE,    label: 'Attendance' },
  { code: VOLUNTEERS,    label: 'Volunteers' },
  { code: RESPONSE_STAT, label: 'Stats'      },
]

export function PreviewGrid({ proposedSetup, previewSample }: Props) {
  // Filter state — which top-level column groups are hidden
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (id: string) => {
    setHiddenGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 1. Synthesize GridConfig from proposedSetup (IR v2 — ministry_tags + metrics)
  const config = useMemo<GridConfig | null>(() => {
    if (!proposedSetup) return null

    const ministryTags: ProposedMinistryTag[] = proposedSetup.ministry_tags ?? []
    const metrics:      ProposedMetric[]       = proposedSetup.metrics ?? []
    const templates:    ProposedServiceTemplate[] = proposedSetup.service_templates ?? []

    // ── ministry_tag code → bucket (via tag_role; default OTHER) ──
    const ministryByCode = new Map<string, ProposedMinistryTag>()
    for (const t of ministryTags) ministryByCode.set(t.code, t)

    const codeToBucket = (code: string | undefined): Bucket => {
      if (!code) return 'other'
      const tag = ministryByCode.get(code)
      const role = (tag?.tag_role as TagRole | undefined) ?? 'OTHER'
      return ROLE_TO_BUCKET[role] ?? 'other'
    }

    // ── Dynamic bucket labels: first ministry of each role names its bucket ──
    const bucketLabel: Record<Bucket, string> = {
      adults: BUCKET_META.adults.defaultLabel,
      kids:   BUCKET_META.kids.defaultLabel,
      youth:  BUCKET_META.youth.defaultLabel,
      other:  BUCKET_META.other.defaultLabel,
    }
    const labelClaimed: Record<Bucket, boolean> = { adults: false, kids: false, youth: false, other: false }
    for (const t of ministryTags) {
      const bucket = codeToBucket(t.code)
      if (bucket === 'other') continue // 'other' keeps the static "Stats" label
      if (!labelClaimed[bucket] && t.name) {
        bucketLabel[bucket] = t.name
        labelClaimed[bucket] = true
      }
    }

    // ── Classify metrics: GIVING → weekly group; rest → bucket × dimension ──
    interface ClassifiedMetric { code: string; name: string; bucket: Bucket; reportingCode: string }
    const givingMetrics: ClassifiedMetric[] = []
    const byBucketDim = new Map<Bucket, Map<string, ClassifiedMetric[]>>()
    for (const b of BUCKET_ORDER) byBucketDim.set(b, new Map())

    for (const m of metrics) {
      const repCode = m.reporting_tag ?? 'OTHER'
      const classified: ClassifiedMetric = {
        code:          m.metric_code,
        name:          m.name ?? m.metric_code,
        bucket:        codeToBucket(m.ministry_tag),
        reportingCode: repCode,
      }
      if (repCode === GIVING) { givingMetrics.push(classified); continue }
      const dimMap = byBucketDim.get(classified.bucket)!
      const arr = dimMap.get(classified.reportingCode) ?? []
      arr.push(classified)
      dimMap.set(classified.reportingCode, arr)
    }

    const leafColId = (code: string) => `metric.${code}`

    const columns: (DataColumn | ColumnGroup)[] = []
    const serviceTemplates: ServiceTemplate[]   = []
    const weeklyMetrics: MetricDefinition[]      = []
    const existingGroups: string[]               = []

    // GIVING (weekly, WK scope) — one top-level group, one child per giving metric.
    if (givingMetrics.length > 0) {
      columns.push({
        type: 'group', id: 'group_giving', label: 'Giving', scope: 'WK',
        children: givingMetrics.map<DataColumn>(m => ({
          type: 'data', id: leafColId(m.code), label: m.name,
          scope: 'WK', editable: true, dataType: 'currency',
        })),
      })
      existingGroups.push('group_giving')
      weeklyMetrics.push({ id: 'wk_giving', label: 'Giving', scope: 'WK', columnId: 'group_giving' })
    }

    const orderedDimsForBucket = (dimMap: Map<string, ClassifiedMetric[]>): { code: string; label: string }[] => {
      const present = new Set(dimMap.keys())
      const result: { code: string; label: string }[] = []
      for (const d of DIM_ORDER) {
        if (present.has(d.code)) { result.push(d); present.delete(d.code) }
      }
      for (const code of Array.from(present).sort()) result.push({ code, label: code })
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
          for (const m of dimMetrics) {
            groupChildren.push({
              type: 'data', id: leafColId(m.code), label: m.name,
              scope: 'SV', editable: true, dataType: 'number',
            })
          }
        } else {
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

    // ── Service templates → which audience groups they populate ──
    // A template's primary_tag bucket is its primary group; adult services also
    // populate kids (they commonly run alongside). Mirrors derive_grid_config.
    for (const tmpl of templates) {
      const populates: string[] = []
      const bucket = codeToBucket(tmpl.primary_tag)
      const primaryGroupId = BUCKET_META[bucket].groupId
      if (existingGroups.includes(primaryGroupId)) {
        populates.push(primaryGroupId)
        if (bucket === 'adults' && existingGroups.includes(BUCKET_META.kids.groupId)) {
          populates.push(BUCKET_META.kids.groupId)
        }
      } else {
        for (const b of BUCKET_ORDER) {
          const gid = BUCKET_META[b].groupId
          if (existingGroups.includes(gid)) { populates.push(gid); break }
        }
      }

      const rawName      = tmpl.display_name || ''
      const friendlyName = rawName.includes('[BLOCKING]')
        ? `Service ${tmpl.service_code} — needs naming`
        : rawName

      serviceTemplates.push({
        id:                    tmpl.service_code,
        displayName:           friendlyName,
        dayOfWeek:             tmpl.day_of_week || 0,
        populatesColumnGroups: populates,
      })
    }

    return {
      churchId:         'preview',
      version:          '3.0-metrics',
      columns,
      serviceTemplates,
      monthlyMetrics:   [],
      weeklyMetrics,
      singleDayMetrics: [],
      serviceMetrics:   [],
    }
  }, [proposedSetup])

  // 2. Filter chips — derived from config top-level groups (stable labels for display)
  const filterOptions = useMemo(() => {
    if (!config) return []
    return config.columns
      .filter((col): col is ColumnGroup => col.type === 'group')
      .map(col => ({ id: col.id, label: col.label }))
  }, [config])

  // 2b. Shared color map — order-based palette assignment for pills + headers.
  const groupColorMap = useMemo(
    () => buildGroupColorMap(filterOptions.map(o => o.id)),
    [filterOptions],
  )

  // 3. Filtered config — exclude hidden groups and their associated metric rows
  const filteredConfig = useMemo<GridConfig | null>(() => {
    if (!config) return null
    if (hiddenGroups.size === 0) return config
    return {
      ...config,
      columns:        config.columns.filter(col => !hiddenGroups.has(col.id)),
      weeklyMetrics:  config.weeklyMetrics.filter(m  => !hiddenGroups.has(m.columnId  ?? '')),
      monthlyMetrics: config.monthlyMetrics.filter(m => !hiddenGroups.has(m.columnId  ?? '')),
      serviceMetrics: config.serviceMetrics.filter(m => !hiddenGroups.has(m.columnId  ?? '')),
    }
  }, [config, hiddenGroups])

  // 4. Service instances + initialData for the preview week.
  const { dateRange, serviceInstances, availableTags, initialData } = useMemo(() => {
    if (!config) return {
      dateRange:        { startDate: new Date(), endDate: new Date() },
      serviceInstances: [],
      availableTags:    [],
      initialData:      new Map<string, number>(),
    }

    const parsePreviewDate = (raw: string): Date | null => {
      const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (isoMatch) {
        const [, y, mo, d] = isoMatch.map(Number)
        const dt = new Date(y, mo - 1, d, 12, 0, 0, 0)
        return isNaN(dt.getTime()) ? null : dt
      }
      const parsed = new Date(raw)
      if (isNaN(parsed.getTime())) return null
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0)
    }

    let previewDate: Date
    const parsedFromSample = previewSample?.date ? parsePreviewDate(previewSample.date) : null
    if (parsedFromSample) {
      previewDate = parsedFromSample
    } else {
      previewDate = new Date()
      previewDate.setDate(previewDate.getDate() - previewDate.getDay() - 7)
      previewDate.setHours(12, 0, 0, 0)
    }

    const weekStartSunday = new Date(previewDate)
    weekStartSunday.setDate(weekStartSunday.getDate() - weekStartSunday.getDay())
    weekStartSunday.setHours(12, 0, 0, 0)

    const instances = config.serviceTemplates.map((t, i) => {
      const occDate = new Date(weekStartSunday)
      occDate.setDate(weekStartSunday.getDate() + (t.dayOfWeek ?? 0))
      return {
        id:                `preview-occ-${i}`,
        serviceTemplateId: t.id,
        serviceDate:       occDate,
      }
    })

    const start = new Date(weekStartSunday)
    start.setDate(start.getDate() - 1)
    const end = new Date(weekStartSunday)
    end.setDate(end.getDate() + 7)

    // availableTags from ministry_tags (code/name).
    const avTags = (proposedSetup?.ministry_tags ?? []).map(t => ({
      id:   t.code,
      name: t.name ?? t.code,
    }))

    // Build initialData keyed off the exact row IDs buildGrid produces. preview
    // values are deferred — only populated when previewSample is present; metric
    // keys (`metric.<CODE>`) are matched case-insensitively to the leaf column IDs.
    const data = new Map<string, number>()
    if (previewSample) {
      const { rows } = buildGrid(config, { startDate: start, endDate: end }, instances, {})

      rows.forEach((row, rowIdx) => {
        const rowId = `${row.type}-${row.anchor.toISOString()}-${
          row.metricId ?? row.serviceTemplateId ?? rowIdx
        }`

        // SV rows: per-template metric values keyed by metric.<CODE>.
        if (row.type === 'SV' && row.serviceTemplateId && previewSample.by_template) {
          const tmplData = previewSample.by_template[row.serviceTemplateId]
          if (tmplData) {
            for (const [field, value] of Object.entries(tmplData)) {
              data.set(`${rowId}-${field.toLowerCase()}`, value)
            }
          }
        }

        // WK rows: church-wide / period metric values (e.g. giving), one week only.
        if (row.type === 'WK' && row.metricId && previewSample.period) {
          const weekStart = row.anchor
          const weekEnd   = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 6)
          weekEnd.setHours(23, 59, 59, 999)
          if (previewDate >= weekStart && previewDate <= weekEnd) {
            for (const [field, value] of Object.entries(previewSample.period)) {
              data.set(`${rowId}-${field.toLowerCase()}`, value)
            }
          }
        }
      })
    }

    return {
      dateRange:        { startDate: start, endDate: end },
      serviceInstances: instances,
      availableTags:    avTags,
      initialData:      data,
    }
  }, [config, proposedSetup, previewSample])

  if (!config || !filteredConfig) return <div className="p-8 text-gray-500">Waiting for data...</div>

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col bg-white">
      <GroupFilterPills
        options={filterOptions}
        hiddenGroups={hiddenGroups}
        onToggle={toggleGroup}
        colorMap={groupColorMap}
      />

      <HistoryGrid
        config={filteredConfig}
        dateRange={dateRange}
        serviceInstances={serviceInstances}
        initialData={initialData}
        availableTags={availableTags}
        onSave={async () => {}}
        groupColorMap={groupColorMap}
      />
    </div>
  )
}
