'use client'

// T_HISTORY — Historical Data Review — /services/history
// IRIS_THISTORY_ELEMENT_MAP.md v1.0: E1-E10 all implemented
// P15a (occurrence rows with totals) + P15b (service-scope stats batch)
// One row per service_date, column groups per active service template
// D-003: NULL≠0 | Rule 1: status=active | Rule 3: volunteers calculated | Rule 4: NULL≠0 | Rule 5: SUM giving

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, Church } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceTemplate {
  id: string
  display_name: string
  sort_order: number
  location_name: string
}

interface StatCategory {
  id: string
  category_name: string
  display_order: number
}

interface GivingSource {
  id: string
  source_name: string
}

interface VolCat {
  id: string
  category_name: string
  audience_group_code: string
  sort_order: number
}

interface ServiceCell {
  occurrenceId: string
  main: number | null
  kids: number | null
  youth: number | null
  givingTotal: number | null
  volunteerTotal: number | null
  stats: Record<string, number | null>
}

interface HistoryRow {
  serviceDate: string
  services: Record<string, ServiceCell | undefined>
  firstOccurrenceId: string | null  // null on synthetic Sunday rows that only carry weeklyGivingTotal
  firstSortOrder: number
  weeklyGivingTotal: number | null  // present only on Sunday rows; church_period_giving rolled up
  isSynthetic?: boolean              // true when the row exists only to anchor weekly giving
}

interface EditCell {
  occurrenceId: string
  templateId: string
  field: string
  value: string
}

interface GivingPopover {
  occurrenceId: string
  templateId: string
  serviceName: string
  serviceDate: string
  sources: Array<{ id: string; name: string; amount: string; original: string }>
}

interface VolPopover {
  occurrenceId: string
  templateId: string
  serviceName: string
  serviceDate: string
  cats: Array<{ id: string; name: string; group: string; count: string; isNa: boolean; origCount: string; origNa: boolean }>
}

