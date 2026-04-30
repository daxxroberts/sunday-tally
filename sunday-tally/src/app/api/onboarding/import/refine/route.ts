/**
 * POST /api/onboarding/import/refine
 *
 * Loop-back round between user's first answer set and Stage B import.
 * Sends user's answers back to Sonnet, gets either:
 *   - { decision: 'proceed' }  — UI proceeds to PATCH /api/onboarding/import
 *   - { decision: 'refine' | 'reclarify', new_questions: [...] }  — UI shows another round
 *
 * The actual import (Stage B) is still triggered by PATCH /api/onboarding/import once
 * the user has answered all rounds. Refine is purely additional question generation.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runStageARound2 } from '@/lib/import/stageA_round2'
import { AiBudgetExhaustedError } from '@/lib/ai/anthropic'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id',   user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'no_church' }, { status: 403 })
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json() as { job_id?: string; qa_answers?: Array<Record<string, unknown>> }
  if (!body.job_id || !Array.isArray(body.qa_answers)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, proposed_mapping, status')
    .eq('id',        body.job_id)
    .eq('church_id', membership.church_id)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (job.status !== 'awaiting_confirmation' && job.status !== 'mapping') {
    return NextResponse.json({ error: 'bad_state', status: job.status }, { status: 409 })
  }

  try {
    const result = await runStageARound2({
      supabase,
      churchId:        membership.church_id,
      proposedMapping: job.proposed_mapping as Record<string, unknown> | null,
      qaAnswers:       body.qa_answers,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AiBudgetExhaustedError) {
      return NextResponse.json({ error: 'ai_budget_exhausted' }, { status: 402 })
    }
    const detail = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: 'round_2_failed', detail }, { status: 500 })
  }
}
