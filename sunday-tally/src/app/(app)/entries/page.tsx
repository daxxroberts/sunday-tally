'use client'

// ─────────────────────────────────────────────────────────────────────────
// ENTRIES — /(app)/entries — task #36 weekly/period data entry hub.
// Build spec: IRIS_ENTRIES_ELEMENT_MAP.md (E-1..E-50).  UI rules: DESIGN_SYSTEM.md.
//
// Everything is schema/config driven — no hardcoded ministries or metrics.
// Flow: user → membership(role, church, default_location) → active campus →
//   week (Sunday-anchored) → that week's service_instances → per-template
//   ministries (service_template_tags) → per-ministry canonical metrics →
//   prefill from metric_entries → tabs → autosave upsert on uq_metric_entry.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { addDays, sundayOf } from '@/lib/date-window'
import { readChurchPrefs, saveChurchPrefs } from '@/lib/churchPrefs'
import { fetchActiveServiceTags } from '@/lib/service-tags'
import { buildGroupColorMap, type GroupColor } from '@/components/history-grid/group-colors'
import type { Church, UserRole } from '@/types'
import {
  Dot, Ico, hasEnterableMetrics, ministryStatus, toDateStr,
  type EntryMap, type GridPrefs, type Instance, type Metric, type Ministry, type Stat,
} from './ui'
import { TotalsView } from './components/TotalsView'
import { OccurrenceView } from './components/OccurrenceView'
import { StatEntriesView } from './components/StatEntriesView'
import { MinistryFilterButton, type FilterableMinistry } from './components/MinistryFilterButton'

const PAGE = 1000  // PostgREST cap — paginate past it (N-7)

/* ── date helpers (client-side, browser-local is fine per task note) ────── */
function fromDateStr(s: string) { return new Date(s + 'T12:00:00') }
function fmtWeek(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
function firstOfMonth(d: Date) { return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)) }

/* ── completion (N-6) ──────────────────────────────────────────────────── */
// Returns null when the occurrence has NO enterable inputs (no ministries, or
// only rollup-only container ministries) — such an occurrence is not a member of
// the completion tally and its tab dot shows "not started" rather than a false
// green "done". Otherwise it aggregates over the enterable ministries only.
function instanceStatus(inst: Instance, entries: EntryMap, isVisible?: (tagId: string) => boolean): Stat | null {
  const ministries = isVisible ? inst.ministries.filter(m => isVisible(m.tag_id)) : inst.ministries
  const enterable = ministries.filter(hasEnterableMetrics)
  if (enterable.length === 0) return null
  const statuses = enterable.map(m => ministryStatus(m, inst.id, entries))
  if (statuses.every(s => s === 'complete')) return 'complete'
  if (statuses.every(s => s === 'empty')) return 'empty'
  return 'needs'
}

