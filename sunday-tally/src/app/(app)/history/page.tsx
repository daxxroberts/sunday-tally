'use client'

// T_HISTORY — Historical Data Review — /history
// Relocated from /services/history when the legacy Sunday-loop routes were retired
// (SESSION_HANDOFF item 8). Component imports (HistoryGrid etc.) live in
// src/components and are unchanged — only the route + internal nav targets moved.
// Re-implemented on the design-package GridConfig + HistoryGrid system.
// Q1: GridConfig stored as JSONB on churches (or NULL → derive on read).
// Q2: derive_grid_config.ts synthesizes a default from the schema when NULL.
// D-003 NULL≠0 · Rule 1 status=active · Rule 3 vols calculated · Rule 5 SUM giving.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, Church } from '@/types'
import { HistoryGrid } from '@/components/history-grid/HistoryGrid'
import type { GridConfig, ColumnGroup } from '@/components/history-grid/grid-config-schema'
import { normalizeMetrics } from '@/components/history-grid/grid-config-schema'
import { deriveGridConfigFromSchema } from '@/lib/history/derive_grid_config'
import { buildGroupColorMap } from '@/components/history-grid/group-colors'
import { GroupFilterPills } from '@/components/history-grid/GroupFilterPills'

interface OccurrenceForGrid {
  id:                string  // service_occurrence UUID
  serviceTemplateId: string  // service_code from GridConfig
  serviceDate:       Date
}

interface CodeMaps {
  templateUuidByCode: Map<string, string>     // service_code → service_template UUID
  // metric.<CODE> resolution for the save handler: code → { scope }.
  metricScopeByCode:  Map<string, 'instance' | 'period'>
}

function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoForGrid(date: string): string {
  // grid-builder.ts uses Date.toISOString() as the anchor — match that exactly.
  return new Date(date + 'T00:00:00.000Z').toISOString()
}

function dedupeConfig(cfg: GridConfig): GridConfig {
  // Strip the dead "Tags" column/group. The per-occurrence tag junction table was
  // dropped in the schema cutover, so this column could never save (the save route
  // skips it). Removed at the source (derive_grid_config) too; this also cleans any
  // grid_config already stored with the column.
  const isTagData = (c: { type: string; dataType?: string }) => c.type === 'data' && c.dataType === 'tags'
  const columns = cfg.columns
    .filter(c => !(c.type === 'group' && c.id === 'group_tags') && !isTagData(c))
    .map(c => (c.type === 'group' ? { ...c, children: (c.children ?? []).filter(ch => !isTagData(ch)) } : c))
  return {
    ...cfg,
    columns,
    serviceTemplates: cfg.serviceTemplates?.map(st => ({
      ...st,
      populatesColumnGroups: (st.populatesColumnGroups ?? []).filter(g => g !== 'group_tags'),
    })) ?? cfg.serviceTemplates,
    weeklyMetrics:    normalizeMetrics(cfg.weeklyMetrics),
    monthlyMetrics:   normalizeMetrics(cfg.monthlyMetrics),
    singleDayMetrics: cfg.singleDayMetrics ? normalizeMetrics(cfg.singleDayMetrics) : cfg.singleDayMetrics,
  }
}

