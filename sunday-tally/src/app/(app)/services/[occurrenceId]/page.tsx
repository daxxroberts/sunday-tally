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
import { useSundaySession } from '@/contexts/SundaySessionContext'

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

const SECTION_COLORS: Record<string, { dot: string; icon: string; bg: string }> = {
  attendance: { dot: 'bg-blue-500',    icon: 'text-blue-600',   bg: 'bg-blue-50' },
  volunteers: { dot: 'bg-violet-500',  icon: 'text-violet-600', bg: 'bg-violet-50' },
  stats:      { dot: 'bg-amber-500',   icon: 'text-amber-600',  bg: 'bg-amber-50' },
  giving:     { dot: 'bg-emerald-500', icon: 'text-emerald-600',bg: 'bg-emerald-50' },
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
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
  const { refetchTick } = useSundaySession()

  const { restoreSession } = useSundaySession()

  useEffect(() => {
    if (typeof window !== 'undefined') {
       restoreSession(occurrenceId)
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

      // P13 — batch four queries via Promise.all
      const [attRes, volRes, catRes, givRes] = await Promise.all([
        supabase.from('attendance_entries').select('main_attendance, kids_attendance, youth_attendance').eq('service_occurrence_id', occurrenceId).maybeSingle(),
        supabase.from('volunteer_entries').select('volunteer_count').eq('service_occurrence_id', occurrenceId).eq('is_not_applicable', false),
        supabase.from('response_categories').select('id').eq('church_id', membership.church_id).eq('is_active', true),
        supabase.from('giving_entries').select('giving_amount').eq('service_occurrence_id', occurrenceId)
      ])

      // Only sum response_entries whose category is currently active — orphaned entries are excluded
      const activeCatIds = (catRes.data ?? []).map(c => c.id)
      const resRes = activeCatIds.length > 0
        ? await supabase.from('response_entries').select('stat_value').eq('service_occurrence_id', occurrenceId).eq('is_not_applicable', false).in('response_category_id', activeCatIds)
        : { data: [] }

      const totalVol = volRes.data?.reduce((s, r) => s + (r.volunteer_count ?? 0), 0) ?? null
      const totalRes = resRes.data?.reduce((s, r) => s + (r.stat_value ?? 0), 0) ?? null
      const totalGiv = givRes.data?.reduce((s, r) => s + parseFloat(r.giving_amount ?? '0'), 0) ?? null

      setSummary({
        main_attendance: attRes.data?.main_attendance ?? null,
        kids_attendance: attRes.data?.kids_attendance ?? null,
        youth_attendance: attRes.data?.youth_attendance ?? null,
        total_volunteers: (volRes.data?.length ?? 0) > 0 ? totalVol : null,
        active_groups: null,
        total_responses: (resRes.data?.length ?? 0) > 0 ? totalRes : null,
        total_giving: (givRes.data?.length ?? 0) > 0 ? totalGiv?.toFixed(2) ?? null : null,
      })

      setLoading(false)
    })
  }, [occurrenceId, router, refetchTick])

  if (!church || !occurrence) return null

  const isCancelled = occurrence.status === 'cancelled'

  const mainFilled = church.tracks_main_attendance ? summary?.main_attendance !== null : true
  const kidsFilled = church.tracks_kids_attendance ? summary?.kids_attendance !== null : true
  const youthFilled = church.tracks_youth_attendance ? summary?.youth_attendance !== null : true
  const anyTrackedAttendance = church.tracks_main_attendance || church.tracks_kids_attendance || church.tracks_youth_attendance
  const attEntered = anyTrackedAttendance && mainFilled && kidsFilled && youthFilled

  const volEntered = summary?.total_volunteers !== null
  const resEntered = summary?.total_responses !== null
  const givEntered = summary?.total_giving !== null

  const tracked = [
    { label: 'Attendance', entered: attEntered, flag: anyTrackedAttendance },
    { label: 'Volunteers', entered: volEntered, flag: church.tracks_volunteers },
    { label: 'Stats', entered: resEntered, flag: church.tracks_responses },
    { label: 'Giving', entered: givEntered, flag: church.tracks_giving },
  ].filter(s => s.flag)

  const allComplete = tracked.every(s => s.entered)

  function attSummary() {
    if (!summary) return 'Tap to enter'
    const parts: string[] = []
    if (church!.tracks_main_attendance && summary.main_attendance !== null) parts.push(`Main ${summary.main_attendance}`)
    if (church!.tracks_kids_attendance && summary.kids_attendance !== null) parts.push(`Kids ${summary.kids_attendance}`)
    if (church!.tracks_youth_attendance && summary.youth_attendance !== null) parts.push(`Youth ${summary.youth_attendance}`)
    return parts.length === 0 ? 'Tap to enter' : parts.join(' · ')
  }

  const SECTIONS = [
    { key: 'attendance', label: 'Attendance', icon: <AttIcon />, href: `/services/${occurrenceId}/attendance`, entered: attEntered, summary: attSummary(), show: anyTrackedAttendance },
    { key: 'volunteers', label: 'Volunteers', icon: <VolIcon />, href: `/services/${occurrenceId}/volunteers`, entered: volEntered, summary: volEntered ? `${summary?.total_volunteers} total` : 'Tap to enter', show: church.tracks_volunteers },
    { key: 'stats', label: 'Stats', icon: <StatsIcon />, href: `/services/${occurrenceId}/stats`, entered: resEntered, summary: resEntered ? `${summary?.total_responses} total` : 'Tap to enter', show: church.tracks_responses },
    { key: 'giving', label: 'Giving', icon: <GivingIcon />, href: `/services/${occurrenceId}/giving`, entered: givEntered, summary: givEntered ? `$${parseFloat(summary?.total_giving ?? '0').toLocaleString()}` : 'Tap to enter', show: church.tracks_giving },
  ].filter(s => s.show)

  const enteredCount = tracked.filter(s => s.entered).length

  return (
    <AppLayout role={role}>
      {/* E1 — Persistent Occurrence Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/services')} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-tight truncate">{occurrence.service_name}</p>
            <p className="text-xs text-gray-400 leading-tight">{formatDate(occurrence.service_date)}{occurrence.location_name ? ` · ${occurrence.location_name}` : ''}</p>
          </div>
          {/* Progress pill */}
          {!loading && !isCancelled && (
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
              allComplete ? 'bg-emerald-50 text-emerald-700' :
              enteredCount > 0 ? 'bg-blue-50 text-blue-700' :
              'bg-amber-50 text-amber-700'
            }`}>
              {allComplete ? 'Complete' : `${enteredCount}/${tracked.length}`}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* E7 — Cancelled banner */}
        {isCancelled && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 font-medium">
            This service was cancelled
          </div>
        )}

        {/* E2 — All-complete banner */}
        {allComplete && !isCancelled && (
          <div className="bg-gradient-to-r from-emerald-50 to-white border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-emerald-800 font-semibold">All sections complete</p>
            </div>
            <button onClick={() => router.push('/services')} className="text-xs text-emerald-600 font-medium hover:text-emerald-800 transition-colors">Back</button>
          </div>
        )}

        {/* E3 — Section rows */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          SECTIONS.map(section => {
            const colors = SECTION_COLORS[section.key] ?? SECTION_COLORS.attendance
            return (
              <Link
                key={section.key}
                href={isCancelled ? '#' : section.href}
                onClick={isCancelled ? e => e.preventDefault() : undefined}
                className={`block bg-white border rounded-2xl px-4 py-4 flex items-center gap-4 transition-all ${
                  isCancelled
                    ? 'border-gray-100 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:border-blue-200 hover:shadow-[0_2px_8px_-2px_rgba(59,130,246,0.15)] cursor-pointer'
                }`}
              >
                {/* Icon in colored circle */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${section.entered ? colors.bg : 'bg-gray-50'} ${section.entered ? colors.icon : 'text-gray-400'}`}>
                  {section.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{section.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{section.summary}</p>
                </div>
                {/* E3d — completion indicator */}
                {section.entered ? (
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${colors.dot}`}>
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </Link>
            )
          })
        )}

        {/* E5 — Correction note */}
        {allComplete && !isCancelled && (
          <p className="text-xs text-center text-gray-400 pt-1">Need to correct something? Tap any section above.</p>
        )}

        {/* E6 — Back */}
        <div className="pt-3 text-center">
          <Link href="/services" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Back to services
          </Link>
        </div>
      </div>
    </AppLayout>
  )
}
