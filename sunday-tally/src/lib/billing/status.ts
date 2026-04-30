import type { SupabaseClient } from '@supabase/supabase-js'

export type BillingPhase = 'trial' | 'active' | 'expired'

export interface BillingStatus {
  phase: BillingPhase
  daysLeft: number
  canEdit: boolean
  subscriptionStatus: string
  trialEndsAt: string | null
  currentPeriodEnd: string | null
}

const PAID_ACTIVE_STATES = new Set(['active', 'past_due'])
const STRIPE_TRIAL_STATES = new Set(['trialing'])

export async function getBillingStatus(
  supabase: SupabaseClient,
  churchId: string,
): Promise<BillingStatus> {
  const { data: church } = await supabase
    .from('churches')
    .select('stripe_subscription_id, subscription_status, trial_ends_at, current_period_end')
    .eq('id', churchId)
    .single()

  const now = Date.now()
  const subscriptionStatus = church?.subscription_status ?? 'trialing'
  const trialEndsAt = church?.trial_ends_at ?? null
  const currentPeriodEnd = church?.current_period_end ?? null
  const hasStripeSub = !!church?.stripe_subscription_id

  const isPaidActive =
    hasStripeSub &&
    (PAID_ACTIVE_STATES.has(subscriptionStatus) ||
      STRIPE_TRIAL_STATES.has(subscriptionStatus))

  if (isPaidActive) {
    const daysLeft = currentPeriodEnd
      ? Math.max(0, Math.ceil((new Date(currentPeriodEnd).getTime() - now) / 86_400_000))
      : 0
    return {
      phase: 'active',
      daysLeft,
      canEdit: true,
      subscriptionStatus,
      trialEndsAt,
      currentPeriodEnd,
    }
  }

  const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : 0
  const daysLeft = Math.max(0, Math.ceil((trialEndMs - now) / 86_400_000))
  const daysValid = trialEndMs > now

  const budgetExhausted = await isTrialBudgetExhausted(supabase, churchId)

  if (daysValid && !budgetExhausted) {
    return {
      phase: 'trial',
      daysLeft,
      canEdit: true,
      subscriptionStatus,
      trialEndsAt,
      currentPeriodEnd,
    }
  }

  return {
    phase: 'expired',
    daysLeft: 0,
    canEdit: false,
    subscriptionStatus,
    trialEndsAt,
    currentPeriodEnd,
  }
}

async function isTrialBudgetExhausted(
  supabase: SupabaseClient,
  churchId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('ai_usage_periods')
    .select('bucket, cents_used, cap_cents')
    .eq('church_id', churchId)
    .eq('period_key', 'trial')

  if (!data || data.length === 0) return false

  const totals = data.reduce(
    (acc, row) => {
      acc.used += row.cents_used ?? 0
      acc.cap += row.cap_cents ?? 0
      return acc
    },
    { used: 0, cap: 0 },
  )

  return totals.cap > 0 && totals.used >= totals.cap
}
