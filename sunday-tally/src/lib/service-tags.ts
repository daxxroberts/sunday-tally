// ─── Active ministry-tag fetch — THE palette-order invariant ───────────────────
// Single source for the service_tags fetch that feeds the positional color
// palette on the dashboard, the Setup track page, and the History grid derive.
//
// created_at tiebreaker: display_order ties (common — many tags sit at 0) come
// back in ARBITRARY per-query order from Postgres, which shuffles the positional
// color palette between surfaces. Every palette-feeding fetch MUST sort
// identically — that is the whole reason this helper exists. Do not change the
// order chain, and do not add palette callers that bypass it.
//
// No 'use client' and no server-only imports — called from both browser pages
// (settings/track) and server modules (history derive).

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ActiveServiceTagRow {
  id: string
  code: string
  name: string
  tag_role: string | null
  parent_tag_id: string | null
  display_order: number
  is_active: boolean
  /** null when the 0040 color column is unavailable (pre-migration fallback). */
  color: string | null
  /** 0051 archive marker. Non-null = archived (hidden from editor + entry, but
   *  History still shows its past). Callers that want only live tags filter this. */
  archived_at: string | null
}

/**
 * All active service_tags for a church, in canonical palette order
 * (display_order, then created_at). Selects the superset of columns the three
 * palette surfaces need; callers narrow to their own row types.
 *
 * color is 0040 — selecting it pre-apply errors, so fall back without it
 * (lifted from the track page's defensive load).
 */
export async function fetchActiveServiceTags(
  supabase: SupabaseClient,
  churchId: string,
): Promise<{ rows: ActiveServiceTagRow[]; error: { message: string } | null }> {
  const withColor = await supabase
    .from('service_tags')
    .select('id, code, name, tag_role, parent_tag_id, display_order, is_active, color, archived_at')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (!withColor.error) {
    return { rows: (withColor.data ?? []) as ActiveServiceTagRow[], error: null }
  }
  const base = await supabase
    .from('service_tags')
    .select('id, code, name, tag_role, parent_tag_id, display_order, is_active')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  const rows = ((base.data ?? []) as Omit<ActiveServiceTagRow, 'color' | 'archived_at'>[])
    .map(r => ({ ...r, color: null, archived_at: null }))
  return { rows, error: base.error }
}
