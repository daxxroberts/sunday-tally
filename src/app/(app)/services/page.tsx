'use client'

// T1 — Recent Services — /services
// IRIS_T1_ELEMENT_MAP.md v1.1: E1-E10 all implemented
// P12 (existing occurrences) + P12b (scheduled not started)
// D-024: 7-day window, incomplete first | D-052: server-side occurrence creation
// N2: debounced tap | N3: sessionStorage key

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, Church } from '@/types'

interface OccurrenceCard {
  type: 'existing'
  occurrence_id: string
  service_name: string
  location_name: string
  start_time: string | null
  service_date: string
  attendance_entered: boolean
  volunteers_entered: boolean
  responses_entered: boolean
  giving_entered: boolean
}

interface ScheduledCard {
  type: 'scheduled'
  template_id: string
  service_name: string
  location_name: string
  location_id: string
  start_time: string | null
  expected_date: string
  church_id: string
}

type ServiceCard = OccurrenceCard | ScheduledCard

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatTime(time: string | null) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`
}

function completionStatus(card: OccurrenceCard, church: Church): 'empty' | 'partial' | 'complete' {
  const attended = card.attendance_entered
  const volunteersOk = !church.tracks_volunteers || card.volunteers_entered
  const responsesOk = !church.tracks_responses || card.responses_entered
  const givingOk = !church.tracks_giving || card.giving_entered
  if (attended && volunteersOk && responsesOk && givingOk) return 'complete'
  if (card.attendance_entered || card.volunteers_entered || card.responses_entered || card.giving_entered) return 'partial'
  return 'empty'
}

const INDICATOR = {
  empty: <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />,
  partial: <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />,
  complete: <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />,
}

export default function ServicesPage() {
  const [role, setRole] = useState<UserRole>('editor')
  const [church, setChurch] = useState<Church | null>(null)
  const [cards, setCards] = useState<ServiceCard[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const tapping = useRef(false)
  const router = useRouter()

  useEffect(() => {
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
      // @ts-expect-error join type
      const churchData = membership.churches as Church
      setChurch(churchData)

      const churchId = membership.church_id
      const since = new Date()
      since.setDate(since.getDate() - 7)
      const sinceStr = since.toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

      // P12 — existing occurrences last 7 days
      const { data: occurrences } = await supabase
        .from('service_occurrences')
        .select(`
          id, service_date, status,
          service_templates(id, display_name, sort_order, location_id),
          church_locations(name),
          service_schedule_versions(start_time)
        `)
        .eq('church_id', churchId)
        .eq('status', 'active')
        .gte('service_date', sinceStr)
        .lte('service_date', today)
        .order('service_date', { ascending: false })

      const existingCards: OccurrenceCard[] = []
      for (const occ of occurrences ?? []) {
        const [att, vol, res, giv] = await Promise.all([
          supabase.from('attendance_entries').select('id').eq('service_occurrence_id', occ.id).limit(1),
          supabase.from('volunteer_entries').select('id').eq('service_occurrence_id', occ.id).limit(1),
          supabase.from('response_entries').select('id').eq('service_occurrence_id', occ.id).limit(1),
          supabase.from('giving_entries').select('id').eq('service_occurrence_id', occ.id).limit(1),
        ])
        existingCards.push({
          type: 'existing',
          occurrence_id: occ.id,
          // @ts-expect-error join
          service_name: occ.service_templates?.display_name ?? '',
          // @ts-expect-error join
          location_name: occ.church_locations?.name ?? '',
          // @ts-expect-error join
          start_time: occ.service_schedule_versions?.[0]?.start_time ?? null,
          service_date: occ.service_date,
          attendance_entered: (att.data?.length ?? 0) > 0,
          volunteers_entered: (vol.data?.length ?? 0) > 0,
          responses_entered: (res.data?.length ?? 0) > 0,
          giving_entered: (giv.data?.length ?? 0) > 0,
        })
      }

      // P12b — scheduled but no occurrence yet
      const { data: templates } = await supabase
        .from('service_templates')
        .select(`id, display_name, sort_order, location_id, church_locations(name), service_schedule_versions(start_time, day_of_week, effective_start_date, is_active)`)
        .eq('church_id', churchId)
        .eq('is_active', true)

      const scheduledCards: ScheduledCard[] = []
      for (const tmpl of templates ?? []) {
        // @ts-expect-error join
        const activeSchedules = (tmpl.service_schedule_versions ?? []).filter((sv: { is_active: boolean }) => sv.is_active)
        for (const sv of activeSchedules) {
          const dow = sv.day_of_week
          const todayDate = new Date()
          const diff = (dow - todayDate.getDay() + 7) % 7
          const expectedDate = new Date(todayDate)
          expectedDate.setDate(todayDate.getDate() - (diff === 0 ? 0 : 7 - diff))
          const expectedStr = expectedDate.toISOString().split('T')[0]

          if (expectedStr < sinceStr || expectedStr > today) continue
          const alreadyExists = existingCards.some(
            c => c.service_date === expectedStr && c.service_name === tmpl.display_name
          )
          if (!alreadyExists) {
            scheduledCards.push({
              type: 'scheduled',
              template_id: tmpl.id,
              service_name: tmpl.display_name,
              // @ts-expect-error join
              location_name: tmpl.church_locations?.name ?? '',
              location_id: tmpl.location_id,
              start_time: sv.start_time,
              expected_date: expectedStr,
              church_id: churchId,
            })
          }
        }
      }

      setCards([...existingCards, ...scheduledCards])
      setLoading(false)
    })
  }, [])

  // Group by date
  const grouped = cards.reduce<Record<string, ServiceCard[]>>((acc, card) => {
    const date = card.type === 'existing' ? card.service_date : card.expected_date
    if (!acc[date]) acc[date] = []
    acc[date].push(card)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => {
    if (!church) return b.localeCompare(a)
    // Incomplete dates first
    const aComplete = grouped[a].every(c =>
      c.type === 'existing' ? completionStatus(c, church) === 'complete' : false
    )
    const bComplete = grouped[b].every(c =>
      c.type === 'existing' ? completionStatus(c, church) === 'complete' : false
    )
    if (aComplete !== bComplete) return aComplete ? 1 : -1
    return b.localeCompare(a)
  })

  const handleTap = useCallback(async (card: ServiceCard) => {
    if (tapping.current) return // N2: debounce
    tapping.current = true
    setTimeout(() => { tapping.current = false }, 800)

    if (card.type === 'existing') {
      // Write session anchor
      const session = {
        occurrenceId: card.occurrence_id,
        serviceDisplayName: card.service_name,
        serviceDate: card.service_date,
        locationName: card.location_name,
      }
      sessionStorage.setItem(`sunday_session_${card.service_date}`, JSON.stringify(session))
      sessionStorage.setItem('sunday_last_active', card.service_date)
      router.push(`/services/${card.occurrence_id}`)
    } else {
      // E4: create occurrence — D-052
      setCreatingId(card.template_id + card.expected_date)
      try {
        const res = await fetch('/api/occurrences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_template_id: card.template_id,
            service_date: card.expected_date,
            location_id: card.location_id,
            church_id: card.church_id,
          }),
        })
        const { occurrence_id } = await res.json()
        const session = {
          occurrenceId: occurrence_id,
          serviceDisplayName: card.service_name,
          serviceDate: card.expected_date,
          locationName: card.location_name,
        }
        sessionStorage.setItem(`sunday_session_${card.expected_date}`, JSON.stringify(session))
        sessionStorage.setItem('sunday_last_active', card.expected_date)
        router.push(`/services/${occurrence_id}`)
      } finally {
        setCreatingId(null)
      }
    }
  }, [router])

  if (!church) return null

  return (
    <AppLayout role={role}>
      {/* E1 — App Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-gray-900">{church.name}</span>
        {(role === 'owner' || role === 'admin') && (
          <Link href="/settings" className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        )}
      </div>

      <div className="px-4 py-4">
        {loading ? (
          // Loading skeleton
          <div className="space-y-6">
            {[1, 2].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-100 rounded w-32 animate-pulse" />
                <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : sortedDates.length === 0 ? (
          /* E5 — Empty state */
          <div className="text-center py-16">
            {role === 'editor' ? (
              <p className="text-gray-500 text-sm">No services this week. Contact your admin.</p>
            ) : (
              <>
                <p className="font-medium text-gray-900 mb-1">Set up your service schedule</p>
                <p className="text-sm text-gray-500 mb-4">Add services so they appear here each week.</p>
                <Link href="/settings/services"
                  className="inline-block bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-700 transition-colors">
                  Go to Settings
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDates.map(date => {
              const dayCards = grouped[date]
              const existingInDay = dayCards.filter(c => c.type === 'existing') as OccurrenceCard[]
              const complete = existingInDay.filter(c => completionStatus(c, church) === 'complete').length
              const total = dayCards.length
              const allDone = complete === total && existingInDay.length === total

              return (
                <div key={date}>
                  {/* E9 — Section header + E10 badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700">{formatDate(date)}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      allDone ? 'bg-green-100 text-green-700' :
                      complete > 0 ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {allDone ? 'Complete' : existingInDay.length === 0 ? 'Not started' : `${complete} of ${total} complete`}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {dayCards.map((card, i) => {
                      const cardKey = card.type === 'existing' ? card.occurrence_id : card.template_id + (card as ScheduledCard).expected_date
                      const isCreating = creatingId === (card.type === 'scheduled' ? card.template_id + (card as ScheduledCard).expected_date : '')
                      const status = card.type === 'existing' ? completionStatus(card, church) : 'empty'

                      return (
                        <button
                          key={cardKey}
                          onClick={() => handleTap(card)}
                          disabled={isCreating}
                          className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex items-center justify-between hover:border-gray-400 active:bg-gray-50 transition-colors disabled:opacity-60"
                        >
                          <div>
                            {/* E3a — service name */}
                            <p className="font-medium text-gray-900">{card.service_name}</p>
                            {/* E3b — time, E3c — location (multi-campus) */}
                            <p className="text-xs text-gray-400 mt-0.5">
                              {card.start_time ? formatTime(card.start_time) : ''}
                              {card.location_name ? ` · ${card.location_name}` : ''}
                              {card.type === 'scheduled' ? ' · Not started' : ''}
                            </p>
                          </div>
                          {/* E3d — completion indicator */}
                          <div className="ml-3 flex-shrink-0">
                            {isCreating ? (
                              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                            ) : (
                              INDICATOR[status]
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
