/**
 * derive_grid_config.ts — synthesize a GridConfig from existing church state.
 *
 * Path Q2 = (b): when `churches.grid_config` is NULL, the History page derives
 * a default config from the church's current schema (templates, categories,
 * sources, tracking flags) so the page always renders without a prior AI
 * import. Stage B and Settings updates persist explicit configs that override
 * this fallback.
 *
 * Layout produced (matches legacy /services/history visible columns):
 *   Per active service_template (with primary_tag):
 *     - Attendance: Main, Kids, Youth (gated by tracks_*)
 *     - Stats: one column per response_category (stat_scope='service')
 *     - Giving (computed total) + collapsible "Sources" subgroup, one column
 *       per giving_source
 *     - Volunteers (computed total) + collapsible "Roles" subgroup, one column
 *       per volunteer_category (each carries audience_group_code in the label)
 *   Weekly column (single, holds all WK metrics — period_giving + week-scope
 *     response_categories), distinguished by row labels per the validation rule
 *     "multiple WK metrics share one column unless sub-categorized"
 *   Monthly column (single, all month-scope categories)
 *   Daily column (single, all day-scope categories) — only when day-scope
 *     categories exist
 *
 * Audience-scoped stats are intentionally not emitted as columns — matches the
 * legacy page (those are entered in T4, not in History).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GridConfig,
  DataColumn,
  ColumnGroup,
  MetricDefinition,
  ServiceTemplate,
} from '@/components/history-grid/grid-config-schema'

interface ChurchRow {
  id:                       string
  tracks_main_attendance:   boolean
  tracks_kids_attendance:   boolean
  tracks_youth_attendance:  boolean
  tracks_volunteers:        boolean
  tracks_responses:         boolean
  tracks_giving:            boolean
}

interface TemplateRow {
  id:             string
  service_code:   string
  display_name:   string
  sort_order:     number
  primary_tag_id: string | null
}

interface ResponseCategoryRow {
  id:             string
  category_code:  string
  category_name:  string
  stat_scope:     'audience' | 'service' | 'week' | 'month' | 'day'
  display_order:  number
}

interface VolunteerCategoryRow {
  id:                  string
  category_code:       string
  category_name:       string
  audience_group_code: 'MAIN' | 'KIDS' | 'YOUTH'
  sort_order:          number
}

interface GivingSourceRow {
  id:            string
  source_code:   string
  source_name:   string
  display_order: number
}

interface ScheduleRow {
  service_template_id: string
  day_of_week:         number
  start_time:          string | null
}

/**
 * Derive a GridConfig from the church's existing schema state.
 * Returns null when the church has no active templates with a primary tag —
 * the page should show "set up your services first" in that case.
 */
