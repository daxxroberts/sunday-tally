'use client'

// T3 — Volunteer Entry — /services/[occurrenceId]/volunteers
// IRIS_T3_ELEMENT_MAP.md: E1-E5 all implemented
// D-018: section-submit per audience group | D-049: independent sections | Rule 3: totals calculated

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, AudienceGroupCode } from '@/types'
import { useSundaySession } from '@/contexts/SundaySessionContext'

interface Category { id: string; category_name: string; audience_group_code: AudienceGroupCode; sort_order: number }
interface EntryRow { category_id: string; count: string; is_na: boolean }

type SectionState = 'editing' | 'submitted'

const GROUPS: AudienceGroupCode[] = ['MAIN', 'KIDS', 'YOUTH']
const GROUP_LABELS: Record<AudienceGroupCode, string> = { MAIN: 'Main', KIDS: 'Kids', YOUTH: 'Youth' }

export default function VolunteersPage() {
  const params = useParams()
  const occurrenceId = params.occurrenceId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('editor')
  const [session, setSession] = useState<{ serviceDisplayName: string } | null>(null)
  const { restoreSession, notifyRefetch } = useSundaySession()

  const [categories, setCategories] = useState<Category[]>([])
  const [entries, setEntries] = useState<Record<AudienceGroupCode, EntryRow[]>>({ MAIN: [], KIDS: [], YOUTH: [] })
  const [savedEntries, setSavedEntries] = useState<Record<AudienceGroupCode, EntryRow[]>>({ MAIN: [], KIDS: [], YOUTH: [] })
  const [sectionState, setSectionState] = useState<Record<AudienceGroupCode, SectionState>>({ MAIN: 'editing', KIDS: 'editing', YOUTH: 'editing' })
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDirtyPrompt, setShowDirtyPrompt] = useState(false)

  useEffect(() => {
    const sess = restoreSession(occurrenceId)
    if (sess) setSession(sess)

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/services'); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(tracks_volunteers)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      
      // @ts-expect-error join
      if (!membership.churches?.tracks_volunteers) { router.push(`/services/${occurrenceId}`); return }
      
      setRole(membership.role as UserRole)

      const [catResult, entResult] = await Promise.all([
        supabase.from('volunteer_categories').select('id, category_name, audience_group_code, sort_order').eq('church_id', membership.church_id).eq('is_active', true).order('sort_order'),
        supabase.from('volunteer_entries').select('volunteer_category_id, volunteer_count, is_not_applicable').eq('service_occurrence_id', occurrenceId),
      ])

      const cats = catResult.data ?? []
      setCategories(cats)

      // Build entry rows per group
      const initialEntries: Record<AudienceGroupCode, EntryRow[]> = { MAIN: [], KIDS: [], YOUTH: [] }
      for (const group of GROUPS) {
        const groupCats = cats.filter(c => c.audience_group_code === group)
        initialEntries[group] = groupCats.map(cat => {
          const existing = entResult.data?.find(e => e.volunteer_category_id === cat.id)
          return {
            category_id: cat.id,
            count: existing ? (existing.is_not_applicable ? '' : String(existing.volunteer_count ?? '')) : '',
            is_na: existing?.is_not_applicable ?? false,
          }
        })
      }
      setEntries(initialEntries)
      setSavedEntries(JSON.parse(JSON.stringify(initialEntries)))
    })
  }, [occurrenceId, router])

  function updateEntry(group: AudienceGroupCode, catId: string, patch: Partial<EntryRow>) {
    setEntries(prev => ({
      ...prev,
      [group]: prev[group].map(r => r.category_id === catId ? { ...r, ...patch } : r)
    }))
  }

  async function submitSection(group: AudienceGroupCode): Promise<boolean> {
    setSaving(group)
    setError(null)
    const supabase = createClient()

    const rows = entries[group]
    for (const row of rows) {
      // Skip rows with no count and not marked N/A — no row = not entered (schema design)
      if (!row.is_na && row.count === '') continue
      const { error: upsertError } = await supabase.from('volunteer_entries').upsert({
        service_occurrence_id: occurrenceId,
        volunteer_category_id: row.category_id,
        volunteer_count: row.is_na ? 0 : parseInt(row.count, 10),
        is_not_applicable: row.is_na,
      }, { onConflict: 'service_occurrence_id,volunteer_category_id' })
      if (upsertError) { setError(`Couldn't save ${GROUP_LABELS[group]} volunteers. Try again.`); setSaving(null); return false }
    }

    setSaving(null)
    setSectionState(prev => ({ ...prev, [group]: 'submitted' }))
    return true
  }

  function groupTotal(group: AudienceGroupCode) {
    return entries[group].filter(r => !r.is_na).reduce((s, r) => s + (parseInt(r.count) || 0), 0)
  }

  const allSubmitted = GROUPS.every(g => sectionState[g] === 'submitted')
  const anyDirty = GROUPS.some(g =>
    sectionState[g] === 'editing' &&
    entries[g].some((r, i) => r.count !== savedEntries[g][i]?.count || r.is_na !== savedEntries[g][i]?.is_na)
  )

  async function handleSaveAllAndLeave() {
    for (const group of GROUPS) {
      if (sectionState[group] === 'editing' && entries[group].some(r => r.count !== '' || r.is_na)) {
        const ok = await submitSection(group)
        if (!ok) return
      }
    }
    notifyRefetch()
    router.push(`/services/${occurrenceId}`)
  }

  const groupCats = (group: AudienceGroupCode) => categories.filter(c => c.audience_group_code === group)

  return (
    <AppLayout role={role}>
      {/* E1 — Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => anyDirty ? setShowDirtyPrompt(true) : router.push(`/services/${occurrenceId}`)} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{session?.serviceDisplayName ?? 'Service'}</p>
            <p className="text-xs text-gray-400">Volunteers</p>
          </div>
        </div>
      </div>

      {/* E8 — Dirty prompt */}
      {showDirtyPrompt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl p-6 space-y-3">
            <p className="font-medium text-gray-900">Save before leaving?</p>
            <p className="text-sm text-gray-500">You have unsaved volunteer counts.</p>
            <button onClick={() => { setShowDirtyPrompt(false); handleSaveAllAndLeave(); }} className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium">Save and leave</button>
            <button onClick={() => { setShowDirtyPrompt(false); router.push(`/services/${occurrenceId}`) }} className="w-full border border-gray-300 text-gray-700 rounded-lg py-3 text-sm font-medium">Leave without saving</button>
            <button onClick={() => setShowDirtyPrompt(false)} className="w-full text-gray-400 py-2 text-sm">Keep editing</button>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {categories.length === 0 ? (
          /* E3 — No categories */
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">No volunteer categories set up yet.</p>
            {(role === 'owner' || role === 'admin') && (
              <Link href="/settings/volunteer-roles" className="mt-3 inline-block text-sm text-gray-900 underline">Add categories in Settings</Link>
            )}
          </div>
        ) : (
          GROUPS.map(group => {
            const cats = groupCats(group)
            if (cats.length === 0) return null
            const isSubmitted = sectionState[group] === 'submitted'

            return (
              <div key={group} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* E2a — Section header */}
                <button
                  type="button"
                  onClick={() => isSubmitted && setSectionState(prev => ({ ...prev, [group]: 'editing' }))}
                  className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">{GROUP_LABELS[group]} Volunteers</span>
                  <span className="text-sm text-gray-500">{groupTotal(group)} total</span>
                </button>

                {isSubmitted ? (
                  /* E2d — Summary state */
                  <div className="px-4 py-3 text-xs text-gray-500">
                    {entries[group].map(r => {
                      const cat = categories.find(c => c.id === r.category_id)
                      return <span key={r.category_id} className="mr-3">{cat?.category_name} {r.is_na ? 'N/A' : r.count || '0'}</span>
                    })}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {/* E2b — Category rows */}
                    {entries[group].map(row => {
                      const cat = categories.find(c => c.id === row.category_id)
                      return (
                        <div key={row.category_id} className="px-4 py-3 flex items-center gap-3">
                          <span className="flex-1 text-sm text-gray-700">{cat?.category_name}</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={row.count}
                            onChange={e => updateEntry(group, row.category_id, { count: e.target.value })}
                            disabled={row.is_na}
                            placeholder="–"
                            className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-gray-900"
                          />
                          <button
                            type="button"
                            onClick={() => updateEntry(group, row.category_id, { is_na: !row.is_na, count: row.is_na ? row.count : '' })}
                            className={`text-xs px-2 py-1 rounded-md border transition-colors ${row.is_na ? 'bg-gray-200 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}
                          >N/A</button>
                        </div>
                      )
                    })}
                    {/* E2c — Section submit */}
                    <div className="px-4 py-3">
                      <button
                        onClick={() => submitSection(group)}
                        disabled={saving === group}
                        className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
                      >
                        {saving === group ? 'Saving...' : `Save ${GROUP_LABELS[group]} Volunteers`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {/* E4 — All submitted → return */}
        {allSubmitted && (
          <button
            onClick={() => { notifyRefetch(); router.push(`/services/${occurrenceId}`); }}
            className="w-full bg-gray-900 text-white rounded-xl py-4 font-medium text-sm hover:bg-gray-700 transition-colors"
          >
            Save and return →
          </button>
        )}
      </div>
    </AppLayout>
  )
}
