// Pricing — single source of truth for the dollar figures shown in the app.
//
// These MUST mirror the Stripe checkout line items in
// src/app/api/stripe/checkout/route.ts:
//   base    $22 / month  × locations
//   starter $29 / month  × 1           (flat, org-wide)
//   plus    $59 / month  × 1           (flat, org-wide)
//   pro     $99 / month  × 1           (flat, org-wide)
//
// The AI dollar figures are DERIVED from AI_TIER_PRICE_CENTS in entitlements.ts
// (the canonical source, which also computes the 15%-of-plan AI ceiling), so the
// displayed price and the enforced ceiling can never drift. Widget-library caps
// also live in entitlements.ts (widgetCapForTier).

import { widgetCapForTier, AI_TIER_PRICE_CENTS, type AiAddonTier } from './entitlements'

export const BASE_PER_LOCATION_USD = 22

/** Monthly add-on price (USD), flat org-wide (Stripe quantity 1). Derived from
 *  the canonical cents in entitlements.ts. */
export const AI_TIER_PRICE_USD: Record<AiAddonTier, number> = {
  none:    AI_TIER_PRICE_CENTS.none    / 100,
  starter: AI_TIER_PRICE_CENTS.starter / 100,
  plus:    AI_TIER_PRICE_CENTS.plus    / 100,
  pro:     AI_TIER_PRICE_CENTS.pro     / 100,
}

/** Tiers that bill per active location (quantity = locations) vs flat org-wide.
 *  All AI tiers are now flat org-wide (2026-06-28) — mirrors checkout quantity:1. */
const AI_TIER_PER_LOCATION: Record<AiAddonTier, boolean> = {
  none: false,
  starter: false,
  plus: false,
  pro: false,
}

/** Base monthly cost for a church with `locations` active locations. */
export function baseMonthly(locations: number): number {
  return Math.max(1, locations) * BASE_PER_LOCATION_USD
}

/** AI add-on monthly cost for a tier — mirrors the checkout quantity exactly. */
export function aiMonthly(tier: AiAddonTier, locations: number): number {
  const unit = AI_TIER_PRICE_USD[tier] ?? 0
  if (unit === 0) return 0
  return AI_TIER_PER_LOCATION[tier] ? unit * Math.max(1, locations) : unit
}

/**
 * Recommend an AI tier from the number of non-starter widgets a church has
 * built. Floor is `starter` (even at 0 widgets) — every church gets the seeded
 * default widgets, so Starter always delivers value (Daxx, H3). Thresholds use
 * the real per-tier widget caps so the recommendation tracks the actual limits.
 */
export function recommendedTierForWidgets(widgetCount: number): AiAddonTier {
  if (widgetCount > widgetCapForTier('plus')) return 'pro'     // > 40
  if (widgetCount > widgetCapForTier('starter')) return 'plus' // 16–40
  return 'starter'                                             // 0–15
}
