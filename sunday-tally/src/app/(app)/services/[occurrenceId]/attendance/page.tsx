'use client'

// T2 — Attendance Entry — /services/[occurrenceId]/attendance
// IRIS_T2_ELEMENT_MAP.md: E1-E8 all implemented
// NULL vs 0: empty field = NULL, "0" typed = stored 0 (D-003, Rule 4)
// D-028: prompt on back if dirty

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, Church } from '@/types'
import { useSundaySession } from '@/contexts/SundaySessionContext'

export default function AttendancePage() {
  const params = useParams()
  const occurrenceId = params.occurrenceId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('editor')
  const [church, setChurch] = useState<Church | null>(null)
  const [session, setSession] = useState<{ serviceDisplayName: string; serviceDate: string; locationName: string } | null>(null)
  // Attendance fields — string to allow empty vs "0" distinction
  const [main, setMain] = useState<string>('')
  const [kids, setKids] = useState<string>('')
  const [youth, setYouth] = useState<string>('')
  const [originalMain, setOriginalMain] = useState<string>('')
  const [originalKids, setOriginalKids] = useState<string>('')
  const [originalYouth, setOriginalYouth] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDirtyPrompt, setShowDirtyPrompt] = useState(false)
  const mainRef = useRef<HTMLInputElement>(null)

  const isDirty = main !== originalMain || kids !== originalKids || youth !== originalYouth

  const { restoreSession, notifyRefetch } = useSundaySession()

  useEffect(() => {
    const sess = restoreSession(occurrenceId)
    if (sess) setSession(sess)

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/services'); return }

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, churches(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership) return
      setRole(membership.role as UserRole)
      // @ts-expect-error join
      const ch = membership.churches as Church
      setChurch(ch)

      // Load existing entry
      const { data: existing } = await supabase
        .from('attendance_entries')
        .select('main_attendance, kids_attendance, youth_attendance')
        .eq('service_occurrence_id', occurrenceId)
        .maybeSingle()

      if (existing) {
        const m = existing.main_attendance !== null ? String(existing.main_attendance) : ''
        const k = existing.kids_attendance !== null ? String(existing.kids_attendance) : ''
        const y = existing.youth_attendance !== null ? String(existing.youth_attendance) : ''
        setMain(m); setOriginalMain(m)
        setKids(k); setOriginalKids(k)
        setYouth(y); setOriginalYouth(y)
      }

      // Auto-focus main on load (State 1) — only if main is tracked
      if (ch.tracks_main_attendance) {
        setTimeout(() => mainRef.current?.focus(), 100)
      }
    })
  }, [occurrenceId, router])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload = {
      service_occurrence_id: occurrenceId,
      last_updated_by: user.id,
      main_attendance: main === '' ? null : parseInt(main, 10),
      kids_attendance: kids === '' ? null : parseInt(kids, 10),
      youth_attendance: youth === '' ? null : parseInt(youth, 10),
    }

    const { error: upsertError } = await supabase
      .from('attendance_entries')
      .upsert(payload, { onConflict: 'service_occurrence_id' })

    setSaving(false)
    if (upsertError) { setError("Couldn't save. Tap to retry."); return }

    setOriginalMain(main); setOriginalKids(kids); setOriginalYouth(youth)
    setSaved(true)
    notifyRefetch()
    setTimeout(() => router.push(`/services/${occurrenceId}`), 1500)
  }

  function handleBack() {
    if (isDirty) { setShowDirtyPrompt(true); return }
    router.push(`/services/${occurrenceId}`)
  }

  const displayTotal = (main !== '' && church?.tracks_main_attendance ? parseInt(main) || 0 : 0)
    + (kids !== '' && church?.tracks_kids_attendance ? parseInt(kids) || 0 : 0)
    + (youth !== '' && church?.tracks_youth_attendance ? parseInt(youth) || 0 : 0)

  if (!church) return null

  // E7 — Confirmation state
  if (saved) {
    return (
      <AppLayout role={role}>
        <div
          className="min-h-screen bg-green-500 flex flex-col items-center justify-center text-white px-4 cursor-pointer"
          onClick={() => router.push(`/services/${occurrenceId}`)}
        >
          <svg className="w-12 h-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-xl font-semibold">Attendance saved</p>
          <p className="mt-2 text-green-100 text-sm">
            {[
              church.tracks_main_attendance ? `Main ${main || '–'}` : null,
              church.tracks_kids_attendance ? `Kids ${kids || '–'}` : null,
              church.tracks_youth_attendance ? `Youth ${youth || '–'}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout role={role}>
      {/* E1 — Persistent Occurrence Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{session?.serviceDisplayName ?? 'Service'}</p>
            <p className="text-xs text-gray-400">Attendance</p>
          </div>
        </div>
      </div>

      {/* E8 — Dirty prompt */}
      {showDirtyPrompt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl p-6 space-y-3">
            <p className="font-medium text-gray-900">Save before leaving?</p>
            <p className="text-sm text-gray-500">You have unsaved attendance.</p>
            <button onClick={() => { setShowDirtyPrompt(false); handleSave() }} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors">Save and leave</button>
            <button onClick={() => { setShowDirtyPrompt(false); router.push(`/services/${occurrenceId}`) }} className="w-full border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors">Leave without saving</button>
            <button onClick={() => setShowDirtyPrompt(false)} className="w-full text-gray-400 py-2 text-sm">Keep editing</button>
          </div>
        </div>
      )}

      <div className="px-4 py-6 space-y-6">
        <div className="space-y-4">
          {/* E2 — Main (conditional) */}
          {church.tracks_main_attendance && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Main</label>
              <input
                ref={mainRef}
                type="number"
                inputMode="numeric"
                min="0"
                value={main}
                onChange={e => setMain(e.target.value)}
                placeholder="–"
                className="w-full text-3xl font-light border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-gray-900 placeholder-gray-300 bg-transparent"
              />
            </div>
          )}

          {/* E3 — Kids (conditional) */}
          {church.tracks_kids_attendance && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kids</label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={kids}
                onChange={e => setKids(e.target.value)}
                placeholder="–"
                className="w-full text-3xl font-light border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-gray-900 placeholder-gray-300 bg-transparent"
              />
            </div>
          )}

          {/* E4 — Youth (conditional) */}
          {church.tracks_youth_attendance && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Youth</label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={youth}
                onChange={e => setYouth(e.target.value)}
                placeholder="–"
                className="w-full text-3xl font-light border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-gray-900 placeholder-gray-300 bg-transparent"
              />
            </div>
          )}
        </div>

        {/* E5 — Running total */}
        <p className="text-sm text-gray-400">Total: {displayTotal}</p>

        {error && (
          <button onClick={handleSave} className="w-full text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </button>
        )}

        {/* E6 — Submit */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 text-white rounded-xl py-4 font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save Attendance'}
        </button>
      </div>
    </AppLayout>
  )
}
