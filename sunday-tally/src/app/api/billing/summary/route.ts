import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveMember } from '@/lib/supabase/auth-helpers'
import { getBillingSummary } from '@/lib/billing/summary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/summary
 * The billing object the app chrome reads (trial countdown, cost estimate,
 * blur-gating, lifecycle stage). Session-authed; returns JSON (middleware
 * leaves /api/* alone). All roles — viewers get blurred too (M8).
 */
export async function GET() {
  const supabase = await createClient()
  const resolved = await resolveMember(supabase)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.reason }, { status: 401 })
  }
  const summary = await getBillingSummary(supabase, resolved.member.churchId)
  return NextResponse.json(summary)
}
