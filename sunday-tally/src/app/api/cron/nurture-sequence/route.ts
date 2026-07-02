import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendEmail, type EmailTemplate } from '@/lib/email/resend'
import { getChurchEmailData } from '@/lib/email/churchEmailData'
import { hasLiveSubscription, type ChurchLifecycleRow } from '@/lib/billing/lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundaytally.church'
}

function dayWindow(anchor: Date, offsetDays: number): { start: Date; end: Date } {
  const target = new Date(anchor)
  target.setUTCDate(target.getUTCDate() + offsetDays)
  const start = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start, end }
}

/**
 * GET /api/cron/nurture-sequence
 * Schedule daily via Vercel Cron. Auth: Bearer CRON_SECRET.
 *
 * Trial nurture drip (SALES_FUNNEL_PLAN.md Part 1), anchored to signup
 * (churches.created_at) for days 2/5/10/21, plus one win-back email anchored
 * to trial lapse (churches.expired_at) ~10 days after expiry. Each send is
 * deduped via notifications_sent (church_id, kind) — the dedup `kind` is
 * independent of which template renders, so the same day-slot can render a
 * different template depending on activation state without colliding with
 * an earlier day's dedup record (see Day 5 / Day 21 fallback branches below).
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const now = new Date()
  const results: Record<string, unknown> = {}

  async function sendOnce(
    churchId: string,
    churchName: string,
    kind: string,
    template: EmailTemplate,
    extra: Record<string, string> = {},
  ): Promise<boolean> {
    // Dedup: skip if this (church, kind) was already sent. Check-then-record — no
    // dependency on any migration, and correct for a once-daily cron (Vercel does
    // not run overlapping invocations of the same job). Migration 0054's optional
    // uq_notifications_church_kind index, once applied, makes the final insert
    // race-proof too (a concurrent duplicate would 23505, tolerated below) — but
    // this code does NOT require it, so the drip is safe to ship before 0054.
    const { data: prior } = await supabase
      .from('notifications_sent').select('id').eq('church_id', churchId).eq('kind', kind).maybeSingle()
    if (prior) return false

    const { data: members } = await supabase
      .from('church_memberships').select('user_id')
      .eq('church_id', churchId).eq('role', 'owner').eq('is_active', true).limit(1)
    const ownerId = members?.[0]?.user_id
    if (!ownerId) return false

    const { data: userData } = await supabase.auth.admin.getUserById(ownerId)
    const email = userData?.user?.email
    if (!email) return false

    const ed = await getChurchEmailData(supabase, churchId, ownerId)
    const res = await sendEmail(email, template, {
      churchName,
      firstName: ed.firstName,
      stats: ed.stats,
      recommendedTier: ed.recommendedTier,
      planMonthly: ed.planMonthly,
      locations: ed.locations,
      billingUrl: ed.urls.billing,
      dashboardUrl: ed.urls.dashboard,
      accountUrl: ed.urls.account,
      helpUrl: ed.urls.help,
      onboardingUrl: `${appUrl()}/onboarding/start`,
      entriesUrl: `${appUrl()}/entries`,
      aiUrl: `${appUrl()}/dashboard/ai`,
      ...extra,
    })
    if (res.error) return false

    // Record the send so it isn't repeated. A 23505 here (only possible once the
    // 0054 unique index exists, under a rare concurrent run) means another run
    // already recorded it — harmless, the email still went once.
    await supabase.from('notifications_sent').insert({ church_id: churchId, kind })
    return true
  }

  // ── Days 2 / 5 / 10 / 21, anchored to signup (created_at) ──────────────
  const { data: activeTrials, error: trialsError } = await supabase
    .from('churches')
    .select('id, name, created_at, subscription_status, expired_at')
    .or('subscription_status.eq.trialing,subscription_status.is.null')
    .is('expired_at', null)
  if (trialsError) {
    results.activeTrials = { error: trialsError.message }
  } else {
    for (const offset of [2, 5, 10, 21] as const) {
      const kind = `nurture_day${offset}`
      const { start, end } = dayWindow(now, -offset)
      const matches = (activeTrials ?? []).filter((c: { created_at: string }) => {
        const created = new Date(c.created_at).getTime()
        return created >= start.getTime() && created < end.getTime()
      })

      let sent = 0
      for (const church of matches) {
       // Per-church isolation: a single church's data/send failure must not abort
       // the rest of the batch (review finding #39).
       try {
        const ed = await getChurchEmailData(supabase, church.id)
        let template: EmailTemplate
        const extra: Record<string, string> = {}

        if (offset === 2) {
          if (!ed.hasCompletedSetup) template = 'nurtureDay2Setup'
          else if (!ed.hasLoggedEntry) template = 'nurtureDay2FirstEntry'
          else { template = 'nurtureDay2Value'; extra.articleUrl = `${appUrl()}/blog/church-analytics-pearsons-law` }
        } else if (offset === 5) {
          // Activation didn't happen by day 2 — repeat the setup nudge under
          // this day's own dedup kind rather than the feature-highlight email.
          if (!ed.hasCompletedSetup) template = 'nurtureDay2Setup'
          else { template = 'nurtureDay5'; extra.articleUrl = `${appUrl()}/blog/build-your-first-widget` }
        } else if (offset === 10) {
          template = 'nurtureDay10'
          extra.articleUrl = `${appUrl()}/blog/attendance-up-church-shrinking`
        } else {
          // Day 21 — never send a stats email with no stats (SALES_FUNNEL_PLAN.md).
          template = ed.hasLoggedEntry ? 'nurtureDay21' : 'nurtureDay2FirstEntry'
        }

        const ok = await sendOnce(church.id, church.name, kind, template, extra)
        if (ok) sent++
       } catch (e) {
        console.error(`[nurture] ${kind} failed for church ${church.id}:`, e)
       }
      }
      results[kind] = { candidates: matches.length, sent }
    }
  }

  // ── Win-back, anchored to trial lapse (expired_at + 10 days) ───────────
  const { data: lapsed, error: lapsedError } = await supabase
    .from('churches')
    .select('id, name, expired_at, stripe_subscription_id, subscription_status, trial_ends_at, current_period_end')
    .not('expired_at', 'is', null)
    .is('deleted_at', null)
  if (lapsedError) {
    results.trial_lapsed_winback = { error: lapsedError.message }
  } else {
    const WINBACK_DAYS = 10
    let sent = 0
    const candidates = (lapsed ?? []).filter((c: ChurchLifecycleRow & { id: string; name: string; expired_at: string }) => !hasLiveSubscription(c))
    for (const church of candidates) {
      try {
        const lapseAt = new Date(church.expired_at as string).getTime()
        const dueAt = lapseAt + WINBACK_DAYS * DAY_MS
        if (now.getTime() < dueAt || now.getTime() >= dueAt + DAY_MS) continue
        const ok = await sendOnce(church.id, church.name, 'trial_lapsed_winback', 'trialLapsedWinback')
        if (ok) sent++
      } catch (e) {
        console.error(`[nurture] winback failed for church ${church.id}:`, e)
      }
    }
    results.trial_lapsed_winback = { candidates: candidates.length, sent }
  }

  return NextResponse.json({ ok: true, results })
}
