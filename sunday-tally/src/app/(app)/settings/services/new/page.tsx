'use client'

// ─────────────────────────────────────────────────────────────────────────
// NEW SERVICE — /settings/services/new — G2
//
// Two-step flow mirroring onboarding T6 + T_SCHED visual + DS:
//   Step 1: display_name (required) · location (required, hidden if single-campus)
//           · primary tag (required) · optional subtags
//   Step 2: cadence — day_of_week · start_time · effective_start_date
//
// On final save:
//   1. createServiceAction() → INSERT service_template + service_template_tags
//   2. saveScheduleAction()  → INSERT service_schedule_versions (reused from onboarding)
// Owner/admin only (gate is enforced server-side in createServiceAction).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { Ico, accentForRole, roleLabel } from '@/app/(app)/entries/ui'
import { createServiceAction, getNewServiceFormData } from '../actions'
import { saveScheduleAction } from '@/app/onboarding/schedule/actions'
import type { UserRole } from '@/types'

// ── day labels (T_SCHED E2) ────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function nextOccurrenceOfDay(dow: number): string {
  const today = new Date()
  const diff = (dow - today.getDay() + 7) % 7
  const d = new Date(today)
  d.setDate(today.getDate() + (diff === 0 ? 7 : diff))
  return d.toISOString().split('T')[0]
}

// ── form data types ────────────────────────────────────────────────────
interface TagOption {
  id: string
  name: string
  code: string
  tag_role: string
}
interface LocationOption {
  id: string
  name: string
}

