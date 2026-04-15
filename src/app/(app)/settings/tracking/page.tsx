'use client'

// T6B — Tracking Configuration — /settings/tracking
// IRIS_T6B_ELEMENT_MAP.md: E1-E5 all implemented
// D-025: five tracking flags | N38: single transaction | N39: impact note if data exists

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

interface TrackingFlags {
  tracks_kids_attendance: boolean
  tracks_youth_attendance: boolean
  tracks_volunteers: boolean
  tracks_responses: boolean
  tracks_giving: boolean
}

function Toggle({ checked, onChange, label, reason, showImpact }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; reason: string; showImpact: boolean
}) {
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between">
        <div className="flex-1 pr-4">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{reason}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(\!checked)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-gray-900' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      {/* E5 — Impact note */}
      {showImpact && \!checked && (
        <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          Turning this off hides the section from entry screens. Your existing data is kept.
        </p>
      )}
    </div>
  )
}

export default function SettingsTrackingPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState('')
  const [flags, setFlags] = useState<TrackingFlags>({
    tracks_kids_attendance: true,
    tracks_youth_attendance: true,
    tracks_volunteers: true,
    tracks_responses: true,
    tracks_giving: true,
  })
  const [originalFlags, setOriginalFlags] = useState<TrackingFlags>({ ...flags })
  const [hasData, setHasData] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (\!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(tracks_kids_attendance,tracks_youth_attendance,tracks_volunteers,tracks_responses,tracks_giving)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (\!membership) return
      setRole(membership.role as UserRole)
      setChurchId(membership.church_id)
      // @ts-expect-error join
      const ch = membership.churches as TrackingFlags
      setFlags({ ...ch }); setOriginalFlags({ ...ch })

      // Check for existing data (N39)
      const { data: volData } = await supabase.from('volunteer_entries').select('id').limit(1)
      const { data: resData } = await supabase.from('response_entries').select('id').limit(1)
      const { data: givData } = await supabase.from('giving_entries').select('id').limit(1)
      setHasData({
        tracks_volunteers: (volData?.length ?? 0) > 0,
        tracks_responses: (resData?.length ?? 0) > 0,
        tracks_giving: (givData?.length ?? 0) > 0,
      })
    })
  }, [])

  function handleSave() {
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('churches').update(flags).eq('id', churchId)
      if (error) return
      setOriginalFlags({ ...flags })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const isDirty = JSON.stringify(flags) \!== JSON.stringify(originalFlags)

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Tracking</p>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* E2 — Audience toggles */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Which audiences do you track?</p>
          <div className="bg-white border border-gray-200 rounded-xl px-4 divide-y divide-gray-100">
            <Toggle checked={flags.tracks_kids_attendance} onChange={v => setFlags(f => ({ ...f, tracks_kids_attendance: v }))} label="Kids" reason="Track your kids ministry attendance separately from main." showImpact={false} />
            <Toggle checked={flags.tracks_youth_attendance} onChange={v => setFlags(f => ({ ...f, tracks_youth_attendance: v }))} label="Youth" reason="Track your youth ministry attendance separately from main." showImpact={false} />
          </div>
        </div>

        {/* E3 — Module toggles */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">What do you track each week?</p>
          <div className="bg-white border border-gray-200 rounded-xl px-4 divide-y divide-gray-100">
            <Toggle checked={flags.tracks_volunteers} onChange={v => setFlags(f => ({ ...f, tracks_volunteers: v }))} label="Volunteers" reason="Track who's serving each week." showImpact={hasData.tracks_volunteers ?? false} />
            <Toggle checked={flags.tracks_responses} onChange={v => setFlags(f => ({ ...f, tracks_responses: v }))} label="Stats" reason="Log decisions, baptisms, and anything else you count." showImpact={hasData.tracks_responses ?? false} />
            <Toggle checked={flags.tracks_giving} onChange={v => setFlags(f => ({ ...f, tracks_giving: v }))} label="Giving" reason="Record your weekly offering totals." showImpact={hasData.tracks_giving ?? false} />
          </div>
        </div>

        {/* E4 — Save */}
        <button
          onClick={handleSave}
          disabled={\!isDirty || isPending}
          className="w-full bg-gray-900 text-white rounded-xl py-3.5 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          {saved ? '✓ Saved' : isPending ? 'Saving...' : 'Save — your Sunday screens will update to match.'}
        </button>
      </div>
    </AppLayout>
  )
}
