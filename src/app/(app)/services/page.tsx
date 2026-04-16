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
import { useSundaySession } from '@/contexts/SundaySessionContext'

interface OccurrenceCard {
  type: 'existing'
  occurrence_id: string
  service_name: string
  location_name: string
  start_time: string | null
  service_date: string
  attendance_entered: boolean
  main_attendance_entered: boolean
  kids_attendance_entered: boolean
  youth_attendance_entered: boolean
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

interface ScheduleVersion {
  start_time: string | null
  day_of_week: number
  effective_start_date: string | null
  is_active: boolean
}

interface OccurrenceJoin {
  id: string
  service_date: string
  status: string
  template: {
    id: string
    display_name: string
    sort_order: number
    location_id: string
    service_schedule_versions: Pick<ScheduleVersion, 'start_time' | 'effective_start_date'>[]
  }
  location: { name: string }
}

interface TemplateRow {
  id: string
  display_name: string
  sort_order: number
  location_id: string
  church_locations: { name: string }[]
  service_schedule_versions: ScheduleVersion[]
}

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

function toLocalDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getMostRecentWeekday(baseDate: Date, dayOfWeek: number) {
  const diff = (baseDate.getDay() - dayOfWeek + 7) % 7
  return addDays(baseDate, -diff)
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

function getChecklistLabels(card: ServiceCard, church: Church) {
  const done: string[] = []
  const missing: string[] = []

  const mark = (label: string, complete: boolean) => {
    if (complete) done.push(label)
    else missing.push(label)
  }

  if (card.type === 'existing') {
    mark('Main attendance', card.main_attendance_entered)
    if (church.tracks_kids_attendance) mark('Kids attendance', card.kids_attendance_entered)
    if (church.tracks_youth_attendance) mark('Youth attendance', card.youth_attendance_entered)
    if (church.tracks_volunteers) mark('Volunteers', card.volunteers_entered)
    if (church.tracks_responses) mark('Stats', card.responses_entered)
    if (church.tracks_giving) mark('Giving', card.giving_entered)
  } else {
    missing.push('Main attendance')
    if (church.tracks_kids_attendance) missing.push('Kids attendance')
    if (church.tracks_youth_attendance) missing.push('Youth attendance')
    if (church.tracks_volunteers) missing.push('Volunteers')
    if (church.tracks_responses) missing.push('Stats')
    if (church.tracks_giving) missing.push('Giving')
  }

  return { done, missing }
}

export default function ServicesPage() {
  const [role, setRole] = useState<UserRole>('editor')
  const [church, setChurch] = useState<Church | null>(null)
  const [cards, setCards] = useState<ServiceCard[]>([])
  const [loading, setLoading] = useState(true)
  const [templateCount, setTemplateCount] = useState<number | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const tapping = useRef(false)
  const router = useRouter()
  const { setSession } = useSundaySession()

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
      const todayDate = new Date()
      const sinceDate = addDays(todayDate, -7)
      const sinceStr = toLocalDateString(sinceDate)
      const today = toLocalDateString(todayDate)

      // P12 — existing occurrences last 7 days
      // Fetch effective_start_date so we can select the correct schedule version client-side
      const { data: occurrences } = await supabase
        .from('service_occurrences')
        .select(`
          id, service_date, status,
          template:service_templates(id, display_name, sort_order, location_id, service_schedule_versions(start_time, effective_start_date)),
          location:church_locations(name)
        `)
        .eq('church_id', churchId)
        .eq('status', 'active')
        .gte('service_date', sinceStr)
        .lte('service_date', today)
        .order('service_date', { ascending: false })

      const typedOccurrences = (occurrences as any) as OccurrenceJoin[]
      const existingCards: OccurrenceCard[] = []
      const occIds = typedOccurrences.map(o => o.id)

      let attSet = new Map()
      let volSet = new Set()
      let resSet = new Set()
      let givSet = new Set()

      if (occIds.length > 0) {
        const [att, vol, res, giv] = await Promise.all([
          supabase.from('attendance_entries').select('service_occurrence_id, main_attendance, kids_attendance, youth_attendance').in('service_occurrence_id', occIds),
          supabase.from('volunteer_entries').select('service_occurrence_id').in('service_occurrence_id', occIds),
          supabase.from('response_entries').select('service_occurrence_id').in('service_occurrence_id', occIds),
          supabase.from('giving_entries').select('service_occurrence_id').in('service_occurrence_id', occIds)
        ])
        att.data?.forEach(r => attSet.set(r.service_occurrence_id, r))
        vol.data?.forEach(r => volSet.add(r.service_occurrence_id))
        res.data?.forEach(r => resSet.add(r.service_occurrence_id))
        giv.data?.forEach(r => givSet.add(r.service_occurrence_id))
      }

      for (const occ of typedOccurrences) {
        let attendance_entered = false
        let main_attendance_entered = false
        let kids_attendance_entered = !churchData.tracks_kids_attendance
        let youth_attendance_entered = !churchData.tracks_youth_attendance
        const attRow = attSet.get(occ.id)
        if (attRow) {
           main_attendance_entered = attRow.main_attendance !== null
           kids_attendance_entered = churchData.tracks_kids_attendance ? attRow.kids_attendance !== null : true
           youth_attendance_entered = churchData.tracks_youth_attendance ? attRow.youth_attendance !== null : true
           attendance_entered = main_attendance_entered && kids_attendance_entered && youth_attendance_entered
        }

        // P12: pick the schedule version effective on this service_date
        // Bulletproof mapping for PostgREST join results (can be array or object depending on aliasing)
        const tmplJoin = Array.isArray(occ.template) ? occ.template[0] : occ.template
        const locJoin = Array.isArray(occ.location) ? occ.location[0] : occ.location
        
        const versions = tmplJoin?.service_schedule_versions ?? []
        const effectiveVersion = (versions as any[])
          .filter((sv: any) => !sv.effective_start_date || sv.effective_start_date <= occ.service_date)
          .sort((a: any, b: any) => (b.effective_start_date ?? '').localeCompare(a.effective_start_date ?? ''))[0]

        existingCards.push({
          type: 'existing',
          occurrence_id: occ.id,
          service_name: tmplJoin?.display_name ?? 'Untitled Service',
          location_name: locJoin?.name ?? '',
          start_time: effectiveVersion?.start_time ?? null,
          service_date: occ.service_date,
          attendance_entered,
          main_attendance_entered,
          kids_attendance_entered,
          youth_attendance_entered,
          volunteers_entered: volSet.has(occ.id),
          responses_entered: resSet.has(occ.id),
          giving_entered: givSet.has(occ.id),
        })
      }

      // P12b — scheduled but no occurrence yet
      // T1 gate: only templates with a primary_tag_id appear (active_tagged_services rule)
      const { data: rawTemplates } = await supabase
        .from('service_templates')
        .select(`id, display_name, sort_order, location_id, church_locations(name), service_schedule_versions(start_time, day_of_week, effective_start_date, is_active)`)
        .eq('church_id', churchId)
        .eq('is_active', true)
        .not('primary_tag_id', 'is', null)

      const templates = (rawTemplates ?? []) as TemplateRow[]
      setTemplateCount(templates.length)

      const scheduledCards: ScheduledCard[] = []
      for (const tmpl of templates) {
        // Only schedules that are active AND already effective (not future-dated)
        const activeSchedules = tmpl.service_schedule_versions.filter(sv =>
          sv.is_active && (!sv.effective_start_date || sv.effective_start_date <= today)
        )
        for (const sv of activeSchedules) {
          const expectedDate = getMostRecentWeekday(todayDate, sv.day_of_week)
          const expectedStr = toLocalDateString(expectedDate)

          if (expectedStr < sinceStr || expectedStr > today) continue
          const alreadyExists = existingCards.some(
            c => c.service_date === expectedStr && c.service_name === tmpl.display_name
          )
          if (!alreadyExists) {
            scheduledCards.push({
              type: 'scheduled',
              template_id: tmpl.id,
              service_name: tmpl.display_name,
              location_name: tmpl.church_locations?.[0]?.name ?? '',
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

  // Hierarchy Logic
  const uniqueLocations = new Set(cards.map(c => c.location_name))
  const isMultiLocation = uniqueLocations.size > 1

  // Primary grouping
  const groupedByLocation = cards.reduce<Record<string, Record<string, ServiceCard[]>>>((acc, card) => {
    const loc = card.location_name || 'General'
    const date = card.type === 'existing' ? card.service_date : card.expected_date
    if (!acc[loc]) acc[loc] = {}
    if (!acc[loc][date]) acc[loc][date] = []
    acc[loc][date].push(card)
    return acc
  }, {})

  const sortedLocations = Object.keys(groupedByLocation).sort()

  const getSortedDates = (dates: string[], group: Record<string, ServiceCard[]>) => {
    return dates.sort((a, b) => {
      if (!church) return b.localeCompare(a)
      // Incomplete dates first
      const aComplete = group[a].every(c =>
        c.type === 'existing' ? completionStatus(c, church) === 'complete' : false
      )
      const bComplete = group[b].every(c =>
        c.type === 'existing' ? completionStatus(c, church) === 'complete' : false
      )
      if (aComplete !== bComplete) return aComplete ? 1 : -1
      return b.localeCompare(a)
    })
  }

  const handleTap = useCallback(async (card: ServiceCard) => {
    if (tapping.current) return // N2: debounce
    tapping.current = true
    setTimeout(() => { tapping.current = false }, 800)

    if (card.type === 'existing') {
      // Write session anchor
      const sessionData = {
        occurrenceId: card.occurrence_id,
        serviceDisplayName: card.service_name,
        serviceDate: card.service_date,
        locationName: card.location_name,
      }
      setSession(sessionData)
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
        const sessionData = {
          occurrenceId: occurrence_id,
          serviceDisplayName: card.service_name,
          serviceDate: card.expected_date,
          locationName: card.location_name,
        }
        setSession(sessionData)
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
        ) : sortedLocations.length === 0 ? (
          /* E5 / E6 — Empty states */
          <div className="text-center py-16 px-4">
            {role === 'editor' ? (
              <p className="text-gray-500 text-sm">No services this week. Contact your admin.</p>
            ) : templateCount === 0 ? (
              /* E6 — State 5: Setup Incomplete */
              <div className="max-w-md mx-auto">
                <p className="font-semibold text-gray-900 text-lg mb-2">Welcome to Sunday Tally</p>
                <p className="text-sm text-gray-500 mb-6">Let's finish setting up your church. You need to configure at least one service location and template before you can log data.</p>
                
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left mb-6 space-y-3">
                   <div className="flex items-center text-sm font-medium text-green-700">
                      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Church Account Created
                   </div>
                   <div className="flex items-center text-sm font-medium text-gray-400">
                      <div className="w-5 h-5 mr-3 rounded-full border-2 border-gray-300" />
                      Locations & Service Templates
                   </div>
                </div>

                <Link href="/settings/services"
                  className="inline-flex justify-center flex-1 w-full bg-gray-900 text-white rounded-lg px-4 py-3 text-sm font-medium hover:bg-gray-700 transition">
                  Continue Setup
                </Link>
              </div>
            ) : (
              /* E5 — State 4: No services this week */
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
          <div className="space-y-10">
            {sortedLocations.map(locName => {
              const datesInLoc = Object.keys(groupedByLocation[locName])
              const sortedDates = getSortedDates(datesInLoc, groupedByLocation[locName])

              return (
                <div key={locName}>
                  {isMultiLocation && (
                    <div className="flex items-center gap-2 mb-4 px-1">
                      <div className="p-1.5 bg-gray-900 rounded-lg text-white">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">{locName}</h2>
                    </div>
                  )}

                  <div className="space-y-8">
                    {sortedDates.map(date => {
                      const dayCards = groupedByLocation[locName][date]
                      const existingInDay = dayCards.filter(c => c.type === 'existing') as OccurrenceCard[]
                      const completionCounts = existingInDay.reduce((acc, card) => {
                        acc.total += 1
                        if (card.main_attendance_entered) acc.complete += 1
                        if (church.tracks_kids_attendance) { acc.total += 1; if (card.kids_attendance_entered) acc.complete += 1 }
                        if (church.tracks_youth_attendance) { acc.total += 1; if (card.youth_attendance_entered) acc.complete += 1 }
                        if (church.tracks_volunteers) { acc.total += 1; if (card.volunteers_entered) acc.complete += 1 }
                        if (church.tracks_responses) { acc.total += 1; if (card.responses_entered) acc.complete += 1 }
                        if (church.tracks_giving) { acc.total += 1; if (card.giving_entered) acc.complete += 1 }
                        return acc
                      }, { complete: 0, total: 0 })
                      
                      const allDone = completionCounts.total > 0 && completionCounts.complete === completionCounts.total && existingInDay.length === dayCards.length

                      return (
                        <div key={date}>
                          <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{formatDate(date)}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              allDone ? 'bg-green-100 text-green-700' :
                              completionCounts.complete > 0 ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {allDone ? 'Complete' : completionCounts.total === 0 ? 'Not started' : `${completionCounts.complete}/${completionCounts.total} entered`}
                            </span>
                          </div>

                          <div className="space-y-3">
                            {dayCards.map((card) => {
                              const cardKey = card.type === 'existing' ? card.occurrence_id : card.template_id + (card as ScheduledCard).expected_date
                              const isCreating = creatingId === (card.type === 'scheduled' ? card.template_id + (card as ScheduledCard).expected_date : '')
                              const status = card.type === 'existing' ? completionStatus(card, church) : 'empty'
                              const checklist = getChecklistLabels(card, church)
                              const checklistTotal = checklist.done.length + checklist.missing.length
                              const progressLabel = checklistTotal > 0 ? `${checklist.done.length}/${checklistTotal} entered` : 'Nothing tracked'

                              return (
                                <button
                                  key={cardKey}
                                  onClick={() => handleTap(card)}
                                  disabled={isCreating}
                                  className="w-full text-left bg-white border border-gray-100 rounded-2xl p-4 flex items-start justify-between hover:border-gray-300 hover:shadow-sm active:bg-gray-50 transition-all disabled:opacity-60 group shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 text-base leading-tight group-hover:text-black transition-colors">{card.service_name}</p>
                                    
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500 font-semibold">
                                      <div className="flex items-center gap-1.5 min-w-fit">
                                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>{card.start_time ? formatTime(card.start_time) : 'No time set'}</span>
                                      </div>
                                      {!isMultiLocation && card.location_name && (
                                        <div className="flex items-center gap-1.5 min-w-fit">
                                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                          </svg>
                                          <span>{card.location_name}</span>
                                        </div>
                                      )}
                                      {card.type === 'scheduled' && (
                                        <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider text-[9px] font-black">Planned</span>
                                      )}
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-gray-50">
                                      {checklist.missing.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                          {checklist.missing.map(label => (
                                            <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 text-gray-500 text-[10px] font-bold border border-gray-100">
                                              <div className="w-1 h-1 rounded-full bg-gray-300" />
                                              {label}
                                            </span >
                                          ))}
                                          <span className="text-[10px] text-gray-400 font-bold ml-1 flex items-center italic low-caps">missing</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 text-[10px] font-black text-green-600 uppercase tracking-widest">
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                          Fully Submitted
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="ml-4 mt-0.5 flex-shrink-0">
                                    {isCreating ? (
                                      <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                                    ) : (
                                      <div className={`p-1.5 rounded-xl border transition-all ${
                                        status === 'complete' ? 'bg-green-50 text-green-600 border-green-100' : 
                                        status === 'partial' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                        'bg-gray-50 text-gray-400 border-gray-100'
                                      }`}>
                                        {status === 'complete' ? (
                                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        ) : status === 'partial' ? (
                                          <div className="w-4 h-4 flex items-center justify-center font-black text-xs">!</div>
                                        ) : (
                                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        )}
                                      </div>
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
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
