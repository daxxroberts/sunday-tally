// POST /api/widgets/[id]/duplicate — clone a widget into the library.
//
// Creates a new row with the same spec, kind, viz_config, and scope.
// Title gets " (copy)" appended. is_starter is always false on the clone.
// Requires editor+ role. church_id comes from the session, never the client.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'no_church' }, { status: 403 })
  if (membership.role === 'viewer') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const churchId = membership.church_id as string

  const { data: source } = await supabase
    .from('widgets')
    .select('title, kind, viz_config, query_spec, scope')
    .eq('id', id)
    .eq('church_id', churchId)
    .maybeSingle()
  if (!source) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: clone, error } = await supabase
    .from('widgets')
    .insert({
      church_id: churchId,
      owner_user_id: user.id,
      scope: source.scope,
      title: `${source.title} (copy)`,
      kind: source.kind,
      viz_config: source.viz_config,
      query_spec: source.query_spec,
      is_starter: false,
    })
    .select('id, title, kind, is_starter, scope')
    .single()
  if (error) return NextResponse.json({ error: 'duplicate_failed' }, { status: 500 })

  return NextResponse.json({ widget: clone }, { status: 201 })
}