export async function deriveGridConfigFromSchema(
  supabase: SupabaseClient,
  churchId: string,
): Promise<GridConfig | null> {
  const [churchRes, tmplRes, respRes, volRes, giveRes, schedRes] = await Promise.all([
    supabase
      .from('churches')
      .select(
        'id, tracks_main_attendance, tracks_kids_attendance, tracks_youth_attendance, ' +
        'tracks_volunteers, tracks_responses, tracks_giving',
      )
      .eq('id', churchId)
      .single(),
    supabase
      .from('service_templates')
      .select('id, service_code, display_name, sort_order, primary_tag_id')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .not('primary_tag_id', 'is', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('response_categories')
      .select('id, category_code, category_name, stat_scope, display_order')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('volunteer_categories')
      .select('id, category_code, category_name, audience_group_code, sort_order')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('audience_group_code', { ascending: true })
      .order('sort_order', { ascending: true }),
    supabase
      .from('giving_sources')
      .select('id, source_code, source_name, display_order')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('service_schedule_versions')
      .select('service_template_id, day_of_week, start_time')
      .eq('is_active', true),
  ])

  const church    = churchRes.data as ChurchRow | null
  const templates = (tmplRes.data ?? []) as TemplateRow[]
  const responses = (respRes.data ?? []) as ResponseCategoryRow[]
  const volCats   = (volRes.data ?? []) as VolunteerCategoryRow[]
  const sources   = (giveRes.data ?? []) as GivingSourceRow[]
  const schedules = (schedRes.data ?? []) as ScheduleRow[]

  if (!church || templates.length === 0) return null

  const dowByTemplate = new Map<string, number>()
  for (const s of schedules) dowByTemplate.set(s.service_template_id, s.day_of_week)

  // ── Per-template column groups (SV-scoped) ────────────────────────────────
  const columns: (DataColumn | ColumnGroup)[] = []
  const svcStats = responses.filter(r => r.stat_scope === 'service')

  for (const tmpl of templates) {
    const children: (DataColumn | ColumnGroup)[] = []

    // Attendance
    if (church.tracks_main_attendance) {
      children.push({
        type: 'data', id: 'attendance.main', label: 'Main',
        scope: 'SV', editable: true, dataType: 'number',
      })
    }
    if (church.tracks_kids_attendance) {
      children.push({
        type: 'data', id: 'attendance.kids', label: 'Kids',
        scope: 'SV', editable: true, dataType: 'number',
      })
    }
    if (church.tracks_youth_attendance) {
      children.push({
        type: 'data', id: 'attendance.youth', label: 'Youth',
        scope: 'SV', editable: true, dataType: 'number',
      })
    }

    // Service-scope stats — one editable column per category
    if (church.tracks_responses) {
      for (const cat of svcStats) {
        children.push({
          type: 'data',
          id:    `response.${cat.category_code}`,
          label: cat.category_name,
          scope: 'SV',
          editable: true,
          dataType: 'number',
        })
      }
    }

    // Giving — Total (read-only computed) + collapsible Sources subgroup
    if (church.tracks_giving && sources.length > 0) {
      children.push({
        type: 'data',
        id:    'giving.total',
        label: 'Giving',
        scope: 'SV',
        editable: false,
        dataType: 'currency',
        computedFrom: sources.map(s => `giving.${s.source_code}`),
      })
      children.push({
        type: 'group',
        id:    `${tmpl.service_code}__giving_sources`,
        label: 'Sources',
        scope: 'SV',
        collapsible: true,
        defaultCollapsed: true,
        children: sources.map<DataColumn>(s => ({
          type: 'data',
          id:    `giving.${s.source_code}`,
          label: s.source_name,
          scope: 'SV',
          editable: true,
          dataType: 'currency',
        })),
      })
    }

    // Volunteers — Total + collapsible Roles subgroup. Audience encoded in label
    // so a single column tree handles MAIN/KIDS/YOUTH-tagged categories.
    if (church.tracks_volunteers && volCats.length > 0) {
      children.push({
        type: 'data',
        id:    'volunteer.total',
        label: 'Vols',
        scope: 'SV',
        editable: false,
        dataType: 'number',
        computedFrom: volCats.map(v => `volunteer.${v.category_code}`),
      })
      children.push({
        type: 'group',
        id:    `${tmpl.service_code}__vol_roles`,
        label: 'Roles',
        scope: 'SV',
        collapsible: true,
        defaultCollapsed: true,
        children: volCats.map<DataColumn>(v => ({
          type: 'data',
          id:    `volunteer.${v.category_code}`,
          label: audienceLabelPrefix(v.audience_group_code) + v.category_name,
          scope: 'SV',
          editable: true,
          dataType: 'number',
        })),
      })
    }

    columns.push({
      type: 'group',
      id:    tmpl.service_code,
      label: tmpl.display_name,
      scope: 'SV',
      children,
    })
  }

  // ── Period-scoped columns (single column per scope, distinguished by rows) ─
  const wkCats   = responses.filter(r => r.stat_scope === 'week')
  const moCats   = responses.filter(r => r.stat_scope === 'month')
  const sdCats   = responses.filter(r => r.stat_scope === 'day')

  const hasWeekly = (church.tracks_giving && sources.length > 0) || wkCats.length > 0
  if (hasWeekly) {
    columns.push({
      type: 'data',
      id:    'weekly_total',
      label: 'Weekly',
      scope: 'WK',
      editable: true,
      dataType: 'number',
    })
  }

  if (moCats.length > 0) {
    columns.push({
      type: 'data',
      id:    'monthly_total',
      label: 'Monthly',
      scope: 'MO',
      editable: true,
      dataType: 'number',
    })
  }

  if (sdCats.length > 0) {
    columns.push({
      type: 'data',
      id:    'daily_total',
      label: 'Daily',
      scope: 'SD',
      editable: true,
      dataType: 'number',
    })
  }

  // ── Service templates — bind each to its own column group for SV cell state
  const serviceTemplates: ServiceTemplate[] = templates.map(t => ({
    id:                    t.service_code,
    displayName:           t.display_name,
    dayOfWeek:             dowByTemplate.get(t.id) ?? 0,
    populatesColumnGroups: [t.service_code],
  }))

  // ── Metric definitions: one row per logical metric per period ─────────────
  const weeklyMetrics: MetricDefinition[] = []
  if (church.tracks_giving) {
    for (const s of sources) {
      weeklyMetrics.push({
        id:       `wk_giving_${s.source_code}`,
        label:    `${s.source_name} (weekly)`,
        scope:    'WK',
        columnId: 'weekly_total',
      })
    }
  }
  for (const c of wkCats) {
    weeklyMetrics.push({
      id:       `wk_${c.category_code}`,
      label:    c.category_name,
      scope:    'WK',
      columnId: 'weekly_total',
    })
  }

  const monthlyMetrics: MetricDefinition[] = moCats.map(c => ({
    id:       `mo_${c.category_code}`,
    label:    c.category_name,
    scope:    'MO',
    columnId: 'monthly_total',
  }))

  const singleDayMetrics: MetricDefinition[] = sdCats.map(c => ({
    id:       `sd_${c.category_code}`,
    label:    c.category_name,
    scope:    'SD',
    columnId: 'daily_total',
  }))

  return {
    churchId:         church.id,
    version:          '1.0-derived',
    columns,
    serviceTemplates,
    monthlyMetrics,
    weeklyMetrics,
    singleDayMetrics,
    serviceMetrics:   [],
  }
}

function audienceLabelPrefix(code: 'MAIN' | 'KIDS' | 'YOUTH'): string {
  if (code === 'MAIN')  return ''
  if (code === 'KIDS')  return 'Kids · '
  return 'Youth · '
}
