'use client'

// ─────────────────────────────────────────────────────────────────────────
// ENTRIES — /(app)/entries — task #36 weekly/period data entry hub.
// Build spec: IRIS_ENTRIES_ELEMENT_MAP.md (E-1..E-50).  UI rules: DESIGN_SYSTEM.md.
// Visual reference (NOT wired): src/app/mockup/weekly-entry/page.tsx.
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
import type { Church, UserRole } from '@/types'
import { Dot, Field, Ico, accentForRole, fmt, roleLabel, type Stat } from './ui'

/* ── domain types (local) ─────────────────────────────────────────────── */
interface Metric {
  id: string
  name: string
  code: string
  scope: 'instance' | 'period'
  is_canonical: boolean
  cadence: 'day' | 'week' | 'month' | null
  ministry_tag_id: string | null
  reporting_tag_code: string | null
}
interface Ministry {
  tag_id: string
  name: string
  tag_role: string | null
  sort_order: number
  metrics: Metric[]      // canonical instance metrics for this ministry
}
interface Instance {
  id: string
  service_date: string
  template_id: string
  template_name: string
  start_datetime: string | null
  ministries: Ministry[]
}
// entries keyed by `${metric_id}|${service_instance_id}` (instance) or `${metric_id}|${period_anchor}` (period)
type EntryMap = Record<string, { value: number | null; is_not_applicable: boolean }>

interface GridPrefs { excludedTotalMinistries?: string[] }

const PAGE = 1000  // PostgREST cap — paginate past it (N-7)

/* ── date helpers (client-side, browser-local is fine per task note) ────── */
function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function sundayOf(d: Date) { return addDays(d, -d.getDay()) } // getDay(): 0 = Sunday
function fromDateStr(s: string) { return new Date(s + 'T12:00:00') }
function fmtWeek(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
function fmtTabLabel(inst: Instance) {
  if (inst.start_datetime) {
    const t = new Date(inst.start_datetime)
    return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return inst.template_name
}
function firstOfMonth(d: Date) { return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)) }
function cadenceLabel(c: Metric['cadence']) {
  if (c === 'day') return 'Daily'
  if (c === 'month') return 'Monthly'
  return 'Weekly'
}

