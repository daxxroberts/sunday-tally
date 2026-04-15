'use client'

// ONBOARDING_CHURCH — /onboarding/church — Step 1
// Church name pre-filled from SIGNUP session. Continue → T_LOC.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import OnboardingLayout from '@/components/layouts/OnboardingLayout'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingChurchPage() {
  const [churchName, setChurchName] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    // Pre-fill from church record (already created in SIGNUP)
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('church_id, churches(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      // @ts-expect-error join type
      if (membership?.churches?.name) setChurchName(membership.churches.name)
    })
  }, [])

  function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    if (!churchName.trim() || isPending) return
    startTransition(() => {
      router.push('/onboarding/locations')
    })
  }

  return (
    <OnboardingLayout step={1} showBack={false}>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Your church</h1>
      <p className="text-sm text-gray-500 mb-8">Confirm your church name — you can update it in Settings anytime.</p>

      <form onSubmit={handleContinue} className="space-y-6">
        <div>
          <label htmlFor="churchName" className="block text-sm font-medium text-gray-700 mb-1">
            Church name
          </label>
          <input
            id="churchName"
            type="text"
            value={churchName}
            onChange={e => setChurchName(e.target.value)}
            disabled
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 bg-gray-50 cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-gray-400">Update this in Settings → Your Church.</p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          Continue →
        </button>
      </form>
    </OnboardingLayout>
  )
}
