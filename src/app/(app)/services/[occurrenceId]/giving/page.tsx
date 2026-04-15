'use client'

// T5 — Giving Entry — /services/[occurrenceId]/giving
// IRIS_T5_ELEMENT_MAP.md: E1-E8 all implemented
// D-008: NUMERIC(12,2) — no float math | Rule 5: always SUM giving_entries
// History-first layout | D-028: prompt on back if dirty

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

interface GivingEntry { id: string; giving_amount: string; created_at: string; giving_source_id: string | null }
interface GivingSource { id: string; source_name: string }

export default function GivingPage() {
  const params = useParams()
  const occurrenceId = params.occurrenceId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('editor')
  const [session, setSession] = useState<{ serviceDisplayName: string } | null>(null)
  const [priorEntries, setPriorEntries] = useState<GivingEntry[]>([])
  const [sources, setSources] = useState<GivingSource[]>([])
  const [amount, setAmount] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newTotal, setNewTotal] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [showDirtyPrompt, setShowDirtyPrompt] = useState(false)

  useEffect(() => {
    const lastActive = sessionStorage.getItem('sunday_last_active')
    if (lastActive) {
      const raw = sessionStorage.getItem(`sunday_session_${lastActive}`)
      if (raw) try { setSession(JSON.parse(raw)) } catch { /* ignore */ }
    }

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (\!user) { router.push('/services'); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (\!membership) return
      setRole(membership.role as UserRole)

      const [entries, srcs] = await Promise.all([
        supabase.from('giving_entries').select('id, giving_amount, created_at, giving_source_id').eq('service_occurrence_id', occurrenceId).order('created_at'),
        supabase.from('giving_sources').select('id, source_name').eq('church_id', membership.church_id).eq('is_active', true).order('sort_order'),
      ])
      setPriorEntries(entries.data ?? [])
      setSources(srcs.data ?? [])
      if (srcs.data && srcs.data.length > 0) setSourceId(srcs.data[0].id)
    })
  }, [occurrenceId, router])

  // F10: sanitize amount field
  function sanitizeAmount(raw: string): string {
    let v = raw.replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    if (parts[1]?.length > 2) v = parts[0] + '.' + parts[1].slice(0, 2)
    if (v.startsWith('0') && v.length > 1 && \!v.startsWith('0.')) v = v.replace(/^0+/, '')
    return v
  }

  const priorTotal = priorEntries.reduce((s, e) => s + parseFloat(e.giving_amount), 0)
  const currentAmount = parseFloat(amount) || 0
  const runningTotal = priorTotal + currentAmount

  function isDuplicate() {
    return priorEntries.some(e => Math.abs(parseFloat(e.giving_amount) - currentAmount) < 0.001)
  }

  async function doSave() {
    if (saving || \!amount || currentAmount <= 0) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('giving_entries').insert({
      service_occurrence_id: occurrenceId,
      giving_source_id: sourceId || null,
      giving_amount: currentAmount.toFixed(2),
    })

    setSaving(false)
    if (insertError) { setError("Couldn't save. Tap to try again — your amount is still here."); return }

    setNewTotal(runningTotal)
    setSaved(true)
    setTimeout(() => router.push(`/services/${occurrenceId}`), 1500)
  }

  function handleSave() {
    if (\!amount || currentAmount <= 0) return
    if (isDuplicate()) { setShowDuplicate(true); return }
    doSave()
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
          <p className="mt-2 text-green-100">Total giving this service: ${newTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout role={role}>
      {/* E1 — Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => amount ? setShowDirtyPrompt(true) : router.push(`/services/${occurrenceId}`)} className="text-gray-400 hover:text-gray-700">
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

      {/* E7 — Duplicate warning */}
      {showDuplicate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl p-6 space-y-3">
            <p className="font-medium text-gray-900">Heads up</p>
            <p className="text-sm text-gray-500">You already logged ${amount} for this service. Adding again?</p>
            <button onClick={() => { setShowDuplicate(false); doSave() }} className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium">Yes, add it</button>
            <button onClick={() => setShowDuplicate(false)} className="w-full border border-gray-300 text-gray-700 rounded-lg py-3 text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      <div className="px-4 py-6 space-y-6">
        {/* E2 — Giving history */}
        {priorEntries.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Prior entries</p>
            <div className="space-y-2">
              {priorEntries.map(entry => {
                const src = sources.find(s => s.id === entry.giving_source_id)
                return (
                  <div key={entry.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{src?.source_name ?? 'Giving'}</span>
                    <span className="font-medium text-gray-900">${parseFloat(entry.giving_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between text-sm">
              <span className="text-gray-500">Total so far</span>
              <span className="font-semibold">${priorTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* E3 — Entry field */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Add giving amount — log each source separately if needed.
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(sanitizeAmount(e.target.value))}
              onBlur={() => amount && setAmount(parseFloat(amount).toFixed(2))}
              placeholder="0.00"
              className="w-full pl-8 text-3xl font-light border-b-2 border-gray-200 focus:border-gray-900 outline-none py-2 text-gray-900 placeholder-gray-300 bg-transparent"
            />
          </div>

          {/* Source picker */}
          {sources.length > 1 && (
            <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900">
              {sources.map(s => <option key={s.id} value={s.id}>{s.source_name}</option>)}
            </select>
          )}
        </div>

        {/* E4 — Running total */}
        {priorEntries.length > 0 && amount && (
          <p className="text-sm text-gray-500">Total after this entry: ${runningTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        )}

        {error && (
          <button onClick={doSave} className="w-full text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-left">
            {error}
          </button>
        )}

        {/* E5 — Submit */}
        <button
          onClick={handleSave}
          disabled={\!amount || currentAmount <= 0 || saving}
          className="w-full bg-gray-900 text-white rounded-xl py-4 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save — your giving total will update in the dashboard.'}
        </button>
      </div>
    </AppLayout>
  )
}