export default function EntriesPage() {
  const supabase = useMemo(() => createClient(), [])

  const [role, setRole] = useState<UserRole>('editor')
  const [church, setChurch] = useState<Church | null>(null)
  const [churchId, setChurchId] = useState<string | null>(null)
  const [campus, setCampus] = useState<{ id: string; name: string } | null>(null)
  const [gridPrefs, setGridPrefs] = useState<GridPrefs>({})

  const [weekStart, setWeekStart] = useState<Date>(() => sundayOf(new Date()))
  const [instances, setInstances] = useState<Instance[]>([])
  // Templates with location_id NULL (0036) — drives NULL-location writes (EN3).
  const [churchWideTmpl, setChurchWideTmpl] = useState<Set<string>>(new Set())
  const [periodMetrics, setPeriodMetrics] = useState<Metric[]>([])
  const [entries, setEntries] = useState<EntryMap>({})
  // Ministry accent colors (0040) — same positional-palette + override logic as
  // Setup/History, so a ministry reads as the SAME color everywhere. Keyed by
  // root-ancestor id; a subgroup inherits its ministry's color.
  const [parentTagById, setParentTagById] = useState<Map<string, string | null>>(new Map())
  const [colorMap, setColorMap] = useState<Map<string, GroupColor>>(new Map())
  const [rootMinistries, setRootMinistries] = useState<FilterableMinistry[]>([])

  // "Ministries" filter — which ministries THIS SCREEN shows (E-4b, iPad-station
  // mode). null = show everything. Saved per church in localStorage so a station
  // set up once (e.g. "only show Kids at the check-in table") stays set up.
  const [visibleMinistryIds, setVisibleMinistryIdsState] = useState<Set<string> | null>(null)

  const [bootLoading, setBootLoading] = useState(true)
  const [weekLoading, setWeekLoading] = useState(true)
  // #29 — a failed prefill query must not silently render as "no data entered".
  const [weekLoadError, setWeekLoadError] = useState(false)
  const [tab, setTab] = useState<string>('')
  // Totals moved out of the entry tabs into a header toggle (2026-06 redesign).
  const [showTotals, setShowTotals] = useState(false)

  const readOnly = role === 'viewer'
  const canEditTotals = role === 'owner' || role === 'admin'
  const weekStartStr = toDateStr(weekStart)

  /* ── boot: resolve user → membership → campus → grid prefs (once) ─────── */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setBootLoading(false); return }

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, default_location_id, churches(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership || cancelled) { if (!cancelled) setBootLoading(false); return }

      const churchData = (Array.isArray(membership.churches) ? membership.churches[0] : membership.churches) as Church
      setRole(membership.role as UserRole)
      setChurch(churchData)
      setChurchId(membership.church_id)
      // 0039 split: prefs from dashboard_prefs (legacy grid_config keys pre-apply).
      setGridPrefs(readChurchPrefs(churchData) as GridPrefs)

      // active campus (N-5): default_location_id, else first active location by sort_order
      let campusRow: { id: string; name: string } | null = null
      if (membership.default_location_id) {
        const { data: loc } = await supabase
          .from('church_locations')
          .select('id, name')
          .eq('id', membership.default_location_id)
          .maybeSingle()
        if (loc) campusRow = loc
      }
      if (!campusRow) {
        const { data: locs } = await supabase
          .from('church_locations')
          .select('id, name')
          .eq('church_id', membership.church_id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .limit(1)
        if (locs && locs[0]) campusRow = locs[0]
      }
      if (!cancelled) { setCampus(campusRow); setBootLoading(false) }
    })()
    return () => { cancelled = true }
  }, [supabase])

  /* ── period (Stat Entries) metrics — church-wide, load once church known ─ */
  useEffect(() => {
    if (!churchId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('metrics')
        .select('id, name, code, scope, is_canonical, cadence, ministry_tag_id, reporting_tags(code)')
        .eq('church_id', churchId)
        .eq('scope', 'period')
        .eq('is_active', true)
        .neq('mode', 'rollup')   // roll-ups are computed (Phase B), not typed here
        .is('archived_at', null) // archived counts keep history but accept no new data (decision 9)
      if (cancelled) return
      const mapped: Metric[] = (data ?? []).map((m: any) => ({
        id: m.id, name: m.name, code: m.code, scope: 'period',
        is_canonical: m.is_canonical, cadence: m.cadence, ministry_tag_id: m.ministry_tag_id,
        reporting_tag_code: Array.isArray(m.reporting_tags) ? m.reporting_tags[0]?.code ?? null : m.reporting_tags?.code ?? null,
      }))
      setPeriodMetrics(mapped)
    })()
    return () => { cancelled = true }
  }, [supabase, churchId])

  /* ── ministry accent colors (0040) — church-wide, load once church known ── */
  useEffect(() => {
    if (!churchId) return
    let cancelled = false
    ;(async () => {
      const { rows } = await fetchActiveServiceTags(supabase, churchId)
      if (cancelled) return
      // Full root set feeds the color palette so positions match the dashboard/
      // History (the palette invariant). Archived ministries are dropped only from
      // the filter dropdown below — the entry cards already hide them (review #53).
      const roots = rows.filter(r => r.parent_tag_id === null)
      const overrides = new Map<string, string>()
      for (const r of roots) if (r.color) overrides.set(r.id.toLowerCase(), r.color)
      setParentTagById(new Map(rows.map(r => [r.id, r.parent_tag_id])))
      const map = buildGroupColorMap(roots.map(r => `group_${r.id}`), overrides)
      setColorMap(map)
      setRootMinistries(roots.filter(r => !r.archived_at).map(r => ({ id: r.id, name: r.name, color: map.get(r.id.toLowerCase())?.strong })))
    })()
    return () => { cancelled = true }
  }, [supabase, churchId])

  const rootAncestorId = useCallback((id: string): string => {
    let cur = id
    let hops = 0
    while (hops++ < 10) {
      const parent = parentTagById.get(cur)
      if (!parent) return cur
      cur = parent
    }
    return cur
  }, [parentTagById])

  const colorForNode = useCallback((id: string): GroupColor | undefined =>
    colorMap.get(rootAncestorId(id).toLowerCase()), [colorMap, rootAncestorId])

  // Load the saved filter once the church is known; per-church so a shared
  // device keeps separate filters if it's ever used for more than one church.
  useEffect(() => {
    if (!churchId) return
    try {
      const raw = localStorage.getItem(`st_entries_ministries:${churchId}`)
      setVisibleMinistryIdsState(raw ? new Set(JSON.parse(raw) as string[]) : null)
    } catch { setVisibleMinistryIdsState(null) }
  }, [churchId])

  const setVisibleMinistryIds = useCallback((next: Set<string> | null) => {
    setVisibleMinistryIdsState(next)
    if (!churchId) return
    try {
      if (next === null) localStorage.removeItem(`st_entries_ministries:${churchId}`)
      else localStorage.setItem(`st_entries_ministries:${churchId}`, JSON.stringify(Array.from(next)))
    } catch { /* localStorage unavailable — filter still works for this session */ }
  }, [churchId])

  // A ministry (root or subgroup) is visible when its ROOT is checked — a
  // subgroup always follows its ministry's visibility, never set separately.
  const isMinistryVisible = useCallback((tagId: string): boolean =>
    !visibleMinistryIds || visibleMinistryIds.has(rootAncestorId(tagId)), [visibleMinistryIds, rootAncestorId])

  /* ── load a week: instances → ministries → canonical metrics → prefill ── */
  const loadWeek = useCallback(async () => {
    if (!churchId || !campus) return
    setWeekLoading(true)
    setWeekLoadError(false)
    const start = weekStartStr
    const end = toDateStr(addDays(weekStart, 6))

    // E-6 / QP-ENTRIES-WEEK — week's instances for this campus PLUS church-wide
    // (location_id IS NULL = one shared occurrence visible at every campus, 0036).
    const { data: instRows } = await supabase
      .from('service_instances')
      .select('id, service_date, service_template_id, start_datetime, service_templates(display_name)')
      .eq('church_id', churchId)
      .or(`location_id.eq.${campus.id},location_id.is.null`)
      .eq('status', 'active')
      .gte('service_date', start)
      .lte('service_date', end)
      .order('service_date', { ascending: true })
      .order('start_datetime', { ascending: true, nullsFirst: true })

    const rawInstancesAll = (instRows ?? []).map((r: any) => ({
      id: r.id as string,
      service_date: r.service_date as string,
      template_id: r.service_template_id as string,
      start_datetime: (r.start_datetime as string | null) ?? null,
      template_name: (Array.isArray(r.service_templates) ? r.service_templates[0]?.display_name : r.service_templates?.display_name) ?? 'Service',
    }))

    // Templates visible on the entry screen: this campus + church-wide, active,
    // and show_in_entries (EN2). Pre-0036 the column doesn't exist — selecting it
    // errors → fall back without it and treat every template as visible.
    type TmplRow = { id: string; display_name: string | null; location_id: string | null; show_in_entries?: boolean }
    let tmplRowsRaw: TmplRow[] = []
    {
      const withCol = await supabase
        .from('service_templates')
        .select('id, display_name, location_id, show_in_entries')
        .eq('church_id', churchId)
        .or(`location_id.eq.${campus.id},location_id.is.null`)
        .eq('is_active', true)
      if (!withCol.error && withCol.data) {
        tmplRowsRaw = (withCol.data as TmplRow[]).filter(t => t.show_in_entries !== false)
      } else {
        const noCol = await supabase
          .from('service_templates')
          .select('id, display_name, location_id')
          .eq('church_id', churchId)
          .or(`location_id.eq.${campus.id},location_id.is.null`)
          .eq('is_active', true)
        tmplRowsRaw = ((noCol.data ?? []) as TmplRow[])
      }
    }
    const visibleTmplIds = new Set(tmplRowsRaw.map(t => t.id))
    const churchWideTmplIds = new Set(tmplRowsRaw.filter(t => t.location_id === null).map(t => t.id))
    setChurchWideTmpl(churchWideTmplIds)

    // Only instances of visible templates render (a retired or hidden service
    // keeps its History; it just stops appearing here — EN2/SE8).
    const rawInstances = rawInstancesAll.filter(i => visibleTmplIds.has(i.template_id))

    // Schedule-derived expected services for this week (E-70) — campus +
    // church-wide. Any week the schedule says a service runs is shown as an
    // enterable occurrence even with no row yet; the row is created on the
    // first entry (materializeVirtual). A missed/forgotten week is never lost.
    const schedTmplName = new Map(tmplRowsRaw.map(t => [t.id, t.display_name ?? 'Service']))
    const schedTmplIds = tmplRowsRaw.map(t => t.id)
    const expected: Array<{ template_id: string; service_date: string }> = []
    if (schedTmplIds.length > 0) {
      const { data: schedRows } = await supabase
        .from('service_schedule_versions')
        .select('service_template_id, day_of_week, effective_start_date, effective_end_date')
        .in('service_template_id', schedTmplIds).eq('is_active', true)
      for (const s of (schedRows ?? []) as Array<{ service_template_id: string; day_of_week: number; effective_start_date: string | null; effective_end_date: string | null }>) {
        const date = toDateStr(addDays(weekStart, s.day_of_week))   // weekStart = Sunday, day_of_week 0=Sun
        if (s.effective_start_date && date < s.effective_start_date) continue
        if (s.effective_end_date && date > s.effective_end_date) continue
        expected.push({ template_id: s.service_template_id, service_date: date })
      }
    }
    const haveKey = new Set(rawInstances.map(i => `${i.template_id}|${i.service_date}`))
    const virtualExpected = expected.filter(e => !haveKey.has(`${e.template_id}|${e.service_date}`))

    // QP-ENTRIES-MINISTRIES — ministries per template (materialized + scheduled)
    const templateIds = Array.from(new Set([...rawInstances.map(i => i.template_id), ...virtualExpected.map(e => e.template_id)]))
    const ministriesByTemplate = new Map<string, Ministry[]>()

    if (templateIds.length > 0) {
      const { data: sttRows } = await supabase
        .from('service_template_tags')
        .select('service_template_id, ministry_tag_id, sort_order, service_tags(id, name, tag_role, archived_at, parent_tag_id)')
        .in('service_template_id', templateIds)
        .order('sort_order', { ascending: true })

      // QP-ENTRIES-CANONICAL-METRICS — canonical instance metrics for all ministry tags
      const tagIds = Array.from(new Set((sttRows ?? []).map((r: any) => r.ministry_tag_id)))
      const metricsByTag = new Map<string, Metric[]>()
      if (tagIds.length > 0) {
        const { data: metricRows } = await supabase
          .from('metrics')
          .select('id, name, code, scope, is_canonical, cadence, ministry_tag_id, reporting_tags(code)')
          .eq('church_id', churchId)
          .eq('scope', 'instance')
          .eq('is_active', true)
          .neq('mode', 'rollup')   // roll-ups are computed (Phase B), not typed here
          .is('archived_at', null) // archived counts keep history but accept no new data (decision 9)
          .in('ministry_tag_id', tagIds)
        for (const m of (metricRows ?? []) as any[]) {
          const metric: Metric = {
            id: m.id, name: m.name, code: m.code, scope: 'instance',
            is_canonical: m.is_canonical, cadence: m.cadence, ministry_tag_id: m.ministry_tag_id,
            reporting_tag_code: Array.isArray(m.reporting_tags) ? m.reporting_tags[0]?.code ?? null : m.reporting_tags?.code ?? null,
          }
          if (!metric.ministry_tag_id) continue
          const list = metricsByTag.get(metric.ministry_tag_id) ?? []
          list.push(metric)
          metricsByTag.set(metric.ministry_tag_id, list)
        }
      }

      for (const r of (sttRows ?? []) as any[]) {
        const tag = Array.isArray(r.service_tags) ? r.service_tags[0] : r.service_tags
        if (!tag) continue
        if (tag.archived_at) continue   // archived ministry/group: keep history, hide from entry (decision 9)
        const list = ministriesByTemplate.get(r.service_template_id) ?? []
        list.push({
          tag_id: tag.id,
          name: tag.name,
          tag_role: tag.tag_role ?? null,
          sort_order: r.sort_order ?? 0,
          parent_tag_id: tag.parent_tag_id ?? null,
          metrics: metricsByTag.get(tag.id) ?? [],
        })
        ministriesByTemplate.set(r.service_template_id, list)
      }
    }

    const builtInstances: Instance[] = rawInstances.map(i => ({
      ...i,
      ministries: ministriesByTemplate.get(i.template_id) ?? [],
      church_wide: churchWideTmplIds.has(i.template_id),
    }))

    // Virtual (not-yet-created) occurrences for scheduled services this week.
    // id = `virtual:<templateId>:<YYYY-MM-DD>` — materialized on first entry.
    const virtualInstances: Instance[] = virtualExpected.map(e => ({
      id: `virtual:${e.template_id}:${e.service_date}`,
      service_date: e.service_date,
      template_id: e.template_id,
      template_name: schedTmplName.get(e.template_id) ?? 'Service',
      start_datetime: null,
      ministries: ministriesByTemplate.get(e.template_id) ?? [],
      church_wide: churchWideTmplIds.has(e.template_id),
    }))
    // Campus occurrences first, church-wide after (EN1 — the tab strip renders
    // a divider at the boundary); date/time order within each group.
    const allInstances: Instance[] = [...builtInstances, ...virtualInstances].sort((a, b) =>
      a.church_wide !== b.church_wide ? (a.church_wide ? 1 : -1)
        : a.service_date < b.service_date ? -1 : a.service_date > b.service_date ? 1
        : (a.start_datetime ?? '') < (b.start_datetime ?? '') ? -1 : 1)

    // ── Prefill existing metric_entries (N-7: paginate past 1000) ─────────
    const instIds = builtInstances.map(i => i.id)
    const nextEntries: EntryMap = {}

    // #29 — a failed/partial prefill must not silently render as "no data entered".
    let prefillFailed = false

    if (instIds.length > 0) {
      let from = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: rows, error: prefillError } = await supabase
          .from('metric_entries')
          .select('metric_id, service_instance_id, value, is_not_applicable')
          .eq('church_id', churchId)
          .in('service_instance_id', instIds)
          .range(from, from + PAGE - 1)
        if (prefillError) { prefillFailed = true; break }
        const batch = rows ?? []
        for (const r of batch as any[]) {
          nextEntries[`${r.metric_id}|${r.service_instance_id}`] = {
            value: r.value === null ? null : Number(r.value),
            is_not_applicable: !!r.is_not_applicable,
          }
        }
        if (batch.length < PAGE) break
        from += PAGE
      }
    }

    // period-metric prefill for the relevant anchors (week/month/day → weekStart)
    const periodInWeek = periodMetrics
    if (periodInWeek.length > 0) {
      const anchors = Array.from(new Set(periodInWeek.map(m => m.cadence === 'month' ? firstOfMonth(weekStart) : start)))
      const { data: pRows, error: periodPrefillError } = await supabase
        .from('metric_entries')
        .select('metric_id, period_anchor, value, is_not_applicable')
        .eq('church_id', churchId)
        .in('metric_id', periodInWeek.map(m => m.id))
        .in('period_anchor', anchors)
      if (periodPrefillError) prefillFailed = true
      for (const r of (pRows ?? []) as any[]) {
        nextEntries[`${r.metric_id}|${r.period_anchor}`] = {
          value: r.value === null ? null : Number(r.value),
          is_not_applicable: !!r.is_not_applicable,
        }
      }
    }

    setInstances(allInstances)
    setEntries(nextEntries)
    setWeekLoading(false)
    setWeekLoadError(prefillFailed)

    // Default to entry (first occurrence), not a summary; keep the tab valid as
    // the week changes. Totals is now a header toggle, not a tab.
    setTab(prev => {
      if (prev === 'Stat Entries') return prev
      if (allInstances.some(i => i.id === prev)) return prev
      return allInstances[0]?.id ?? 'Stat Entries'
    })
  }, [supabase, churchId, campus, weekStart, weekStartStr, periodMetrics])

  useEffect(() => { loadWeek() }, [loadWeek])

  // Materialize a schedule-derived (virtual) occurrence on first write — creates
  // the real service_instance via the server route (owner/admin-gated, LD-1),
  // then swaps the virtual id for the real one in state. Returns the real id.
  // For an already-real id it's a no-op passthrough.
  const materializeVirtual = useCallback(async (instId: string): Promise<string> => {
    if (!instId.startsWith('virtual:') || !churchId || !campus) return instId
    const parts = instId.split(':')          // ['virtual', templateId, 'YYYY-MM-DD']
    // Church-wide template (0036) → the shared occurrence carries NO campus (EN3);
    // the server re-verifies the template really is church-wide before accepting NULL.
    const isChurchWide = churchWideTmpl.has(parts[1])
    const res = await fetch('/api/occurrences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: churchId, service_template_id: parts[1], service_date: parts[2], location_id: isChurchWide ? null : campus.id }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error === 'Forbidden' ? 'You have view-only access — ask an editor or admin to enter this.' : 'Could not start this service.')
    }
    const { occurrence_id } = await res.json()
    setInstances(list => list.map(i => (i.id === instId ? { ...i, id: occurrence_id as string } : i)))
    setTab(t => (t === instId ? (occurrence_id as string) : t))
    return occurrence_id as string
  }, [churchId, campus, churchWideTmpl])

  /** EN3 — entry rows against a church-wide occurrence carry NO campus.
   *  Virtual ids embed the template (`virtual:<tmpl>:<date>`), so this stays
   *  correct even after materializeVirtual swaps the id in state. */
  const locationForInst = useCallback((instId: string): string | null => {
    const tmplId = instId.startsWith('virtual:') ? instId.split(':')[1] : instances.find(i => i.id === instId)?.template_id
    if (tmplId && churchWideTmpl.has(tmplId)) return null
    return campus?.id ?? null
  }, [instances, churchWideTmpl, campus])

  /* ── autosave (E-40 / DS-11 / N-2): optimistic upsert on uq_metric_entry ─ */
  const upsertInstance = useCallback(async (metric: Metric, instId: string, value: number | null) => {
    if (!churchId) throw new Error('no church')
    const realId = await materializeVirtual(instId)   // create the occurrence if this is a scheduled (virtual) one
    const key = `${metric.id}|${realId}`
    const prev = entries[key]
    // optimistic
    setEntries(e => ({ ...e, [key]: { value, is_not_applicable: false } }))
    const { error } = await supabase.from('metric_entries').upsert({
      church_id: churchId,
      metric_id: metric.id,
      service_instance_id: realId,
      period_anchor: null,
      value,
      is_not_applicable: false,
      reporting_tag_code: metric.reporting_tag_code,
      location_id: locationForInst(instId),
    }, { onConflict: 'metric_id,service_instance_id,period_anchor' })
    if (error) {
      setEntries(e => ({ ...e, [key]: prev ?? { value: null, is_not_applicable: false } }))
      throw error
    }
  }, [supabase, churchId, entries, materializeVirtual, locationForInst])

  const upsertPeriod = useCallback(async (metric: Metric, anchor: string, value: number | null) => {
    if (!churchId) throw new Error('no church')
    const key = `${metric.id}|${anchor}`
    const prev = entries[key]
    setEntries(e => ({ ...e, [key]: { value, is_not_applicable: false } }))
    const { error } = await supabase.from('metric_entries').upsert({
      church_id: churchId,
      metric_id: metric.id,
      service_instance_id: null,
      period_anchor: anchor,
      value,
      is_not_applicable: false,
      reporting_tag_code: metric.reporting_tag_code,
      location_id: null, // church-wide (O-3 MVP)
    }, { onConflict: 'metric_id,service_instance_id,period_anchor' })
    if (error) {
      setEntries(e => ({ ...e, [key]: prev ?? { value: null, is_not_applicable: false } }))
      throw error
    }
  }, [supabase, churchId, entries])

  // Per-metric "not available" — the explicit version of leaving a single field
  // blank. Same meaning (didn't happen), but marks it reviewed so the ministry's
  // status dot can reach green without every field needing a typed value.
  const toggleFieldNAInstance = useCallback(async (metric: Metric, instId: string, na: boolean) => {
    if (!churchId || readOnly) return
    const realId = await materializeVirtual(instId)
    const key = `${metric.id}|${realId}`
    const prev = entries[key]
    setEntries(e => ({ ...e, [key]: { value: null, is_not_applicable: na } }))
    const { error } = await supabase.from('metric_entries').upsert({
      church_id: churchId,
      metric_id: metric.id,
      service_instance_id: realId,
      period_anchor: null,
      value: null,
      is_not_applicable: na,
      reporting_tag_code: metric.reporting_tag_code,
      location_id: locationForInst(instId),
    }, { onConflict: 'metric_id,service_instance_id,period_anchor' })
    if (error) {
      setEntries(e => ({ ...e, [key]: prev ?? { value: null, is_not_applicable: false } }))
      throw error
    }
  }, [supabase, churchId, entries, readOnly, materializeVirtual, locationForInst])

  const toggleFieldNAPeriod = useCallback(async (metric: Metric, anchor: string, na: boolean) => {
    if (!churchId || readOnly) return
    const key = `${metric.id}|${anchor}`
    const prev = entries[key]
    setEntries(e => ({ ...e, [key]: { value: null, is_not_applicable: na } }))
    const { error } = await supabase.from('metric_entries').upsert({
      church_id: churchId,
      metric_id: metric.id,
      service_instance_id: null,
      period_anchor: anchor,
      value: null,
      is_not_applicable: na,
      reporting_tag_code: metric.reporting_tag_code,
      location_id: null,
    }, { onConflict: 'metric_id,service_instance_id,period_anchor' })
    if (error) {
      setEntries(e => ({ ...e, [key]: prev ?? { value: null, is_not_applicable: false } }))
      throw error
    }
  }, [supabase, churchId, entries, readOnly])

  // E-24 "Didn't meet?" — set all this ministry's canonical metrics N/A on this occurrence
  const toggleDidntMeet = useCallback(async (m: Ministry, instId: string, na: boolean) => {
    if (!churchId || readOnly) return
    const realId = await materializeVirtual(instId)   // create the occurrence if scheduled (virtual)
    const prior: EntryMap = {}
    const optimistic: EntryMap = {}
    for (const metric of m.metrics) {
      const key = `${metric.id}|${realId}`
      prior[key] = entries[key] ?? { value: null, is_not_applicable: false }
      optimistic[key] = { value: na ? null : (entries[key]?.value ?? null), is_not_applicable: na }
    }
    setEntries(e => ({ ...e, ...optimistic }))
    const payload = m.metrics.map(metric => ({
      church_id: churchId,
      metric_id: metric.id,
      service_instance_id: realId,
      period_anchor: null,
      value: na ? null : (entries[`${metric.id}|${realId}`]?.value ?? null),
      is_not_applicable: na,
      reporting_tag_code: metric.reporting_tag_code,
      location_id: locationForInst(instId),
    }))
    const { error } = await supabase.from('metric_entries').upsert(payload, { onConflict: 'metric_id,service_instance_id,period_anchor' })
    if (error) {
      setEntries(e => ({ ...e, ...prior }))
      alert('Could not save — please try again.')
    }
  }, [supabase, churchId, entries, readOnly, materializeVirtual, locationForInst])

  /* ── grid_config include-in-total prefs (E-12 / N-8) ────────────────────── */
  const saveGridPrefs = useCallback(async (patch: GridPrefs) => {
    if (!churchId) return
    const prev = gridPrefs
    const next = { ...gridPrefs, ...patch }
    setGridPrefs(next)
    const res = await saveChurchPrefs(supabase, churchId, next as Record<string, unknown>)
    if (!res.ok) {
      setGridPrefs(prev)
      console.error('Failed to save grid prefs:', res.message)
    }
  }, [supabase, churchId, gridPrefs])

  // ── derived: all ministries across the week (deduped by tag) for Totals ──
  // Honors the "Ministries" screen filter — a hidden ministry's totals hide too.
  const weekMinistries = useMemo(() => {
    const byTag = new Map<string, Ministry>()
    for (const inst of instances) for (const m of inst.ministries) if (!byTag.has(m.tag_id) && isMinistryVisible(m.tag_id)) byTag.set(m.tag_id, m)
    return Array.from(byTag.values()).sort((a, b) => a.sort_order - b.sort_order)
  }, [instances, isMinistryVisible])

  const excluded = new Set(gridPrefs.excludedTotalMinistries ?? [])
  const excludedMetrics = new Set(gridPrefs.excludedTotalMetrics ?? [])

  // E-13 ministry rollups: attendance summed across week's occurrences + other canonical metrics
  const rollups = useMemo(() => {
    return weekMinistries.map(m => {
      const rows: { label: string; value: number; sub?: string; reporting_tag_code: string }[] = []
      // group metrics by reporting tag for ordered output: ATTENDANCE first, then volunteers subtotal, then others
      const att = m.metrics.filter(x => x.reporting_tag_code === 'ATTENDANCE')
      const vols = m.metrics.filter(x => x.reporting_tag_code === 'VOLUNTEERS')
      const others = m.metrics.filter(x => x.reporting_tag_code !== 'ATTENDANCE' && x.reporting_tag_code !== 'VOLUNTEERS')

      const sumAcrossWeek = (metric: Metric) =>
        instances.reduce((s, inst) => {
          const e = entries[`${metric.id}|${inst.id}`]
          return s + (e && !e.is_not_applicable && e.value !== null ? e.value : 0)
        }, 0)

      let attVal = 0
      const attSittings = instances.filter(i => i.ministries.some(mm => mm.tag_id === m.tag_id)).length
      for (const a of att) attVal += sumAcrossWeek(a)
      rows.push({ label: 'Attendance', value: attVal, sub: attSittings > 1 ? `${attSittings} sittings` : undefined, reporting_tag_code: 'ATTENDANCE' })

      let volVal = 0
      if (vols.length > 0) {
        for (const v of vols) volVal += sumAcrossWeek(v)
        rows.push({ label: 'Volunteers', value: volVal, reporting_tag_code: 'VOLUNTEERS' })
      }
      for (const o of others) rows.push({ label: o.name, value: sumAcrossWeek(o), reporting_tag_code: o.reporting_tag_code ?? '' })

      let attTotal = 0
      if (!excludedMetrics.has(`${m.tag_id}|ATTENDANCE`)) attTotal += attVal
      if (!excludedMetrics.has(`${m.tag_id}|VOLUNTEERS`)) attTotal += volVal

      return { ministry: m, rows, attTotal, attVal, volVal }
    })
  }, [weekMinistries, instances, entries, excludedMetrics])

  // Legacy fallback: if excluded.has(tag_id), drop the whole ministry. Otherwise use the granular attTotal.
  const grandTotal = rollups.reduce((s, r) => s + (excluded.has(r.ministry.tag_id) ? 0 : r.attTotal), 0)

  /* ── completion strip (E-4) ────────────────────────────────────────────── */
  // Occurrences with no enterable inputs (rollup-only containers) return null and
  // are dropped from the tally entirely — they neither add to the denominator nor
  // read as a false-green "complete".
  // #31 — the "X of Y complete" strip is a truth surface for the WHOLE week, so it
  // always counts every ministry regardless of the "Ministries" screen filter. A
  // ministry hidden by the filter must not be able to silently drop out of the
  // denominator and make an incomplete occurrence read as done. The per-tab Dot
  // (below, in the tab strip) still honors the filter — that's "what's on this tab".
  const occStatuses = useMemo(
    () => instances.map(i => instanceStatus(i, entries)),
    [instances, entries],
  )

  const statEntriesStatus: Stat | null = useMemo(() => {
    if (periodMetrics.length === 0) return null   // nothing church-wide to enter → not a tally member
    let done = 0
    for (const m of periodMetrics) {
      const anchor = m.cadence === 'month' ? firstOfMonth(weekStart) : weekStartStr
      const e = entries[`${m.id}|${anchor}`]
      if (e && (e.is_not_applicable || e.value !== null)) done++
    }
    return done === 0 ? 'empty' : done === periodMetrics.length ? 'complete' : 'needs'
  }, [periodMetrics, entries, weekStart, weekStartStr])

  // Honest "X of Y": only sections that actually have something to enter count.
  const tallyStatuses = [...occStatuses, statEntriesStatus].filter((s): s is Stat => s !== null)
  const totalSections = tallyStatuses.length
  const completeSections = tallyStatuses.filter(s => s === 'complete').length

  // Entry tabs grouped by WHEN they happen — dated services by day-of-week, and the
  // church-wide period things under a CADENCE label ("Weekly", or "Monthly" when the
  // church-wide stats are monthly). Replaces the flat strip + the "Church-wide" divider.
  const tabGroups = useMemo(() => {
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const byDay = new Map<number, Instance[]>()
    const weekly: Instance[] = []
    for (const inst of instances) {
      // The Ministries filter also filters OCCURRENCES: hide a service whose
      // ministries are all filtered out — its tab would just open an empty screen.
      if (visibleMinistryIds && !inst.ministries.some(m => isMinistryVisible(m.tag_id))) continue
      if (inst.church_wide) { weekly.push(inst); continue }
      const dow = fromDateStr(inst.service_date).getDay()
      const arr = byDay.get(dow) ?? []
      arr.push(inst); byDay.set(dow, arr)
    }
    const groups: { label: string; instances: Instance[]; includeStat: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      const list = byDay.get(d)
      if (list && list.length) groups.push({ label: DAY_NAMES[d], instances: list, includeStat: false })
    }
    // Church-wide occurrences + the period Stat Entries. Label by cadence: "Monthly"
    // only when every church-wide stat is monthly, otherwise "Weekly" (the common case;
    // each metric also carries its own cadence badge inside Stat Entries).
    const cadences = new Set(periodMetrics.map(m => m.cadence ?? 'week'))
    const periodLabel = cadences.size > 0 && cadences.has('month') && !cadences.has('week') && !cadences.has('day')
      ? 'Monthly'
      : 'Weekly'
    groups.push({ label: periodLabel, instances: weekly, includeStat: true })
    return groups
  }, [instances, periodMetrics, visibleMinistryIds, isMinistryVisible])

  // If the ministry filter hides the occurrence that's currently open, jump to the
  // first still-visible one (or Stat Entries) so the body always matches the strip.
  useEffect(() => {
    if (tab === 'Stat Entries') return
    const shown = tabGroups.flatMap(g => g.instances)
    if (!shown.some(i => i.id === tab)) setTab(shown[0]?.id ?? 'Stat Entries')
  }, [tabGroups, tab])

  if (bootLoading) {
    return (
      <AppLayout role={role}>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
          <div className="mt-6 space-y-4">{[1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        </div>
      </AppLayout>
    )
  }
  if (!church) return null

  return (
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* ── Zone A — Header (E-1/E-2/E-3) ─────────────────────────────── */}
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl font-num text-sm font-bold text-white shadow-sm" style={{ background: '#4F6EF7' }}>ST</span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>Entries</div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">{church.name}</h1>
                  {campus && (
                    <span title="Campus is selected on the Locations page" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-600">
                      <Ico.pin className="h-3.5 w-3.5 text-[#4F6EF7]" />{campus.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* History link → past weeks (E-3b) */}
              <a href="/history" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors duration-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-400"><path d="M12 8v4l3 2" /><path d="M3.05 11a9 9 0 1 1 .5 4M3 11V6m0 5h5" /></svg>
                History
              </a>
              {/* E-3 — week navigator */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button aria-label="Previous week" onClick={() => setWeekStart(w => addDays(w, -7))} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"><Ico.left className="h-4 w-4" /></button>
                <span className="flex items-center gap-1.5 px-2 text-[13px] font-semibold text-slate-700"><Ico.calendar className="h-4 w-4 text-slate-400" />Week of {fmtWeek(weekStart)}</span>
                <button aria-label="Next week" onClick={() => setWeekStart(w => addDays(w, 7))} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"><Ico.right className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          {/* ── Zone B — Week-totals toggle + ministry filter + completion strip ─ */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTotals(s => !s)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 shadow-sm transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
              >
                {showTotals
                  ? (<><Ico.left className="h-4 w-4" />Back to entry</>)
                  : (<><Ico.grid className="h-4 w-4 text-slate-400" />Week totals</>)}
              </button>
              <MinistryFilterButton ministries={rootMinistries} selected={visibleMinistryIds} onChange={setVisibleMinistryIds} />
            </div>
            <span className="text-[12px] font-medium text-slate-500">
              <span className="font-num font-semibold text-slate-700">{completeSections} of {totalSections}</span> complete
              {visibleMinistryIds !== null && <span className="text-slate-400"> · all ministries</span>}
            </span>
          </div>

          {showTotals ? (
            /* ── Week totals — moved out of the entry tabs (review, not entry) ── */
            <TotalsView
              weekLabel={fmtWeek(weekStart)}
              grandTotal={grandTotal}
              rollups={rollups}
              excluded={excluded}
              excludedMetrics={excludedMetrics}
              readOnly={!canEditTotals}
              onSavePrefs={saveGridPrefs}
              colorForNode={colorForNode}
            />
          ) : (
            <>
              {weekLoadError && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-700">
                  <Ico.info className="h-4 w-4 shrink-0" />
                  Some of this week’s saved entries couldn’t be loaded — what you see below may be incomplete. Refresh to try again before entering new numbers.
                </div>
              )}
              {/* ── Zone C — entry tabs, grouped by WHEN they happen ───────── */}
              <div className="mb-6 space-y-3">
                {tabGroups.map(group => (group.instances.length > 0 || group.includeStat) && (
                  <div key={group.label} className="flex items-center gap-2">
                    <div className="w-16 shrink-0 px-1 text-right text-[11px] font-semibold uppercase tracking-wide leading-tight text-slate-400">{group.label}</div>
                    <div role="tablist" className="flex flex-1 flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                      {group.instances.map(inst => {
                        const active = tab === inst.id
                        return (
                          <button key={inst.id} role="tab" aria-selected={active} onClick={() => setTab(inst.id)}
                            style={active ? { background: '#4F6EF7' } : undefined}
                            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-200 ${active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                            <Dot s={instanceStatus(inst, entries, isMinistryVisible) ?? 'empty'} />
                            <span className="leading-none">{inst.template_name}</span>
                          </button>
                        )
                      })}
                      {group.includeStat && (
                        <button role="tab" aria-selected={tab === 'Stat Entries'} onClick={() => setTab('Stat Entries')}
                          style={tab === 'Stat Entries' ? { background: '#4F6EF7' } : undefined}
                          className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-200 ${tab === 'Stat Entries' ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                          <Dot s={statEntriesStatus ?? 'empty'} />
                          <span className="leading-none">Stat Entries</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {weekLoading ? (
                <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />)}</div>
              ) : (
                <>
                  {/* ── Zone E — OCCURRENCE (E-20..E-25) ──────────────────────── */}
                  {instances.map(inst => tab === inst.id && (
                    <OccurrenceView key={inst.id} inst={inst} entries={entries} readOnly={readOnly}
                      onCommit={upsertInstance} onToggleDidntMeet={toggleDidntMeet} onToggleNA={toggleFieldNAInstance}
                      colorForNode={colorForNode} isVisible={isMinistryVisible} />
                  ))}

                  {/* ── Zone F — STAT ENTRIES (E-30..E-32) ────────────────────── */}
                  {tab === 'Stat Entries' && (
                    <StatEntriesView metrics={periodMetrics} entries={entries} weekStart={weekStart}
                      weekStartStr={weekStartStr} readOnly={readOnly} status={statEntriesStatus ?? 'empty'}
                      onCommit={upsertPeriod} onToggleNA={toggleFieldNAPeriod} />
                  )}

                  <div className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-slate-400">
                    <Ico.check className="h-3.5 w-3.5 text-[#22C55E]" /> {readOnly ? 'Read-only view' : 'Entered values save automatically'}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </AppLayout>
  )
}
