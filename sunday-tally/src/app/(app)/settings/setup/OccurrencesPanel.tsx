'use client'

// OCCURRENCES PANEL — /settings/setup?tab=occurrences
// Shows each service template's schedule (the "when" side of setup).
// Links out to /settings/services/[id]/schedule for editing.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const DAY_NAMES_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

function fmt12h(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr, 10)
  const m = (mStr ?? '00').padStart(2, '0')
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${ampm}`
}

interface OccSvc {
  id: string
  name: string
  sort_order: number
  schedule: {
    day_of_week: number
    start_time: string
    frequency: 'specific' | 'weekly' | 'monthly'
  } | null
}

export function OccurrencesPanel({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<OccSvc[]>([])

  const load = useCallback(async (cid: string) => {
    const { data: tmplRows } = await supabase
      .from('service_templates')
      .select('id, display_name, sort_order')
      .eq('church_id', cid)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .range(0, 999)

    const templates = ((tmplRows ?? []) as { id: string; display_name: string | null; sort_order: number | null }[])
      .map(t => ({ id: t.id, name: t.display_name ?? 'Service', sort_order: t.sort_order ?? 0 }))

    const schedByTemplate = new Map<string, OccSvc['schedule']>()
    if (templates.length > 0) {
      type SchedRow = { service_template_id: string; day_of_week: number; start_time: string; frequency?: string }
      const { data: schedRows } = await supabase
        .from('service_schedule_versions')
        .select('*')
        .in('service_template_id', templates.map(t => t.id))
        .eq('is_active', true)
        .is('effective_end_date', null)
        .range(0, 999)
      for (const s of ((schedRows ?? []) as SchedRow[])) {
        const freq = s.frequency === 'weekly' || s.frequency === 'monthly' ? s.frequency : 'specific'
        schedByTemplate.set(s.service_template_id, {
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          frequency: freq,
        })
      }
    }

    setServices(templates.map(t => ({ ...t, schedule: schedByTemplate.get(t.id) ?? null })))
  }, [supabase])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('church_id')
        .eq('user_id', user.id).eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1).maybeSingle()
      if (!membership) { setLoading(false); return }
      await load(membership.church_id as string)
      setLoading(false)
    })()
  }, [supabase, load])

  if (loading) return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-400">Loading…</div>
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" style={{ fontFamily: embedded ? undefined : "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">Occurrences</h2>
        <p className="mt-1 text-sm text-slate-500">
          Each service runs on a schedule. Sunday Tally creates an occurrence each time a service meets — that&apos;s what your team enters numbers against each week.
        </p>
      </div>

      <div className="space-y-2">
        {services.map(svc => {
          const s = svc.schedule
          let label = 'No schedule set'
          let sublabel = 'Set a schedule so occurrences generate automatically.'
          if (s) {
            if (s.frequency === 'weekly') {
              label = 'Weekly'
              sublabel = 'One occurrence generated per week, any day.'
            } else if (s.frequency === 'monthly') {
              label = 'Monthly'
              sublabel = 'One occurrence generated per month.'
            } else {
              label = `${DAY_NAMES_PLURAL[s.day_of_week]} at ${fmt12h(s.start_time)}`
              sublabel = 'One occurrence generated each time this service meets.'
            }
          }

          return (
            <div key={svc.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{svc.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${s ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-xs font-medium text-slate-600">{label}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">{sublabel}</div>
              </div>
              <Link
                href={`/settings/services/${svc.id}/schedule`}
                className="mt-0.5 shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-[#4F6EF7] hover:text-[#4F6EF7]"
              >
                {s ? 'Change' : 'Set schedule'}
              </Link>
            </div>
          )
        })}

        {services.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">No services yet.</p>
            <p className="mt-1 text-xs text-slate-400">Add a service in the Services tab first.</p>
          </div>
        )}
      </div>
    </div>
  )
}
