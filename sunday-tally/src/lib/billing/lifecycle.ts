// Trial lifecycle — the calendar-expiry predicate + retention windows shared by
// the billing summary (chrome) and the lifecycle cron.
//
// CRITICAL (C1): expiry here is CALENDAR / SUBSCRIPTION expiry ONLY. It is
// deliberately NOT getBillingStatus().phase, because that phase also flips to
// 'expired' when a trial church merely exhausts its AI budget — which must
// never start a deletion clock. Everything that schedules deletion reads this
// predicate, not the phase.

const DAY_MS = 86_400_000

/** Days of full-app blur (data intact, self-serve restore) before soft-delete. */
export const GRACE_DAYS = 30
/** Days a soft-deleted church is recoverable before the hard purge. */
export const PURGE_DAYS = 60
/** Days a base-only church keeps its AI-built widgets before they're dropped. */
export const WIDGET_RETENTION_DAYS = 30

const PAID_ACTIVE_STATES = new Set(['active', 'past_due', 'trialing'])

/** The churches columns the calendar-expiry decision reads. */
export interface ChurchLifecycleRow {
  stripe_subscription_id: string | null
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
}

/** True when the church has a live (paying or Stripe-trialing) subscription. */
export function hasLiveSubscription(row: ChurchLifecycleRow): boolean {
  return (
    !!row.stripe_subscription_id &&
    PAID_ACTIVE_STATES.has(row.subscription_status ?? '')
  )
}

export interface CalendarExpiry {
  /** True once the trial calendar ran out / the paid subscription lapsed. */
  expired: boolean
  /** ISO date expiry began — anchors the grace clock when the cron hasn't stamped expired_at yet. */
  anchor: string | null
}

/**
 * Pure calendar-expiry computation. A church with any live subscription is
 * never expired. Otherwise the anchor is the trial end (app-managed trial) or
 * the period end of a lapsed paid subscription.
 */
export function computeCalendarExpiry(row: ChurchLifecycleRow, nowMs: number): CalendarExpiry {
  const hasLiveSub =
    !!row.stripe_subscription_id &&
    PAID_ACTIVE_STATES.has(row.subscription_status ?? '')
  if (hasLiveSub) return { expired: false, anchor: null }

  // Lapsed paid subscription → period end; otherwise app-managed trial end.
  const anchor = row.stripe_subscription_id
    ? row.current_period_end ?? row.trial_ends_at
    : row.trial_ends_at
  if (!anchor) return { expired: false, anchor: null }

  return { expired: new Date(anchor).getTime() < nowMs, anchor }
}

/** Whole days remaining until a deadline `days` after `anchorIso` (>= 0). */
export function daysUntil(anchorIso: string | null, days: number, nowMs: number): number | null {
  if (!anchorIso) return null
  const deadline = new Date(anchorIso).getTime() + days * DAY_MS
  return Math.max(0, Math.ceil((deadline - nowMs) / DAY_MS))
}