export default function HistoryPage() {
  const router = useRouter()

  const [role, setRole]                 = useState<UserRole>('editor')
  const [church, setChurch]             = useState<Church | null>(null)
  const [config, setConfig]             = useState<GridConfig | null>(null)
  const [occurrences, setOccurrences]   = useState<OccurrenceForGrid[]>([])
  const [initialData, setInitialData]   = useState<Map<string, unknown>>(new Map())
  const [codeMaps, setCodeMaps]         = useState<CodeMaps | null>(null)
  const [loading, setLoading]           = useState(true)
  const [emptyReason, setEmptyReason]   = useState<string | null>(null)

  // Top-level group filter state — same pattern as the import review preview.
  // Hides/shows full ministry sections (Giving, Experience, LifeKids, Switch, …)
  // via colored pills above the grid.
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set())
  const toggleGroup = useCallback((id: string) => {
    setHiddenGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Filter pill options + shared color map. Both the pills and HistoryGrid use
  // the same colorMap so a pill and its column header below match.
  const filterOptions = useMemo(() => {
    if (!config) return []
    return config.columns
      .filter((c): c is ColumnGroup => c.type === 'group')
      .map(c => ({ id: c.id, label: c.label }))
  }, [config])

  // Church-chosen ministry colors (0040) — loaded in boot; palette fills the rest.
  const [colorOverrides, setColorOverrides] = useState<Map<string, string>>(new Map())
  const groupColorMap = useMemo(
    () => buildGroupColorMap(filterOptions.map(o => o.id), colorOverrides),
    [filterOptions, colorOverrides],
  )

  const filteredConfig = useMemo<GridConfig | null>(() => {
    if (!config) return null
    if (hiddenGroups.size === 0) return config
    return {
      ...config,
      columns:          config.columns.filter(col => !hiddenGroups.has(col.id)),
      weeklyMetrics:    config.weeklyMetrics.filter(m  => !hiddenGroups.has(m.columnId  ?? '')),
      monthlyMetrics:   config.monthlyMetrics.filter(m => !hiddenGroups.has(m.columnId  ?? '')),
      serviceMetrics:   config.serviceMetrics.filter(m => !hiddenGroups.has(m.columnId  ?? '')),
      // Strip service templates whose every group is hidden — otherwise their
      // SV rows stay in the grid as blank-cell rows even when all columns are gone.
      serviceTemplates: (config.serviceTemplates ?? []).filter(st =>
        st.populatesColumnGroups.some(g => !hiddenGroups.has(g))
      ),
    }
  }, [config, hiddenGroups])

  // Service occurrences scoped to the visible service templates.
  // Filters in sync with filteredConfig so row count matches column visibility.
  const filteredOccurrences = useMemo(() => {
    if (hiddenGroups.size === 0) return occurrences
    const visibleCodes = new Set((filteredConfig?.serviceTemplates ?? []).map(st => st.id))
    return occurrences.filter(o => visibleCodes.has(o.serviceTemplateId))
  }, [filteredConfig, occurrences, hiddenGroups])

  const today = new Date()
  const yearAgo = new Date(today)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const [dateFrom, setDateFrom] = useState(toDateInput(yearAgo))
  const [dateTo,   setDateTo]   = useState(toDateInput(today))

  // ── Auth + church + config ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/entries'); return }

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, churches(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership) { router.push('/entries'); return }

      const r = membership.role as UserRole
      if (r === 'viewer') { router.push('/dashboard/viewer'); return }

      setRole(r)
      // @ts-expect-error join
      const ch = membership.churches as Church & { grid_config?: GridConfig | null }
      setChurch(ch)

      const stored = ch.grid_config ?? null
      // Use a stored config ONLY if it actually has grid columns. The dashboard
      // persists its prefs (keyMetrics / excludedTotalMinistries) into the SAME
      // grid_config column, so a prefs-only object has no columns. In that case
      // — or when null — derive the grid from the live schema so History always
      // reflects the current structure and never renders an empty/crashing grid.
      const storedHasGrid = !!stored && Array.isArray(stored.columns) && stored.columns.length > 0
      if (storedHasGrid) {
        setConfig(dedupeConfig(stored))
      } else {
        const derived = await deriveGridConfigFromSchema(supabase, ch.id)
        if (!derived) {
          setEmptyReason('No active services with a primary tag yet. Set up your services first.')
        }
        setConfig(derived ? dedupeConfig(derived) : null)
      }

      // Ministry colors (0040): root tags with a chosen color override the
      // positional palette — same color here as everywhere that ministry shows.
      // Key matches extractRootKey on group_<code-sans-underscores> ids.
      // Pre-0040 the column doesn't exist → select errors → palette only.
      const { data: colorRows, error: colorErr } = await supabase
        .from('service_tags')
        .select('code, parent_tag_id, color')
        .eq('church_id', ch.id)
        .eq('is_active', true)
      if (!colorErr && colorRows) {
        const overrides = new Map<string, string>()
        for (const t of colorRows as { code: string; parent_tag_id: string | null; color?: string | null }[]) {
          if (t.parent_tag_id === null && t.color) {
            overrides.set(t.code.toLowerCase().replace(/_/g, ''), t.color)
          }
        }
        setColorOverrides(overrides)
      }
    })
  }, [router])

  // ── Load occurrences + per-cell data for the date range ──────────────────
  const loadData = useCallback(async (
    ch: Church,
    cfg: GridConfig,
    from: string,
    to:   string,
  ) => {
    setLoading(true)
    const supabase = createClient()

    // Templates (UUID ↔ service_code) — needed for SV-row occurrence mapping
    // and for the save handler's instance-scope occurrence resolution.
    const { data: tmplRows } = await supabase
      .from('service_templates')
      .select('id, service_code')
      .eq('church_id', ch.id)
    const tmplCodeByUuid  = new Map<string, string>()
    const tmplUuidByCode  = new Map<string, string>()
    for (const t of tmplRows ?? []) {
      tmplCodeByUuid.set(t.id, t.service_code)
      tmplUuidByCode.set(t.service_code, t.id)
    }

    // Metric definitions: code → scope. `metrics.code` is the stable key that
    // matches the grid_config leaf column id `metric.<CODE>`. Used by the save
    // handler to resolve which metric a cell edit targets and whether it is
    // instance- or period-scoped.
    const { data: metricRows } = await supabase
      .from('metrics')
      .select('code, scope, is_active')
      .eq('church_id', ch.id)
      .eq('is_active', true)
    const metricScopeByCode = new Map<string, 'instance' | 'period'>()
    for (const m of metricRows ?? []) {
      metricScopeByCode.set(m.code as string, m.scope as 'instance' | 'period')
    }

    setCodeMaps({
      templateUuidByCode: tmplUuidByCode,
      metricScopeByCode,
    })

    // Occurrences in range (Rule 1: status=active)
    const { data: occRows } = await supabase
      .from('service_instances')
      .select('id, service_date, service_template_id')
      .eq('church_id', ch.id)
      .eq('status', 'active')
      .gte('service_date', from)
      .lte('service_date', to)
      .order('service_date', { ascending: true })

    const occList: OccurrenceForGrid[] = []
    for (const o of occRows ?? []) {
      const code = tmplCodeByUuid.get(o.service_template_id)
      if (!code) continue
      occList.push({
        id:                o.id,
        serviceTemplateId: code,
        serviceDate:       new Date((o.service_date as string) + 'T00:00:00.000Z'),
      })
    }
    setOccurrences(occList)

    const occByUuid = new Map(occList.map(o => [o.id, o]))

    // ── Cell data — ONE query of metric_entries (IR v2) ──────────────────────
    // Every leaf column is a metric whose id is `metric.<CODE>`. Instance-scoped
    // entries join service_instances for the service date + template (→ SV row);
    // period-scoped entries carry period_anchor (the week's Sunday → WK row).
    //
    // The grid's cell-lookup key is `${rowId}-${columnId}` where:
    //   SV rowId = `SV-${serviceDate.toISOString()}-${serviceTemplateCode}`
    //   WK rowId = `WK-${sundaySunday.toISOString()}-wk_giving`  (period metrics)
    //   columnId = `metric.${code}`  (the grid_config leaf id)
    //
    // D-003 NULL ≠ 0: rows with NULL value or is_not_applicable=true are excluded
    // and simply never written to the map (cell renders "—"), never coalesced to 0.
    // Per-service-instance rows show the raw value; period rows show the stored
    // weekly value as-is. (agg_default — ATTENDANCE=avg, the rest=sum — governs the
    // grid's own month-header aggregation across these raw cells; we deliberately
    // place RAW values so that aggregation is computed once, in the grid.)
    const data: Map<string, unknown> = new Map()

    // The visible range can hold well over 1,000 metric_entries rows (98 occ ×
    // ~12 metrics), which exceeds PostgREST's default 1,000-row cap. We therefore
    // (a) scope each fetch to the visible range so unrelated old rows never crowd
    // out the ones we need, and (b) page through results with .range() until a
    // short page signals the end. Instance-scoped and period-scoped entries are
    // fetched separately (cleaner than an .or() spanning an embedded column) and
    // merged into one row list that feeds the existing mapping loop below.
    const ENTRY_SELECT = `
        value,
        is_not_applicable,
        period_anchor,
        service_instance_id,
        metrics!inner ( code, scope ),
        service_instances ( service_date, service_template_id, status )
      `
    const PAGE = 1000

    // Paginate a metric_entries query. The caller's factory takes the page
    // window (offset/limit) and returns the awaitable builder for that page —
    // each page must be a fresh builder (Supabase builders are single-use). The
    // factory applies a stable .order('id') so paging is deterministic.
    type EntryRowRaw = Record<string, unknown>
    const fetchAllPaged = async (
      buildPage: (
        offset: number,
        limit: number,
      ) => PromiseLike<{ data: unknown }>,
    ): Promise<EntryRowRaw[]> => {
      const all: EntryRowRaw[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data: page } = await buildPage(offset, PAGE)
        const rows = (page ?? []) as EntryRowRaw[]
        all.push(...rows)
        if (rows.length < PAGE) break
      }
      return all
    }

    const occIds = occList.map(o => o.id)

    // Instance-scoped entries — only those tied to in-range active occurrences.
    // (Skip entirely when no occurrences are in range.)
    const instanceRows: EntryRowRaw[] =
      occIds.length === 0
        ? []
        : await fetchAllPaged((offset, limit) =>
            supabase
              .from('metric_entries')
              .select(ENTRY_SELECT)
              .eq('church_id', ch.id)
              .eq('is_not_applicable', false)
              .not('value', 'is', null)
              .in('service_instance_id', occIds)
              .order('id', { ascending: true })
              .range(offset, offset + limit - 1),
          )

    // Period-scoped entries (giving) — scoped to the visible date range by the
    // week's Sunday anchor.
    const periodRows: EntryRowRaw[] = await fetchAllPaged((offset, limit) =>
      supabase
        .from('metric_entries')
        .select(ENTRY_SELECT)
        .eq('church_id', ch.id)
        .eq('is_not_applicable', false)
        .not('value', 'is', null)
        .gte('period_anchor', from)
        .lte('period_anchor', to)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1),
    )

    const entryRows: EntryRowRaw[] = [...instanceRows, ...periodRows]

    type MetricJoin       = { code: string; scope: 'instance' | 'period' }
    type InstanceJoin     = { service_date: string; service_template_id: string; status: string }
    interface EntryRow {
      value:               number | null
      is_not_applicable:   boolean
      period_anchor:       string | null
      service_instance_id: string | null
      // PostgREST returns embedded one-to-one joins as an object (or array in
      // some type generations) — normalize defensively below.
      metrics:             MetricJoin | MetricJoin[] | null
      service_instances:   InstanceJoin | InstanceJoin[] | null
    }

    const one = <T,>(j: T | T[] | null): T | null =>
      Array.isArray(j) ? (j[0] ?? null) : j

    for (const raw of (entryRows ?? []) as unknown as EntryRow[]) {
      if (raw.value === null) continue                  // D-003: NULL ≠ 0
      const metric = one<MetricJoin>(raw.metrics)
      if (!metric) continue
      const columnId = `metric.${metric.code}`
      const value    = Number(raw.value)

      if (metric.scope === 'instance' && raw.service_instance_id) {
        // Instance-scoped → SV row. Filter to active instances in range (Rule 1).
        const inst = one<InstanceJoin>(raw.service_instances)
        if (!inst || inst.status !== 'active') continue
        const occ = occByUuid.get(raw.service_instance_id)
        if (!occ) continue                              // out of visible range
        const rowId = `SV-${occ.serviceDate.toISOString()}-${occ.serviceTemplateId}`
        data.set(`${rowId}-${columnId}`, value)         // raw per-instance value
      } else if (metric.scope === 'period' && raw.period_anchor) {
        // Period-scoped (giving) → WK row anchored on the week's Sunday. The
        // derived config emits a single `wk_giving` weekly metric whose columnId
        // is the `group_giving` group, so every leaf inside it is EDITABLE; the
        // rowId's metric segment is therefore `wk_giving`.
        const anchorDate = raw.period_anchor.slice(0, 10)
        if (anchorDate < from || anchorDate > to) continue
        const sundayIso = isoForGrid(anchorDate)         // period_anchor already = Sunday
        const rowId = `WK-${sundayIso}-wk_giving`
        data.set(`${rowId}-${columnId}`, value)
      }
    }

    setInitialData(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (church && config) loadData(church, config, dateFrom, dateTo)
  }, [church, config, dateFrom, dateTo, loadData])

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async (changes: Map<string, unknown>) => {
    if (!church || !codeMaps) return
    const payload: Array<{ key: string; value: unknown }> = []
    for (const [key, value] of changes.entries()) {
      payload.push({ key, value })
    }
    const res = await fetch('/api/history/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ church_id: church.id, changes: payload }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || body.error || 'Save failed')
    }
    // Refresh data from server so computed rows + persisted state stay in sync
    if (config) await loadData(church, config, dateFrom, dateTo)
  }, [church, config, codeMaps, dateFrom, dateTo, loadData])

  if (!church) return null

  // ── Render ────────────────────────────────────────────────────────────────
  const rangeStart = new Date(dateFrom + 'T00:00:00Z')
  const rangeEnd   = new Date(dateTo   + 'T00:00:00Z')

  return (
    <AppLayout role={role} fillHeight>
      <div className="flex flex-col h-full overflow-hidden w-full min-w-0">
        {/* Header + date range */}
        <div className="shrink-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/entries" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">History</p>
              <p className="text-xs text-gray-400 leading-tight">{church.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-gray-400 w-32"
            />
            <span className="text-gray-300">–</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={e => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-gray-400 w-32"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {emptyReason ? (
            <div className="px-6 py-16 text-center">
              <p className="text-gray-500 font-medium">{emptyReason}</p>
              <Link
                href="/onboarding/services"
                className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline"
              >
                Set up services →
              </Link>
            </div>
          ) : !config ? (
            <div className="px-6 py-16 text-center">
              <p className="text-gray-400 text-sm">Loading grid…</p>
            </div>
          ) : (
            <>
              <GroupFilterPills
                options={filterOptions}
                hiddenGroups={hiddenGroups}
                onToggle={toggleGroup}
                colorMap={groupColorMap}
              />
              <HistoryGrid
                config={filteredConfig ?? config}
                dateRange={{ startDate: rangeStart, endDate: rangeEnd }}
                serviceInstances={filteredOccurrences.map(o => ({
                  id:                o.id,
                  serviceTemplateId: o.serviceTemplateId,
                  serviceDate:       o.serviceDate,
                }))}
                initialData={initialData}
                onSave={handleSave}
                groupColorMap={groupColorMap}
              />
            </>
          )}
          {loading && (
            <div className="px-6 py-2 text-xs text-gray-400">Loading data…</div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
