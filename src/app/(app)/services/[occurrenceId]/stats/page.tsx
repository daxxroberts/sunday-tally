'use client'

// T4 — Stats Entry — /services/[occurrenceId]/stats
// IRIS_T4_ELEMENT_MAP.md: E1-E6 all implemented
// D-020: full-screen post-submit summary required (E6)
// D-049: independent section submit | D-050: last-write-wins, no locking
// D-034: "Stats" in UI, schema uses response_categories/response_entries

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, AudienceGroupCode } from '@/types'
import { useSundaySession } from '@/contexts/SundaySessionContext'

interface StatCategory { id: string; category_name: string; category_code: string; stat_scope: string; display_order: number }
interface EntryRow { category_id: string; value: string; is_na: boolean; scope: string }

type SectionState = 'editing' | 'submitted'
const GROUPS: AudienceGroupCode[] = ['MAIN', 'KIDS', 'YOUTH']
const GROUP_LABELS: Record<AudienceGroupCode, string> = { MAIN: 'Main', KIDS: 'Kids', YOUTH: 'Youth' }

function weekStartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d); monday.setDate(diff)
  return monday.toISOString().split('T')[0]
}
function monthStartDate(dateStr: string): string {
  return dateStr.substring(0, 7) + '-01'
}

export default function StatsPage() {
  const params = useParams()
  const occurrenceId = params.occurrenceId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('editor')
  const [session, setSession] = useState<{ serviceDisplayName: string } | null>(null)
  const { notifyRefetch, restoreSession } = useSundaySession()

  // Occurrence context
  const [serviceDate, setServiceDate] = useState<string>('')
  const [primaryTagId, setPrimaryTagId] = useState<string | null>(null)
  const [churchId, setChurchId] = useState<string>('')

  // Audience / service categories (occurrence-keyed)
  const [audienceCategories, setAudienceCategories] = useState<StatCategory[]>([])
  const [serviceCategories, setServiceCategories] = useState<StatCategory[]>([])
  const [audienceEntries, setAudienceEntries] = useState<Record<AudienceGroupCode, EntryRow[]>>({ MAIN: [], KIDS: [], YOUTH: [] })
  const [savedAudienceEntries, setSavedAudienceEntries] = useState<Record<AudienceGroupCode, EntryRow[]>>({ MAIN: [], KIDS: [], YOUTH: [] })
  const [serviceEntries, setServiceEntries] = useState<EntryRow[]>([])
  const [savedServiceEntries, setSavedServiceEntries] = useState<EntryRow[]>([])
  const [sectionState, setSectionState] = useState<Record<AudienceGroupCode, SectionState>>({ MAIN: 'editing', KIDS: 'editing', YOUTH: 'editing' })
  const [serviceSubmitted, setServiceSubmitted] = useState(false)

  // Period categories (church+tag+period-keyed — shared across same-tag services)
  const [dayCategories, setDayCategories] = useState<StatCategory[]>([])
  const [weekCategories, setWeekCategories] = useState<StatCategory[]>([])
  const [monthCategories, setMonthCategories] = useState<StatCategory[]>([])
  const [dayEntries, setDayEntries] = useState<EntryRow[]>([])
  const [weekEntries, setWeekEntries] = useState<EntryRow[]>([])
  const [monthEntries, setMonthEntries] = useState<EntryRow[]>([])
  const [savedDayEntries, setSavedDayEntries] = useState<EntryRow[]>([])
  const [savedWeekEntries, setSavedWeekEntries] = useState<EntryRow[]>([])
  const [savedMonthEntries, setSavedMonthEntries] = useState<EntryRow[]>([])
  const [daySubmitted, setDaySubmitted] = useState(false)
  const [weekSubmitted, setWeekSubmitted] = useState(false)
  const [monthSubmitted, setMonthSubmitted] = useState(false)

  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [summaryData, setSummaryData] = useState<{ name: string; total: number }[]>([])
  const [showDirtyPrompt, setShowDirtyPrompt] = useState(false)

  useEffect(() => {
    const sess = restoreSession(occurrenceId)
    if (sess) setSession(sess)

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/services'); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(tracks_responses)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return

      // @ts-expect-error join
      if (!membership.churches?.tracks_responses) { router.push(`/services/${occurrenceId}`); return }

      setRole(membership.role as UserRole)
      setChurchId(membership.church_id)

      // Fetch occurrence service_date + primary_tag_id
      const { data: occ } = await supabase
        .from('service_occurrences')
        .select('service_date, service_templates(primary_tag_id)')
        .eq('id', occurrenceId)
        .single()

      const sDate = (occ as any)?.service_date as string ?? ''
      const tagId = (occ as any)?.service_templates?.[0]?.primary_tag_id as string | null ?? null
      setServiceDate(sDate)
      setPrimaryTagId(tagId)

      const [catResult, entResult] = await Promise.all([
        supabase.from('response_categories').select('id, category_name, category_code, stat_scope, display_order').eq('church_id', membership.church_id).eq('is_active', true).order('display_order'),
        supabase.from('response_entries').select('response_category_id, audience_group_code, stat_value, is_not_applicable').eq('service_occurrence_id', occurrenceId),
      ])

      const cats = catResult.data ?? []
      const aud = cats.filter(c => c.stat_scope === 'audience')
      const svc = cats.filter(c => c.stat_scope === 'service')
      const day = cats.filter(c => c.stat_scope === 'day')
      const wk  = cats.filter(c => c.stat_scope === 'week')
      const mo  = cats.filter(c => c.stat_scope === 'month')

      setAudienceCategories(aud)
      setServiceCategories(svc)
      setDayCategories(day)
      setWeekCategories(wk)
      setMonthCategories(mo)

      // Build audience entries per group
      const initialAud: Record<AudienceGroupCode, EntryRow[]> = { MAIN: [], KIDS: [], YOUTH: [] }
      for (const group of GROUPS) {
        initialAud[group] = aud.map(cat => {
          const ex = entResult.data?.find(e => e.response_category_id === cat.id && e.audience_group_code === group)
          return { category_id: cat.id, value: ex ? (ex.is_not_applicable ? '' : String(ex.stat_value ?? '')) : '', is_na: ex?.is_not_applicable ?? false, scope: 'audience' }
        })
      }
      setAudienceEntries(initialAud)
      setSavedAudienceEntries(JSON.parse(JSON.stringify(initialAud)))

      // Build service-level entries (D-050: last-write-wins)
      const initialSvc = svc.map(cat => {
        const ex = entResult.data?.find(e => e.response_category_id === cat.id && !e.audience_group_code)
        return { category_id: cat.id, value: ex ? (ex.is_not_applicable ? '' : String(ex.stat_value ?? '')) : '', is_na: ex?.is_not_applicable ?? false, scope: 'service' }
      })
      setServiceEntries(initialSvc)
      setSavedServiceEntries(JSON.parse(JSON.stringify(initialSvc)))

      // Build period entries (shared across services with same tag on same period)
      if (tagId && sDate) {
        const dayPeriod   = sDate
        const weekPeriod  = weekStartDate(sDate)
        const monthPeriod = monthStartDate(sDate)

        const { data: periodData } = await supabase
          .from('church_period_entries')
          .select('response_category_id, entry_period_type, period_date, stat_value, is_not_applicable')
          .eq('church_id', membership.church_id)
          .eq('service_tag_id', tagId)
          .in('period_date', [dayPeriod, weekPeriod, monthPeriod])

        function buildPeriodRows(categories: StatCategory[], periodType: string, periodDate: string): EntryRow[] {
          return categories.map(cat => {
            const ex = periodData?.find(p => p.response_category_id === cat.id && p.entry_period_type === periodType && p.period_date === periodDate)
            return { category_id: cat.id, value: ex ? (ex.is_not_applicable ? '' : String(ex.stat_value ?? '')) : '', is_na: ex?.is_not_applicable ?? false, scope: periodType }
          })
        }

        const dayE  = buildPeriodRows(day, 'day', dayPeriod)
        const wkE   = buildPeriodRows(wk, 'week', weekPeriod)
        const moE   = buildPeriodRows(mo, 'month', monthPeriod)
        setDayEntries(dayE);   setSavedDayEntries(JSON.parse(JSON.stringify(dayE)))
        setWeekEntries(wkE);   setSavedWeekEntries(JSON.parse(JSON.stringify(wkE)))
        setMonthEntries(moE);  setSavedMonthEntries(JSON.parse(JSON.stringify(moE)))
      }
    })
  }, [occurrenceId, router])

  function updateAudienceEntry(group: AudienceGroupCode, catId: string, patch: Partial<EntryRow>) {
    setAudienceEntries(prev => ({ ...prev, [group]: prev[group].map(r => r.category_id === catId ? { ...r, ...patch } : r) }))
  }
  function updateServiceEntry(catId: string, patch: Partial<EntryRow>) {
    setServiceEntries(prev => prev.map(r => r.category_id === catId ? { ...r, ...patch } : r))
  }
  function updatePeriodEntry(setter: React.Dispatch<React.SetStateAction<EntryRow[]>>, catId: string, patch: Partial<EntryRow>) {
    setter(prev => prev.map(r => r.category_id === catId ? { ...r, ...patch } : r))
  }

  async function submitAudienceSection(group: AudienceGroupCode): Promise<boolean> {
    setSaving(group)
    setError(null)
    const supabase = createClient()

    for (const row of audienceEntries[group]) {
      // audience_group_code is nullable in the schema, so PostgREST can't resolve the
      // three-column unique constraint for upsert (on_conflict returns 400).
      // Use DELETE + INSERT (same pattern as service stats) to guarantee one row
      // per (occurrence, category, audience_group). D-050: last-write-wins.
      await supabase
        .from('response_entries')
        .delete()
        .eq('service_occurrence_id', occurrenceId)
        .eq('response_category_id', row.category_id)
        .eq('audience_group_code', group)

      const { error: insertError } = await supabase.from('response_entries').insert({
        service_occurrence_id: occurrenceId,
        response_category_id: row.category_id,
        audience_group_code: group,
        stat_value: row.is_na ? null : (row.value === '' ? null : parseInt(row.value, 10)),
        is_not_applicable: row.is_na,
      })
      if (insertError) { setError(`Couldn't save. Try again.`); setSaving(null); return false }
    }

    setSaving(null)
    setSectionState(prev => ({ ...prev, [group]: 'submitted' }))
    return true
  }

  async function submitServiceStats(): Promise<boolean> {
    setSaving('service')
    setError(null)
    const supabase = createClient()
    for (const row of serviceEntries) {
      // Service-level stats use a partial unique index on (occurrence_id, category_id)
      // WHERE audience_group_code IS NULL (migration 0006: uq_response_entry_service_level).
      // NULL keys are distinct in standard UNIQUE constraints, so we use DELETE + INSERT
      // rather than upsert to ensure exactly one row per (occurrence, category) for service stats.
      // D-050: last-write-wins — no ownership check.
      await supabase
        .from('response_entries')
        .delete()
        .eq('service_occurrence_id', occurrenceId)
        .eq('response_category_id', row.category_id)
        .is('audience_group_code', null)

      const { error: insertError } = await supabase.from('response_entries').insert({
        service_occurrence_id: occurrenceId,
        response_category_id: row.category_id,
        audience_group_code: null,
        stat_value: row.is_na ? null : (row.value === '' ? null : parseInt(row.value, 10)),
        is_not_applicable: row.is_na,
      })
      if (insertError) { setError(`Couldn't save. Try again.`); setSaving(null); return false }
    }
    setSaving(null)
    setServiceSubmitted(true)
    return true
  }

  async function submitPeriodSection(
    entries: EntryRow[],
    periodType: 'day' | 'week' | 'month',
    periodDate: string,
    setSaved: (v: EntryRow[]) => void,
    setSubmitted: (v: boolean) => void,
  ): Promise<boolean> {
    if (!primaryTagId || !churchId) return false
    setSaving(periodType)
    setError(null)
    const supabase = createClient()

    for (const row of entries) {
      const { error: upsertError } = await supabase
        .from('church_period_entries')
        .upsert({
          church_id: churchId,
          service_tag_id: primaryTagId,
          response_category_id: row.category_id,
          entry_period_type: periodType,
          period_date: periodDate,
          stat_value: row.is_na ? null : (row.value === '' ? null : parseInt(row.value, 10)),
          is_not_applicable: row.is_na,
        }, { onConflict: 'church_id,service_tag_id,response_category_id,entry_period_type,period_date' })
      if (upsertError) { setError(`Couldn't save. Try again.`); setSaving(null); return false }
    }

    setSaved(JSON.parse(JSON.stringify(entries)))
    setSaving(null)
    setSubmitted(true)
    return true
  }

  const allAudienceSubmitted = GROUPS.every(g => sectionState[g] === 'submitted')
  const allPeriodSubmitted =
    (dayCategories.length === 0 || daySubmitted) &&
    (weekCategories.length === 0 || weekSubmitted) &&
    (monthCategories.length === 0 || monthSubmitted)
  const allSubmitted =
    allAudienceSubmitted &&
    (serviceCategories.length === 0 || serviceSubmitted) &&
    allPeriodSubmitted

  const anyDirty =
    GROUPS.some(g =>
      sectionState[g] === 'editing' &&
      audienceEntries[g].some((r, i) => r.value !== savedAudienceEntries[g][i]?.value || r.is_na !== savedAudienceEntries[g][i]?.is_na)
    ) ||
    (!serviceSubmitted && serviceEntries.some((r, i) => r.value !== savedServiceEntries[i]?.value || r.is_na !== savedServiceEntries[i]?.is_na)) ||
    (!daySubmitted && dayEntries.some((r, i) => r.value !== savedDayEntries[i]?.value || r.is_na !== savedDayEntries[i]?.is_na)) ||
    (!weekSubmitted && weekEntries.some((r, i) => r.value !== savedWeekEntries[i]?.value || r.is_na !== savedWeekEntries[i]?.is_na)) ||
    (!monthSubmitted && monthEntries.some((r, i) => r.value !== savedMonthEntries[i]?.value || r.is_na !== savedMonthEntries[i]?.is_na))

  async function handleSaveAllAndLeave() {
    const dayPeriod   = serviceDate
    const weekPeriod  = serviceDate ? weekStartDate(serviceDate) : ''
    const monthPeriod = serviceDate ? monthStartDate(serviceDate) : ''

    for (const group of GROUPS) {
      if (sectionState[group] === 'editing' && audienceEntries[group].some(r => r.value !== '' || r.is_na)) {
        const ok = await submitAudienceSection(group)
        if (!ok) return
      }
    }
    if (!serviceSubmitted && serviceEntries.some(r => r.value !== '' || r.is_na)) {
      const ok = await submitServiceStats()
      if (!ok) return
    }
    if (!daySubmitted && dayEntries.some(r => r.value !== '' || r.is_na)) {
      const ok = await submitPeriodSection(dayEntries, 'day', dayPeriod, setSavedDayEntries, setDaySubmitted)
      if (!ok) return
    }
    if (!weekSubmitted && weekEntries.some(r => r.value !== '' || r.is_na)) {
      const ok = await submitPeriodSection(weekEntries, 'week', weekPeriod, setSavedWeekEntries, setWeekSubmitted)
      if (!ok) return
    }
    if (!monthSubmitted && monthEntries.some(r => r.value !== '' || r.is_na)) {
      const ok = await submitPeriodSection(monthEntries, 'month', monthPeriod, setSavedMonthEntries, setMonthSubmitted)
      if (!ok) return
    }
    notifyRefetch()
    router.push(`/services/${occurrenceId}`)
  }

  useEffect(() => {
    if (allSubmitted && !showSummary) {
      // Build summary data (N17: by category_code across groups)
      const totals: Record<string, { name: string; total: number }> = {}
      for (const group of GROUPS) {
        audienceEntries[group].forEach(row => {
          const cat = audienceCategories.find(c => c.id === row.category_id)
          if (!cat || row.is_na) return
          const val = parseInt(row.value) || 0
          if (!totals[cat.category_code]) totals[cat.category_code] = { name: cat.category_name, total: 0 }
          totals[cat.category_code].total += val
        })
      }
      setSummaryData(Object.values(totals).filter(t => t.total > 0))
      setShowSummary(true)
      setTimeout(() => { notifyRefetch(); router.push(`/services/${occurrenceId}`) }, 3000) // D-020: auto 3s (map says 2.5s)
    }
  }, [allSubmitted])

  // E6 — Post-submit summary (D-020 REQUIRED)
  if (showSummary) {
    const grandTotal = summaryData.reduce((s, d) => s + d.total, 0)
    return (
      <AppLayout role={role}>
        <div
          className="min-h-screen bg-green-500 flex flex-col items-center justify-center text-white px-6 cursor-pointer"
          onClick={() => { notifyRefetch(); router.push(`/services/${occurrenceId}`) }}
        >
          <p className="text-lg font-semibold mb-6">This week&apos;s responses</p>
          {summaryData.map(d => (
            <p key={d.name} className="text-white/90 text-sm mb-1">{d.name}: {d.total}</p>
          ))}
          <p className="mt-4 text-xl font-bold">Total: {grandTotal} responses</p>
          <p className="mt-6 text-xs text-green-200">Tap to continue</p>
        </div>
      </AppLayout>
    )
  }

  const hasPeriodCategories = dayCategories.length > 0 || weekCategories.length > 0 || monthCategories.length > 0
  const hasAnyCategories = audienceCategories.length > 0 || serviceCategories.length > 0 || hasPeriodCategories

  return (
    <AppLayout role={role}>
      {/* E1 — Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => anyDirty ? setShowDirtyPrompt(true) : router.push(`/services/${occurrenceId}`)} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{session?.serviceDisplayName ?? 'Service'}</p>
            <p className="text-xs text-gray-400">Stats</p>
          </div>
        </div>
      </div>

      {showDirtyPrompt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl p-6 space-y-3">
            <p className="font-medium text-gray-900">Save before leaving?</p>
            <p className="text-sm text-gray-500">Unsaved stats won&apos;t appear in your reports.</p>
            <button onClick={() => { setShowDirtyPrompt(false); handleSaveAllAndLeave(); }} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors">Save and leave</button>
            <button onClick={() => { setShowDirtyPrompt(false); router.push(`/services/${occurrenceId}`) }} className="w-full border border-gray-300 text-gray-700 rounded-lg py-3 text-sm font-medium">Leave without saving</button>
            <button onClick={() => setShowDirtyPrompt(false)} className="w-full text-gray-400 py-2 text-sm">Keep editing</button>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {!hasAnyCategories ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">No stat categories set up yet.</p>
            {(role === 'owner' || role === 'admin') && (
              <Link href="/settings/stats" className="mt-3 inline-block text-sm text-gray-900 underline">Add categories in Settings</Link>
            )}
          </div>
        ) : (
          <>
            {/* Audience-scoped sections */}
            {GROUPS.map(group => {
          const cats = audienceCategories
          if (cats.length === 0) return null
          const isSubmitted = sectionState[group] === 'submitted'
          return (
            <div key={group} className="border border-gray-200 rounded-xl overflow-hidden">
              <button type="button" onClick={() => isSubmitted && setSectionState(prev => ({ ...prev, [group]: 'editing' }))} className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 text-left">
                <span className="text-sm font-semibold text-gray-900">{GROUP_LABELS[group]} Stats</span>
              </button>
              {isSubmitted ? (
                <div className="px-4 py-3 text-xs text-gray-500">
                  {audienceEntries[group].map(r => {
                    const cat = audienceCategories.find(c => c.id === r.category_id)
                    return <span key={r.category_id} className="mr-3">{cat?.category_name} {r.is_na ? "Didn't apply" : r.value || '0'}</span>
                  })}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {audienceEntries[group].map(row => {
                    const cat = audienceCategories.find(c => c.id === row.category_id)
                    return (
                      <div key={row.category_id} className="px-4 py-3 flex items-center gap-3">
                        <span className="flex-1 text-sm font-medium text-gray-900">{cat?.category_name}</span>
                        <input type="number" inputMode="numeric" min="0" value={row.value} onChange={e => updateAudienceEntry(group, row.category_id, { value: e.target.value })} disabled={row.is_na} placeholder="–" className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <button type="button" onClick={() => updateAudienceEntry(group, row.category_id, { is_na: !row.is_na, value: '' })} className={`text-xs px-2 py-1 rounded-md border transition-colors ${row.is_na ? 'bg-gray-200 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}>Didn&apos;t apply</button>
                      </div>
                    )
                  })}
                  <div className="px-4 py-3">
                    <button onClick={() => submitAudienceSection(group)} disabled={saving === group} className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40">
                      {saving === group ? 'Saving...' : `Save ${GROUP_LABELS[group]} Stats`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Service-level stats (D-035) */}
        {serviceCategories.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50">
              <span className="text-sm font-semibold text-gray-900">Service Stats</span>
            </div>
            {serviceSubmitted ? (
              <div className="px-4 py-3 text-xs text-gray-500">
                {serviceEntries.map(r => { const cat = serviceCategories.find(c => c.id === r.category_id); return <span key={r.category_id} className="mr-3">{cat?.category_name} {r.is_na ? "Didn't apply" : r.value || '0'}</span> })}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {serviceEntries.map(row => {
                  const cat = serviceCategories.find(c => c.id === row.category_id)
                  return (
                    <div key={row.category_id} className="px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 text-sm font-medium text-gray-900">{cat?.category_name}</span>
                      <input type="number" inputMode="numeric" min="0" value={row.value} onChange={e => updateServiceEntry(row.category_id, { value: e.target.value })} disabled={row.is_na} placeholder="–" className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={() => updateServiceEntry(row.category_id, { is_na: !row.is_na, value: '' })} className={`text-xs px-2 py-1 rounded-md border transition-colors ${row.is_na ? 'bg-gray-200 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}>
                        Didn&apos;t apply
                      </button>
                    </div>
                  )
                })}
                <div className="px-4 py-3">
                  <button onClick={submitServiceStats} disabled={saving === 'service'} className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40">
                    {saving === 'service' ? 'Saving...' : 'Save Service Stats'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Daily Stats — shared across all services with the same tag on this date */}
        {dayCategories.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50">
              <span className="text-sm font-semibold text-gray-900">Daily Stats</span>
              <p className="text-xs text-gray-400 mt-0.5">Shared across all services today</p>
            </div>
            {daySubmitted ? (
              <div className="px-4 py-3 text-xs text-gray-500">
                {dayEntries.map(r => { const cat = dayCategories.find(c => c.id === r.category_id); return <span key={r.category_id} className="mr-3">{cat?.category_name} {r.is_na ? "Didn't apply" : r.value || '0'}</span> })}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {dayEntries.map(row => {
                  const cat = dayCategories.find(c => c.id === row.category_id)
                  return (
                    <div key={row.category_id} className="px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 text-sm font-medium text-gray-900">{cat?.category_name}</span>
                      <input type="number" inputMode="numeric" min="0" value={row.value} onChange={e => updatePeriodEntry(setDayEntries, row.category_id, { value: e.target.value })} disabled={row.is_na} placeholder="–" className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={() => updatePeriodEntry(setDayEntries, row.category_id, { is_na: !row.is_na, value: '' })} className={`text-xs px-2 py-1 rounded-md border transition-colors ${row.is_na ? 'bg-gray-200 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}>Didn&apos;t apply</button>
                    </div>
                  )
                })}
                <div className="px-4 py-3">
                  <button onClick={() => submitPeriodSection(dayEntries, 'day', serviceDate, setSavedDayEntries, setDaySubmitted)} disabled={saving === 'day'} className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40">
                    {saving === 'day' ? 'Saving...' : 'Save Daily Stats'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Weekly Stats — shared across all services with the same tag this week */}
        {weekCategories.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50">
              <span className="text-sm font-semibold text-gray-900">Weekly Stats</span>
              <p className="text-xs text-gray-400 mt-0.5">Shared across all services this week</p>
            </div>
            {weekSubmitted ? (
              <div className="px-4 py-3 text-xs text-gray-500">
                {weekEntries.map(r => { const cat = weekCategories.find(c => c.id === r.category_id); return <span key={r.category_id} className="mr-3">{cat?.category_name} {r.is_na ? "Didn't apply" : r.value || '0'}</span> })}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {weekEntries.map(row => {
                  const cat = weekCategories.find(c => c.id === row.category_id)
                  return (
                    <div key={row.category_id} className="px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 text-sm font-medium text-gray-900">{cat?.category_name}</span>
                      <input type="number" inputMode="numeric" min="0" value={row.value} onChange={e => updatePeriodEntry(setWeekEntries, row.category_id, { value: e.target.value })} disabled={row.is_na} placeholder="–" className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={() => updatePeriodEntry(setWeekEntries, row.category_id, { is_na: !row.is_na, value: '' })} className={`text-xs px-2 py-1 rounded-md border transition-colors ${row.is_na ? 'bg-gray-200 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}>Didn&apos;t apply</button>
                    </div>
                  )
                })}
                <div className="px-4 py-3">
                  <button onClick={() => submitPeriodSection(weekEntries, 'week', weekStartDate(serviceDate), setSavedWeekEntries, setWeekSubmitted)} disabled={saving === 'week'} className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40">
                    {saving === 'week' ? 'Saving...' : 'Save Weekly Stats'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Monthly Stats — shared across all services with the same tag this month */}
        {monthCategories.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50">
              <span className="text-sm font-semibold text-gray-900">Monthly Stats</span>
              <p className="text-xs text-gray-400 mt-0.5">Shared across all services this month</p>
            </div>
            {monthSubmitted ? (
              <div className="px-4 py-3 text-xs text-gray-500">
                {monthEntries.map(r => { const cat = monthCategories.find(c => c.id === r.category_id); return <span key={r.category_id} className="mr-3">{cat?.category_name} {r.is_na ? "Didn't apply" : r.value || '0'}</span> })}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {monthEntries.map(row => {
                  const cat = monthCategories.find(c => c.id === row.category_id)
                  return (
                    <div key={row.category_id} className="px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 text-sm font-medium text-gray-900">{cat?.category_name}</span>
                      <input type="number" inputMode="numeric" min="0" value={row.value} onChange={e => updatePeriodEntry(setMonthEntries, row.category_id, { value: e.target.value })} disabled={row.is_na} placeholder="–" className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={() => updatePeriodEntry(setMonthEntries, row.category_id, { is_na: !row.is_na, value: '' })} className={`text-xs px-2 py-1 rounded-md border transition-colors ${row.is_na ? 'bg-gray-200 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}>Didn&apos;t apply</button>
                    </div>
                  )
                })}
                <div className="px-4 py-3">
                  <button onClick={() => submitPeriodSection(monthEntries, 'month', monthStartDate(serviceDate), setSavedMonthEntries, setMonthSubmitted)} disabled={saving === 'month'} className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40">
                    {saving === 'month' ? 'Saving...' : 'Save Monthly Stats'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </>
        )}

        {error && (
          <p className="text-red-500 text-sm text-center font-medium bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>
        )}
      </div>
    </AppLayout>
  )
}
