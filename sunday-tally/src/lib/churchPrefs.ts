// ─────────────────────────────────────────────────────────────────────────
// churchPrefs — read/write the CHURCH-WIDE dashboard preferences
// (keyMetrics · keyMetricTargets · excludedTotalMinistries) across the
// grid_config → dashboard_prefs split (migration 0039).
// (Per-USER summary-metric flags live in dashboardPrefs.ts / localStorage —
// a different concern; do not merge the two.)
//
// THE FOOTGUN THIS KILLS: prefs used to live INSIDE churches.grid_config —
// the same JSONB the History grid's column structure lives in. A prefs-only
// save produced a non-null, column-less grid_config that defeated History's
// "re-derive when empty" heuristic ("History out of whack"). Prefs now live
// in churches.dashboard_prefs; grid_config means ONLY the History grid.
//
// TRANSITION SAFETY (this code ships BEFORE 0039 is applied):
//   read  → dashboard_prefs when present, else the legacy pref keys still
//           inside grid_config (pre-migration state).
//   write → dashboard_prefs first; if the column doesn't exist yet
//           (Postgres 42703 / PostgREST PGRST204), fall back to the legacy
//           merge-into-grid_config write so saves keep working either way.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

/** The three church-wide dashboard pref keys (and ONLY these — anything else
 *  in grid_config belongs to the History grid). 0039 moves exactly this set. */
export const CHURCH_PREF_KEYS = ['keyMetrics', 'keyMetricTargets', 'excludedTotalMinistries', 'totals'] as const

export type ChurchPrefs = Record<string, unknown>

interface ChurchPrefSource {
  dashboard_prefs?: Record<string, unknown> | null
  grid_config?: Record<string, unknown> | null
}

/** Resolve current prefs from a churches row: new column first, legacy
 *  grid_config keys as the pre-0039 fallback. Never returns grid columns. */
export function readChurchPrefs(church: ChurchPrefSource | null | undefined): ChurchPrefs {
  if (!church) return {}
  if (church.dashboard_prefs && typeof church.dashboard_prefs === 'object') {
    return { ...church.dashboard_prefs }
  }
  const legacy = church.grid_config
  if (!legacy || typeof legacy !== 'object') return {}
  const prefs: ChurchPrefs = {}
  for (const k of CHURCH_PREF_KEYS) if (legacy[k] !== undefined) prefs[k] = legacy[k]
  return prefs
}

/** Column-missing detection: Postgres undefined_column (42703) or PostgREST
 *  schema-cache miss (PGRST204) — the pre-0039 states. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  const msg = error.message ?? ''
  return /dashboard_prefs/.test(msg) && /column|schema cache/i.test(msg)
}

/**
 * Persist the FULL prefs object (caller merges its patch first).
 * ok=false on error or a zero-row write (RLS no-op — the silent failure that
 * made saves "vanish on refresh"; .select('id') exposes it).
 */
export async function saveChurchPrefs(
  supabase: SupabaseClient,
  churchId: string,
  next: ChurchPrefs,
): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await supabase
    .from('churches')
    .update({ dashboard_prefs: next })
    .eq('id', churchId)
    .select('id')

  if (!error) {
    if (!data || data.length === 0) return { ok: false, message: 'write matched 0 rows (RLS or missing church)' }
    return { ok: true }
  }

  if (!isMissingColumn(error)) return { ok: false, message: error.message }

  // ── legacy fallback (0039 not applied yet): merge prefs into grid_config.
  // Fresh-read the current grid_config so we never clobber History columns.
  const { data: row, error: readErr } = await supabase
    .from('churches').select('grid_config').eq('id', churchId).maybeSingle()
  if (readErr) return { ok: false, message: readErr.message }
  const existing = ((row as { grid_config?: Record<string, unknown> } | null)?.grid_config) ?? {}
  const { data: w, error: writeErr } = await supabase
    .from('churches')
    .update({ grid_config: { ...existing, ...next } })
    .eq('id', churchId)
    .select('id')
  if (writeErr) return { ok: false, message: writeErr.message }
  if (!w || w.length === 0) return { ok: false, message: 'legacy write matched 0 rows (RLS or missing church)' }
  return { ok: true }
}
