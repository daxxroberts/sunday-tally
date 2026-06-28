// Pricing — single source of truth for the dollar figures shown in the app.
//
// These MUST mirror the Stripe checkout line items in
// src/app/api/stripe/checkout/route.ts:
//   base    $22 / month  × locations
//   starter $15 / month  × locations   (per-location add-on)
//   plus    $29 / month  × 1           (flat, org-wide)
//   pro     $49 / month  × 1           (flat, org-wide)
//
// Widget-library caps live in entitlements.ts (widgetCapForTier) — the one
// source the recommendation reads, so price/limit experiments stay in step.

import { widgetCapForTier, type AiAddonTier } from './entitlements'

export const BASE_PER_LOCATION_USD = 22

/** Monthly add-on price (USD) PER UNIT. starter bills per location; plus/pro flat. */
export const AI_TIER_PRICE_USD: Record<AiAddonTier, number> = {
  none: 0,
  starter: 15,
  plus: 29,
  pro: 49,
}

/** Tiers that bill per active location (quantity = locations) vs flat org-wide. */
const AI_TIER_PER_LOCATION: Record<AiAddonTier, boolean> = {
  none: false,
  starter: true,
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
