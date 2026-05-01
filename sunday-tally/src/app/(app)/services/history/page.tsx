'use client'

// T_HISTORY — Historical Data Review — /services/history
// Re-implemented on the design-package GridConfig + HistoryGrid system.
// Q1: GridConfig stored as JSONB on churches (or NULL → derive on read).
// Q2: derive_grid_config.ts synthesizes a default from the schema when NULL.
// D-003 NULL≠0 · Rule 1 status=active · Rule 3 vols calculated · Rule 5 SUM giving.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, Church } from '@/types'
import { HistoryGrid } from '@/components/history-grid/HistoryGrid'
import type { GridConfig } from '@/components/history-grid/grid-config-schema'
import { deriveGridConfigFromSchema } from '@/lib/history/derive_grid_config'

interface OccurrenceForGrid {
  id:                string  // service_occurrence UUID
  serviceTemplateId: string  // service_code from GridConfig
  serviceDate:       Date
}

interface CodeMaps {
  templateUuidByCode: Map<string, string>     // service_code → service_template UUID
  categoryByCode:     Map<string, { id: string; scope: string }>
  sourceUuidByCode:   Map<string, string>
  volCatUuidByCode:   Map<string, string>
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

function sundayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

function firstOfMonth(isoDate: string): string {
  return isoDate.slice(0, 7) + '-01'
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

  const today = new Date()
  const yearAgo = new Date(today)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const [dateFrom, setDateFrom] = useState(toDateInput(yearAgo))
  const [dateTo,   setDateTo]   = useState(toDateInput(today))

  // ── Auth + church + config ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/services'); return }

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, churches(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership) { router.push('/services'); return }

      const r = membership.role as UserRole
      if (r === 'viewer') { router.push('/dashboard/viewer'); return }

      setRole(r)
      // @ts-expect-error join
      const ch = membership.churches as Church & { grid_config?: GridConfig | null }
      setChurch(ch)

      const stored = ch.grid_config ?? null
      if (stored) {
        setConfig(stored)
      } else {
        const derived = await deriveGridConfigFromSchema(supabase, ch.id)
        if (!derived) {
          setEmptyReason('No active services with a primary tag yet. Set up your services first.')
        }
        setConfig(derived)
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

    // Templates (UUID ↔ service_code) — needed both for occurrence mapping and save.
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

    // Category / source / volunteer UUID lookups for the save handler later.
    const [{ data: respRows }, { data: srcRows }, { data: volRows }] = await Promise.all([
      supabase
        .from('response_categories')
        .select('id, category_code, stat_scope')
        .eq('church_id', ch.id),
      supabase
        .from('giving_sources')
        .select('id, source_code')
        .eq('church_id', ch.id),
      supabase
        .from('volunteer_categories')
        .select('id, category_code')
        .eq('church_id', ch.id),
    ])
    const categoryByCode = new Map<string, { id: string; scope: string }>()
    for (const r of respRows ?? []) categoryByCode.set(r.category_code, { id: r.id, scope: r.stat_scope })
    const sourceUuidByCode = new Map<string, string>()
    for (const r of srcRows ?? []) sourceUuidByCode.set(r.source_code, r.id)
    const volCatUuidByCode = new Map<string, string>()
    for (const r of volRows ?? []) volCatUuidByCode.set(r.category_code, r.id)

    setCodeMaps({
      templateUuidByCode: tmplUuidByCode,
      categoryByCode,
      sourceUuidByCode,
      volCatUuidByCode,
    })

    // Occurrences in range (Rule 1: status=active)
    const { data: occRows } = await supabase
      .from('service_occurrences')
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

    // Cell data sources in parallel.
    const occIds = occList.map(o => o.id)
    const data: Map<string, unknown> = new Map()

    // SV-row keying helper: rowId for an occurrence/template anchor + columnId.
    const svRowKey = (occ: OccurrenceForGrid, columnId: string) => {
      const anchor = occ.serviceDate.toISOString()
      return `SV-${anchor}-${occ.serviceTemplateId}-${columnId}`
    }

    const occByUuid = new Map(occList.map(o => [o.id, o]))

    if (occIds.length > 0) {
      const [
        { data: attRows },
        { data: respEntryRows },
        { data: givEntryRows },
        { data: volEntryRows },
      ] = await Promise.all([
        supabase
          .from('attendance_entries')
          .select('service_occurrence_id, main_attendance, kids_attendance, youth_attendance')
          .in('service_occurrence_id', occIds),
        supabase
          .from('response_entries')
          .select('service_occurrence_id, response_category_id, audience_group_code, stat_value, is_not_applicable')
          .in('service_occurrence_id', occIds)
          .eq('is_not_applicable', false),
        supabase
          .from('giving_entries')
          .select('service_occurrence_id, giving_source_id, giving_amount')
          .in('service_occurrence_id', occIds),
        supabase
          .from('volunteer_entries')
          .select('service_occurrence_id, volunteer_category_id, volunteer_count, is_not_applicable')
          .in('service_occurrence_id', occIds)
          .eq('is_not_applicable', false),
      ])

      // Attendance
      for (const r of attRows ?? []) {
        const occ = occByUuid.get(r.service_occurrence_id)
        if (!occ) continue
        if (r.main_attendance !== null)  data.set(svRowKey(occ, 'attendance.main'),  r.main_attendance)
        if (r.kids_attendance !== null)  data.set(svRowKey(occ, 'attendance.kids'),  r.kids_attendance)
        if (r.youth_attendance !== null) data.set(svRowKey(occ, 'attendance.youth'), r.youth_attendance)
      }

      // Per-source giving (each row → one cell)
      const codeBySource = new Map<string, string>()
      for (const r of srcRows ?? []) codeBySource.set(r.id, r.source_code)
      for (const r of givEntryRows ?? []) {
        const occ  = occByUuid.get(r.service_occurrence_id)
        const code = codeBySource.get(r.giving_source_id)
        if (!occ || !code) continue
        data.set(svRowKey(occ, `giving.${code}`), Number(r.giving_amount))
      }

      // Per-category volunteers
      const codeByVol = new Map<string, string>()
      for (const r of volRows ?? []) codeByVol.set(r.id, r.category_code)
      for (const r of volEntryRows ?? []) {
        const occ  = occByUuid.get(r.service_occurrence_id)
        const code = codeByVol.get(r.volunteer_category_id)
        if (!occ || !code) continue
        data.set(svRowKey(occ, `volunteer.${code}`), r.volunteer_count)
      }

      // Per-category service-scope responses (audience_group_code IS NULL)
      const codeByCat = new Map<string, string>()
      for (const r of respRows ?? []) codeByCat.set(r.id, r.category_code)
      for (const r of respEntryRows ?? []) {
        const occ  = occByUuid.get(r.service_occurrence_id)
        const code = codeByCat.get(r.response_category_id)
        if (!occ || !code) continue
        if (r.audience_group_code === null) {
          data.set(svRowKey(occ, `response.${code}`), r.stat_value)
        }
        // Audience-scoped stats not surfaced as columns in derived layout.
      }
    }

    // ── Period giving + period entries ───────────────────────────────────────
    const [{ data: pgRows }, { data: peRows }] = await Promise.all([
      supabase
        .from('church_period_giving')
        .select('giving_source_id, period_date, giving_amount, entry_period_type')
        .eq('church_id', ch.id)
        .gte('period_date', from)
        .lte('period_date', to)
        .eq('entry_period_type', 'week'),
      supabase
        .from('church_period_entries')
        .select('response_category_id, period_date, stat_value, entry_period_type, is_not_applicable')
        .eq('church_id', ch.id)
        .gte('period_date', from)
        .lte('period_date', to)
        .eq('is_not_applicable', false)
        .is('service_tag_id', null),
    ])

    // WK-row keying: metricId = `wk_giving_<source_code>` or `wk_<category_code>`.
    // grid-builder uses week_start (anchored Sunday-on-or-before) as row anchor.
    const codeBySource2 = new Map<string, string>()
    for (const r of srcRows ?? []) codeBySource2.set(r.id, r.source_code)
    for (const r of pgRows ?? []) {
      const code = codeBySource2.get(r.giving_source_id)
      if (!code) continue
      const sundayIso = isoForGrid(sundayOfWeek(r.period_date as string))
      const rowId = `WK-${sundayIso}-wk_giving_${code}`
      data.set(`${rowId}-weekly_total`, Number(r.giving_amount))
    }

    const codeByCat2 = new Map<string, string>()
    for (const r of respRows ?? []) codeByCat2.set(r.id, r.category_code)
    for (const r of peRows ?? []) {
      const code = codeByCat2.get(r.response_category_id)
      if (!code) continue
      const period = r.entry_period_type as 'day' | 'week' | 'month'
      if (period === 'week') {
        const sundayIso = isoForGrid(sundayOfWeek(r.period_date as string))
        const rowId = `WK-${sundayIso}-wk_${code}`
        data.set(`${rowId}-weekly_total`, r.stat_value)
      } else if (period === 'month') {
        const monthIso = isoForGrid(firstOfMonth(r.period_date as string))
        const rowId = `MO-${monthIso}-mo_${code}`
        data.set(`${rowId}-monthly_total`, r.stat_value)
      }
      // 'day' rows not yet emitted by grid-builder (no SD row generation in this version).
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
            <Link href="/services" className="text-gray-400 hover:text-gray-600 transition-colors">
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

        <div className="flex-1 overflow-hidden">
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
            <HistoryGrid
              config={config}
              dateRange={{ startDate: rangeStart, endDate: rangeEnd }}
              serviceOccurrences={occurrences.map(o => ({
                id:                o.id,
                serviceTemplateId: o.serviceTemplateId,
                serviceDate:       o.serviceDate,
              }))}
              initialData={initialData}
              onSave={handleSave}
            />
          )}
          {loading && (
            <div className="px-6 py-2 text-xs text-gray-400">Loading data…</div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
