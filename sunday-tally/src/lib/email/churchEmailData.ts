import type { SupabaseClient } from '@supabase/supabase-js'
import { getSetupEstimate } from '@/lib/billing/estimate'

// Per-church data the rich lifecycle/trial emails need: owner first name, the
// church's value stats (weeks/attendance/giving/volunteers), the recommended
// plan + price, and deep-link URLs. Used by the crons (service-role client).

export interface ChurchEmailStats {
  servicesLogged: number
  weeksTracked: number
  attendance: number
  giving: number
  volunteers: number
}

export interface ChurchEmailData {
  firstName: string | null
  stats: ChurchEmailStats
  recommendedTier: string
  planMonthly: number
  locations: number
  urls: { billing: string; dashboard: string; account: string; help: string }
}

const TIER_LABEL: Record<string, string> = {
  none: 'no AI',
  starter: 'Starter AI',
  plus: 'Plus AI',
  pro: 'Pro AI',
}

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundaytally.church'
}

function firstNameOf(full: string | null | undefined): string | null {
  const t = (full ?? '').trim().split(/\s+/)[0]
  return t || null
}

export async function getChurchEmailData(
  supabase: SupabaseClient,
  churchId: string,
  ownerUserId?: string | null,
): Promise<ChurchEmailData> {
  const base = appBase()

  const [estimate, statsRes, profileRes] = await Promise.all([
    getSetupEstimate(supabase, churchId),
    supabase.rpc('church_email_stats', { p_church_id: churchId }),
    ownerUserId
      ? supabase.from('user_profiles').select('full_name').eq('id', ownerUserId).maybeSingle()
      : Promise.resolve({ data: null } as { data: { full_name?: string | null } | null }),
  ])

  const raw = (statsRes.data ?? {}) as Record<string, unknown>
  const num = (v: unknown) => Math.round(Number(v ?? 0)) || 0
  const stats: ChurchEmailStats = {
    servicesLogged: num(raw.servicesLogged),
    weeksTracked: num(raw.weeksTracked),
    attendance: num(raw.attendance),
    giving: num(raw.giving),
    volunteers: num(raw.volunteers),
  }

  return {
    firstName: firstNameOf((profileRes.data as { full_name?: string | null } | null)?.full_name),
    stats,
    recommendedTier: TIER_LABEL[estimate.recommendedTier] ?? 'AI',
    planMonthly: estimate.totalMonthly,
    locations: estimate.locations,
    urls: {
      billing: `${base}/settings/account?tab=billing`,
      dashboard: `${base}/dashboard`,
      account: `${base}/settings/account`,
      help: `${base}/contact`,
    },
  }
}
