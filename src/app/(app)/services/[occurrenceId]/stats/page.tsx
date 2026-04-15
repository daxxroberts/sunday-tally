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

interface StatCategory { id: string; category_name: string; category_code: string; stat_scope: string; display_order: number }
interface EntryRow { category_id: string; value: string; is_na: boolean; scope: string }

type SectionState = 'editing' | 'submitted'
const GROUPS: AudienceGroupCode[] = ['MAIN', 'KIDS', 'YOUTH']
const GROUP_LABELS: Record<AudienceGroupCode, string> = { MAIN: 'Main', KIDS: 'Kids', YOUTH: 'Youth' }

export default function StatsPage() {
  const params = useParams()
  const occurrenceId = params.occurrenceId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('editor')
  const [session, setSession] = useState<{ serviceDisplayName: string } | null>(null)
  const [audienceCategories, setAudienceCategories] = useState<StatCategory[]>([])
  const [serviceCategories, setServiceCategories] = useState<StatCategory[]>([])
  const [audienceEntries, setAudienceEntries] = useState<Record<AudienceGroupCode, EntryRow[]>>({ MAIN: [], KIDS: [], YOUTH: [] })
  const [serviceEntries, setServiceEntries] = useState<EntryRow[]>([])
  const [sectionState, setSectionState] = useState<Record<AudienceGroupCode, SectionState>>({ MAIN: 'editing', KIDS: 'editing', YOUTH: 'editing' })
  const [serviceSubmitted, setServiceSubmitted] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [summaryData, setSummaryData] = useState<{ name: string; total: number }[]>([])
  const [showDirtyPrompt, setShowDirtyPrompt] = useState(false)

  useEffect(() => {
    const lastActive = sessionStorage.getItem('sunday_last_active')
    if (lastActive) {
      const raw = sessionStorage.getItem(`sunday_session_${lastActive}`)
      if (raw) try { setSession(JSON.parse(raw)) } catch { /* ignore */ }
    }

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/services'); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole)

      const [catResult, entResult] = await Promise.all([
        supabase.from('response_categories').select('id, category_name, category_code, stat_scope, display_order').eq('church_id', membership.church_id).eq('is_active', true).order('display_order'),
        supabase.from('response_entries').select('response_category_id, audience_group_code, stat_value, is_not_applicable').eq('service_occurrence_id', occurrenceId),
      ])

      const cats = catResult.data ?? []
      const aud = cats.filter(c => c.stat_scope === 'audience')
      const svc = cats.filter(c => c.stat_scope === 'service')
      setAudienceCategories(aud)
      setServiceCategories(svc)

      // Build audience entries per group
      const initialAud: Record<AudienceGroupCode, EntryRow[]> = { MAIN: [], KIDS: [], YOUTH: [] }
      for (const group of GROUPS) {
        initialAud[group] = aud.map(cat => {
          const ex = entResult.data?.find(e => e.response_category_id === cat.id && e.audience_group_code === group)
          return { category_id: cat.id, value: ex ? (ex.is_not_applicable ? '' : String(ex.stat_value ?? '')) : '', is_na: ex?.is_not_applicable ?? false, scope: 'audience' }
        })
      }
      setAudienceEntries(initialAud)

      // Build service-level entries (D-050: last-write-wins)
      const initialSvc = svc.map(cat => {
        const ex = entResult.data?.find(e => e.response_category_id === cat.id && !e.audience_group_code)
        return { category_id: cat.id, value: ex ? (ex.is_not_applicable ? '' : String(ex.stat_value ?? '')) : '', is_na: ex?.is_not_applicable ?? false, scope: 'service' }
      })
      setServiceEntries(initialSvc)
    })
  }, [occurrenceId, router])

  function updateAudienceEntry(group: AudienceGroupCode, catId: string, patch: Partial<EntryRow>) {
    setAudienceEntries(prev => ({ ...prev, [group]: prev[group].map(r => r.category_id === catId ? { ...r, ...patch } : r) }))
  }
  function updateServiceEntry(catId: string, patch: Partial<EntryRow>) {
    setServiceEntries(prev => prev.map(r => r.category_id === catId ? { ...r, ...patch } : r))
  }

  async function submitAudienceSection(group: AudienceGroupCode) {
    setSaving(group)
    setError(null)
    const supabase = createClient()

    for (const row of audienceEntries[group]) {
      const { error: upsertError } = await supabase.from('response_entries').upsert({
        service_occurrence_id: occurrenceId,
        response_category_id: row.category_id,
        audience_group_code: group,
        stat_value: row.is_na ? null : (row.value === '' ? null : parseInt(row.value, 10)),
        is_not_applicable: row.is_na,
      }, { onConflict: 'service_occurrence_id,response_category_id,audience_group_code' })
      if (upsertError) { setError(`Couldn't save. Try again.`); setSaving(null); return }
    }

    setSaving(null)
    setSectionState(prev => ({ ...prev, [group]: 'submitted' }))
  }

  async function submitServiceStats() {
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
      if (insertError) { setError(`Couldn't save. Try again.`); setSaving(null); return }
    }
    setSaving(null)
    setServiceSubmitted(true)
  }

  const allAudienceSubmitted = GROUPS.every(g => sectionState[g] === 'submitted')
  const allSubmitted = allAudienceSubmitted && (serviceCategories.length === 0 || serviceSubmitted)

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
      setTimeout(() => router.push(`/services/${occurrenceId}`), 3000) // D-020: auto 3s (map says 2.5s)
    }
  }, [allSubmitted])

  // E6 — Post-submit summary (D-020 REQUIRED)
  if (showSummary) {
    const grandTotal = summaryData.reduce((s, d) => s + d.total, 0)
    return (
      <AppLayout role={role}>
        <div
          className="min-h-screen bg-green-500 flex flex-col items-center justify-center text-white px-6 cursor-pointer"
          onClick={() => router.push(`/services/${occurrenceId}`)}
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

  return (
    <AppLayout role={role}>
      {/* E1 — Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowDirtyPrompt(true)} className="text-gray-400 hover:text-gray-700">
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
            <p className="font-medium text-gray-900">Leave without saving?</p>
            <p className="text-sm text-gray-500">Unsaved stats won&apos;t appear in your reports.</p>
            <button onClick={() => { setShowDirtyPrompt(false); router.push(`/services/${occurrenceId}`) }} className="w-full border border-gray-300 text-gray-700 rounded-lg py-3 text-sm font-medium">Leave without saving</button>
            <button onClick={() => setShowDirtyPrompt(false)} className="w-full text-gray-400 py-2 text-sm">Keep editing</button>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
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
                    return <span key={r.category_id} className="mr-3">{cat?.category_name} {r.is_na ? 'N/A' : r.value || '0'}</span>
                  })}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {audienceEntries[group].map(row => {
                    const cat = audienceCategories.find(c => c.id === row.category_id)
                    return (
                      <div key={row.category_id} className="px-4 py-3 flex items-center gap-3">
                        <span className="flex-1 text-sm font-medium text-gray-900">{cat?.category_name}</span>
                        <input type="number" inputMode="numeric" min="0" value={row.value} onChange={e => updateAudienceEntry(group, row.category_id, { value: e.target.value })} disabled={row.is_na} placeholder="–" className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-gray-900" />
                        <button type="button" onClick={() => updateAudienceEntry(group, row.category_id, { is_na: !row.is_na, value: '' })} className={`text-xs px-2 py-1 rounded-md border transition-colors ${row.is_na ? 'bg-gray-200 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}>N/A</button>
                      </div>
                    )
                  })}
                  <div className="px-4 py-3">
                    <button onClick={() => submitAudienceSection(group)} disabled={saving === group} className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40">
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
                {serviceEntries.map(r => { const cat = serviceCategories.find(c => c.id === r.category_id); return <span key={r.category_id} className="mr-3">{cat?.category_name} {r.is_na ? 'N/A' : r.value || '0'}</span> })}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {serviceEntries.map(row => {
                  const cat = serviceCategories.find(c => c.id === row.category_id)
                  return (
                    <div key={row.category_id} className="px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 text-sm font-medium text-gray-900">{cat?.category_name}</span>
                      <input type="number" inputMode="numeric" min="0" value={row.value} onChange={e => updateServiceEntry(row.category_id, { value: e.target.value })} disabled={row.is_na} placeholder="–" className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      <button type="button" onClick={() => updateServiceEntry(row.category_id, { is_na: !row.is_na, value: '' })} className={`text-xs px-2 py-1 rounded-md border transition-colors ${row.is_na ? 'bg-gray-200 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}>
                        Didn&apos;t apply
                      </button>
                    </div>
                  )
                })}
                <