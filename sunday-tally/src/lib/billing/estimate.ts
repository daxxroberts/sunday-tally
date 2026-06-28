import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiAddonTier } from './entitlements'
import { aiMonthly, baseMonthly, recommendedTierForWidgets } from './pricing'

export interface SetupEstimate {
  /** Active locations — drives the $22/mo base. */
  locations: number
  /** Non-starter church-library widgets — drives the AI-tier recommendation. */
  widgets: number
  /** $22 × locations. */
  baseMonthly: number
  /** Tier we'd recommend so their current widgets keep working. */
  recommendedTier: AiAddonTier
  /** Add-on cost for the recommended tier (mirrors checkout quantities). */
  aiMonthly: number
  /** base + recommended AI. */
  totalMonthly: number
}

/**
 * "What your plan will cost once you go live" — counted from the church's real
 * setup. Location count and widget count reuse the exact queries the
 * entitlement + widget gates use, so the banner, the billing page, and Stripe
 * all agree on the numbers.
 */
export async function getSetupEstimate(
  supabase: SupabaseClient,
  churchId: string,
): Promise<SetupEstimate> {
  const [{ count: locCount }, { count: widgetCount }] = await Promise.all([
    supabase
      .from('church_locations')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId)
      .eq('is_active', true),
    supabase
      .from('widgets')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId)
      .eq('scope', 'church')
      .eq('is_starter', false),
  ])

  const locations = locCount ?? 1
  const widgets = widgetCount ?? 0
  const recommendedTier = recommendedTierForWidgets(widgets)
  const base = baseMonthly(locations)
  const ai = aiMonthly(recommendedTier, locations)

  return {
    locations,
    widgets,
    baseMonthly: base,
    recommendedTier,
    aiMonthly: ai,
    totalMonthly: base + ai,
  }
}
