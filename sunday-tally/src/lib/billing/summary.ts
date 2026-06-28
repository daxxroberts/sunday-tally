import type { SupabaseClient } from '@supabase/supabase-js'
import { getBillingStatus, type BillingPhase } from './status'
import { getEntitlements, type AiAddonTier } from './entitlements'
import { getSetupEstimate, type SetupEstimate } from './estimate'
import {
  computeCalendarExpiry,
  daysUntil,
  GRACE_DAYS,
  PURGE_DAYS,
} from './lifecycle'
import { recommendedTierForWidgets } from './pricing'

export type LifecycleStage = 'trial' | 'active' | 'expired-grace' | 'soft-deleted'

export interface BillingSummary {
  lifecycleStage: LifecycleStage
  phase: BillingPhase
  /** Trial/active days remaining (from getBillingStatus). */
  daysLeft: number
  canEdit: boolean
  aiEnabled: boolean
  tier: AiAddonTier
  recommendedTier: AiAddonTier
  estimate: SetupEstimate
  subscriptionStatus: string
  /** Days until soft-delete, during expired-grace. */
  graceDaysLeft: number | null
  /** Days until permanent purge, during soft-deleted. */
  purgeDaysLeft: number | null
}

/** Read the 0046 lifecycle columns; tolerate their absence before the migration applies. */
async function readAnchors(
  supabase: SupabaseClient,
  churchId: string,
): Promise<{ expiredAt: string | null; deletedAt: string | null }> {
  const { data, error } = await supabase
    .from('churches')
    .select('expired_at, deleted_at')
    .eq('id', churchId)
    .single()
  if (error || !data) return { expiredAt: null, deletedAt: null }
  return {
    expiredAt: (data as { expired_at?: string | null }).expired_at ?? null,
    deletedAt: (data as { deleted_at?: string | null }).deleted_at ?? null,
  }
}

/**
 * The one billing object the app chrome reads. Resolves once per (app) segment
 * load on the server, then flows down via BillingProvider — no client refetch,
 * no flash of unblurred content.
 */
export async function getBillingSummary(
  supabase: SupabaseClient,
  churchId: string,
): Promise<BillingSummary> {
  const now = Date.now()

  const [billing, entitlements, estimate, cal, anchors] = await Promise.all([
    getBillingStatus(supabase, churchId),
    getEntitlements(supabase, churchId),
    getSetupEstimate(supabase, churchId),
    // Calendar-expiry from the raw subscription fields (NOT phase — C1).
    supabase
      .from('churches')
      .select('stripe_subscription_id, subscription_status, trial_ends_at, current_period_end')
      .eq('id', churchId)
      .single()
      .then(({ data }) =>
        computeCalendarExpiry(
          {
            stripe_subscription_id: data?.stripe_subscription_id ?? null,
            subscription_status: data?.subscription_status ?? null,
            trial_ends_at: data?.trial_ends_at ?? null,
            current_period_end: data?.current_period_end ?? null,
          },
          now,
        ),
      ),
    readAnchors(supabase, churchId),
  ])

  // Stage resolution. soft-deleted wins; then calendar-expiry (NOT budget
  // exhaustion); then paid-active; else trial (incl. budget-exhausted trial,
  // which keeps the app visible — only the Ask AI screen reacts).
  let lifecycleStage: LifecycleStage
  if (anchors.deletedAt) lifecycleStage = 'soft-deleted'
  else if (cal.expired) lifecycleStage = 'expired-grace'
  else if (billing.phase === 'active') lifecycleStage = 'active'
  else lifecycleStage = 'trial'

  const graceAnchor = anchors.expiredAt ?? cal.anchor
  const graceDaysLeft =
    lifecycleStage === 'expired-grace' ? daysUntil(graceAnchor, GRACE_DAYS, now) : null
  const purgeDaysLeft =
    lifecycleStage === 'soft-deleted' ? daysUntil(anchors.deletedAt, PURGE_DAYS, now) : null

  return {
    lifecycleStage,
    phase: billing.phase,
    daysLeft: billing.daysLeft,
    canEdit: billing.canEdit,
    aiEnabled: entitlements.aiEnabled,
    tier: entitlements.tier,
    recommendedTier: recommendedTierForWidgets(estimate.widgets),
    estimate,
    subscriptionStatus: billing.subscriptionStatus,
    graceDaysLeft,
    purgeDaysLeft,
  }
}
