import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendEmail, type EmailTemplate } from '@/lib/email/resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/trial-reminders
 * Schedule daily via Vercel Cron. Auth: Bearer CRON_SECRET.
 * Selects churches whose trial ends in 7 days or 1 day and sends reminders.
 * Dedupes via notifications_sent (church_id, kind) UNIQUE.
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

  for (const offset of [7, 1] as const) {
    const template: EmailTemplate = offset === 7 ? 'trialEnding7d' : 'trialEnding1d'
    const kind = template

    const target = new Date(now)
    target.setUTCDate(target.getUTCDate() + offset)
    const start = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()))
    const end   = new Date(start); end.setUTCDate(end.getUTCDate() + 1)

    const { data: churches, error } = await supabase
      .from('churches')
      .select('id, name, trial_ends_at, subscription_status')
      .gte('trial_ends_at', start.toISOString())
      .lt('trial_ends_at',  end.toISOString())
      .eq('subscription_status', 'trialing')
    if (error) {
      results[kind] = { error: error.message }
      continue
    }

    let sent = 0
    for (const church of churches ?? []) {
      // Dedupe
      const { data: prior } = await supabase
        .from('notifications_sent')
        .select('id')
        .eq('church_id', church.id)
        .eq('kind',      kind)
        .maybeSingle()
      if (prior) continue

      // Find the owner email
      const { data: members } = await supabase
        .from('church_memberships')
        .select('user_id')
        .eq('church_id', church.id)
        .eq('role',      'owner')
        .eq('is_active', true)
        .limit(1)
      const ownerUserId = members?.[0]?.user_id
      if (!ownerUserId) continue

      const { data: userData } = await supabase.auth.admin.getUserById(ownerUserId)
      const email = userData?.user?.email
      if (!email) continue

      const result = await sendEmail(email, template, { churchName: church.name })
      if (result.error) continue

      await supabase.from('notifications_sent').insert({ church_id: church.id, kind })
      sent++
    }
    results[kind] = { candidates: churches?.length ?? 0, sent }
  }

  return NextResponse.json({ ok: true, results })
}
