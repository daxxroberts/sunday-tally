'use client'

// T5 — Giving Entry — /services/[occurrenceId]/giving
// IRIS_T5_ELEMENT_MAP.md v1.1: E1-E8 handled per D-036, D-037, D-038 
// Flat list per source, UPSERT pattern.

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'
import { useSundaySession } from '@/contexts/SundaySessionContext'

interface GivingSource { id: string; source_name: string }
interface EntryState { [sourceId: string]: string } // Raw input string per source

export default function GivingPage() {
  const params = useParams()
  const occurrenceId = params.occurrenceId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('editor')
  const [session, setSession] = useState<{ serviceDisplayName: string } | null>(null)
  const [sources, setSources] = useState<GivingSource[]>([])
  
  const { notifyRefetch } = useSundaySession()
  
  // State maps
  const [entries, setEntries] = useState<EntryState>({})
  const [initialEntries, setInitialEntries] = useState<EntryState>({})
  
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDirtyPrompt, setShowDirtyPrompt] = useState(false)

  const { restoreSession } = useSundaySession()

  useEffect(() => {
    const sess = restoreSession(occurrenceId)
    if (sess) setSession(sess)

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/services'); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(tracks_giving)')
        .eq('user_id', user.id).eq('is_active', true).single()
      
      if (!membership) return
      // @ts-expect-error join
      if (!membership.churches?.tracks_giving) { router.push(`/services/${occurrenceId}`); return }
      
      setRole(membership.role as UserRole)

      const [priorReq, srcsReq] = await Promise.all([
        supabase.from('giving_entries').select('id, giving_amount, giving_source_id').eq('service_occurrence_id', occurrenceId),
        supabase.from('giving_sources').select('id, source_name').eq('church_id', membership.church_id).eq('is_active', true).order('sort_order'),
      ])
      
      const loadedSources = srcsReq.data ?? []
      setSources(loadedSources)
      
      const loadedEntries: EntryState = {}
      priorReq.data?.forEach(e => {
        if (e.giving_source_id) {
          loadedEntries[e.giving_source_id] = parseFloat(e.giving_amount).toFixed(2)
        }
      })
      
      setEntries(loadedEntries)
      setInitialEntries(loadedEntries)
    })
  }, [occurrenceId, router])

  // F10: sanitize amount field
  function sanitizeAmount(raw: string): string {
    let v = raw.replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    if (parts[1]?.length > 2) v = parts[0] + '.' + parts[1].slice(0, 2)
    if (v.startsWith('0') && v.length > 1 && !v.startsWith('0.')) v = v.replace(/^0+/, '')
    return v
  }

  const isDirty = JSON.stringify(entries) !== JSON.stringify(initialEntries)
  const totalAmount = Object.values(entries).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)

  async function doSave() {
    if (saving) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    
    // UPSERT one row per source — schema has UNIQUE (service_occurrence_id, giving_source_id)
    for (const source of sources) {
      const val = entries[source.id]
      const existingVal = initialEntries[source.id]

      if (val !== undefined && val !== '') {
        const numVal = parseFloat(val) || 0
        const { error: upsertError } = await supabase.from('giving_entries').upsert({
          service_occurrence_id: occurrenceId,
          giving_source_id: source.id,
          giving_amount: numVal.toFixed(2),
        }, { onConflict: 'service_occurrence_id,giving_source_id' })

        if (upsertError) {
          setError("Couldn't save. Tap to try again — your amounts are still here.")
          setSaving(false)
          return
        }
      } else if (existingVal !== undefined) {
        // Field was cleared — remove the row
        await supabase.from('giving_entries')
          .delete()
          .eq('service_occurrence_id', occurrenceId)
          .eq('giving_source_id', source.id)
      }
    }

    setSaving(false)
    setSaved(true)
    setInitialEntries(entries)
    notifyRefetch()
    setTimeout(() => router.push(`/services/${occurrenceId}`), 1500)
  }

  // E6 — Confirmation
  if (saved) {
    return (
      <AppLayout role={role}>
        <div
          className="min-h-screen bg-green-500 flex flex-col items-center justify-center text-white px-4 cursor-pointer"
          onClick={() => router.push(`/services/${occurrenceId}`)}
        >
          <p className="text-xl font-semibold">Saved.</p>
          <p className="mt-2 text-green-100">Total giving this service: ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout role={role}>
      {/* E1 — Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => isDirty ? setShowDirtyPrompt(true) : router.push(`/services/${occurrenceId}`)} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{session?.serviceDisplayName ?? 'Service'}</p>
            <p className="text-xs text-gray-400">Giving</p>
          </div>
        </div>
      </div>

      {/* E8 — Dirty prompt */}
      {showDirtyPrompt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl p-6 space-y-3">
            <p className="font-medium text-gray-900">Save your giving entry first?</p>
            <p className="text-sm text-gray-500">It won&apos;t be included in your total if you leave now.</p>
            <button onClick={() => { setShowDirtyPrompt(false); doSave() }} className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium">Save</button>
            <button onClick={() => { setShowDirtyPrompt(false); router.push(`/services/${occurrenceId}`) }} className="w-full border border-gray-300 text-gray-700 rounded-lg py-3 text-sm font-medium">Discard</button>
            <button onClick={() => setShowDirtyPrompt(false)} className="w-full text-gray-400 py-2 text-sm">Keep editing</button>
          </div>
        </div>
      )}

      <div className="px-4 py-6 space-y-6 pb-32">
        <div className="space-y-4">
           {sources.map(source => (
              <div key={source.id} className="bg-white border text-sm border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                 <label className="font-medium text-gray-900">{source.source_name}</label>
                 <div className="relative w-32 border-b-2 border-gray-200 focus-within:border-gray-900 pb-1">
                   <span className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
                   <input
                     type="number"
                     inputMode="decimal"
                     min="0"
                     step="0.01"
                     value={entries[source.id] ?? ''}
                     onChange={e => setEntries({...entries, [source.id]: sanitizeAmount(e.target.value)})}
                     onBlur={(e) => {
                       if (e.target.value) {
                          setEntries({...entries, [source.id]: parseFloat(e.target.value).toFixed(2)})
                       }
                     }}
                     placeholder="0.00"
                     className="w-full pl-6 text-xl font-light outline-none text-gray-900 bg-transparent text-right"
                   />
                 </div>
              </div>
           ))}
           
           <div className="pt-2 text-center">
             {(role === 'owner' || role === 'admin') && (
               <Link href="/settings/giving-sources" className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  + Add giving source
               </Link>
             )}
           </div>
        </div>

        <div className="flex justify-between items-center text-lg px-2">
           <span className="text-gray-500 font-medium">Total Giving</span>
           <span className="font-semibold text-gray-900">
             ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
           </span>
        </div>

        {error && (
          <button onClick={doSave} className="w-full text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-left">
            {error}
          </button>
        )}

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
           <button
             onClick={doSave}
             disabled={saving}
             className="w-full bg-gray-900 text-white rounded-xl py-4 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40"
           >
             {saving ? 'Saving...' : 'Save — dashboard will update'}
           </button>
        </div>
      </div>
    </AppLayout>
  )
}