/* ── completion (N-6) ──────────────────────────────────────────────────── */
function ministryStatus(m: Ministry, instId: string, entries: EntryMap): Stat {
  // completion is measured against REQUIRED (canonical) metrics only — non-canonical
  // metrics still render for entry but don't gate "complete"
  const canon = m.metrics.filter(x => x.is_canonical)
  if (canon.length === 0) return 'complete'
  let done = 0
  for (const metric of canon) {
    const e = entries[`${metric.id}|${instId}`]
    if (e && (e.is_not_applicable || e.value !== null)) done++
  }
  if (done === 0) return 'empty'
  if (done === canon.length) return 'complete'
  return 'needs'
}
function instanceStatus(inst: Instance, entries: EntryMap): Stat {
  if (inst.ministries.length === 0) return 'complete'
  const statuses = inst.ministries.map(m => ministryStatus(m, inst.id, entries))
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
  const [periodMetrics, setPeriodMetrics] = useState<Metric[]>([])
  const [entries, setEntries] = useState<EntryMap>({})

  const [bootLoading, setBootLoading] = useState(true)
  const [weekLoading, setWeekLoading] = useState(true)
  const [tab, setTab] = useState<string>('Totals')

  const readOnly = role === 'viewer'
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
      setGridPrefs(((churchData as { grid_config?: GridPrefs })?.grid_config as GridPrefs) ?? {})

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

  /* ── load a week: instances → ministries → canonical metrics → prefill ── */
  const loadWeek = useCallback(async () => {
    if (!churchId || !campus) return
    setWeekLoading(true)
    const start = weekStartStr
    const end = toDateStr(addDays(weekStart, 6))

    // E-6 / QP-ENTRIES-WEEK — week's instances for this campus
    const { data: instRows } = await supabase
      .from('service_instances')
      .select('id, service_date, service_template_id, start_datetime, service_templates(display_name)')
      .eq('church_id', churchId)
      .eq('location_id', campus.id)
      .eq('status', 'active')
      .gte('service_date', start)
      .lte('service_date', end)
      .order('service_date', { ascending: true })
      .order('start_datetime', { ascending: true, nullsFirst: true })

    const rawInstances = (instRows ?? []).map((r: any) => ({
      id: r.id as string,
      service_date: r.service_date as string,
      template_id: r.service_template_id as string,
      start_datetime: (r.start_datetime as string | null) ?? null,
      template_name: (Array.isArray(r.service_templates) ? r.service_templates[0]?.display_name : r.service_templates?.display_name) ?? 'Service',
    }))

    // QP-ENTRIES-MINISTRIES — ministries per template (cache per template)
    const templateIds = Array.from(new Set(rawInstances.map(i => i.template_id)))
    const ministriesByTemplate = new Map<string, Ministry[]>()

    if (templateIds.length > 0) {
      const { data: sttRows } = await supabase
        .from('service_template_tags')
        .select('service_template_id, ministry_tag_id, sort_order, service_tags(id, name, tag_role)')
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
        const list = ministriesByTemplate.get(r.service_template_id) ?? []
        list.push({
          tag_id: tag.id,
          name: tag.name,
          tag_role: tag.tag_role ?? null,
          sort_order: r.sort_order ?? 0,
          metrics: metricsByTag.get(tag.id) ?? [],
        })
        ministriesByTemplate.set(r.service_template_id, list)
      }
    }

    const builtInstances: Instance[] = rawInstances.map(i => ({
      ...i,
      ministries: ministriesByTemplate.get(i.template_id) ?? [],
    }))

    // ── Prefill existing metric_entries (N-7: paginate past 1000) ─────────
    const instIds = builtInstances.map(i => i.id)
    const nextEntries: EntryMap = {}

    if (instIds.length > 0) {
      let from = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: rows } = await supabase
          .from('metric_entries')
          .select('metric_id, service_instance_id, value, is_not_applicable')
          .eq('church_id', churchId)
          .in('service_instance_id', instIds)
          .range(from, from + PAGE - 1)
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
      const { data: pRows } = await supabase
        .from('metric_entries')
        .select('metric_id, period_anchor, value, is_not_applicable')
        .eq('church_id', churchId)
        .in('metric_id', periodInWeek.map(m => m.id))
        .in('period_anchor', anchors)
      for (const r of (pRows ?? []) as any[]) {
        nextEntries[`${r.metric_id}|${r.period_anchor}`] = {
          value: r.value === null ? null : Number(r.value),
          is_not_applicable: !!r.is_not_applicable,
        }
      }
    }

    setInstances(builtInstances)
    setEntries(nextEntries)
    setWeekLoading(false)

    // keep current tab valid: if a closed occurrence tab, fall back to Totals (N-3)
    setTab(prev => {
      if (prev === 'Totals' || prev === 'Stat Entries') return prev
      return builtInstances.some(i => i.id === prev) ? prev : 'Totals'
    })
  }, [supabase, churchId, campus, weekStart, weekStartStr, periodMetrics])

  useEffect(() => { loadWeek() }, [loadWeek])

  /* ── autosave (E-40 / DS-11 / N-2): optimistic upsert on uq_metric_entry ─ */
  const upsertInstance = useCallback(async (metric: Metric, instId: string, value: number | null) => {
    if (!churchId) throw new Error('no church')
    const key = `${metric.id}|${instId}`
    const prev = entries[key]
    // optimistic
    setEntries(e => ({ ...e, [key]: { value, is_not_applicable: false } }))
    const { error } = await supabase.from('metric_entries').upsert({
      church_id: churchId,
      metric_id: metric.id,
      service_instance_id: instId,
      period_anchor: null,
      value,
      is_not_applicable: false,
      reporting_tag_code: metric.reporting_tag_code,
      location_id: campus?.id ?? null,
    }, { onConflict: 'metric_id,service_instance_id,period_anchor' })
    if (error) {
      setEntries(e => ({ ...e, [key]: prev ?? { value: null, is_not_applicable: false } }))
      throw error
    }
  }, [supabase, churchId, campus, entries])

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

  // E-24 "Didn't meet?" — set all this ministry's canonical metrics N/A on this occurrence
  const toggleDidntMeet = useCallback(async (m: Ministry, instId: string, na: boolean) => {
    if (!churchId || readOnly) return
    const optimistic: EntryMap = {}
    for (const metric of m.metrics) {
      optimistic[`${metric.id}|${instId}`] = { value: na ? null : (entries[`${metric.id}|${instId}`]?.value ?? null), is_not_applicable: na }
    }
    setEntries(e => ({ ...e, ...optimistic }))
    const payload = m.metrics.map(metric => ({
      church_id: churchId,
      metric_id: metric.id,
      service_instance_id: instId,
      period_anchor: null,
      value: na ? null : (entries[`${metric.id}|${instId}`]?.value ?? null),
      is_not_applicable: na,
      reporting_tag_code: metric.reporting_tag_code,
      location_id: campus?.id ?? null,
    }))
    await supabase.from('metric_entries').upsert(payload, { onConflict: 'metric_id,service_instance_id,period_anchor' })
  }, [supabase, churchId, campus, entries, readOnly])

  /* ── grid_config include-in-total prefs (E-12 / N-8) ────────────────────── */
  const saveGridPrefs = useCallback(async (next: GridPrefs) => {
    if (!churchId) return
    setGridPrefs(next)
    const existing = ((church as { grid_config?: object } | null)?.grid_config as object) ?? {}
    await supabase.from('churches').update({ grid_config: { ...existing, ...next } }).eq('id', churchId)
  }, [supabase, churchId, church])

  // ── derived: all ministries across the week (deduped by tag) for Totals ──
  const weekMinistries = useMemo(() => {
    const byTag = new Map<string, Ministry>()
    for (const inst of instances) for (const m of inst.ministries) if (!byTag.has(m.tag_id)) byTag.set(m.tag_id, m)
    return Array.from(byTag.values()).sort((a, b) => a.sort_order - b.sort_order)
  }, [instances])

  const excluded = new Set(gridPrefs.excludedTotalMinistries ?? [])

  // E-13 ministry rollups: attendance summed across week's occurrences + other canonical metrics
  const rollups = useMemo(() => {
    return weekMinistries.map(m => {
      const rows: { label: string; value: number; sub?: string }[] = []
      // group metrics by reporting tag for ordered output: ATTENDANCE first, then volunteers subtotal, then others
      const att = m.metrics.filter(x => x.reporting_tag_code === 'ATTENDANCE')
      const vols = m.metrics.filter(x => x.reporting_tag_code === 'VOLUNTEERS')
      const others = m.metrics.filter(x => x.reporting_tag_code !== 'ATTENDANCE' && x.reporting_tag_code !== 'VOLUNTEERS')

      const sumAcrossWeek = (metric: Metric) =>
        instances.reduce((s, inst) => {
          const e = entries[`${metric.id}|${inst.id}`]
          return s + (e && !e.is_not_applicable && e.value !== null ? e.value : 0)
        }, 0)

      let attTotal = 0
      const attSittings = instances.filter(i => i.ministries.some(mm => mm.tag_id === m.tag_id)).length
      for (const a of att) attTotal += sumAcrossWeek(a)
      rows.push({ label: 'Attendance', value: attTotal, sub: attSittings > 1 ? `${attSittings} sittings` : undefined })

      if (vols.length > 0) {
        const vTotal = vols.reduce((s, v) => s + sumAcrossWeek(v), 0)
        rows.push({ label: 'Volunteers', value: vTotal })
      }
      for (const o of others) rows.push({ label: o.name, value: sumAcrossWeek(o) })

      return { ministry: m, rows, attTotal }
    })
  }, [weekMinistries, instances, entries])

  const grandTotal = rollups.reduce((s, r) => s + (excluded.has(r.ministry.tag_id) ? 0 : r.attTotal), 0)

  /* ── completion strip (E-4) ────────────────────────────────────────────── */
  const sectionStatuses: Stat[] = useMemo(() => {
    const occ = instances.map(i => instanceStatus(i, entries))
    // stat entries section status
    let stat: Stat = 'complete'
    if (periodMetrics.length > 0) {
      let done = 0
      for (const m of periodMetrics) {
        const anchor = m.cadence === 'month' ? firstOfMonth(weekStart) : weekStartStr
        const e = entries[`${m.id}|${anchor}`]
        if (e && (e.is_not_applicable || e.value !== null)) done++
      }
      stat = done === 0 ? 'empty' : done === periodMetrics.length ? 'complete' : 'needs'
    }
    return [...occ, stat]
  }, [instances, entries, periodMetrics, weekStart, weekStartStr])

  const totalSections = instances.length + 1 // occurrences + Stat Entries
  const completeSections = sectionStatuses.filter(s => s === 'complete').length

  const statEntriesStatus = sectionStatuses[sectionStatuses.length - 1]

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
          {/* ── Zone B — completion strip (E-4) ─────────────────────────── */}
          <div className="mb-2 flex justify-end px-1">
            <span className="text-[12px] font-medium text-slate-500"><span className="font-num font-semibold text-slate-700">{completeSections} of {totalSections}</span> complete</span>
          </div>

          {/* ── Zone C — tabs (E-5/E-6/E-7, DS-12) ──────────────────────── */}
          <div role="tablist" className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button role="tab" aria-selected={tab === 'Totals'} onClick={() => setTab('Totals')}
              style={tab === 'Totals' ? { background: '#4F6EF7' } : undefined}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-200 ${tab === 'Totals' ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
              <Ico.grid className="h-4 w-4" />Totals
            </button>
            {instances.map((inst, i) => {
              const active = tab === inst.id
              return (
                <button key={inst.id} role="tab" aria-selected={active} onClick={() => setTab(inst.id)}
                  style={active ? { background: '#4F6EF7' } : undefined}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-200 ${active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                  <Dot s={sectionStatuses[i]} />
                  <span className="leading-none">{fmtTabLabel(inst)}</span>
                </button>
              )
            })}
            <button role="tab" aria-selected={tab === 'Stat Entries'} onClick={() => setTab('Stat Entries')}
              style={tab === 'Stat Entries' ? { background: '#4F6EF7' } : undefined}
              className={`ml-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border-l border-slate-200 px-3 py-2 pl-3 text-[13px] font-semibold transition-colors duration-200 ${tab === 'Stat Entries' ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
              <Dot s={statEntriesStatus} />
              <span className="leading-none">Stat Entries</span>
            </button>
          </div>

          {weekLoading ? (
            <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : (
            <>
              {/* ── Zone D — TOTALS (E-10..E-13) ──────────────────────────── */}
              {tab === 'Totals' && (
                <TotalsView
                  weekLabel={fmtWeek(weekStart)}
                  grandTotal={grandTotal}
                  rollups={rollups}
                  excluded={excluded}
                  readOnly={readOnly}
                  onSavePrefs={saveGridPrefs}
                />
              )}

              {/* ── Zone E — OCCURRENCE (E-20..E-25) ──────────────────────── */}
              {instances.map(inst => tab === inst.id && (
                <OccurrenceView key={inst.id} inst={inst} entries={entries} readOnly={readOnly}
                  onCommit={upsertInstance} onToggleDidntMeet={toggleDidntMeet} />
              ))}

              {/* ── Zone F — STAT ENTRIES (E-30..E-32) ────────────────────── */}
              {tab === 'Stat Entries' && (
                <StatEntriesView metrics={periodMetrics} entries={entries} weekStart={weekStart}
                  weekStartStr={weekStartStr} readOnly={readOnly} status={statEntriesStatus} onCommit={upsertPeriod} />
              )}

              <div className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-slate-400">
                <Ico.check className="h-3.5 w-3.5 text-[#22C55E]" /> {readOnly ? 'Read-only view' : 'Entered values save automatically'}
              </div>
            </>
          )}
        </main>
      </div>
    </AppLayout>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sub-views
 * ──────────────────────────────────────────────────────────────────────── */

function TotalsView({ weekLabel, grandTotal, rollups, excluded, readOnly, onSavePrefs }: {
  weekLabel: string
  grandTotal: number
  rollups: { ministry: Ministry; rows: { label: string; value: number; sub?: string }[]; attTotal: number }[]
  excluded: Set<string>
  readOnly: boolean
  onSavePrefs: (next: GridPrefs) => void
}) {
  const [editTotals, setEditTotals] = useState(false)
  const [draft, setDraft] = useState<Set<string>>(new Set(excluded))
  const [savedNote, setSavedNote] = useState(false)
  useEffect(() => { setDraft(new Set(excluded)) }, [editTotals]) // reset draft when panel opens

  const breakdown = rollups.filter(r => !excluded.has(r.ministry.tag_id)).map(r => `${r.ministry.name} ${fmt(r.attTotal)}`).join(' · ')

  return (
    <div>
      <div className="mb-4 overflow-hidden rounded-2xl border text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #4F6EF7, #3D5BD4)' }}>
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/70">
              Total attendance · week of {weekLabel}
              {!readOnly && (
                <button onClick={() => { setEditTotals(e => !e); setSavedNote(false) }} aria-label="Edit what counts toward total" className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-white/80 transition-colors duration-200 hover:bg-white/25 hover:text-white">
                  <Ico.pencilFill className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            <div className="mt-0.5 font-num text-[11px] text-white/60">{breakdown || 'no ministries included'}</div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-num text-5xl font-bold tracking-tight">{fmt(grandTotal)}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total</span>
          </div>
        </div>

        {editTotals && !readOnly && (
          <div className="border-t border-white/20 bg-white px-5 py-4 text-slate-700">
            <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400">Include in total attendance</div>
            <div className="space-y-1.5">
              {rollups.map(r => {
                const included = !draft.has(r.ministry.tag_id)
                return (
                  <button key={r.ministry.tag_id} onClick={() => setDraft(d => { const n = new Set(d); if (included) n.add(r.ministry.tag_id); else n.delete(r.ministry.tag_id); return n })}
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors duration-200 hover:bg-slate-50">
                    <span className="flex items-center gap-2.5">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors duration-200 ${included ? 'border-transparent' : 'border-slate-300'}`} style={included ? { background: '#4F6EF7' } : undefined}>
                        {included && <Ico.check className="h-3 w-3 text-white" />}
                      </span>
                      <span className={`h-4 w-1.5 rounded-full ${accentForRole(r.ministry.tag_role)}`} aria-hidden />
                      <span className="text-[14px] font-semibold text-slate-800">{r.ministry.name}</span>
                    </span>
                    <span className="font-num text-[13px] text-slate-500">{fmt(r.attTotal)}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Saved for the whole church · doesn’t change entered numbers</span>
              <button onClick={() => { onSavePrefs({ excludedTotalMinistries: Array.from(draft) }); setEditTotals(false); setSavedNote(true) }} className="cursor-pointer rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-opacity duration-200 hover:opacity-90" style={{ background: '#4F6EF7' }}>Save</button>
            </div>
          </div>
        )}
      </div>

      {savedNote && !editTotals && (
        <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-[#22C55E]/10 px-3 py-2 text-[12px] font-medium text-[#15803D]">
          <Ico.check className="h-3.5 w-3.5" />Saved for the church — total now counts {rollups.filter(r => !excluded.has(r.ministry.tag_id)).map(r => r.ministry.name).join(', ') || 'no ministries'}.
        </div>
      )}

      {rollups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">No services this week for this campus.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rollups.map(r => {
            const isExcluded = excluded.has(r.ministry.tag_id)
            return (
              <div key={r.ministry.tag_id} className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md ${isExcluded ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`h-5 w-1.5 rounded-full ${accentForRole(r.ministry.tag_role)}`} aria-hidden />
                  <h4 className="text-[15px] font-bold tracking-tight text-slate-900">{r.ministry.name}</h4>
                  <span className="text-[12px] font-medium text-slate-400">· {roleLabel(r.ministry.tag_role)}</span>
                  {isExcluded && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Not in total</span>}
                </div>
                <div className="space-y-2.5">
                  {r.rows.map((m, i) => (
                    <div key={m.label} className={`flex items-baseline justify-between ${i === 0 ? 'border-b border-slate-100 pb-2.5' : ''}`}>
                      <span className="text-[12px] font-medium text-slate-500">{m.label}{m.sub && <span className="ml-1 font-num text-[10px] text-slate-400">{m.sub}</span>}</span>
                      <span className={`font-num font-bold tracking-tight text-slate-900 ${i === 0 ? 'text-2xl' : 'text-lg'}`}>{fmt(m.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-slate-400">
        Attendance sums each ministry across the week’s sittings. Derived from <span className="font-num">service + date</span> — never stored.
      </p>
    </div>
  )
}

function OccurrenceView({ inst, entries, readOnly, onCommit, onToggleDidntMeet }: {
  inst: Instance
  entries: EntryMap
  readOnly: boolean
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleDidntMeet: (m: Ministry, instId: string, na: boolean) => Promise<void>
}) {
  if (inst.ministries.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">No ministries are configured for this service yet.</div>
  }
  return (
    <div className="space-y-4">
      {inst.ministries.map(m => (
        <MinistryCard key={m.tag_id} ministry={m} instId={inst.id} entries={entries} readOnly={readOnly}
          onCommit={onCommit} onToggleDidntMeet={onToggleDidntMeet} />
      ))}
      <p className="px-1 text-[12px] leading-relaxed text-slate-400">Each ministry shows only its own metrics — they never share fields.</p>
    </div>
  )
}

function MinistryCard({ ministry, instId, entries, readOnly, onCommit, onToggleDidntMeet }: {
  ministry: Ministry
  instId: string
  entries: EntryMap
  readOnly: boolean
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
  onToggleDidntMeet: (m: Ministry, instId: string, na: boolean) => Promise<void>
}) {
  // N/A state derived from entries (any metric flagged is_not_applicable)
  const na = ministry.metrics.length > 0 && ministry.metrics.every(mt => entries[`${mt.id}|${instId}`]?.is_not_applicable)
  const status = ministryStatus(ministry, instId, entries)

  const att = ministry.metrics.filter(m => m.reporting_tag_code === 'ATTENDANCE')
  const vols = ministry.metrics.filter(m => m.reporting_tag_code === 'VOLUNTEERS')
  const others = ministry.metrics.filter(m => m.reporting_tag_code !== 'ATTENDANCE' && m.reporting_tag_code !== 'VOLUNTEERS')

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`h-7 w-1.5 rounded-full ${accentForRole(ministry.tag_role)}`} aria-hidden />
          <h3 className="text-[17px] font-bold tracking-tight text-slate-900">{ministry.name}</h3>
          <span className="text-[13px] font-medium text-slate-400">· {roleLabel(ministry.tag_role)}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {!readOnly && (
            <button onClick={() => onToggleDidntMeet(ministry, instId, !na)} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700">
              <Ico.ban className="h-3 w-3" />{na ? 'Mark as met' : 'Didn’t meet?'}
            </button>
          )}
          {!na && <Dot s={status} />}
        </div>
      </div>
      {na ? (
        <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">N/A this week</span>
          <span className="text-[12px] text-slate-400">recorded as “did not meet” — not zero, not blank</span>
        </div>
      ) : (
        <div className="space-y-1 px-3 py-2">
          {att.map(m => (
            <Field key={m.id} fieldId={`f-${m.id}-${instId}`} label={m.name} value={entries[`${m.id}|${instId}`]?.value ?? null}
              needs={m.is_canonical} readOnly={readOnly} onCommit={(v) => onCommit(m, instId, v)} />
          ))}
          {vols.length > 0 && (
            <VolunteersGroup vols={vols} instId={instId} entries={entries} readOnly={readOnly} onCommit={onCommit} />
          )}
          {others.map(m => (
            <Field key={m.id} fieldId={`f-${m.id}-${instId}`} label={m.name} value={entries[`${m.id}|${instId}`]?.value ?? null}
              needs={m.is_canonical} readOnly={readOnly} onCommit={(v) => onCommit(m, instId, v)} />
          ))}
        </div>
      )}
    </section>
  )
}

// E-23 — Volunteers group with CALCULATED subtotal (never stored, rule #3 / DS-9)
function VolunteersGroup({ vols, instId, entries, readOnly, onCommit }: {
  vols: Metric[]
  instId: string
  entries: EntryMap
  readOnly: boolean
  onCommit: (metric: Metric, instId: string, value: number | null) => Promise<void>
}) {
  const [open, setOpen] = useState(true)
  const total = vols.reduce((s, v) => {
    const e = entries[`${v.id}|${instId}`]
    return s + (e && !e.is_not_applicable && e.value !== null ? e.value : 0)
  }, 0)
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5">
      <button onClick={() => setOpen(o => !o)} className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors duration-200 hover:bg-white">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
          <Ico.chevron className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} /> Volunteers
        </span>
        <span className="flex items-center gap-2">
          <span className="font-num text-base font-semibold text-slate-900">{total}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">calculated</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 border-t border-slate-100 pt-1">
          {vols.map(v => (
            <Field key={v.id} fieldId={`f-${v.id}-${instId}`} indent label={v.name} value={entries[`${v.id}|${instId}`]?.value ?? null}
              readOnly={readOnly} onCommit={(val) => onCommit(v, instId, val)} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatEntriesView({ metrics, entries, weekStart, weekStartStr, readOnly, status, onCommit }: {
  metrics: Metric[]
  entries: EntryMap
  weekStart: Date
  weekStartStr: string
  readOnly: boolean
  status: Stat
  onCommit: (metric: Metric, anchor: string, value: number | null) => Promise<void>
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="h-7 w-1.5 rounded-full" style={{ background: '#4F6EF7' }} aria-hidden />
          <h3 className="text-[17px] font-bold tracking-tight text-slate-900">Stat Entries</h3>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(79,110,247,.1)', color: '#3D5BD4' }}>period totals · church-wide</span>
        </div>
        {metrics.length > 0 && <Dot s={status} />}
      </div>
      {metrics.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
          <span className="text-sm font-semibold text-slate-600">No church-wide stats configured yet</span>
          <span className="text-[12px] text-slate-400">Period stats (giving, baptisms, prayer requests…) appear here once configured in Settings.</span>
        </div>
      ) : (
        <>
          <div className="space-y-1 px-3 py-2">
            {metrics.map(m => {
              // TODO(N-4): cadence-aware controls — 'day' should render 7 per-day boxes (Mon–Sun)
              const anchor = m.cadence === 'month'
                ? toDateStr(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1))
                : weekStartStr // 'week' and (MVP) 'day' anchor to the week's Sunday
              const e = entries[`${m.id}|${anchor}`]
              const isGiving = m.reporting_tag_code === 'GIVING'
              return (
                <Field key={m.id} fieldId={`p-${m.id}`} label={m.name} value={e?.value ?? null}
                  cadence={cadenceLabel(m.cadence)} prefix={isGiving ? '$' : undefined} needs readOnly={readOnly}
                  onCommit={(v) => onCommit(m, anchor, v)} />
              )
            })}
          </div>
          <p className="px-4 pb-4 pt-1 text-[12px] leading-relaxed text-slate-400">Church-wide stats, each entered on its own cadence — not tied to any single service or ministry.</p>
        </>
      )}
    </section>
  )
}
