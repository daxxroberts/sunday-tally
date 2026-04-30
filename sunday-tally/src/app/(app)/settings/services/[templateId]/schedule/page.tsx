'use client'

// T_SCHED_SETTINGS — /settings/services/[templateId]/schedule
// IRIS_TSCHED_ELEMENT_MAP.md: Settings context
// E6: show current schedule | E7: change warning | N29: new version, close prior

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { saveScheduleAction } from '@/app/onboarding/schedule/actions'
import type { UserRole } from '@/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function nextOccurrenceOfDay(dow: number): string {
  const today = new Date()
  const diff = (dow - today.getDay() + 7) % 7
  const d = new Date(today)
  d.setDate(today.getDate() + (diff === 0 ? 7 : diff))
  return d.toISOString().split('T')[0]
}

export default function SettingsSchedulePage() {
  const params = useParams()
  const templateId = params.templateId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('admin')
  const [templateName, setTemplateName] = useState('')
  const [currentSchedule, setCurrentSchedule] = useState<{day: number; time: string; since: string} | null>(null)
  const [changingSchedule, setChangingSchedule] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [startTime, setStartTime] = useState('09:00')
  const [effectiveDate, setEffectiveDate] = useState(nextOccurrenceOfDay(0))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role').eq('user_id', user.id).eq('is_active', true).single()
      if (membership) setRole(membership.role as UserRole)
      const { data: tmpl } = await supabase.from('service_templates').select('display_name').eq('id', templateId).single()
      if (tmpl) setTemplateName(tmpl.display_name)
      const { data: sv } = await supabase.from('service_schedule_versions').select('day_of_week, start_time, effective_start_date').eq('service_template_id', templateId).eq('is_active', true).maybeSingle()
      if (sv) setCurrentSchedule({ day: sv.day_of_week, time: sv.start_time, since: sv.effective_start_date })
    })
  }, [templateId])

  function handleDayChange(dow: number) {
    setDayOfWeek(dow)
    setEffectiveDate(nextOccurrenceOfDay(dow))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await saveScheduleAction(templateId, dayOfWeek, startTime, effectiveDate)
      if (result.error) { setError(result.error); return }
      setSaved(true)
      setTimeout(() => router.push('/settings/services'), 1000)
    })
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings/services')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <p className="font-semibold text-gray-900 text-sm">Schedule</p>
          <p className="text-xs text-gray-400">{templateName}</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* E6 — Current schedule */}
        {currentSchedule && !changingSchedule && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{DAYS[currentSchedule.day]}s · {currentSchedule.time} · since {currentSchedule.since}</p>
            <button onClick={() => setChangingSchedule(true)} className="mt-2 text-xs text-blue-600 hover:underline">Change schedule</button>
          </div>
        )}

        {/* E7 + new schedule form */}
        {(!currentSchedule || changingSchedule) && (
          <form onSubmit={handleSave} className="space-y-5">
            {changingSchedule && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-800">Starting a new schedule — what date does the change take effect?</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Day</label>
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => (
                  <button key={d} type="button" onClick={() => handleDayChange(i)} className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${dayOfWeek === i ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-600 border-gray-300 hover:border-gray-600'}`}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective from</label>
              <input type="date" value={effectiveDate} min={new Date().toISOString().split('T')[0]} onChange={e => setEffectiveDate(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={isPending} className="w-full bg-gray-900 text-white rounded-xl py-3.5 font-medium text-sm hover:bg-gray-700 disabled:opacity-40">
              {saved ? '✓ Saved' : isPending ? 'Saving...' : 'Save schedule'}
            </button>
            {changingSchedule && (
              <button type="button" onClick={() => setChangingSchedule(false)} className="w-full text-gray-400 text-sm py-2">Cancel</button>
            )}
          </form>
        )}
      </div>
    </AppLayout>
  )
}
