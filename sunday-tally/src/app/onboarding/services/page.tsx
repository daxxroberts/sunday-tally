'use client'

// T6 — /onboarding/services — Step 3
// IRIS_T6_ELEMENT_MAP.md v1.1: E1-E5, E2e (primary tag), E2f (subtags)
// N34: cross-campus name preview | N36: deactivate if occurrences exist | N37: single-campus auto-assign

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import OnboardingLayout from '@/components/layouts/OnboardingLayout'
import { saveTemplatesAction, getChurchData, type TemplateInput } from './actions'
import { createMinistry, type TagRole } from '@/app/(app)/settings/track/actions'

const ROLE_OPTIONS: { value: TagRole; label: string }[] = [
  { value: 'ADULT_SERVICE', label: 'Adult' },
  { value: 'KIDS_MINISTRY',  label: 'Kids' },
  { value: 'YOUTH_MINISTRY', label: 'Students' },
  { value: 'OTHER',          label: 'Other' },
]

interface ServiceTag { id: string; name: string; code: string; tag_role: string | null }
interface Location { id: string; name: string }
interface Template { id: string | null; display_name: string; location_id: string; sort_order: number; primary_tag_id: string; subtag_ids: string[] }

const EMPTY_TEMPLATE = (locationId: string, order: number): Template => ({
  id: null, display_name: '', location_id: locationId, sort_order: order, primary_tag_id: '', subtag_ids: []
})

