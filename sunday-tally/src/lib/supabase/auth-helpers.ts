import 'server-only'

// ─── Server-action caller resolution ────────────────────────────────────────────
// The createClient → getUser → active-membership chain that every settings
// server action repeated inline. One query shape, one place (lifted verbatim
// from team/actions.ts resolveCaller).
//
// Error COPY stays at the call sites: each screen's user-visible strings are
// frozen, so this helper reports a machine reason and the caller maps it to its
// own wording. Callers also keep their own role checks/messages — this only
// answers "who is calling and what is their membership?".

import { createClient } from '@/lib/supabase/server'

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface CallerMembership {
  userId: string
  churchId: string
  role: MemberRole
}

export type ResolveMemberResult =
  | { ok: true; member: CallerMembership }
  | { ok: false; reason: 'unauthenticated' | 'no-membership' }

/**
 * Resolve the signed-in caller's active church membership.
 * Pass the action's existing cookie-bound server client when it has one
 * (so the same client serves the whole action); otherwise one is created.
 */
export async function resolveMember(
  supabase?: Awaited<ReturnType<typeof createClient>>,
): Promise<ResolveMemberResult> {
  const sb = supabase ?? await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }
  const { data: membership } = await sb
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return { ok: false, reason: 'no-membership' }
  return {
    ok: true,
    member: {
      userId: user.id,
      churchId: membership.church_id as string,
      role: membership.role as MemberRole,
    },
  }
}

/** owner/admin = the write tier used by every settings mutation. */
export function isOwnerAdmin(role: MemberRole): boolean {
  return role === 'owner' || role === 'admin'
}
