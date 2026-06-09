// /api/dashboards — list + create named dashboard canvases.
//
//   GET  → dashboards visible to the caller: every church-scope dashboard for the
//          church, plus the caller's own user-scope dashboards. RLS already
//          enforces this (church rows for any member; user rows only where
//          owner_user_id = auth.uid()); we add the church_id predicate as defense
//          in depth and order newest-ish-first by name for a stable palette list.
//   POST → create a dashboard. church-scope requires a manager (owner/admin/editor)
//          and stores owner_user_id = NULL; user-scope is open to any active member
//          and stores owner_user_id = auth.uid(). church_id ALWAYS comes from the
//          session membership, NEVER from the request body (CONCEPT §5/§6).
//
// The dashboards table was introduced by migration 0033 (live, alongside 0035) —
// this handler runs for real against it under the caller's RLS.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MANAGER_ROLES = ['owner', 'admin', 'editor'] as const

async function getActiveMembership(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id',   userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data as { church_id: string; role: string } | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const membership = await getActiveMembership(supabase, user.id)
  if (!membership) return NextResponse.json({ error: 'no_church' }, { status: 403 })
  const churchId = membership.church_id

  // RLS returns church-scope rows (any member) + own user-scope rows. The
  // church_id filter is defense in depth and a query-performance aid.
  const { data, error } = await supabase
    .from('dashboards')
    .select('id, church_id, owner_user_id, name, scope, breakpoints, created_at, updated_at')
    .eq('church_id', churchId)
    .order('scope', { ascending: true })       // 'church' before 'user'
    .order('name',  { ascending: true })
  if (error) return NextResponse.json({ error: 'list_failed' }, { status: 500 })

  return NextResponse.json({ dashboards: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const membership = await getActiveMembership(supabase, user.id)
  if (!membership) return NextResponse.json({ error: 'no_church' }, { status: 403 })
  const churchId = membership.church_id

  const body = await req.json().catch(() => null) as { name?: unknown; scope?: unknown; breakpoints?: unknown } | null
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })

  const scope = body.scope === 'church' ? 'church' : body.scope === 'user' ? 'user' : null
  if (!scope) return NextResponse.json({ error: 'invalid_scope' }, { status: 400 })

  // church-scope = a shared canvas → manager-only (owner/admin/editor). user-scope
  // = a private canvas → any active member may create their own. This server gate
  // mirrors the RLS the 0033 migration applies (defense in depth).
  if (scope === 'church' && !MANAGER_ROLES.includes(membership.role as typeof MANAGER_ROLES[number])) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // owner_user_id: NULL for church-scope (shared), the caller for user-scope.
  // church_id is taken from the session membership, never from the client body.
  const insert = {
    church_id:      churchId,
    name,
    scope,
    owner_user_id:  scope === 'user' ? user.id : null,
    breakpoints:    body.breakpoints ?? null,
    created_by:     user.id,
  }

  const { data, error } = await supabase
    .from('dashboards')
    .insert(insert)
    .select('id, church_id, owner_user_id, name, scope, breakpoints, created_at, updated_at')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }

  return NextResponse.json({ dashboard: data }, { status: 201 })
}
