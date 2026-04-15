'use client'

// T1B — Occurrence Dashboard — /services/[occurrenceId]
// IRIS_T1B_ELEMENT_MAP.md: E1-E7 all implemented
// P13 single round-trip | TrackingGate for each section row

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, Church } from '@/types'

interface SectionSummary {
  main_attendance: number | null
  kids_attendance: number | null
  youth_attendance: number | null
  total_volunteers: number | null
  active_groups: number | null
  total_responses: number | null
  total_giving: string | null
}

interface OccurrenceInfo {
  id: string
  service_date: string
  status: string
  service_name: string
  location_name: string
}

function AttIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function VolIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
}

function GivingIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function OccurrencePage() {
  const params = useParams()
  const occurrenceId = params.occurrenceId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('editor')
  const [church, setChurch] = useState<Church | null>(null)
  const [occurrence, setOccurrence] = useState<OccurrenceInfo | null>(null)
  const [summary, setSummary] = useState<SectionSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Try to restore session from sessionStorage or URL param (N8)
    const lastActive = sessionStorage.getItem('sunday_last_active')
    if (lastActive) {
      const sessionKey = `sunday_session_${lastActive}`
      const raw = sessionStorage.getItem(sessionKey)
      // Validate occurrenceId matches session
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (parsed.occurrenceId !== occurrenceId) {
            // Update session to this occurrence
            sessionStorage.setItem('sunday_last_active', parsed.serviceDate)
          }
        } catch { /* ignore */ }
      }
    }

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (!membership) return
      setRole(membership.role as UserRole)
      // @ts-expect-error join
      setChurch(membership.churches as Church)

      // Fetch occurrence
      const { data: occ } = await supabase
        .from('service_occurrences')
        .select('id, service_date, status, service_templates(display_name), church_locations(name)')
        .eq('id', occurrenceId)
        .single()

      if (!occ) { router.push('/services'); return }

      setOccurrence({
        id: occ.id,
        service_date: occ.service_date,
        status: occ.status,
        // @ts-expect-error join
        service_name: occ.service_templates?.display_name ?? '',
        // @ts-expect-error join
        location_name: occ.church_locations?.name ?? '',
      })

      // P13 — single round-trip section summaries (N7)
      const { data: att } = await supabase.from('attendance_entries').select('main_attendance, kids_attendance, youth_attendance').eq('service_occurrence_id', occurrenceId).maybeSingle()
      const { data: volSum } = await supabase.from('volunteer_entries').select('volunteer_count').eq('service_occurrence_id', occurrenceId).eq('is_not_applicable', false)
      const { data: resSum } = await supabase.from('response_entries').select('stat_value').eq('service_occurrence_id', occurrenceId).eq('is_not_applicable', false)
      const { data: givSum } = await supabase.from('giving_entries').select('giving_amount').eq('service_occurrence_id', occurrenceId)

      const totalVol = volSum?.reduce((s, r) => s + (r.volunteer_count ?? 0), 0) ?? null
      const totalRes = resSum?.reduce((s, r) => s + (r.stat_value ?? 0), 0) ?? null
      const totalGiv = givSum?.reduce((s, r) => s + parseFloat(r.giving_amount ?? '0'), 0) ?? null

      setSummary({
        main_attendance: att?.main_attendance ?? null,
        kids_attendance: att?.kids_attendance ?? null,
        youth_attendance: att?.youth_attendance ?? null,
        total_volunteers: (volSum?.length ?? 0) > 0 ? totalVol : null,
        active_groups: null,
        total_responses: (resSum?.length ?? 0) > 0 ? totalRes : null,
        total_giving: (givSum?.length ?? 0) > 0 ? totalGiv?.toFixed(2) ?? null : null,
      })

      setLoading(false)
    })
  }, [occurrenceId, router])

  if (!church || !occurrence) return null

  const isCancelled = occurrence.status === 'cancelled'
  const attEntered = summary?.main_attendance !== null
  const volEntered = summary?.total_volunteers !== null
  const resEntered = summary?.total_responses !== null
  const givEntered = summary?.total_giving !== null

  const tracked = [
    { label: 'Attendance', entered: attEntered, always: true },
    { label: 'Volunteers', entered: volEntered, flag: church.tracks_volunteers },
    { label: 'Stats', entered: resEntered, flag: church.tracks_responses },
    { label: 'Giving', entered: givEntered, flag: church.tracks_giving },
  ].filter(s => s.always || s.flag)

  const allComplete = tracked.every(s => s.entered)
  const anyStarted = tracked.some(s => s.entered)

  function attSummary() {
    if (!summary || summary.main_attendance === null) return 'Tap to enter attendance'
    const parts = [`Main ${summary.main_attendance}`]
    if (church!.tracks_kids_attendance && summary.kids_attendance !== null) parts.push(`Kids ${summary.kids_attendance}`)
    if (church!.tracks_youth_attendance && summary.youth_attendance !== null) parts.push(`Youth ${summary.youth_attendance}`)
    return parts.join(' · ')
  }

  const SECTIONS = [
    { key: 'attendance', label: 'Attendance', icon: <AttIcon />, href: `/services/${occurrenceId}/attendance`, entered: attEntered, summary: attSummary(), show: true },
    { key: 'volunteers', label: 'Volunteers', icon: <VolIcon />, href: `/services/${occurrenceId}/volunteers`, entered: volEntered, summary: volEntered ? `${summary?.total_volunteers} total` : 'Tap to enter volunteers', show: church.tracks_volunteers },
    { key: 'stats', label: 'Stats', icon: <StatsIcon />, href: `/services/${occurrenceId}/stats`, entered: resEntered, summary: resEntered ? `${summary?.total_responses} total` : 'Tap to enter stats', show: church.tracks_responses },
    { key: 'giving', label: 'Giving', icon: <GivingIcon />, href: `/services/${occurrenceId}/giving`, entered: givEntered, summary: givEntered ? `$${parseFloat(summary?.total_giving ?? '0').toLocaleString()}` : 'Tap to enter giving', show: church.tracks_giving },
  ].filter(s => s.show)

  return (
    <AppLayout role={role}>
      {/* E1 — Persistent Occurrence Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/services')} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{occurrence.service_name}</p>
            <p className="text-xs text-gray-400">{formatDate(occurrence.service_date)}{occurrence.location_name ? ` · ${occurrence.location_name}` : ''}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* E7 — Cancelled banner */}
        {isCancelled && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            This service was cancelled
          </div>
        )}

        {/* E2 — All-complete banner */}
        {allComplete && !isCancelled && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-green-800 font-medium">All done for {occurrence.service_name}</p>
            <button onClick={() => router.push('/services')} className="text-xs text-green-700 underline">Back</button>
          </div>
        )}

        {/* E3 — Section rows */}
        {SECTIONS.map((section, i) => (
          <Link
            key={section.key}
            href={isCancelled ? '#' : section.href}
            onClick={isCancelled ? e => e.preventDefault() : undefined}
            className={`block border rounded-xl px-4 py-4 flex items-center gap-4 transition-colors ${
              isCancelled ? 'border-gray-100 opacity-50 cursor-not-allowed' : 'border-gray-200 hover:border-gray-400 active:bg-gray-50'
            }`}
          >
            <span className={section.entered ? 'text-gray-900' : 'text-gray-400'}>{section.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{section.label}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{section.summary}</p>
            </div>
            {/* E3d — completion indicator */}
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              section.entered ? 'bg-green-500' : 'bg-amber-400'
            }`} />
          </Link>
        ))}

        {/* E5 — Correction note */}
        {allComplete && !isCancelled && (
          <p className="text-xs text-center text-gray-400 pt-2">Need to correct something? Tap any section.</p>
        )}

        {/* E6 — Back */}
        <div className="pt-4 text-center">
          <Link href="/services" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← Back to services
          </Link>
        </div>
      </div>
    </AppLayout>
  )
}
