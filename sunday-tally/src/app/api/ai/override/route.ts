import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { pin } = await req.json() as { pin?: string }

  // Validate PIN server-side only — never trust client
  if (!pin || pin !== process.env.OWNER_OVERRIDE_PIN) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'owner_only' }, { status: 403 })
  }

  const churchId = membership.church_id

  // Bump cap_cents on every trial period row by +2000 ($20.00 headroom per use)
  // Also reset cents_used so the check passes immediately
  const { data: rows } = await supabase
    .from('ai_usage_periods')
    .select('id, cap_cents, cents_used')
    .eq('church_id', churchId)
    .eq('period_key', 'trial')

  if (rows && rows.length > 0) {
    for (const row of rows) {
      await supabase
        .from('ai_usage_periods')
        .update({ cap_cents: row.cap_cents + 2000 })
        .eq('id', row.id)
    }
  } else {
    // No rows yet — insert a generous one so the next request passes
    await supabase
      .from('ai_usage_periods')
      .insert({
        church_id:  churchId,
        bucket:     'setup',
        period_key: 'trial',
        cents_used: 0,
        cap_cents:  2100,
      })
  }

  return NextResponse.json({ ok: true })
}
