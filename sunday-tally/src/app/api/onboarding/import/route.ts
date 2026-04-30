import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeSource, type SourceInput } from '@/lib/import/sources'
import { runStageA } from '@/lib/import/stageA'
import { runStageB, type ConfirmedMapping } from '@/lib/import/stageB'
import { reconcileAnswersIntoMapping } from '@/lib/import/reconcile_answers'
import { AiBudgetExhaustedError } from '@/lib/ai/anthropic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveChurch(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized' as const }

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id',   user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return { error: 'no_church' as const }
  return { churchId: membership.church_id as string, role: membership.role as string }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const ctx = await resolveChurch(supabase)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    sources?:  SourceInput[]
    freeText?: string
  }
  const rawSources = (body.sources ?? []).filter(Boolean)
  const freeText   = (body.freeText ?? '').trim()

  if (rawSources.length === 0 && !freeText) {
    return NextResponse.json(
      { error: 'no_sources', message: 'Upload at least one CSV, Sheets URL, or description.' },
      { status: 400 },
    )
  }

  const normalized = await Promise.all(rawSources.map(normalizeSource))

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .insert({
      church_id: ctx.churchId,
      status:    'mapping',
      sources:   { raw: rawSources, normalized, free_text: freeText },
    })
    .select('id')
    .single()
  if (jobErr || !job) {
    return NextResponse.json({ error: 'job_create_failed', detail: jobErr?.message }, { status: 500 })
  }

  try {
    const stageA = await runStageA({
      supabase,
      churchId:     ctx.churchId,
      sources:      normalized,
      sourceInputs: rawSources,
      freeText:     freeText || undefined,
    })
    await supabase
      .from('import_jobs')
      .update({
        proposed_mapping: stageA.proposedMapping,
        status:           'awaiting_confirmation',
      })
      .eq('id', job.id)

    return NextResponse.json({ job_id: job.id, proposed_mapping: stageA.proposedMapping, total_cents: stageA.totalCents })
  } catch (err) {
    if (err instanceof AiBudgetExhaustedError) {
      await supabase.from('import_jobs')
        .update({ status: 'failed', error: 'ai_budget_exhausted' })
        .eq('id', job.id)
      return NextResponse.json({ error: 'ai_budget_exhausted' }, { status: 402 })
    }
    const detail = err instanceof Error ? err.message : 'stage_a_failed'
    await supabase.from('import_jobs')
      .update({ status: 'failed', error: detail })
      .eq('id', job.id)
    return NextResponse.json({ error: 'stage_a_failed', detail }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const ctx = await resolveChurch(supabase)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 401 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    job_id:             string
    confirmed_mapping:  ConfirmedMapping
  }
  if (!body.job_id || !body.confirmed_mapping) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, church_id, status, sources')
    .eq('id',        body.job_id)
    .eq('church_id', ctx.churchId)
    .maybeSingle()
  if (jobErr || !job) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (job.status !== 'awaiting_confirmation' && job.status !== 'mapping') {
    return NextResponse.json({ error: 'bad_state', status: job.status }, { status: 409 })
  }

  // Apply user answers deterministically to the mapping BEFORE Stage B sees it.
  // Closes the answer→mapping loop (Codex review 2026-04-30).
  const reconcileLog: string[] = []
  const reconciledMapping = reconcileAnswersIntoMapping(body.confirmed_mapping, {
    log: (line) => reconcileLog.push(line),
  })
  if (reconcileLog.length > 0) {
    console.log('[reconcile_answers]', reconcileLog.join(' | '))
  }

  await supabase.from('import_jobs')
    .update({ status: 'extracting', confirmed_mapping: reconciledMapping })
    .eq('id', job.id)

  try {
    const rawSources = (job.sources?.raw ?? []) as SourceInput[]
    const result = await runStageB({
      supabase,
      churchId:         ctx.churchId,
      sources:          rawSources,
      confirmedMapping: reconciledMapping,
    })

    await supabase.from('import_jobs')
      .update({
        status:         'done',
        result_summary: result,
      })
      .eq('id', job.id)

    return NextResponse.json({ job_id: job.id, result })
  } catch (err) {
    if (err instanceof AiBudgetExhaustedError) {
      await supabase.from('import_jobs')
        .update({ status: 'failed', error: 'ai_budget_exhausted' })
        .eq('id', job.id)
      return NextResponse.json({ error: 'ai_budget_exhausted' }, { status: 402 })
    }
    const detail = err instanceof Error ? err.message : 'stage_b_failed'
    await supabase.from('import_jobs')
      .update({ status: 'failed', error: detail })
      .eq('id', job.id)
    return NextResponse.json({ error: 'stage_b_failed', detail }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const ctx = await resolveChurch(supabase)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 401 })

  const url = new URL(req.url)
  const jobId = url.searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, status, proposed_mapping, confirmed_mapping, result_summary, error, created_at, updated_at')
    .eq('id',        jobId)
    .eq('church_id', ctx.churchId)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ job })
}
