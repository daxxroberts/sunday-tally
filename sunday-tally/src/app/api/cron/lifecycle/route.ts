import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendEmail, type EmailTemplate } from '@/lib/email/resend'
import { getChurchEmailData } from '@/lib/email/churchEmailData'
import { widgetCapForTier, type AiAddonTier } from '@/lib/billing/entitlements'
import {
  computeCalendarExpiry,
  hasLiveSubscription,
  GRACE_DAYS,
  PURGE_DAYS,
  WIDGET_RETENTION_DAYS,
} from '@/lib/billing/lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000
const ARCHIVE_WARN_DAYS = 7 // warn this many days before soft-delete / purge

/**
 * GET /api/cron/lifecycle  — daily (vercel.json). Auth: Bearer CRON_SECRET.
 *
 * One pass over all churches drives the whole trial-end lifecycle:
 *   1. mark/clear expired_at  — CALENDAR/subscription expiry only (never AI budget, C1)
 *   2. soft-delete @ expired_at + 30d  (set deleted_at; data still recoverable)
 *   3. purge @ deleted_at + 60d  (irreversible; re-verifies no live sub first, C2)
 *   4. drop AI widgets @ widget_retention_at + 30d for base-only churches (H4)
 *   5. warning emails (dedup via notifications_sent)
 * Every church is isolated in try/catch so one failure can't abort the batch.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const now = Date.now()
  // Test scope: ?churchId=<id> limits the entire sweep to one church, so a
  // controlled production test never touches the rest of the table.
  const onlyChurch = new URL(req.url).searchParams.get('churchId')

  const counts = {
    marked: 0, cleared: 0, restored: 0,
    softDeleted: 0, purged: 0,
    widgetsDropped: 0, widgetRetentionSet: 0, widgetRetentionCleared: 0,
    emails: 0, errors: 0,
  }

  // Send an email once per (church, kind) — notifications_sent UNIQUE dedup.
  async function sendOnce(churchId: string, churchName: string, kind: string, template: EmailTemplate, daysLeft: number) {
    const { data: prior } = await supabase
      .from('notifications_sent').select('id').eq('church_id', churchId).eq('kind', kind).maybeSingle()
    if (prior) return
    const { data: members } = await supabase
      .from('church_memberships').select('user_id')
      .eq('church_id', churchId).eq('role', 'owner').eq('is_active', true).limit(1)
    const ownerId = members?.[0]?.user_id
    if (!ownerId) return
    const { data: userData } = await supabase.auth.admin.getUserById(ownerId)
    const email = userData?.user?.email
    if (!email) return
    const ed = await getChurchEmailData(supabase, churchId, ownerId)
    const res = await sendEmail(email, template, {
      churchName,
      daysLeft,
      firstName: ed.firstName,
      stats: ed.stats,
      recommendedTier: ed.recommendedTier,
      planMonthly: ed.planMonthly,
      locations: ed.locations,
      billingUrl: ed.urls.billing,
      dashboardUrl: ed.urls.dashboard,
      accountUrl: ed.urls.account,
      helpUrl: ed.urls.help,
    })
    if (res.error) return
    await supabase.from('notifications_sent').insert({ church_id: churchId, kind })
    counts.emails++
  }

  let churchesQuery = supabase
    .from('churches')
    .select('id, name, stripe_subscription_id, subscription_status, trial_ends_at, current_period_end, ai_addon_tier, expired_at, deleted_at, widget_retention_at')
  if (onlyChurch) churchesQuery = churchesQuery.eq('id', onlyChurch)
  const { data: churches, error } = await churchesQuery
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const c of churches ?? []) {
    try {
      const cal = computeCalendarExpiry(c, now)
      const live = hasLiveSubscription(c)

      // ── Reactivation: a live sub clears any lifecycle flags (restore). ──
      if (live && (c.expired_at || c.deleted_at)) {
        await supabase.from('churches').update({ expired_at: null, deleted_at: null }).eq('id', c.id)
        counts.restored++
        // fall through to widget-retention below (still a paying church)
      }

      // ── Soft-deleted churches: purge or warn. ──
      else if (c.deleted_at) {
        const purgeAt = new Date(c.deleted_at).getTime() + PURGE_DAYS * DAY_MS
        if (now >= purgeAt) {
          if (!live) { await supabase.rpc('purge_church', { p_church_id: c.id }); counts.purged++ }
          continue // purged (or somehow live → handled above next run)
        }
        if (now >= purgeAt - ARCHIVE_WARN_DAYS * DAY_MS) {
          await sendOnce(c.id, c.name, 'church_purging_7d', 'churchPurging7d', ARCHIVE_WARN_DAYS)
        }
        continue
      }

      // ── Calendar-expired churches: mark, then soft-delete or warn. ──
      else if (cal.expired) {
        let anchor = c.expired_at
        if (!anchor) {
          anchor = cal.anchor
          await supabase.from('churches').update({ expired_at: anchor }).eq('id', c.id)
          counts.marked++
        }
        const anchorMs = new Date(anchor as string).getTime()
        const softAt = anchorMs + GRACE_DAYS * DAY_MS
        if (now >= softAt) {
          await supabase.from('churches').update({ deleted_at: new Date(now).toISOString() }).eq('id', c.id)
          counts.softDeleted++
          await sendOnce(c.id, c.name, 'church_archived', 'churchArchived', PURGE_DAYS)
        } else if (now >= softAt - ARCHIVE_WARN_DAYS * DAY_MS) {
          const daysLeft = Math.max(0, Math.ceil((softAt - now) / DAY_MS))
          await sendOnce(c.id, c.name, 'church_archiving_7d', 'churchArchiving7d', daysLeft)
        }
        continue
      }

      // ── Not expired, not deleted: clear a stale expired_at if present. ──
      else if (c.expired_at) {
        await supabase.from('churches').update({ expired_at: null }).eq('id', c.id)
        counts.cleared++
      }

      // ── Widget retention — paid (live-sub) churches whose plan grants fewer
      //    widgets than they have. Trial churches have an unlimited cap. ──
      if (live) {
        const cap = widgetCapForTier((c.ai_addon_tier as AiAddonTier) ?? 'none')
        if (Number.isFinite(cap)) {
          const { count } = await supabase
            .from('widgets').select('id', { count: 'exact', head: true })
            .eq('church_id', c.id).eq('scope', 'church').eq('is_starter', false)
          const over = (count ?? 0) > cap
          if (over) {
            if (!c.widget_retention_at) {
              await supabase.from('churches').update({ widget_retention_at: new Date(now).toISOString() }).eq('id', c.id)
              counts.widgetRetentionSet++
            } else if (now >= new Date(c.widget_retention_at).getTime() + WIDGET_RETENTION_DAYS * DAY_MS) {
              await supabase.rpc('delete_dropped_ai_widgets', { p_church_id: c.id })
              await supabase.from('churches').update({ widget_retention_at: null }).eq('id', c.id)
              counts.widgetsDropped++
            }
          } else if (c.widget_retention_at) {
            await supabase.from('churches').update({ widget_retention_at: null }).eq('id', c.id)
            counts.widgetRetentionCleared++
          }
        } else if (c.widget_retention_at) {
          await supabase.from('churches').update({ widget_retention_at: null }).eq('id', c.id)
          counts.widgetRetentionCleared++
        }
      }
    } catch (e) {
      counts.errors++
      console.error('LIFECYCLE CRON church error', c.id, e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ ok: true, counts })
}
