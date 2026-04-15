'use client'

// T_LOC — /onboarding/locations — Step 2
// IRIS_TLOC_ELEMENT_MAP.md: E1-E5 all implemented
// N25: name uniqueness | N26: delete blocked if services reference | N27: sort order on save

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import OnboardingLayout from '@/components/layouts/OnboardingLayout'
import { createClient } from '@/lib/supabase/client'
import { saveLocationsAction, deleteLocationAction } from './actions'

interface Location {
  id: string | null
  name: string
  sort_order: number
}

export default function OnboardingLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([{ id: null, name: '', sort_order: 1 }])
  const [error, setError] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({})
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Load existing locations
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (\!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('church_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (\!membership) return

      const { data: locs } = await supabase
        .from('church_locations')
        .select('id, name, sort_order')
        .eq('church_id', membership.church_id)
        .eq('is_active', true)
        .order('sort_order')

      if (locs && locs.length > 0) setLocations(locs)
    })
  }, [])

  const validLocations = locations.filter(l => l.name.trim().length > 0)
  const hasValid = validLocations.length >= 1

  // N25: uniqueness check
  function isDuplicate(name: string, idx: number) {
    return locations.some((l, i) => i \!== idx && l.name.trim().toLowerCase() === name.trim().toLowerCase())
  }

  function updateName(idx: number, name: string) {
    setLocations(prev => prev.map((l, i) => i === idx ? { ...l, name } : l))
  }

  function addLocation() {
    setLocations(prev => [...prev, { id: null, name: '', sort_order: prev.length + 1 }])
  }

  function removeLocation(idx: number) {
    const loc = locations[idx]
    if (\!loc.id) {
      setLocations(prev => prev.filter((_, i) => i \!== idx))
      return
    }
    startTransition(async () => {
      const result = await deleteLocationAction(loc.id\!)
      if (result.error) {
        setDeleteErrors(prev => ({ ...prev, [idx]: result.error\! }))
      } else {
        setLocations(prev => prev.filter((_, i) => i \!== idx))
      }
    })
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    if (\!hasValid || isPending) return
    setError(null)

    // Assign sort_order before saving
    const toSave = validLocations.map((l, i) => ({ ...l, sort_order: i + 1 }))

    startTransition(async () => {
      const result = await saveLocationsAction(toSave)
      if (result.error) { setError(result.error); return }
      router.push('/onboarding/services')
    })
  }

  return (
    <OnboardingLayout step={2} onBack={() => router.push('/onboarding/church')}>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Your locations</h1>

      {/* E5 — single campus note, first load onboarding */}
      <p className="text-sm text-gray-500 mb-8">
        Most churches meet in one place — just add that one and you&apos;re set.
      </p>

      <form onSubmit={handleContinue} className="space-y-6">
        <div className="space-y-3">
          {locations.map((loc, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2">
                {/* E2a — Name field */}
                <input
                  type="text"
                  value={loc.name}
                  onChange={e => updateName(idx, e.target.value)}
                  placeholder={idx === 0 ? 'Main Campus' : idx === 1 ? 'North Campus' : 'Downtown'}
                  disabled={isPending}
                  aria-label={`Location ${idx + 1} name`}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
                />
                {/* E2c — Delete icon */}
                {locations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLocation(idx)}
                    disabled={isPending}
                    aria-label="Remove location"
                    className="text-gray-400 hover:text-red-500 transition-colors p-1 disabled:opacity-40"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Duplicate warning (N25) */}
              {loc.name.trim() && isDuplicate(loc.name, idx) && (
                <p className="text-xs text-red-600 pl-1">That location name is already used.</p>
              )}
              {/* Delete error (N26) */}
              {deleteErrors[idx] && (
                <p className="text-xs text-red-600 pl-1">{deleteErrors[idx]}</p>
              )}
            </div>
          ))}
        </div>

        {/* E3 — Add another */}
        <button
          type="button"
          onClick={addLocation}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          + Add another location — if your church meets in more than one place.
        </button>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* E4 — Continue */}
        <button
          type="submit"
          disabled={\!hasValid || isPending}
          className="w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Continue — set up your service times next.'}
        </button>

        {\!hasValid && (
          <p className="text-xs text-center text-gray-400">Add at least one location to continue.</p>
        )}
      </form>
    </OnboardingLayout>
  )
}
