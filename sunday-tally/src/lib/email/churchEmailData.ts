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
  hasCompletedSetup: boolean
  hasLoggedEntry: boolean
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

  const [estimate, statsRes, profileRes, scheduleRes, entryRes] = await Promise.all([
    getSetupEstimate(supabase, churchId),
    supabase.rpc('church_email_stats', { p_church_id: churchId }),
    ownerUserId
      ? supabase.from('user_profiles').select('full_name').eq('id', ownerUserId).maybeSingle()
      : Promise.resolve({ data: null } as { data: { full_name?: string | null } | null }),
    // has_completed_setup: at least one active schedule exists for this church
    // (service_schedule_versions has no direct church_id — joined via
    // service_templates, the FK PostgREST can embed-filter on).
    supabase
      .from('service_schedule_versions')
      .select('id, service_templates!inner(church_id)')
      .eq('service_templates.church_id', churchId)
      .eq('is_active', true)
      .limit(1),
    // has_logged_entry: at least one metric_entries row with a real value
    // (NULL value = a blank slot that was never filled in).
    supabase
      .from('metric_entries')
      .select('id')
      .eq('church_id', churchId)
      .not('value', 'is', null)
      .limit(1),
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
    hasCompletedSetup: (scheduleRes.data?.length ?? 0) > 0,
    hasLoggedEntry: (entryRes.data?.length ?? 0) > 0,
  }
}
