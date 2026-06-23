'use client'

// BillingPanel — the Billing surface as an EMBEDDABLE client panel, for the
// Account workspace tabs (mirrors the Setup workspace's Services/Track panels).
// The standalone /settings/billing server page fetched billing status and passed
// it to BillingClient; here we fetch the same status client-side (getBillingStatus
// is isomorphic — it just takes a SupabaseClient) and render BillingClient with
// embedded=true so it drops its own AppLayout + header.

import { Suspense, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getBillingStatus } from '@/lib/billing/status'
import BillingClient from './BillingClient'
import type { UserRole } from '@/types'

interface BillingProps {
  role: UserRole
  churchName: string
  phase: 'trial' | 'active' | 'expired'
  subscriptionStatus: string
  daysLeft: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  aiAddonTier: string
}

export function BillingPanel({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [props, setProps] = useState<BillingProps | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('church_id, role, churches(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership || cancelled) return
      const billing = await getBillingStatus(supabase, membership.church_id as string)
      if (cancelled) return
      const ch = Array.isArray(membership.churches) ? membership.churches[0] : membership.churches
      setProps({
        role: membership.role as UserRole,
        churchName: (ch as { name?: string } | null)?.name ?? 'Your church',
        phase: billing.phase,
        subscriptionStatus: billing.subscriptionStatus,
        daysLeft: billing.daysLeft,
        trialEndsAt: billing.trialEndsAt,
        currentPeriodEnd: billing.currentPeriodEnd,
        aiAddonTier: billing.aiAddonTier,
      })
    })()
    return () => { cancelled = true }
  }, [supabase])

  if (!props) {
    return <div className="mx-auto max-w-2xl px-5 py-10 text-sm text-slate-400">Loading…</div>
  }

  // BillingClient uses useSearchParams (?checkout=…) → needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <BillingClient {...props} embedded={embedded} />
    </Suspense>
  )
}