// ── shared input style (matches T6 onboarding) ────────────────────────
const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[14px] text-slate-900 placeholder-slate-400 focus:border-[#4F6EF7] focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/30 disabled:opacity-50'
const labelCls = 'block text-[13px] font-semibold text-slate-700 mb-1.5'

export default function NewServicePage() {
  const router = useRouter()

  // ── resolved data ──────────────────────────────────────────────────
  const [role] = useState<UserRole>('admin') // AppLayout only needs role for nav; gate is server-side
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [allTags, setAllTags] = useState<TagOption[]>([])
  const [isMultiCampus, setIsMultiCampus] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── step 1 state ───────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1)
  const [displayName, setDisplayName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [primaryTagId, setPrimaryTagId] = useState('')
  const [subtagIds, setSubtagIds] = useState<string[]>([])
  const [step1Error, setStep1Error] = useState<string | null>(null)

  // ── step 2 state ───────────────────────────────────────────────────
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [startTime, setStartTime] = useState('09:00')
  const [effectiveDate, setEffectiveDate] = useState(nextOccurrenceOfDay(0))
  const [step2Error, setStep2Error] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [isPending, startTransition] = useTransition()

  // ── load form data ─────────────────────────────────────────────────
  useEffect(() => {
    getNewServiceFormData().then(data => {
      if (!data) {
        setLoadError('You don\'t have permission to add services, or no church was found.')
        return
      }
      setLocations(data.locations)
      setAllTags(data.tags)
      setIsMultiCampus(data.isMultiCampus)
      if (!data.isMultiCampus && data.locations.length === 1) {
        setLocationId(data.locations[0].id)
      }
    })
  }, [])

  // ── step 1 validation ──────────────────────────────────────────────
  const step1Valid =
    displayName.trim().length > 0 &&
    locationId.length > 0 &&
    primaryTagId.length > 0

  function handleDayChange(dow: number) {
    setDayOfWeek(dow)
    setEffectiveDate(nextOccurrenceOfDay(dow))
  }

  function handleStep1Next(e: React.FormEvent) {
    e.preventDefault()
    setStep1Error(null)
    if (!step1Valid) { setStep1Error('Please fill in all required fields.'); return }
    setStep(2)
  }

  // ── final submit (step 2) ──────────────────────────────────────────
  function handleStep2Save(e: React.FormEvent) {
    e.preventDefault()
    setStep2Error(null)
    if (!startTime || !effectiveDate) { setStep2Error('Please fill in all schedule fields.'); return }

    startTransition(async () => {
      // 1. Create service template
      const createResult = await createServiceAction({
        display_name: displayName.trim(),
        location_id: locationId === 'ALL' || locationId === 'CHURCH_WIDE' ? undefined : locationId,
        all_locations: locationId === 'ALL',
        church_wide: locationId === 'CHURCH_WIDE',   // one campus-less template (0036)
        primary_tag_id: primaryTagId,
        subtag_ids: subtagIds,
      })

      const templateIds = createResult.templateIds ?? []
      if (templateIds.length === 0) {
        setStep2Error(createResult.error ?? 'Failed to create service.')
        return
      }

      // 2. Apply the schedule to each created service (one per location).
      for (const tid of templateIds) {
        const schedResult = await saveScheduleAction(tid, dayOfWeek, startTime, effectiveDate)
        if (schedResult.error) {
          setStep2Error(`Service created but schedule could not be saved: ${schedResult.error}`)
          return
        }
      }

      setSaved(true)
      setTimeout(() => router.push('/settings/services'), 800)
    })
  }

  // ── subtag toggle ──────────────────────────────────────────────────
  function toggleSubtag(id: string) {
    setSubtagIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }

  // ── tag options for primary picker (all tags) ──────────────────────
  const primaryTagOptions = allTags
  // ── subtag options (all except selected primary) ───────────────────
  const subtagOptions = allTags.filter(t => t.id !== primaryTagId)

  // ── early error state ──────────────────────────────────────────────
  if (loadError) {
    return (
      <AppLayout role={role}>
        <div className="flex min-h-full items-center justify-center p-8">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-700">{loadError}</p>
            <button onClick={() => router.push('/settings/services')}
              className="mt-4 text-[13px] font-semibold text-[#3D5BD4] hover:underline">
              Back to services
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

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
              onClick={() => step === 2 ? setStep(1) : router.push('/settings/services')}
              aria-label={step === 2 ? 'Back to service details' : 'Back to services'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.left className="h-5 w-5" />
            </button>
            <div>
              {/* FLAG: copy for this new screen has no IRIS map — invented below, consistent with T6 pattern */}
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>
                {step === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}
              </div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">
                {step === 1 ? 'New service' : 'When does it run?'}
              </h1>
            </div>
          </div>
          {/* Step indicator */}
          <div className="mx-auto flex max-w-2xl gap-1 px-4 pb-3">
            <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${step >= 1 ? 'bg-[#4F6EF7]' : 'bg-slate-200'}`} />
            <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${step >= 2 ? 'bg-[#4F6EF7]' : 'bg-slate-200'}`} />
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-6">

          {/* ── Step 1: Service details (mirrors T6) ──────────────────── */}
          {step === 1 && (
            <form onSubmit={handleStep1Next} className="space-y-5">
              <p className="text-[13px] leading-relaxed text-slate-500">
                Define the service — you can change these later in Settings.
              </p>

              {/* Display name — E2a */}
              <div>
                <label htmlFor="display_name" className={labelCls}>
                  What do you call this service?{' '}
                  <span className="text-slate-400 font-normal">It appears on every Sunday screen.</span>
                </label>
                <input
                  id="display_name"
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="9am Service"
                  required
                  disabled={isPending}
                  className={inputCls}
                />
              </div>

              {/* Location picker — E2b (multi-campus only, N37) */}
              {isMultiCampus && (
                <div>
                  <label htmlFor="location_id" className={labelCls}>Location</label>
                  <select
                    id="location_id"
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    required
                    disabled={isPending}
                    className={inputCls}
                  >
                    <option value="">Select a location</option>
                    <option value="ALL">All locations (one service at each campus)</option>
                    <option value="CHURCH_WIDE">Church-wide (one shared count for the whole church)</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  {locationId === 'CHURCH_WIDE' && (
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                      No campus — everyone sees and edits the same weekly count (good for groups tracked church-wide).
                    </p>
                  )}
                </div>
              )}

              {/* Primary tag — E2e */}
              <div>
                <label htmlFor="primary_tag" className={labelCls}>
                  Which tag best describes this service?{' '}
                  <span className="text-slate-400 font-normal">This groups it in your dashboard.</span>
                </label>
                {primaryTagOptions.length === 0 ? (
                  <p className="text-[12px] text-[#B45309]">
                    No tags yet.{' '}
                    <button
                      type="button"
                      onClick={() => router.push('/settings/track')}
                      className="font-semibold text-[#3D5BD4] hover:underline"
                    >
                      Create a ministry first →
                    </button>
                  </p>
                ) : (
                  <select
                    id="primary_tag"
                    value={primaryTagId}
                    onChange={e => { setPrimaryTagId(e.target.value); setSubtagIds(prev => prev.filter(id => id !== e.target.value)) }}
                    required
                    disabled={isPending}
                    className={inputCls}
                  >
                    <option value="">Select a tag</option>
                    {primaryTagOptions.map(t => (
                      <option key={t.id} value={t.id}>{t.name} · {roleLabel(t.tag_role)}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Subtags — E2f (optional) */}
              {subtagOptions.length > 0 && (
                <div>
                  <label className={labelCls}>
                    Subtags{' '}
                    <span className="text-slate-400 font-normal">(optional) For campaigns, series, or special groupings.</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {subtagOptions.map(t => {
                      const selected = subtagIds.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleSubtag(t.id)}
                          disabled={isPending}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 ${
                            selected
                              ? 'border-[#4F6EF7] bg-[#4F6EF7]/10 text-[#3D5BD4]'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-[#4F6EF7]/40'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${accentForRole(t.tag_role)}`} aria-hidden />
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Need a new ministry?{' '}
                    <button type="button" onClick={() => router.push('/settings/track')} className="font-semibold text-[#3D5BD4] hover:underline">
                      Manage ministries →
                    </button>
                  </p>
                </div>
              )}

              {step1Error && (
                <p className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-[12px] font-medium text-[#B45309]">
                  {step1Error}
                </p>
              )}

              <button
                type="submit"
                disabled={!step1Valid || isPending}
                className="w-full rounded-xl bg-slate-900 py-3.5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue — set when this service runs →
              </button>
            </form>
          )}

          {/* ── Step 2: Cadence (mirrors T_SCHED) ─────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleStep2Save} className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[13px] font-semibold text-slate-700">{displayName}</p>
                {!isMultiCampus
                  ? null
                  : <p className="text-[12px] text-slate-400">{locationId === 'ALL' ? 'All locations' : (locations.find(l => l.id === locationId)?.name ?? '')}</p>
                }
              </div>

              <p className="text-[13px] leading-relaxed text-slate-500">
                Set the recurring schedule — so we know which weeks to expect data.
              </p>

              {/* Day of week — T_SCHED E2 */}
              <div>
                <label className={labelCls}>Which day does this service run?</label>
                <div className="flex gap-1.5">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleDayChange(i)}
                      className={`flex-1 rounded-lg border py-2 text-[12px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 ${
                        dayOfWeek === i
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 text-slate-600 hover:border-slate-600'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start time — T_SCHED E3 */}
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

              {/* Effective date — T_SCHED E4 */}
              <div>
                <label htmlFor="effective_date" className={labelCls}>
                  When does this schedule start?{' '}
                  <span className="text-slate-400 font-normal">This tells us which weeks to expect data.</span>
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

              {step2Error && (
                <p className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-[12px] font-medium text-[#B45309]">
                  {step2Error}
                </p>
              )}

              <button
                type="submit"
                disabled={isPending || saved}
                className="w-full rounded-xl bg-slate-900 py-3.5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saved ? '✓ Saved. Returning…' : isPending ? 'Saving…' : 'Save service'}
              </button>
            </form>
          )}
        </main>
      </div>
    </AppLayout>
  )
}
