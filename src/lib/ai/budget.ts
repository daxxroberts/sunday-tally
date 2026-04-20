import type { SupabaseClient } from '@supabase/supabase-js'
import { getBillingStatus } from '@/lib/billing/status'
import { tokensToCents, type AiModel, type UsageTokens } from './pricing'

export type AiRequestKind = 'import_stage_a' | 'import_stage_b' | 'analytics_chat'
export type AiBucket = 'setup' | 'analytics' | 'shared'

const TRIAL_CAPS: Record<'setup' | 'analytics', number> = {
  setup:     100, // $1.00
  analytics:  50, // $0.50
}
const PAID_SHARED_CAP_CENTS = 300 // $3.00 / month

export interface BucketSelection {
  bucket:     AiBucket
  periodKey:  string
  capCents:   number
}

/**
 * Resolves which usage bucket a given request writes to. Trial sessions keep
 * setup and analytics separate so the caps per D-058 stay independent.
 * Paid sessions pool all AI spend into a monthly shared bucket (D-059).
 */
export async function resolveBucket(
  supabase: SupabaseClient,
  churchId: string,
  kind: AiRequestKind,
): Promise<BucketSelection> {
  const billing = await getBillingStatus(supabase, churchId)

  if (billing.phase === 'active') {
    return {
      bucket:    'shared',
      periodKey: monthKey(new Date()),
      capCents:  PAID_SHARED_CAP_CENTS,
    }
  }

  const trialBucket: 'setup' | 'analytics' =
    kind === 'analytics_chat' ? 'analytics' : 'setup'

  return {
    bucket:    trialBucket,
    periodKey: 'trial',
    capCents:  TRIAL_CAPS[trialBucket],
  }
}

/** Returns remaining cents in the relevant bucket. Negative or zero = exhausted. */
export async function getRemaining(
  supabase: SupabaseClient,
  churchId: string,
  kind: AiRequestKind,
): Promise<number> {
  const sel = await resolveBucket(supabase, churchId, kind)
  const row = await ensurePeriodRow(supabase, churchId, sel)
  return row.cap_cents - row.cents_used
}

/** Records usage after a Claude call. Idempotent only at the event level. */
export async function recordUsage(
  supabase: SupabaseClient,
  churchId: string,
  kind: AiRequestKind,
  model: AiModel,
  usage: UsageTokens,
): Promise<{ cents: number; remainingCents: number }> {
  const cents = tokensToCents(model, usage)
  const sel = await resolveBucket(supabase, churchId, kind)
  const row = await ensurePeriodRow(supabase, churchId, sel)

  await supabase
    .from('ai_usage_periods')
    .update({ cents_used: row.cents_used + cents })
    .eq('id', row.id)

  await supabase
    .from('ai_usage_events')
    .insert({
      church_id:           churchId,
      request_kind:        kind,
      model,
      input_tokens:        usage.input,
      output_tokens:       usage.output,
      cache_read_tokens:   usage.cacheRead   ?? 0,
      cache_create_tokens: usage.cacheCreate ?? 0,
      cents,
      bucket:              sel.bucket,
      period_key:          sel.periodKey,
    })

  return {
    cents,
    remainingCents: sel.capCents - (row.cents_used + cents),
  }
}

interface PeriodRow {
  id:         string
  cents_used: number
  cap_cents:  number
}

async function ensurePeriodRow(
  supabase: SupabaseClient,
  churchId: string,
  sel: BucketSelection,
): Promise<PeriodRow> {
  const existing = await supabase
    .from('ai_usage_periods')
    .select('id, cents_used, cap_cents')
    .eq('church_id',  churchId)
    .eq('bucket',     sel.bucket)
    .eq('period_key', sel.periodKey)
    .maybeSingle()

  if (existing.data) return existing.data as PeriodRow

  const { data: inserted, error } = await supabase
    .from('ai_usage_periods')
    .insert({
      church_id:  churchId,
      bucket:     sel.bucket,
      period_key: sel.periodKey,
      cents_used: 0,
      cap_cents:  sel.capCents,
    })
    .select('id, cents_used, cap_cents')
    .single()

  if (error || !inserted) {
    // Race — refetch
    const again = await supabase
      .from('ai_usage_periods')
      .select('id, cents_used, cap_cents')
      .eq('church_id',  churchId)
      .eq('bucket',     sel.bucket)
      .eq('period_key', sel.periodKey)
      .single()
    return again.data as PeriodRow
  }

  return inserted as PeriodRow
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
