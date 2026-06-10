// /api/dashboards/[id]/widgets — place / remove a widget on a dashboard
// (the Track-D grid's add-from-library and remove-card actions).
//
//   POST   { widget_id, layout? }  → place a library widget on this dashboard
//                                     (upsert on the UNIQUE(dashboard_id, widget_id)
//                                     constraint, so re-placing just refreshes layout).
//   DELETE ?widget_id=<uuid>       → remove THIS dashboard's placement of a widget.
//                                     Only the junction row is deleted; the widget
//                                     definition stays in the library.
//
// Auth + tenancy mirror the replay route (src/app/api/dashboards/[id]/route.ts):
// active-membership is required and pins church_id from the SESSION, never the
// client. RLS on dashboard_widgets (migration 0033) is the real guard — a write
// only succeeds when the parent dashboard is WRITABLE by the caller (church-scope
// → editor+, user-scope → owner). The church_id we inject is defense in depth +
// it satisfies the table's NOT NULL column.
//
// We do NOT validate the widget's spec here: placement is a pointer. A stale /
// broken spec is handled gracefully at replay time (the schema-drift guard), so a
// placement can never 500 a dashboard load.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function activeMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data as { church_id: string; role: string } | null
}

// ─── POST — place a widget ────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dashboardId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const membership = await activeMembership(supabase, user.id)
  if (!membership) return NextResponse.json({ error: 'no_church' }, { status: 403 })
  const churchId = membership.church_id

  const body = await req.json().catch(() => null) as { widget_id?: unknown; layout?: unknown } | null
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const widgetId = typeof body.widget_id === 'string' ? body.widget_id : ''
  if (!widgetId) return NextResponse.json({ error: 'widget_id_required' }, { status: 400 })

  // layout is the optional grid cell ({ x, y, w, h }); default {} lets the grid
  // size/position it on first render (matches save_widget's default placement).
  const layout = body.layout ?? {}

  // Confirm the dashboard is visible to the caller before writing (RLS would also
  // reject the insert, but this returns a clean 404 instead of a generic failure
  // and gives no cross-tenant existence oracle).
  const { data: dash, error: dErr } = await supabase
    .from('dashboards')
    .select('id')
    .eq('id', dashboardId)
    .eq('church_id', churchId)
    .maybeSingle()
  if (dErr) return NextResponse.json({ error: 'dashboard_load_failed' }, { status: 500 })
  if (!dash) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Upsert on the unique (dashboard_id, widget_id) pair: placing an already-placed
  // widget just updates its stored layout (idempotent re-add). church_id is pinned
  // from the session. RLS enforces that the parent dashboard is writable here.
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .upsert(
      { church_id: churchId, dashboard_id: dashboardId, widget_id: widgetId, layout },
      { onConflict: 'dashboard_id,widget_id' },
    )
    .select('id, dashboard_id, widget_id, layout')
    .single()

  if (error || !data) {
    // A failed upsert here is most often the RLS write gate (caller lacks editor+
    // on a church dashboard, or isn't the owner of a user dashboard) or a missing
    // widget. Report without leaking which.
    return NextResponse.json({ error: 'place_failed', detail: error?.message }, { status: 403 })
  }

  return NextResponse.json({ placement: data }, { status: 201 })
}

// ─── DELETE — remove a placement ──────────────────────────────────────────────

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dashboardId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const membership = await activeMembership(supabase, user.id)
  if (!membership) return NextResponse.json({ error: 'no_church' }, { status: 403 })
  const churchId = membership.church_id

  const url = new URL(req.url)
  const widgetId = url.searchParams.get('widget_id') ?? ''
  if (!widgetId) return NextResponse.json({ error: 'widget_id_required' }, { status: 400 })

  // Delete only this dashboard's placement (the junction row). The widget stays in
  // the library. RLS permits the delete only when the parent dashboard is writable
  // by the caller; church_id is the session value (defense in depth).
  const { error } = await supabase
    .from('dashboard_widgets')
    .delete()
    .eq('dashboard_id', dashboardId)
    .eq('widget_id', widgetId)
    .eq('church_id', churchId)

  if (error) return NextResponse.json({ error: 'remove_failed', detail: error.message }, { status: 403 })

  return NextResponse.json({ ok: true })
}
