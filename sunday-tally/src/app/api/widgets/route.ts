// GET /api/widgets — the church's widget library, for the Batch-2 drag-from
// palette (CONCEPT_AI_WIDGETS.md §9).
//
// A widget is a reusable definition (the library entity) that can be placed on
// many dashboards. This lists the library visible to the caller: every
// church-scope widget for the church (the seeded starter set + every AI-built
// widget joins it automatically) plus the caller's own user-scope widgets. RLS
// enforces that visibility; the church_id predicate is defense in depth.
//
// church_id ALWAYS comes from the session membership, NEVER from the client.
// This is a read path — visible to all active members, including viewers — so
// there is no role gate.
//
// The widgets table was introduced by migration 0033 (live, alongside 0035) — this
// handler runs for real against it under the caller's RLS.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
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
  const churchId = membership.church_id as string

  // RLS returns church-scope widgets (any member) + own user-scope widgets. We do
  // NOT return query_spec here — the palette only needs identity + how to render a
  // thumbnail; the full spec is resolved on the replay endpoint. Starter widgets
  // sort first, then alphabetical, for a stable gallery.
  const { data, error } = await supabase
    .from('widgets')
    .select('id, church_id, scope, owner_user_id, title, kind, viz_config, is_starter, created_at, updated_at')
    .eq('church_id', churchId)
    .order('is_starter', { ascending: false })   // starter set first
    .order('title',      { ascending: true })
  if (error) return NextResponse.json({ error: 'list_failed' }, { status: 500 })

  return NextResponse.json({ widgets: data ?? [] })
}
