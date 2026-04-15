'use client'

// T_LOC_SETTINGS — /settings/locations
// Reuses T_LOC logic in Settings context (AppLayout + back to settings)
// IRIS_TLOC_ELEMENT_MAP.md E4b: Save button → T_SETTINGS

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { saveLocationsAction, deleteLocationAction } from '@/app/onboarding/locations/actions'
import type { UserRole } from '@/types'

interface Location { id: string | null; name: string; sort_order: number }

export default function SettingsLocationsPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [locations, setLocations] = useState<Location[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole)
      const { data: locs } = await supabase.from('church_locations').select('id, name, sort_order').eq('church_id', membership.church_id).eq('is_active', true).order('sort_order')
      if (locs && locs.length > 0) setLocations(locs)
    })
  }, [])

  function updateName(idx: number, name: string) {
    setLocations(prev => prev.map((l, i) => i === idx ? { ...l, name } : l))
  }

  function addLocation() {
    setLocations(prev => [...prev, { id: null, name: '', sort_order: prev.length + 1 }])
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const valid = locations.filter(l => l.name.trim())
    if (!valid.length) return
    startTransition(async () => {
      const result = await saveLocationsAction(valid.map((l, i) => ({ ...l, sort_order: i + 1 })))
      if (result.error) { setError(result.error); return }
      setSaved(true)
      setTimeout(() => router.push('/settings'), 1000)
    })
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Locations</p>
      </div>
      <form onSubmit={handleSave} className="px-4 py-4 space-y-4">
        {locations.map((loc, idx) => (
          <input key={idx} type="text" value={loc.name} onChange={e => updateName(idx, e.target.value)} placeholder="Location name" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900" />
        ))}
        <button type="button" onClick={addLocation} className="text-sm text-gray-500 hover:text-gray-900">+ Add another location</button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={isPending} className="w-full bg-gray-900 text-white rounded-xl py-3.5 font-medium text-sm hover:bg-gray-700 disabled:opacity-40">
          {saved ? '✓ Saved' : isPending ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </AppLayout>
  )
}
