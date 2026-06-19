// Regression guard for the cadence-window import model (SAGE Tier 1, 2026-06-18):
// - church-wide period homes (no location → location_id NULL)
// - schedule frequency (weekly/monthly with placeholder day/time; specific keeps day/time)
// - explicit metric cadence (period → week/month; instance → null)
// - BACKWARD COMPAT: a specific gathering still resolves a campus + keeps its day/time
//
// The writers hit Supabase, so we use a tiny chainable stub that records insert/
// upsert/update payloads and returns configured lookup results. No live DB.

import { describe, it, expect, vi } from 'vitest'

// writers.ts imports 'server-only' (a no-op outside RSC bundling) — neutralize it.
vi.mock('server-only', () => ({}))

import { WRITER_HANDLERS } from '../writers'

type Captured = { op: 'insert' | 'upsert' | 'update'; obj: Record<string, unknown> }

/** Minimal thenable PostgREST-style stub. from() → fresh chain; filters return this;
 *  maybeSingle/single return this; awaiting resolves {data,error}. insert/upsert/update
 *  capture their payload (per table) and make the awaited result {id}. */
function makeSupabase(lookups: Record<string, unknown>) {
  const captured: Record<string, Captured[]> = {}
  const from = (table: string) => {
    let mode: 'select' | 'insert' | 'upsert' | 'update' = 'select'
    const push = (op: Captured['op'], obj: Record<string, unknown>) => {
      ;(captured[table] ??= []).push({ op, obj })
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b, eq: () => b, neq: () => b, is: () => b, order: () => b, limit: () => b,
      maybeSingle: () => b, single: () => b,
      insert: (obj: Record<string, unknown>) => { mode = 'insert'; push('insert', obj); return b },
      upsert: (obj: Record<string, unknown>) => { mode = 'upsert'; push('upsert', obj); return b },
      update: (obj: Record<string, unknown>) => { mode = 'update'; push('update', obj); return b },
      then: (resolve: (r: { data: unknown; error: null }) => void) => {
        const data = mode === 'insert' || mode === 'upsert'
          ? { id: `${table}_id` }
          : mode === 'update' ? null
          : (lookups[table] ?? null)
        resolve({ data, error: null })
      },
    })
    return b
  }
  return { from, captured }
}

const ctx = (sb: ReturnType<typeof makeSupabase>) =>
  ({ churchId: 'church1', supabase: sb as unknown as never })

const firstOp = (sb: ReturnType<typeof makeSupabase>, table: string, op: Captured['op']) =>
  (sb.captured[table] ?? []).find(c => c.op === op)?.obj

describe('import writers — cadence-window model', () => {
  it('church-wide period home: no location_code → inserts location_id NULL', async () => {
    const sb = makeSupabase({ service_tags: { id: 'tag1' }, service_templates: null })
    await WRITER_HANDLERS.upsert_service_template(
      { service_code: 'WEEKLY', display_name: 'Weekly', primary_tag_code: 'CHURCH_WIDE' },
      ctx(sb),
    )
    const ins = firstOp(sb, 'service_templates', 'insert')
    expect(ins).toBeDefined()
    expect(ins!.location_id).toBeNull()
  })

  it('specific gathering: location_code still resolves to a campus (backward compat)', async () => {
    const sb = makeSupabase({ church_locations: { id: 'loc1' }, service_tags: { id: 'tag1' }, service_templates: null })
    await WRITER_HANDLERS.upsert_service_template(
      { service_code: 'EXP', display_name: 'Experience', location_code: 'MAIN', primary_tag_code: 'EXP' },
      ctx(sb),
    )
    expect(firstOp(sb, 'service_templates', 'insert')!.location_id).toBe('loc1')
  })

  it('weekly schedule: frequency=weekly written with placeholder day/time, no location required', async () => {
    const sb = makeSupabase({ service_templates: { id: 'tmpl1' } })
    await WRITER_HANDLERS.upsert_service_schedule_version(
      { service_code: 'WEEKLY', frequency: 'weekly' },
      ctx(sb),
    )
    const up = firstOp(sb, 'service_schedule_versions', 'upsert')
    expect(up).toBeDefined()
    expect(up!.frequency).toBe('weekly')
    expect(up!.day_of_week).toBe(0)
    expect(up!.start_time).toBe('00:00:00')
  })

  it('specific schedule: keeps real day/time (backward compat)', async () => {
    const sb = makeSupabase({ church_locations: { id: 'loc1' }, service_templates: { id: 'tmpl1' } })
    await WRITER_HANDLERS.upsert_service_schedule_version(
      { service_code: 'EXP', location_code: 'MAIN', day_of_week: 0, start_time: '09:00', frequency: 'specific' },
      ctx(sb),
    )
    const up = firstOp(sb, 'service_schedule_versions', 'upsert')!
    expect(up.frequency).toBe('specific')
    expect(up.day_of_week).toBe(0)
    expect(up.start_time).toBe('09:00:00')
  })

  it('period metric: cadence defaults to week; instance metric: cadence null', async () => {
    const sbP = makeSupabase({ service_tags: { id: 'tag1' }, reporting_tags: { id: 'rpt1' } })
    await WRITER_HANDLERS.upsert_metric(
      { metric_code: 'CW_GIVING', name: 'Giving', ministry_tag_code: 'CHURCH_WIDE', reporting_tag_code: 'GIVING', scope: 'period', is_canonical: true },
      ctx(sbP),
    )
    expect(firstOp(sbP, 'metrics', 'upsert')!.cadence).toBe('week')

    const sbI = makeSupabase({ service_tags: { id: 'tag1' }, reporting_tags: { id: 'rpt1' } })
    await WRITER_HANDLERS.upsert_metric(
      { metric_code: 'EXP_ATT', name: 'Attendance', ministry_tag_code: 'EXP', reporting_tag_code: 'ATTENDANCE', scope: 'instance', is_canonical: true },
      ctx(sbI),
    )
    expect(firstOp(sbI, 'metrics', 'upsert')!.cadence).toBeNull()
  })
})

describe('import writers — schedule deactivation never writes a backwards range', () => {
  it('prior version starting AFTER the new start ends at its OWN start (not the earlier new start)', async () => {
    const sb = makeSupabase({
      service_templates: { id: 'tmpl1' },
      // the neq-filtered prior active version, starting later than the incoming one
      service_schedule_versions: [{ id: 'old1', effective_start_date: '2026-06-14' }],
    })
    await WRITER_HANDLERS.upsert_service_schedule_version(
      { service_code: 'WEEKLY', frequency: 'weekly', effective_start_date: '2026-06-07' },
      ctx(sb),
    )
    const upd = firstOp(sb, 'service_schedule_versions', 'update')
    expect(upd).toBeDefined()
    expect(upd!.is_active).toBe(false)
    // clamped UP to the prior row's own start — pre-fix this was '2026-06-07' (end < start)
    expect(upd!.effective_end_date).toBe('2026-06-14')
  })

  it('prior version starting BEFORE the new start ends at the new start (normal forward edit)', async () => {
    const sb = makeSupabase({
      service_templates: { id: 'tmpl1' },
      service_schedule_versions: [{ id: 'old1', effective_start_date: '2026-06-01' }],
    })
    await WRITER_HANDLERS.upsert_service_schedule_version(
      { service_code: 'WEEKLY', frequency: 'weekly', effective_start_date: '2026-06-10' },
      ctx(sb),
    )
    expect(firstOp(sb, 'service_schedule_versions', 'update')!.effective_end_date).toBe('2026-06-10')
  })
})
