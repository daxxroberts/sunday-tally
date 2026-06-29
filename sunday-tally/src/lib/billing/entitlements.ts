import type { SupabaseClient } from '@supabase/supabase-js'
import { getBillingStatus } from './status'

/**
 * AI + Dashboarding add-on entitlements (Sunday Tally pricing plan).
 *
 * Base ($22/mo per location) ships the app. The AI widget builder + analytics
 * chat are a paid ADD-ON gated here. One source of truth: a church's
 * `ai_addon_tier` (written by the Stripe webhook) resolves into the runtime
 * limits every gate reads. The add-on is flat org-wide — nothing here scales
 * with the number of campuses.
 *
 *   none     no AI features (base product only)
 *   starter  +$29/mo flat — 15 widgets,  AI ceiling 15% of plan (~$4.35)
 *   plus     +$59/mo flat — 40 widgets,  AI ceiling 15% of plan (~$8.85)
 *   pro      +$99/mo flat — 120 widgets, AI ceiling 15% of plan (~$14.85), advanced routing
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
  /** Max non-starter church-library widgets allowed on the tier (pro = 120). */
  widgetCap: number
  /** Monthly pooled AI ceiling in cents for the PAID shared bucket. */
  aiCeilingCents: number
  /** Effective during the free trial (full access, starter-equivalent limits). */
  isTrial: boolean
}

// ── Tier pricing + limits (single source of truth) ──────────────────────────

/** Canonical monthly add-on price in US cents, flat org-wide. The one source
 *  of truth for AI tier dollars: pricing.ts derives its USD display figures
 *  from this, and the Stripe checkout/webhook mirror it via the
 *  STRIPE_PRICE_AI_* price objects. (2026-06-28: starter $29 · plus $59 · pro $99) */
export const AI_TIER_PRICE_CENTS: Record<AiAddonTier, number> = {
  none:    0,
  starter: 2900,
  plus:    5900,
  pro:     9900,
}

/** A paid church's monthly AI wholesale-spend ceiling is 15% of its plan price.
 *  Past it we fall back to the cheaper model (never a hard cutoff until the
 *  −$20 runaway backstop in anthropic.ts). Being a flat % of a flat price, the
 *  ceiling no longer scales with locations — AI spend is decoupled from campuses. */
export const AI_SPEND_CEILING_RATIO = 0.15

/** Base onboarding/import pool for churches WITHOUT an add-on (tier 'none').
 *  They have no AI plan to take 15% of, but still run setup imports ($3, D-059). */
const BASE_PAID_CEILING_CENTS = 300

const WIDGET_CAP: Record<AiAddonTier, number> = {
  none:    0,
  starter: 15,
  plus:    40,
  pro:     120,
}

/** Widgets a tier may keep in the church library (excludes seeded starters). */
export function widgetCapForTier(tier: AiAddonTier): number {
  return WIDGET_CAP[tier] ?? 0
}

/** Monthly pooled AI ceiling (cents) for a paid church on `tier` — a flat 15%
 *  of the plan price, independent of location count (`none` keeps the base
 *  onboarding pool). `activeLocations` is accepted for call-site compatibility
 *  but no longer affects the ceiling; AI spend is decoupled from campuses. */
export function ceilingCentsForTier(tier: AiAddonTier, _activeLocations?: number): number {
  if (tier === 'none') return BASE_PAID_CEILING_CENTS
  return Math.round(AI_TIER_PRICE_CENTS[tier] * AI_SPEND_CEILING_RATIO)
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
    // Trial unlocks AI regardless of add-on, with the PRO library cap (120) so
    // churches can build well past 40 widgets and the cost banner can genuinely
    // recommend plus/pro from real usage (H1). Spend stays bounded by the
    // separate trial buckets in budget.ts; only the library cap is lifted.
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
