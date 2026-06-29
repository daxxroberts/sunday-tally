/**
 * POST /api/onboarding/import/preview
 *
 * Re-rolls the DETERMINISTIC preview_sample (the recent-week pivot the user
 * verifies against) from the current, answer-applied mapping — so the numbers
 * shown before import reflect the user's clarification answers and match exactly
 * what Stage B will write.
 *
 * No AI, no budget spend: pure aggregation over rows we re-parse from the stored
 * sources, folding answers in via the same reconcile the import (PATCH) uses.
 * Best-effort — a failure here never blocks the import.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllRows, type SourceInput } from '@/lib/import/sources'
import { reconcileAnswersIntoMapping } from '@/lib/import/reconcile_answers'
import { buildPreviewSample } from '@/lib/import/stageA'
import type { ConfirmedMapping } from '@/lib/import/stageB'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const body = await req.json() as { job_id?: string; confirmed_mapping?: ConfirmedMapping }
  if (!body.job_id || !body.confirmed_mapping) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, sources')
    .eq('id',        body.job_id)
    .eq('church_id', membership.church_id)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Fold answers into the mapping exactly as the import (PATCH) does, so the
  // preview matches what Stage B will actually write.
  const reconciled = reconcileAnswersIntoMapping(body.confirmed_mapping)

  // Re-parse rows per source, aligned to the mapping's source order
  // (buildPreviewSample indexes allRowsBySource by mapping.sources position).
  const rawSources    = (job.sources as { raw?: SourceInput[] } | null)?.raw ?? []
  const mappingSources = (reconciled.sources as Array<{ source_name?: string }> | undefined) ?? []
  const allRowsBySource = await Promise.all(
    mappingSources.map(async (ms) => {
      const src = rawSources.find((r) => r.name === ms.source_name)
      if (!src || src.kind === 'text') return []
      try { return await getAllRows(src) } catch { return [] }
    }),
  )

  try {
    const preview_sample = await buildPreviewSample(
      allRowsBySource,
      reconciled as unknown as Record<string, unknown>,
    )
    return NextResponse.json({ preview_sample })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'preview_failed'
    return NextResponse.json({ error: 'preview_failed', detail }, { status: 500 })
  }
}