interface SubColumn {
  key: string
  label: string
  type: 'attendance' | 'giving' | 'volunteers' | 'stat'
  field?: 'main' | 'kids' | 'youth'
  categoryId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMoney(n: number | null): string {
  if (n === null) return '—'
  return '$' + Math.round(n).toLocaleString()
}

function buildSubColumns(church: Church, statCats: StatCategory[]): SubColumn[] {
  return [
    ...(church.tracks_main_attendance
      ? [{ key: 'main', label: 'Main', type: 'attendance' as const, field: 'main' as const }]
      : []),
    ...(church.tracks_kids_attendance
      ? [{ key: 'kids', label: 'Kids', type: 'attendance' as const, field: 'kids' as const }]
      : []),
    ...(church.tracks_youth_attendance
      ? [{ key: 'youth', label: 'Youth', type: 'attendance' as const, field: 'youth' as const }]
      : []),
    ...(church.tracks_giving
      ? [{ key: 'giving', label: 'Giving', type: 'giving' as const }]
      : []),
    ...(church.tracks_volunteers
      ? [{ key: 'volunteers', label: 'Vols', type: 'volunteers' as const }]
      : []),
    ...(church.tracks_responses
      ? statCats.map(sc => ({
          key: `stat_${sc.id}`,
          label: sc.category_name,
          type: 'stat' as const,
          categoryId: sc.id,
        }))
      : []),
  ]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('editor')
  const [church, setChurch] = useState<Church | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [templates, setTemplates] = useState<ServiceTemplate[]>([])
  const [statCats, setStatCats] = useState<StatCategory[]>([])
  const [givingSources, setGivingSources] = useState<GivingSource[]>([])
  const [volCats, setVolCats] = useState<VolCat[]>([])

  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([])

  const today = new Date()
  const yearAgo = new Date(today)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const [dateFrom, setDateFrom] = useState(toDateInput(yearAgo))
  const [dateTo, setDateTo] = useState(toDateInput(today))

  const [editCell, setEditCell] = useState<EditCell | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const [givingPopover, setGivingPopover] = useState<GivingPopover | null>(null)
  const [volPopover, setVolPopover] = useState<VolPopover | null>(null)
  const [savingPopover, setSavingPopover] = useState(false)

  // ─── Auth + column definitions ────────────────────────────────────────────

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
      setUserId(user.id)
      // @ts-expect-error join
      const ch = membership.churches as Church

      const [{ data: tmpl }, { data: stats }, { data: sources }, { data: vols }] = await Promise.all([
        supabase
          .from('service_templates')
          .select('id, display_name, sort_order, church_locations(name)')
          .eq('church_id', ch.id)
          .eq('is_active', true)
          .not('primary_tag_id', 'is', null)
          .order('sort_order'),
        supabase
          .from('response_categories')
          .select('id, category_name, display_order')
          .eq('church_id', ch.id)
          .eq('is_active', true)
          .eq('stat_scope', 'service')
          .order('display_order'),
        supabase
          .from('giving_sources')
          .select('id, source_name, display_order')
          .eq('church_id', ch.id)
          .eq('is_active', true)
          .order('display_order'),
        supabase
          .from('volunteer_categories')
          .select('id, category_name, audience_group_code, sort_order')
          .eq('church_id', ch.id)
          .eq('is_active', true)
          .order('audience_group_code')
          .order('sort_order'),
      ])

      // setChurch last — React 18 batches all five setters in this tick together,
      // so loadData only fires once templates/statCats/etc. are already in state.
      setTemplates(
        (tmpl ?? []).map((t: any) => ({
          id: t.id,
          display_name: t.display_name,
          sort_order: t.sort_order,
          location_name: Array.isArray(t.church_locations)
            ? (t.church_locations[0]?.name ?? '')
            : (t.church_locations?.name ?? ''),
        }))
      )
      setStatCats(stats ?? [])
      setGivingSources(sources ?? [])
      setVolCats(vols ?? [])
      setChurch(ch)
    })
  }, [router])

  // ─── Load table data (P15a + P15b) ──────────────────────────────────────────

  const loadData = useCallback(async (ch: Church, from: string, to: string) => {
    setLoading(true)
    const supabase = createClient()

    // P15a — occurrence rows with attendance
    const { data: occRows } = await supabase
      .from('service_occurrences')
      .select(`
        id,
        service_date,
        service_template_id,
        service_templates!inner(display_name, sort_order),
        attendance_entries(main_attendance, kids_attendance, youth_attendance)
      `)
      .eq('church_id', ch.id)
      .eq('status', 'active')
      .gte('service_date', from)
      .lte('service_date', to)
      .order('service_date', { ascending: false })

    // Period giving runs in parallel with occurrence query so the await chain doesn't grow.
    const periodGivingPromise = supabase
      .from('church_period_giving')
      .select('period_date, giving_amount')
      .eq('church_id', ch.id)
      .eq('entry_period_type', 'week')
      .gte('period_date', from)
      .lte('period_date', to)

    if (!occRows || occRows.length === 0) {
      // Even with no occurrences, period_giving may exist for this range — show synthetic rows.
      const { data: pgRows } = await periodGivingPromise
      const weeklyMap: Record<string, number> = {}
      for (const r of (pgRows ?? [])) {
        weeklyMap[r.period_date] = (weeklyMap[r.period_date] ?? 0) + Number(r.giving_amount)
      }
      const synth: HistoryRow[] = Object.entries(weeklyMap).map(([sundayDate, total]) => ({
        serviceDate: sundayDate,
        services: {},
        firstOccurrenceId: null,
        firstSortOrder: 9999,
        weeklyGivingTotal: total,
        isSynthetic: true,
      }))
      setHistoryRows(synth.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)))
      setLoading(false)
      return
    }

    const ids = occRows.map((r: any) => r.id)

    // P15b + giving totals + volunteer totals + period giving — batch
    const [{ data: statsRows }, { data: givingRows }, { data: volRows }, { data: pgRows }] = await Promise.all([
      supabase
        .from('response_entries')
        .select('service_occurrence_id, response_category_id, stat_value')
        .in('service_occurrence_id', ids)
        .eq('is_not_applicable', false),
      supabase
        .from('giving_entries')
        .select('service_occurrence_id, giving_amount')
        .in('service_occurrence_id', ids),
      supabase
        .from('volunteer_entries')
        .select('service_occurrence_id, volunteer_count')
        .in('service_occurrence_id', ids)
        .eq('is_not_applicable', false),
      periodGivingPromise,
    ])

    // Aggregate maps
    const statsMap: Record<string, Record<string, number>> = {}
    for (const sr of (statsRows ?? [])) {
      if (!statsMap[sr.service_occurrence_id]) statsMap[sr.service_occurrence_id] = {}
      statsMap[sr.service_occurrence_id][sr.response_category_id] = sr.stat_value
    }

    const givingMap: Record<string, number> = {}
    for (const gr of (givingRows ?? [])) {
      givingMap[gr.service_occurrence_id] = (givingMap[gr.service_occurrence_id] ?? 0) + Number(gr.giving_amount)
    }

    const volMap: Record<string, number> = {}
    for (const vr of (volRows ?? [])) {
      volMap[vr.service_occurrence_id] = (volMap[vr.service_occurrence_id] ?? 0) + vr.volunteer_count
    }

    // Roll up period_giving by Sunday date (period_date is already Sunday-anchored).
    const weeklyMap: Record<string, number> = {}
    for (const r of (pgRows ?? [])) {
      weeklyMap[r.period_date] = (weeklyMap[r.period_date] ?? 0) + Number(r.giving_amount)
    }

    // Pivot: group by service_date then by template_id
    const byDate: Record<string, HistoryRow> = {}

    for (const occ of occRows as any[]) {
      const ae = Array.isArray(occ.attendance_entries) ? occ.attendance_entries[0] : (occ.attendance_entries ?? null)
      const tmplSort: number = occ.service_templates?.sort_order ?? 999
      const cell: ServiceCell = {
        occurrenceId: occ.id,
        main: ae?.main_attendance ?? null,
        kids: ae?.kids_attendance ?? null,
        youth: ae?.youth_attendance ?? null,
        givingTotal: givingMap[occ.id] !== undefined ? givingMap[occ.id] : null,
        volunteerTotal: volMap[occ.id] !== undefined ? volMap[occ.id] : null,
        stats: statsMap[occ.id] ?? {},
      }

      if (!byDate[occ.service_date]) {
        byDate[occ.service_date] = {
          serviceDate: occ.service_date,
          services: {},
          firstOccurrenceId: occ.id,
          firstSortOrder: tmplSort,
          weeklyGivingTotal: null,
        }
      } else if (tmplSort < byDate[occ.service_date].firstSortOrder) {
        byDate[occ.service_date].firstOccurrenceId = occ.id
        byDate[occ.service_date].firstSortOrder = tmplSort
      }

      byDate[occ.service_date].services[occ.service_template_id] = cell
    }

    // Stamp weeklyGivingTotal onto the Sunday row of each week. If a week has period_giving
    // but no Sunday occurrence row, inject a synthetic row to anchor the weekly total.
    for (const [sundayDate, total] of Object.entries(weeklyMap)) {
      if (byDate[sundayDate]) {
        byDate[sundayDate].weeklyGivingTotal = total
      } else {
        byDate[sundayDate] = {
          serviceDate: sundayDate,
          services: {},
          firstOccurrenceId: null,
          firstSortOrder: 9999,
          weeklyGivingTotal: total,
          isSynthetic: true,
        }
      }
    }

    setHistoryRows(Object.values(byDate).sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (church) loadData(church, dateFrom, dateTo)
  }, [church, dateFrom, dateTo, loadData])

  // ─── Local state updater ───────────────────────────────────────────────────

  function patchCell(templateId: string, occurrenceId: string, patch: Partial<ServiceCell>) {
    setHistoryRows(prev =>
      prev.map(row => {
        const cell = row.services[templateId]
        if (!cell || cell.occurrenceId !== occurrenceId) return row
        return { ...row, services: { ...row.services, [templateId]: { ...cell, ...patch } } }
      })
    )
  }

  // ─── Save: attendance ──────────────────────────────────────────────────────

  const saveAttendance = useCallback(async (
    occurrenceId: string,
    templateId: string,
    field: 'main' | 'kids' | 'youth',
    value: string,
  ) => {
    const key = `${occurrenceId}:${field}`
    setSavingKey(key)
    setErrorKey(null)
    const supabase = createClient()
    const colMap = { main: 'main_attendance', kids: 'kids_attendance', youth: 'youth_attendance' }
    const numVal = value === '' ? null : parseInt(value, 10)

    const { error } = await supabase
      .from('attendance_entries')
      .upsert(
        { service_occurrence_id: occurrenceId, [colMap[field]]: numVal, last_updated_by: userId },
        { onConflict: 'service_occurrence_id' }
      )

    setSavingKey(null)
    if (error) { setErrorKey(key); return }
    patchCell(templateId, occurrenceId, { [field]: numVal })
  }, [userId])

  // ─── Save: stat cell ───────────────────────────────────────────────────────

  const saveStat = useCallback(async (
    occurrenceId: string,
    templateId: string,
    categoryId: string,
    value: string,
  ) => {
    const key = `${occurrenceId}:stat_${categoryId}`
    setSavingKey(key)
    setErrorKey(null)
    const supabase = createClient()

    const { error: delErr } = await supabase
      .from('response_entries')
      .delete()
      .eq('service_occurrence_id', occurrenceId)
      .eq('response_category_id', categoryId)

    if (delErr) { setSavingKey(null); setErrorKey(key); return }

    const numVal = value === '' ? null : parseInt(value, 10)
    if (numVal !== null) {
      const { error: insErr } = await supabase
        .from('response_entries')
        .insert({
          service_occurrence_id: occurrenceId,
          response_category_id: categoryId,
          stat_value: numVal,
          audience_group_code: null,
          is_not_applicable: false,
        })
      if (insErr) { setSavingKey(null); setErrorKey(key); return }
    }

    setSavingKey(null)
    patchCell(templateId, occurrenceId, { stats: undefined }) // trigger re-read via full patch
    setHistoryRows(prev =>
      prev.map(row => {
        const cell = row.services[templateId]
        if (!cell || cell.occurrenceId !== occurrenceId) return row
        return {
          ...row,
          services: {
            ...row.services,
            [templateId]: { ...cell, stats: { ...cell.stats, [categoryId]: numVal } },
          },
        }
      })
    )
  }, [])

  // ─── Inline edit handlers ──────────────────────────────────────────────────

  function startEdit(occurrenceId: string, templateId: string, field: string, current: number | null) {
    setEditCell({ occurrenceId, templateId, field, value: current !== null ? String(current) : '' })
    setErrorKey(null)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  async function commitEdit() {
    if (!editCell) return
    const { occurrenceId, templateId, field, value } = editCell
    setEditCell(null)
    if (field === 'main' || field === 'kids' || field === 'youth') {
      await saveAttendance(occurrenceId, templateId, field, value)
    } else if (field.startsWith('stat_')) {
      await saveStat(occurrenceId, templateId, field.slice(5), value)
    }
  }

  function cancelEdit() {
    setEditCell(null)
  }

  // ─── Giving popover ────────────────────────────────────────────────────────

  async function openGivingPopover(occurrenceId: string, templateId: string, serviceName: string, serviceDate: string) {
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('giving_entries')
      .select('giving_source_id, giving_amount')
      .eq('service_occurrence_id', occurrenceId)

    const amtMap: Record<string, string> = {}
    for (const e of (existing ?? [])) amtMap[e.giving_source_id] = Number(e.giving_amount).toFixed(2)

    setGivingPopover({
      occurrenceId, templateId, serviceName, serviceDate,
      sources: givingSources.map(s => ({ id: s.id, name: s.source_name, amount: amtMap[s.id] ?? '', original: amtMap[s.id] ?? '' })),
    })
  }

  async function saveGivingPopover() {
    if (!givingPopover) return
    setSavingPopover(true)
    const supabase = createClient()
    const { occurrenceId, templateId } = givingPopover

    for (const src of givingPopover.sources) {
      if (src.amount === src.original) continue
      if (src.amount === '') {
        await supabase.from('giving_entries').delete()
          .eq('service_occurrence_id', occurrenceId).eq('giving_source_id', src.id)
      } else {
        await supabase.from('giving_entries')
          .upsert({ service_occurrence_id: occurrenceId, giving_source_id: src.id, giving_amount: parseFloat(src.amount), submitted_by: userId },
            { onConflict: 'service_occurrence_id,giving_source_id' })
      }
    }

    const newTotal = givingPopover.sources.reduce((s, src) => {
      const v = parseFloat(src.amount)
      return src.amount !== '' && !isNaN(v) ? s + v : s
    }, 0)

    patchCell(templateId, occurrenceId, { givingTotal: newTotal > 0 ? newTotal : null })
    setSavingPopover(false)
    setGivingPopover(null)
  }

  // ─── Volunteer popover ─────────────────────────────────────────────────────

  async function openVolPopover(occurrenceId: string, templateId: string, serviceName: string, serviceDate: string) {
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('volunteer_entries')
      .select('volunteer_category_id, volunteer_count, is_not_applicable')
      .eq('service_occurrence_id', occurrenceId)

    const entMap: Record<string, { count: number; isNa: boolean }> = {}
    for (const e of (existing ?? [])) entMap[e.volunteer_category_id] = { count: e.volunteer_count, isNa: e.is_not_applicable }

    setVolPopover({
      occurrenceId, templateId, serviceName, serviceDate,
      cats: volCats.map(vc => {
        const e = entMap[vc.id]
        const count = e && !e.isNa ? String(e.count) : ''
        const isNa = e?.isNa ?? false
        return { id: vc.id, name: vc.category_name, group: vc.audience_group_code, count, isNa, origCount: count, origNa: isNa }
      }),
    })
  }

  async function saveVolPopover() {
    if (!volPopover) return
    setSavingPopover(true)
    const supabase = createClient()
    const { occurrenceId, templateId } = volPopover

    for (const cat of volPopover.cats) {
      if (cat.count === cat.origCount && cat.isNa === cat.origNa) continue
      if (cat.isNa) {
        await supabase.from('volunteer_entries')
          .upsert({ service_occurrence_id: occurrenceId, volunteer_category_id: cat.id, volunteer_count: 0, is_not_applicable: true, created_by: userId },
            { onConflict: 'service_occurrence_id,volunteer_category_id' })
      } else if (cat.count === '') {
        await supabase.from('volunteer_entries').delete()
          .eq('service_occurrence_id', occurrenceId).eq('volunteer_category_id', cat.id)
      } else {
        await supabase.from('volunteer_entries')
          .upsert({ service_occurrence_id: occurrenceId, volunteer_category_id: cat.id, volunteer_count: parseInt(cat.count, 10), is_not_applicable: false, created_by: userId },
            { onConflict: 'service_occurrence_id,volunteer_category_id' })
      }
    }

    // Rule 3: recalculate total, never store
    const newTotal = volPopover.cats.reduce((s, c) => {
      if (c.isNa || c.count === '') return s
      const v = parseInt(c.count, 10)
      return !isNaN(v) ? s + v : s
    }, 0)

    patchCell(templateId, occurrenceId, { volunteerTotal: newTotal > 0 ? newTotal : null })
    setSavingPopover(false)
    setVolPopover(null)
  }

  // ─── Cell renderer ─────────────────────────────────────────────────────────

  function renderCell(row: HistoryRow, templateId: string, col: SubColumn) {
    const cell = row.services[templateId]
    if (!cell) return <span className="text-gray-300 select-none">—</span>

    const { occurrenceId } = cell

    if ((col.type === 'attendance' && col.field) || col.type === 'stat') {
      const field = col.type === 'attendance' ? col.field! : `stat_${col.categoryId}`
      const key = `${occurrenceId}:${field}`
      const isEditing = editCell?.occurrenceId === occurrenceId && editCell?.field === field
      const isSaving = savingKey === key
      const hasError = errorKey === key
      const current = col.type === 'attendance'
        ? cell[col.field as 'main' | 'kids' | 'youth']
        : (cell.stats[col.categoryId!] ?? null)

      if (isEditing) {
        return (
          <input
            ref={editInputRef}
            type="text"
            inputMode="numeric"
            value={editCell!.value}
            onChange={e => setEditCell(prev => prev ? { ...prev, value: e.target.value.replace(/\D/g, '') } : null)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
              if (e.key === 'Escape') cancelEdit()
            }}
            className="w-14 text-right text-sm bg-blue-50 border border-blue-400 rounded px-1 py-0.5 outline-none"
          />
        )
      }

      return (
        <button
          onClick={() => !savingKey && startEdit(occurrenceId, templateId, field, current)}
          className={`w-full text-right text-sm px-1 py-0.5 rounded min-w-[40px] transition-colors
            ${isSaving ? 'opacity-40' : 'hover:bg-gray-100'}
            ${hasError ? 'text-red-500 bg-red-50' : current === null ? 'text-gray-300' : 'text-gray-800'}`}
        >
          {isSaving ? '…' : current !== null ? current.toLocaleString() : '—'}
        </button>
      )
    }

    if (col.type === 'giving') {
      const { givingTotal, occurrenceId: oId } = cell
      const tmpl = templates.find(t => t.id === templateId)
      return (
        <button
          onClick={() => openGivingPopover(oId, templateId, tmpl?.display_name ?? 'Service', row.serviceDate)}
          className={`w-full text-right text-sm px-1 py-0.5 rounded min-w-[56px] hover:bg-gray-100 transition-colors ${givingTotal === null ? 'text-gray-300' : 'text-gray-800'}`}
        >
          {formatMoney(givingTotal)}
        </button>
      )
    }

    if (col.type === 'volunteers') {
      const { volunteerTotal, occurrenceId: oId } = cell
      const tmpl = templates.find(t => t.id === templateId)
      return (
        <button
          onClick={() => openVolPopover(oId, templateId, tmpl?.display_name ?? 'Service', row.serviceDate)}
          className={`w-full text-right text-sm px-1 py-0.5 rounded min-w-[40px] hover:bg-gray-100 transition-colors ${volunteerTotal === null ? 'text-gray-300' : 'text-gray-800'}`}
        >
          {volunteerTotal !== null ? volunteerTotal.toLocaleString() : '—'}
        </button>
      )
    }

    return null
  }

  // ─── Column headers ────────────────────────────────────────────────────────

  // Step 1: build the full set of possible sub-columns from church tracking flags + stats config.
  const allSubColumns = church ? buildSubColumns(church, statCats) : []

  // Step 2 (V1.5 adaptive rendering): drop sub-columns that have ZERO data across the visible
  // date range. A church that doesn't track per-service giving shouldn't see a "Giving" column
  // under every template. Same for kids attendance, youth, vols, stats.
  const subColumns = (() => {
    if (historyRows.length === 0) return allSubColumns
    return allSubColumns.filter(col => {
      // For each row × template, check if this col has any non-null value
      for (const row of historyRows) {
        for (const cell of Object.values(row.services)) {
          if (!cell) continue
          if (col.type === 'attendance' && col.field) {
            if (cell[col.field as 'main' | 'kids' | 'youth'] != null) return true
          } else if (col.type === 'giving') {
            if (cell.givingTotal != null) return true
          } else if (col.type === 'volunteers') {
            if (cell.volunteerTotal != null) return true
          } else if (col.type === 'stat' && col.categoryId) {
            if (cell.stats[col.categoryId] != null) return true
          }
        }
      }
      return false
    })
  })()

  const colSpan = subColumns.length || 1

  // Only show column groups for templates that have actual data in the current range
  const templateIdsWithData = new Set(historyRows.flatMap(row => Object.keys(row.services)))
  const displayTemplates = historyRows.length > 0
    ? templates.filter(t => templateIdsWithData.has(t.id))
    : templates

  const hasDupeNames = new Set(displayTemplates.map(t => t.display_name)).size !== displayTemplates.length
  function groupLabel(t: ServiceTemplate) {
    return hasDupeNames && t.location_name ? `${t.display_name} · ${t.location_name}` : t.display_name
  }

  // ─── Popovers ──────────────────────────────────────────────────────────────

  const givenTotal = givingPopover?.sources.reduce((s, src) => {
    const v = parseFloat(src.amount)
    return src.amount !== '' && !isNaN(v) ? s + v : s
  }, 0) ?? 0

  const volTotal = volPopover?.cats.reduce((s, c) => {
    if (c.isNa || c.count === '') return s
    const v = parseInt(c.count, 10)
    return !isNaN(v) ? s + v : s
  }, 0) ?? 0

  const volGroups = Array.from(new Set(volCats.map(c => c.audience_group_code)))
  const groupName: Record<string, string> = { MAIN: 'Adults', KIDS: 'Kids', YOUTH: 'Youth' }

  if (!church) return null

  return (
    <AppLayout role={role} fillHeight>

      {/* E6 — Giving Popover */}
      {givingPopover && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setGivingPopover(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-gray-900">{givingPopover.serviceName}</p>
            <p className="text-xs text-gray-400 mb-4">{formatDate(givingPopover.serviceDate)} · Giving</p>
            <div className="space-y-3">
              {givingPopover.sources.map((src, i) => (
                <div key={src.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-700 flex-1">{src.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={src.amount}
                      placeholder="0.00"
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
                        setGivingPopover(prev => prev ? {
                          ...prev,
                          sources: prev.sources.map((s, j) => j === i ? { ...s, amount: v } : s),
                        } : null)
                      }}
                      onBlur={e => {
                        const v = e.target.value
                        if (v !== '' && !isNaN(parseFloat(v))) {
                          setGivingPopover(prev => prev ? {
                            ...prev,
                            sources: prev.sources.map((s, j) => j === i ? { ...s, amount: parseFloat(v).toFixed(2) } : s),
                          } : null)
                        }
                      }}
                      className="w-24 text-right text-sm border-b border-gray-200 focus:border-gray-900 outline-none py-0.5"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">Total: {formatMoney(givenTotal)}</span>
              <button
                onClick={saveGivingPopover}
                disabled={savingPopover}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {savingPopover ? 'Saving…' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* E7 — Volunteer Popover */}
      {volPopover && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setVolPopover(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-gray-900">{volPopover.serviceName}</p>
            <p className="text-xs text-gray-400 mb-4">{formatDate(volPopover.serviceDate)} · Volunteers</p>
            <div className="space-y-5">
              {volGroups.map(group => {
                const groupCats = volPopover.cats.filter(c => c.group === group)
                if (groupCats.length === 0) return null
                return (
                  <div key={group}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                      {groupName[group] ?? group}
                    </p>
                    <div className="space-y-2">
                      {groupCats.map(cat => {
                        const gi = volPopover.cats.findIndex(c => c.id === cat.id)
                        return (
                          <div key={cat.id} className="flex items-center gap-3">
                            <span className="text-sm text-gray-700 flex-1">{cat.name}</span>
                            <button
                              onClick={() => setVolPopover(prev => prev ? {
                                ...prev,
                                cats: prev.cats.map((c, j) => j === gi ? { ...c, isNa: !c.isNa } : c),
                              } : null)}
                              className={`text-xs px-2 py-0.5 rounded-lg border transition-colors ${cat.isNa ? 'bg-gray-100 text-gray-500 border-gray-200' : 'text-gray-300 border-gray-100 hover:border-gray-300'}`}
                            >
                              N/A
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={cat.isNa ? '' : cat.count}
                              disabled={cat.isNa}
                              placeholder="0"
                              onChange={e => {
                                const v = e.target.value.replace(/\D/g, '')
                                setVolPopover(prev => prev ? {
                                  ...prev,
                                  cats: prev.cats.map((c, j) => j === gi ? { ...c, count: v } : c),
                                } : null)
                              }}
                              className="w-16 text-right text-sm border-b border-gray-200 focus:border-gray-900 outline-none py-0.5 disabled:opacity-30"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">Total: {volTotal.toLocaleString()}</span>
              <button
                onClick={saveVolPopover}
                disabled={savingPopover}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {savingPopover ? 'Saving…' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col h-full overflow-hidden w-full min-w-0">
        {/* E1 — Page Header */}
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

        {/* E2 — Date Range Filter */}
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

      {/* E3/E4/E5 — Data Table */}
      <div className="flex-1 overflow-auto w-full min-w-0 min-h-0 relative">
        <table className="min-w-full border-collapse text-sm">

          {/* Sticky double-row header */}
          <thead className="sticky top-0 z-10 bg-white shadow-sm">
            {/* E3 — Service group row */}
            <tr className="border-b border-gray-200">
              <th
                rowSpan={2}
                className="sticky left-0 bg-white z-20 px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider border-r border-gray-100 min-w-[160px] align-bottom pb-2"
              >
                Date
              </th>
              {displayTemplates.map(t => (
                <th
                  key={t.id}
                  colSpan={colSpan}
                  className="px-3 py-2 text-center text-xs font-bold text-gray-700 border-l border-gray-100 bg-gray-50 whitespace-nowrap"
                >
                  {groupLabel(t)}
                </th>
              ))}
              {/* E11 — Weekly (church-wide) column group, visually distinct from per-service groups */}
              {church?.tracks_giving && (
                <th
                  className="px-3 py-2 text-center text-xs font-bold text-amber-900 border-l-2 border-amber-200 bg-amber-50 whitespace-nowrap"
                >
                  Weekly
                  <span className="block text-[9px] font-medium text-amber-700/70 normal-case tracking-normal">church-wide</span>
                </th>
              )}
            </tr>
            {/* E4 — Sub-column label row */}
            <tr className="border-b border-gray-200">
              {displayTemplates.map(t =>
                subColumns.map(col => (
                  <th
                    key={`${t.id}-${col.key}`}
                    className="px-2 py-1 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-l border-gray-50 whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))
              )}
              {church?.tracks_giving && (
                <th
                  className="px-2 py-1 text-right text-[10px] font-semibold text-amber-700/80 uppercase tracking-wider border-l-2 border-amber-200 bg-amber-50 whitespace-nowrap"
                >
                  Total
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {/* E9 — Loading skeleton */}
            {loading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="sticky left-0 bg-white px-4 py-3 border-r border-gray-100">
                  <div className="h-3 w-14 bg-gray-100 rounded animate-pulse" />
                </td>
                {displayTemplates.map(t =>
                  subColumns.map(col => (
                    <td key={`${t.id}-${col.key}`} className="px-3 py-3 border-l border-gray-50">
                      <div className="h-3 w-10 bg-gray-100 rounded animate-pulse ml-auto" />
                    </td>
                  ))
                )}
                {church?.tracks_giving && (
                  <td className="px-3 py-3 border-l-2 border-amber-200 bg-amber-50/40">
                    <div className="h-3 w-12 bg-amber-100 rounded animate-pulse ml-auto" />
                  </td>
                )}
              </tr>
            ))}

            {/* E8 — Empty state */}
            {!loading && historyRows.length === 0 && (
              <tr>
                <td
                  colSpan={1 + displayTemplates.length * colSpan + (church?.tracks_giving ? 1 : 0)}
                  className="px-6 py-16 text-center"
                >
                  <p className="text-gray-500 font-medium">No services found for this period.</p>
                  <p className="text-gray-400 text-xs mt-1">Adjust the date range or check that services have been created.</p>
                </td>
              </tr>
            )}

            {/* E5 — Data rows */}
            {!loading && historyRows.map(row => (
              <tr
                key={row.serviceDate}
                className={`border-b border-gray-50 hover:bg-gray-50/40 transition-colors group ${row.isSynthetic ? 'bg-amber-50/20' : ''}`}
              >
                {/* E10 — Date cell / occurrence link */}
                <td className="sticky left-0 bg-white group-hover:bg-gray-50/40 px-4 py-2 border-r border-gray-100 whitespace-nowrap z-10 transition-colors">
                  {row.firstOccurrenceId ? (
                    <Link
                      href={`/services/${row.firstOccurrenceId}`}
                      className="text-sm font-medium text-gray-700 hover:text-blue-600 hover:underline transition-colors"
                    >
                      {formatDate(row.serviceDate)}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-amber-800/80">
                      {formatDate(row.serviceDate)}
                      <span className="ml-2 text-[9px] font-semibold text-amber-700/70 uppercase tracking-wide">weekly only</span>
                    </span>
                  )}
                </td>

                {/* E5a/E5b — Data cells */}
                {displayTemplates.map(t =>
                  subColumns.map(col => (
                    <td
                      key={`${row.serviceDate}-${t.id}-${col.key}`}
                      className="px-2 py-1.5 text-right border-l border-gray-50"
                    >
                      {row.isSynthetic ? <span className="text-gray-200 select-none">—</span> : renderCell(row, t.id, col)}
                    </td>
                  ))
                )}

                {/* E11 — Weekly (church-wide) cell */}
                {church?.tracks_giving && (
                  <td className="px-2 py-1.5 text-right border-l-2 border-amber-200 bg-amber-50/40 whitespace-nowrap">
                    {row.weeklyGivingTotal !== null ? (
                      <Link
                        href={`/services/weekly?week=${row.serviceDate}`}
                        className="text-sm font-semibold text-amber-900 hover:text-amber-700 hover:underline px-1 py-0.5"
                      >
                        {formatMoney(row.weeklyGivingTotal)}
                      </Link>
                    ) : (
                      <span className="text-amber-200 select-none">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </AppLayout>
  )
}
