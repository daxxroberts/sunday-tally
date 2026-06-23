import { createClient } from '@/lib/supabase/server'
import { getBillingStatus } from '@/lib/billing/status'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import type { UserRole } from '@/types'
import BillingClient from './BillingClient'

// BILLING screen (D-096 account portal) — IRIS_BILLING_ELEMENT_MAP.
// Stripe logic (status.ts, stripe/server.ts, api/stripe/*) is verified-correct
// and untouched. This page is a DESIGN_SYSTEM redesign + the one functional
// repair: surface the past_due render state (E-12) from subscriptionStatus.

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role, churches(name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!membership) redirect('/auth/login')

  const role = membership.role as UserRole
  const churchRel = membership.churches as { name?: string | null } | { name?: string | null }[] | null
  const churchName =
    (Array.isArray(churchRel) ? churchRel[0]?.name : churchRel?.name) ?? 'Your church'

  const billing = await getBillingStatus(supabase, membership.church_id)

  return (
    <Suspense fallback={null}>
      <BillingClient
        role={role}
        churchName={churchName}
        phase={billing.phase}
        subscriptionStatus={billing.subscriptionStatus}
        daysLeft={billing.daysLeft}
        trialEndsAt={billing.trialEndsAt}
        currentPeriodEnd={billing.currentPeriodEnd}
        aiAddonTier={billing.aiAddonTier}
      />
    </Suspense>
  )
}