export default function OnboardingServicesPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [allTags, setAllTags] = useState<ServiceTag[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Inline ministry creation
  const [newMinName, setNewMinName] = useState('')
  const [newMinRole, setNewMinRole] = useState<TagRole>('ADULT_SERVICE')
  const [creatingMin, setCreatingMin] = useState(false)
  const [createMinError, setCreateMinError] = useState<string | null>(null)
  const [showCreateFor, setShowCreateFor] = useState<number | null>(null)

  useEffect(() => {
    getChurchData().then(data => {
      if (!data) return
      setLocations(data.locations)
      setAllTags(data.tags)
      if (data.templates.length > 0) {
        setTemplates(data.templates.map(t => ({
          ...t, id: t.id, subtag_ids: [],
        })))
      } else if (data.locations.length > 0) {
        setTemplates([EMPTY_TEMPLATE(data.locations[0].id, 1)])
      }
    })
  }, [])

  // D-046: primary tag picker — all active tags (effective_start/end_date removed in unified schema)
  const primaryTagOptions = allTags
  const multiCampus = locations.length > 1

  const hasValid = templates.some(t => t.display_name.trim() && t.primary_tag_id && t.location_id)

  function updateTemplate(idx: number, patch: Partial<Template>) {
    setTemplates(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
  }

  function addTemplate() {
    const locationId = locations[0]?.id ?? ''
    setTemplates(prev => [...prev, EMPTY_TEMPLATE(locationId, prev.length + 1)])
  }

  function removeTemplate(idx: number) {
    setTemplates(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleCreateMinistry(forTemplateIdx: number) {
    const name = newMinName.trim()
    if (!name) return
    setCreatingMin(true)
    setCreateMinError(null)
    const result = await createMinistry({ name, tag_role: newMinRole })
    if (result.ok && result.data) {
      const newTag: ServiceTag = {
        id: result.data.id,
        name: result.data.name,
        code: result.data.code,
        tag_role: result.data.tag_role,
      }
      setAllTags(prev => [...prev, newTag])
      // Auto-select for whichever service triggered the create if it has none yet
      if (!templates[forTemplateIdx]?.primary_tag_id) {
        updateTemplate(forTemplateIdx, { primary_tag_id: result.data.id })
      }
      setNewMinName('')
      setNewMinRole('ADULT_SERVICE')
      setShowCreateFor(null)
    } else {
      setCreateMinError(result.error ?? 'Could not create ministry.')
    }
    setCreatingMin(false)
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    const valid = templates.filter(t => t.display_name.trim() && t.primary_tag_id && t.location_id)
    if (!valid.length || isPending) return
    setError(null)

    const toSave: TemplateInput[] = valid.map((t, i) => ({ ...t, sort_order: i + 1 }))
    startTransition(async () => {
      const result = await saveTemplatesAction(toSave)
      if (result.error) { setError(result.error); return }
      router.push('/onboarding/schedule')
    })
  }

  return (
    <OnboardingLayout step={3} onBack={() => router.push('/onboarding/locations')}>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Your services</h1>
      <p className="text-sm text-gray-500 mb-8">
        Add one entry per service time. If the same ministry meets at 9am and 11am, add both and pick the same ministry for each — their numbers will total together on your dashboard.
      </p>

      <form onSubmit={handleContinue} className="space-y-6">
        {templates.map((tmpl, idx) => (
          <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Service {idx + 1}</span>
              {templates.length > 1 && (
                <button type="button" onClick={() => removeTemplate(idx)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
              )}
            </div>

            {/* E2a — Display name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What do you call this service?{' '}
                <span className="text-gray-400 font-normal">— this name appears on every Sunday screen.</span>
              </label>
              <input
                type="text"
                value={tmpl.display_name}
                onChange={e => updateTemplate(idx, { display_name: e.target.value })}
                placeholder="9am Service"
                disabled={isPending}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
              />
            </div>

            {/* E2b — Location picker (multi-campus only) — N37 */}
            {multiCampus && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={tmpl.location_id}
                  onChange={e => updateTemplate(idx, { location_id: e.target.value })}
                  disabled={isPending}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
                >
                  <option value="">Select a location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            {/* E2e — Primary ministry picker (D-046: undated only). Copy steers
                toward reusing ONE ministry across service times so they combine
                on the dashboard — the "Experience 1 / Experience 2" trap. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ministry
              </label>
              {primaryTagOptions.length === 0 ? (
                /* No ministries yet — create one inline, right here */
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">No ministries yet — add one to continue.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMinName}
                      onChange={e => { setNewMinName(e.target.value); setCreateMinError(null) }}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateMinistry(idx))}
                      placeholder="e.g. Main Service, Kids, Youth"
                      disabled={creatingMin}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7] focus:border-transparent disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => handleCreateMinistry(idx)}
                      disabled={!newMinName.trim() || creatingMin}
                      className="px-4 py-2.5 bg-[#4F6EF7] text-white text-sm font-medium rounded-lg hover:bg-[#3D5BD4] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {creatingMin ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {ROLE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setNewMinRole(opt.value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          newMinRole === opt.value
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-white text-gray-500 border-gray-300 hover:border-gray-500'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {createMinError && <p className="text-xs text-red-600">{createMinError}</p>}
                </div>
              ) : (
                /* Has ministries — dropdown + inline create option */
                <div className="space-y-2">
                  <select
                    value={tmpl.primary_tag_id}
                    onChange={e => updateTemplate(idx, { primary_tag_id: e.target.value })}
                    disabled={isPending}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">Select a ministry</option>
                    {primaryTagOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>

                  {showCreateFor === idx ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMinName}
                          onChange={e => { setNewMinName(e.target.value); setCreateMinError(null) }}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateMinistry(idx))}
                          placeholder="New ministry name"
                          disabled={creatingMin}
                          autoFocus
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7] focus:border-transparent disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => handleCreateMinistry(idx)}
                          disabled={!newMinName.trim() || creatingMin}
                          className="px-3 py-2 bg-[#4F6EF7] text-white text-sm font-medium rounded-lg hover:bg-[#3D5BD4] transition-colors disabled:opacity-40 whitespace-nowrap"
                        >
                          {creatingMin ? '…' : 'Add'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowCreateFor(null); setNewMinName(''); setNewMinRole('ADULT_SERVICE'); setCreateMinError(null) }}
                          className="text-xs text-gray-400 hover:text-gray-600 px-2"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        {ROLE_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setNewMinRole(opt.value)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                              newMinRole === opt.value
                                ? 'bg-stone-900 text-white border-stone-900'
                                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setShowCreateFor(idx); setNewMinName(''); setCreateMinError(null) }}
                      className="text-xs text-[#4F6EF7] hover:text-[#3D5BD4] transition-colors"
                    >
                      + New ministry
                    </button>
                  )}
                  {createMinError && showCreateFor === idx && (
                    <p className="text-xs text-red-600">{createMinError}</p>
                  )}
                </div>
              )}
            </div>

            {/* E2f — Subtags (optional) */}
            {allTags.filter(t => t.id !== tmpl.primary_tag_id).length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subtags <span className="text-gray-400 font-normal">(optional) — for campaigns, series, or special groupings.</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {allTags.filter(t => t.id !== tmpl.primary_tag_id).map(t => {
                    const selected = tmpl.subtag_ids.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => updateTemplate(idx, {
                          subtag_ids: selected
                            ? tmpl.subtag_ids.filter(id => id !== t.id)
                            : [...tmpl.subtag_ids, t.id]
                        })}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-600'
                        }`}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* E4 — Add another service */}
        <button type="button" onClick={addTemplate}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          + Add another service time
        </button>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* E5 — Continue */}
        <button
          type="submit"
          disabled={!hasValid || isPending}
          className="w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Continue — set when these services run next.'}
        </button>
      </form>
    </OnboardingLayout>
  )
}
