// GET  /api/widgets/[id] — load a specific widget (full spec + metadata)
// PUT  /api/widgets/[id] — rename (title only; full spec edits go through the AI builder)
// DELETE /api/widgets/[id] — remove from library; dashboard_widgets FK is ON DELETE CASCADE
//
// church_id ALWAYS comes from the session membership, never from the client.
// Starters are protected from deletion. Mutations require editor+ role.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

async function loadContext(supabase: Awaited<ReturnType<typeof createClient>>, widgetId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { _err: 'unauthorized', status: 401 } as const

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) return { _err: 'no_church', status: 403 } as const

  const { data: widget } = await supabase
    .from('widgets')
    .select('id, church_id, scope, owner_user_id, title, kind, viz_config, query_spec, is_starter, created_at')
    .eq('id', widgetId)
    .eq('church_id', membership.church_id as string)
    .maybeSingle()
  if (!widget) return { _err: 'not_found', status: 404 } as const

  return {
    user,
    role: membership.role as string,
    churchId: membership.church_id as string,
    widget,
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const ctx = await loadContext(supabase, id)
  if ('_err' in ctx) return NextResponse.json({ error: ctx._err }, { status: ctx.status })
  return NextResponse.json({ widget: ctx.widget })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const ctx = await loadContext(supabase, id)
  if ('_err' in ctx) return NextResponse.json({ error: ctx._err }, { status: ctx.status })
  if (ctx.role === 'viewer') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof body.title === 'string' ? body.title.trim() : null
  if (!title) return NextResponse.json({ error: 'title_required' }, { status: 422 })
  if (title.length > 200) return NextResponse.json({ error: 'title_too_long' }, { status: 422 })

  const { data: updated, error } = await supabase
    .from('widgets')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('church_id', ctx.churchId)
    .select('id, title')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

  return NextResponse.json({ widget: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const ctx = await loadContext(supabase, id)
  if ('_err' in ctx) return NextResponse.json({ error: ctx._err }, { status: ctx.status })
  if (ctx.role === 'viewer') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (ctx.widget.is_starter) return NextResponse.json({ error: 'cannot_delete_starter' }, { status: 409 })

  const { error } = await supabase
    .from('widgets')
    .delete()
    .eq('id', id)
    .eq('church_id', ctx.churchId)
  if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 500 })

  return NextResponse.json({ deleted: id })
}
