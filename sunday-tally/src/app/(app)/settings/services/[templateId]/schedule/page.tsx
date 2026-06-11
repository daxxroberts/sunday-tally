'use client'

// T_SCHED_SETTINGS — /settings/services/[templateId]/schedule
// IRIS_TSCHED_ELEMENT_MAP.md: Settings context
// E6: show current schedule | E7: change warning | N29: new version, close prior
//
// You arrive here by clicking "Change schedule" on the service card — so land
// DIRECTLY on the editable form, pre-filled with the current day/time. The old
// read-only-summary-then-click-"Change schedule"-again step was a redundant
// extra click; the current schedule now shows as a one-line note above the form.
//
// Visual system mirrors /settings/services/new (Fira Sans, slate-50 shell,
// shared input styles, brand accents) so it reads like the rest of the app.

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { Ico } from '@/app/(app)/entries/ui'
import { createClient } from '@/lib/supabase/client'
import { saveScheduleAction } from '@/app/onboarding/schedule/actions'
import type { UserRole } from '@/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Frequency = 'specific' | 'weekly' | 'monthly'

const FREQ_OPTIONS: { value: Frequency; label: string; hint: string }[] = [
  { value: 'specific', label: 'On a set day and time', hint: 'A gathering, like Sundays at 9 AM. Creates one occurrence each time it meets.' },
  { value: 'weekly',    label: 'Weekly',  hint: 'Counted once a week, no set day or time. Good for giving.' },
  { value: 'monthly',   label: 'Monthly', hint: 'Counted once a month, no set day or time.' },
]

// Shared field styles (match /settings/services/new)
const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[14px] text-slate-900 placeholder-slate-400 focus:border-[#4F6EF7] focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/30 disabled:opacity-50'
const labelCls = 'block text-[13px] font-semibold text-slate-700 mb-1.5'

function nextOccurrenceOfDay(dow: number): string {
  const today = new Date()
  const diff = (dow - today.getDay() + 7) % 7
  const d = new Date(today)
  d.setDate(today.getDate() + (diff === 0 ? 7 : diff))
  return d.toISOString().split('T')[0]
}

// "HH:MM" (24h) → "9:00 AM"
function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h)) return hhmm
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${ampm}`
}

export default function SettingsSchedulePage() {
  const params = useParams()
  const templateId = params.templateId as string
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('admin')
  const [templateName, setTemplateName] = useState('')
  const [currentSchedule, setCurrentSchedule] = useState<{ day: number; time: string; since: string; frequency: Frequency } | null>(null)
  const [frequency, setFrequency] = useState<Frequency>('specific')
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
      // select('*') so this is safe whether or not the `frequency` column has
      // been migrated yet (PostgREST errors on selecting an unknown column).
      const { data: sv } = await supabase.from('service_schedule_versions').select('*').eq('service_template_id', templateId).eq('is_active', true).maybeSingle()
      if (sv) {
        const freq: Frequency = (sv.frequency as Frequency) ?? 'specific'
        setCurrentSchedule({ day: sv.day_of_week, time: sv.start_time, since: sv.effective_start_date, frequency: freq })
        // Pre-fill the form with the live values so editing starts from where the
        // schedule is, not from defaults. Effective date defaults forward (a new
        // version starts from the next occurrence).
        setFrequency(freq)
        setDayOfWeek(sv.day_of_week)
        setStartTime(sv.start_time)
        setEffectiveDate(nextOccurrenceOfDay(sv.day_of_week))
      }
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
      const result = await saveScheduleAction(templateId, dayOfWeek, startTime, effectiveDate, frequency)
      if (result.error) { setError(result.error); return }
      setSaved(true)
      setTimeout(() => router.push('/settings/services'), 1000)
    })
  }

  // Plain-language summary of the current schedule, cadence-aware.
  function describeCurrent(c: { day: number; time: string; frequency: Frequency }): string {
    if (c.frequency === 'weekly')  return 'Weekly (no set day or time)'
    if (c.frequency === 'monthly') return 'Monthly (no set day or time)'
    return `${DAYS_LONG[c.day]}s at ${prettyTime(c.time)}`
  }

  const isChange = !!currentSchedule

  return (
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3.5">
            <button
              onClick={() => router.push('/settings/services')}
              aria-label="Back to Services and Occurrences"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.left className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              {templateName && (
                <div className="truncate text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>
                  {templateName}
                </div>
              )}
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">
                {isChange ? 'Change schedule' : 'Set schedule'}
              </h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-6">
          <p className="mb-5 text-[13px] leading-relaxed text-slate-500">
            Set when this gathering happens. It tells us which weeks to expect data, and creates the occurrences you log in Entries.
          </p>

          {/* E6 + E7 — current schedule note. Saving starts a new version. */}
          {currentSchedule && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-4 py-3">
              <Ico.calendar className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
              <p className="text-[12px] leading-relaxed text-[#B45309]">
                Currently <span className="font-semibold">{describeCurrent(currentSchedule)}</span>, since {currentSchedule.since}.
                {' '}Saving starts a new schedule from the date you pick below.
              </p>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            {/* How often — the cadence. 'specific' reveals day + time; weekly /
                monthly are cadence-only occurrences (no clock), e.g. giving. */}
            <div>
              <label className={labelCls}>How often does it happen?</label>
              <div className="space-y-2">
                {FREQ_OPTIONS.map(opt => {
                  const selected = frequency === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFrequency(opt.value)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 ${
                        selected
                          ? 'border-[#4F6EF7] bg-[#4F6EF7]/5'
                          : 'border-slate-200 bg-white hover:border-[#4F6EF7]/40'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? 'border-[#4F6EF7]' : 'border-slate-300'
                      }`}>
                        {selected && <span className="h-2 w-2 rounded-full bg-[#4F6EF7]" />}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[14px] font-semibold ${selected ? 'text-[#3D5BD4]' : 'text-slate-800'}`}>{opt.label}</span>
                        <span className="block text-[12px] leading-relaxed text-slate-500">{opt.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Day + time — only for a set day & time. Weekly / monthly need no clock. */}
            {frequency === 'specific' && (
              <>
                <div>
                  <label className={labelCls}>Which day does it run?</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DAYS.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleDayChange(i)}
                        className={`rounded-lg border py-2 text-[12px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 ${
                          dayOfWeek === i
                            ? 'border-[#4F6EF7] bg-[#4F6EF7] text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-[#4F6EF7]/40'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="start_time" className={labelCls}>What time does it start?</label>
                  <input
                    id="start_time"
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    required
                    disabled={isPending}
                    className={inputCls}
                  />
                </div>
              </>
            )}

            {/* Effective from */}
            <div>
              <label htmlFor="effective_date" className={labelCls}>
                When does this schedule start?{' '}
                <span className="font-normal text-slate-400">We&apos;ll expect data from this date on.</span>
              </label>
              <input
                id="effective_date"
                type="date"
                value={effectiveDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setEffectiveDate(e.target.value)}
                required
                disabled={isPending}
                className={inputCls}
              />
            </div>

            {error && (
              <p className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-[12px] font-medium text-[#B45309]">
                {error}
              </p>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="submit"
                disabled={isPending || saved}
                className="w-full rounded-xl bg-slate-900 py-3.5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saved ? '✓ Saved. Returning…' : isPending ? 'Saving…' : 'Save schedule'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/settings/services')}
                className="w-full rounded-xl py-2.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </main>
      </div>
    </AppLayout>
  )
}
