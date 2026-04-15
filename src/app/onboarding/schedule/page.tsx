'use client'

// T_SCHED — /onboarding/schedule — Step 4
// IRIS_TSCHED_ELEMENT_MAP.md v1.1: E1-E7 + multi-template loop (E6, N31b)

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import OnboardingLayout from '@/components/layouts/OnboardingLayout'
import { getUnscheduledTemplates, saveScheduleAction } from './actions'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function nextOccurrenceOfDay(dayOfWeek: number): string {
  const today = new Date()
  const diff = (dayOfWeek - today.getDay() + 7) % 7
  const next = new Date(today)
  next.setDate(today.getDate() + (diff === 0 ? 7 : diff))
  return next.toISOString().split('T')[0]
}

export default function OnboardingSchedulePage() {
  const [unscheduled, setUnscheduled] = useState<{ id: string; display_name: string }[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [dayOfWeek, setDayOfWeek] = useState(0) // Sunday
  const [startTime, setStartTime] = useState('09:00')
  const [effectiveDate, setEffectiveDate] = useState(nextOccurrenceOfDay(0))
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    getUnscheduledTemplates().then(templates => {
      setUnscheduled(templates)
    })
  }, [])

  const current = unscheduled[currentIdx]
  const remaining = unscheduled.slice(currentIdx + 1)
  const allScheduled = unscheduled.length === 0

  function handleDayChange(day: number) {
    setDayOfWeek(day)
    setEffectiveDate(nextOccurrenceOfDay(day)) // N31: default to next occurrence
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!current || isPending) return
    setError(null)

    startTransition(async () => {
      const result = await saveScheduleAction(current.id, dayOfWeek, startTime, effectiveDate)
      if (result.error) { setError(result.error); return }

      setJustSaved(current.display_name)

      if (remaining.length === 0) {
        // All scheduled — continue to T9 (N31b)
        router.push('/onboarding/invite')
      } else {
        // More to schedule — advance (E6)
        setCurrentIdx(prev => prev + 1)
        setJustSaved(null)
        setDayOfWeek(0)
        setStartTime('09:00')
        setEffectiveDate(nextOccurrenceOfDay(0))
      }
    })
  }

  if (allScheduled && !current) {
    return (
      <OnboardingLayout step={4} onBack={() => router.push('/onboarding/services')}>
        <div className="text-center py-12">
          <p className="text-gray-500 text-sm">All services are scheduled.</p>
          <button onClick={() => router.push('/onboarding/invite')}
            className="mt-4 w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors">
            Continue — invite your team next.
          </button>
        </div>
      </OnboardingLayout>
    )
  }

  if (!current) {
    return (
      <OnboardingLayout step={4} onBack={() => router.push('/onboarding/services')}>
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
        </div>
      </OnboardingLayout>
    )
  }

  return (
    <OnboardingLayout step={4} onBack={() => router.push('/onboarding/services')}>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">When do you meet?</h1>
      <p className="text-sm text-gray-500 mb-2">
        Setting up: <span className="font-medium text-gray-900">{current.display_name}</span>
      </p>
      {unscheduled.length > 1 && (
        <p className="text-xs text-gray-400 mb-6">
          {currentIdx + 1} of {unscheduled.length} services
        </p>
      )}

      {/* E6 — Just saved confirmation + remaining list */}
      {justSaved && remaining.length > 0 && (
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-sm text-gray-700 font-medium">Done — {justSaved} is scheduled.</p>
          <p className="text-xs text-gray-500 mt-1">You have {remaining.length} more service{remaining.length > 1 ? 's' : ''} to schedule:</p>
          <ul className="mt-2 space-y-0.5">
            {remaining.map(t => <li key={t.id} className="text-xs text-gray-600">• {t.display_name}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* E2 — Day of week */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Which day does this service run?
          </label>
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDayChange(i)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  dayOfWeek === i
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-600'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* E3 — Start time */}
        <div>
          <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
            What time does it start?
          </label>
          <input
            id="startTime"
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {/* E4 — Effective start date */}
        <div>
          <label htmlFor="effectiveDate" className="block text-sm font-medium text-gray-700 mb-1">
            When does this schedule start?{' '}
            <span className="text-gray-400 font-normal">— so we know which weeks to expect data.</span>
          </label>
          <input
            id="effectiveDate"
            type="date"
            value={effectiveDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => setEffectiveDate(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* E5 — Save / Continue */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending
            ? 'Saving...'
            : remaining.length > 0
              ? `Save and schedule next service →`
              : 'Continue — invite your team next.'}
        </button>
      </form>
    </OnboardingLayout>
  )
}
