// Thorough coverage for saveScheduleAction — the MANUAL schedule-edit path that
// originally produced backwards-date rows (start 06-14 / end 06-07). Previously
// ZERO coverage (SAGE/FELIX gate, 2026-06-19). Mocks the Supabase server client
// and next/cache so the action runs in isolation; asserts the deactivation flow
// ends every prior version at GREATEST(its own start, the new start).

import { vi, describe, it, expect, beforeEach } from 'vitest'

// Stub Supabase server client + next/cache before importing the action.
let current: { client: unknown }
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => current.client) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveScheduleAction } from '../actions'

type Upd = { obj: Record<string, unknown>; id?: unknown }

/** Chainable PostGREST-ish stub. select() resolves to `priors`; update()/upsert()
 *  capture their payloads (update also captures its .eq('id', …) target). */
function makeSupabase(opts: { user?: { id: string } | null; priors?: { id: string; effective_start_date: string }[] } = {}) {
  const user = opts.user === undefined ? { id: 'u1' } : opts.user
  const priors = opts.priors ?? []
  const captured = { updates: [] as Upd[], upserts: [] as Record<string, unknown>[] }
  const make = () => {
    let mode: 'select' | 'update' | 'upsert' = 'select'
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b, neq: () => b, is: () => b, order: () => b, limit: () => b,
      maybeSingle: () => b, single: () => b,
      eq: (col: string, val: unknown) => {
        if (mode === 'update' && col === 'id') captured.updates[captured.updates.length - 1].id = val
        return b
      },
      update: (o: Record<string, unknown>) => { mode = 'update'; captured.updates.push({ obj: o }); return b },
      upsert: (o: Record<string, unknown>) => { mode = 'upsert'; captured.upserts.push(o); return b },
      then: (resolve: (r: { data: unknown; error: null }) => void) =>
        resolve({ data: mode === 'select' ? priors : mode === 'upsert' ? { id: 'new' } : null, error: null }),
    })
    return b
  }
  const client = { auth: { getUser: async () => ({ data: { user } }) }, from: () => make() }
  return { client, captured }
}

describe('saveScheduleAction — schedule version deactivation', () => {
  beforeEach(() => { current = { client: null } })

  it('THE BUG (manual edit): a prior version starting AFTER the new start ends at its own start, never before', async () => {
    const sb = makeSupabase({ priors: [{ id: 'old1', effective_start_date: '2026-06-14' }] })
    current = { client: sb.client }
    await saveScheduleAction('tmpl1', 0, '00:00', '2026-06-07', 'weekly')
    expect(sb.captured.updates).toHaveLength(1)
    const u = sb.captured.updates[0]
    expect(u.id).toBe('old1')
    expect(u.obj.is_active).toBe(false)
    expect(u.obj.effective_end_date).toBe('2026-06-14') // clamped up — pre-fix was '2026-06-07' (end<start)
  })

  it('forward edit: a prior version starting BEFORE the new start ends at the new start', async () => {
    const sb = makeSupabase({ priors: [{ id: 'old1', effective_start_date: '2026-06-01' }] })
    current = { client: sb.client }
    await saveScheduleAction('tmpl1', 0, '09:00', '2026-06-10', 'specific')
    expect(sb.captured.updates[0].obj.effective_end_date).toBe('2026-06-10')
  })

  it('multiple prior versions: each is clamped independently, none ends before its own start', async () => {
    const sb = makeSupabase({ priors: [
      { id: 'back', effective_start_date: '2026-06-14' },
      { id: 'fwd',  effective_start_date: '2026-06-01' },
    ] })
    current = { client: sb.client }
    await saveScheduleAction('tmpl1', 0, '00:00', '2026-06-07', 'weekly')
    const byId = Object.fromEntries(sb.captured.updates.map(u => [u.id, u.obj.effective_end_date]))
    expect(byId['back']).toBe('2026-06-14') // clamped up to its own start
    expect(byId['fwd']).toBe('2026-06-07')  // ends at the new start
  })

  it('not authenticated: returns an error and writes nothing', async () => {
    const sb = makeSupabase({ user: null, priors: [{ id: 'old1', effective_start_date: '2026-06-14' }] })
    current = { client: sb.client }
    const res = await saveScheduleAction('tmpl1', 0, '09:00', '2026-06-07', 'specific')
    expect(res.error).toBeTruthy()
    expect(sb.captured.updates).toHaveLength(0)
    expect(sb.captured.upserts).toHaveLength(0)
  })

  it('weekly cadence writes placeholder day/time; specific writes the real day/time', async () => {
    const sbWeekly = makeSupabase()
    current = { client: sbWeekly.client }
    await saveScheduleAction('tmpl1', 3, '18:30', '2026-06-07', 'weekly')
    expect(sbWeekly.captured.upserts[0].day_of_week).toBe(0)
    expect(sbWeekly.captured.upserts[0].start_time).toBe('00:00')
    expect(sbWeekly.captured.upserts[0].frequency).toBe('weekly')

    const sbSpecific = makeSupabase()
    current = { client: sbSpecific.client }
    await saveScheduleAction('tmpl1', 3, '18:30', '2026-06-07', 'specific')
    expect(sbSpecific.captured.upserts[0].day_of_week).toBe(3)
    expect(sbSpecific.captured.upserts[0].start_time).toBe('18:30')
  })
})
