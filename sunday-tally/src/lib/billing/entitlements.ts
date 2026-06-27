import type { SupabaseClient } from '@supabase/supabase-js'
import { getBillingStatus } from './status'

/**
 * AI + Dashboarding add-on entitlements (Sunday Tally pricing plan).
 *
 * Base ($22/mo per location) ships the app. The AI widget builder + analytics
 * chat are a paid ADD-ON gated here. One source of truth: a church's
 * `ai_addon_tier` (written by the Stripe webhook) plus its active-location
 * count resolve into the runtime limits every gate reads.
 *
 *   none     no AI features (base product only)
 *   starter  +$15/mo per location — 15 widgets, $5 pooled ceiling (+$5 / extra AI location)
 *   plus     +$29/mo org          — 40 widgets, $12 pooled ceiling
 *   pro      +$49/mo org          — unlimited widgets, $25 pooled, advanced routing
 *
 * Caps live in code (not the DB) so price/limit experiments don't need a
 * migration; migration 0044 only records WHICH tier a church is on.
 *
 * Trial churches get full AI access (starter-equivalent limits) to drive
 * conversion — the trial AI spend is capped separately by the trial buckets in
 * budget.ts, so the add-on gate only bites once a church is PAID (`active`).
 */

export type AiAddonTier = 'none' | 'starter' | 'plus' | 'pro'

export interface Entitlements {
  /** Whether AI features (widget builder, analytics chat) are usable at all. */
  aiEnabled: boolean
  /** The church's add-on tier as recorded on `churches.ai_addon_tier`. */
  tier: AiAddonTier
  /** Max non-starter church-library widgets. Infinity = unlimited (pro). */
  widgetCap: number
  /** Monthly pooled AI ceiling in cents for the PAID shared bucket. */
  aiCeilingCents: number
  /** Effective during the free trial (full access, starter-equivalent limits). */
  isTrial: boolean
}

// ── Tier limits (single source of truth) ────────────────────────────────────

/** Base paid pool for churches WITHOUT the add-on — covers onboarding imports
 *  and other base-product AI. Mirrors the historical $3 shared cap (D-059). */
const BASE_PAID_CEILING_CENTS = 300

/** Starter is per-location: $5 for the first AI location, +$5 each additional. */
const STARTER_CEILING_PER_LOCATION_CENTS = 500
const PLUS_CEILING_CENTS = 1200
const PRO_CEILING_CENTS = 2500

const WIDGET_CAP: Record<AiAddonTier, number> = {
  none:    0,
  starter: 15,
  plus:    40,
  pro:     Number.POSITIVE_INFINITY,
}

/** Widgets a tier may keep in the church library (excludes seeded starters). */
export function widgetCapForTier(tier: AiAddonTier): number {
  return WIDGET_CAP[tier] ?? 0
}

/** Monthly pooled AI ceiling (cents) for a paid church on `tier`. Starter
 *  scales with the number of active locations so "per location" buys real
 *  capacity; plus/pro are flat org-wide pools. */
export function ceilingCentsForTier(tier: AiAddonTier, activeLocations: number): number {
  const locations = Math.max(1, activeLocations)
  switch (tier) {
    case 'starter': return STARTER_CEILING_PER_LOCATION_CENTS * locations
    case 'plus':    return PLUS_CEILING_CENTS
    case 'pro':     return PRO_CEILING_CENTS
    case 'none':
    default:        return BASE_PAID_CEILING_CENTS
  }
}

// ── Resolution from the database ─────────────────────────────────────────────

async function readTierAndLocations(
  supabase: SupabaseClient,
  churchId: string,
): Promise<{ tier: AiAddonTier; activeLocations: number }> {
  const [{ data: church }, { count }] = await Promise.all([
    supabase.from('churches').select('ai_addon_tier').eq('id', churchId).single(),
    supabase
      .from('church_locations')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId)
      .eq('is_active', true),
  ])
  const tier = (church?.ai_addon_tier as AiAddonTier | undefined) ?? 'none'
  return { tier, activeLocations: count ?? 1 }
}

/**
 * The PAID 'shared' bucket ceiling for a church (cents). Used by budget.ts in
 * the active phase. Trial/expired ceilings are handled by budget.ts itself.
 */
export async function resolvePaidCeilingCents(
  supabase: SupabaseClient,
  churchId: string,
): Promise<number> {
  const { tier, activeLocations } = await readTierAndLocations(supabase, churchId)
  return ceilingCentsForTier(tier, activeLocations)
}

/**
 * Full entitlement resolution for the AI feature gates and widget-library cap.
 * Phase-aware:
 *   - trial   → AI unlocked (starter-equivalent limits) to drive conversion
 *   - active  → AI gated by the paid add-on tier
 *   - expired → AI off (editing is already blocked)
 */
export async function getEntitlements(
  supabase: SupabaseClient,
  churchId: string,
): Promise<Entitlements> {
  const billing = await getBillingStatus(supabase, churchId)

  if (billing.phase === 'expired') {
    return { aiEnabled: false, tier: 'none', widgetCap: 0, aiCeilingCents: 0, isTrial: false }
  }

  const { tier, activeLocations } = await readTierAndLocations(supabase, churchId)

  if (billing.phase === 'trial') {
    // Trial unlocks AI regardless of add-on, with a PRO-equivalent library cap
    // (unlimited) so churches can build past 40 widgets and the cost banner can
    // genuinely recommend plus/pro from real usage (H1). Spend stays bounded by
    // the separate trial buckets in budget.ts; only the library cap is lifted.
    return {
      aiEnabled: true,
      tier,
      widgetCap: widgetCapForTier('pro'),
      aiCeilingCents: ceilingCentsForTier('starter', activeLocations),
      isTrial: true,
    }
  }

  // Paid (active): the add-on gate bites here.
  return {
    aiEnabled: tier !== 'none',
    tier,
    widgetCap: widgetCapForTier(tier),
    aiCeilingCents: ceilingCentsForTier(tier, activeLocations),
    isTrial: false,
  }
}
