'use server'

// T9 invite actions
// N60: token = crypto.randomBytes(32) (CANONICAL — see @/lib/invites)
// N61(reconciled): a single send path for ALL roles. The viewer-vs-editor
//   distinction is resolved at ACCEPTANCE (auth/invite/[token]/actions.ts), not
//   at send time, so we no longer branch on role here. The old Supabase
//   admin.auth.admin.inviteUserByEmail / generateLink path is removed — it
//   contradicted the locked D-009 custom-token decision and gave invitees two
//   different experiences (EMAIL_POLICY §2 #3 vs #11/#12 reconciliation).
// N64: remove = delete memberships + revoke sessions | N65: last owner protection

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createAndSendInvite, type InviteRole } from '@/lib/invites'
import { revalidatePath } from 'next/cache'

export async function getTeamData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return null

  const [membersResult, pendingResult] = await Promise.all([
    supabase
      .from('church_memberships')
      .select('id, role, user_id, users:user_id(email, raw_user_meta_data)')
      .eq('church_id', membership.church_id)
      .eq('is_active', true),
    supabase
      .from('church_invites')
      .select('id, email, role, created_at')
      .eq('church_id', membership.church_id)
      .is('accepted_at', null),
  ])

  return {
    churchId: membership.church_id,
    myRole: membership.role,
    members: membersResult.data ?? [],
    pendingInvites: pendingResult.data ?? [],
  }
}

export async function sendInviteAction(
  email: string,
  role: string,
  churchId: string
): Promise<{ error?: string; sent?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // CANONICAL invite (D-009): 32-byte token → church_invites row (status
  // 'pending' + expires_at) → branded Resend invite carrying the
  // /auth/invite/[token] link. ONE path for all roles — the viewer-vs-editor
  // distinction is handled at acceptance, not at send. The inserted row is
  // identical in shape to the Members screen's, so /settings/team lists
  // onboarding-created invites correctly.
  const result = await createAndSendInvite({
    churchId,
    email,
    role: role as InviteRole,
    invitedBy: user?.id ?? null,
  })
  if (result.error) return { error: result.error }

  revalidatePath('/onboarding/invite')
  return { sent: true }
}

export async function removeMemberAction(membershipId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const admin = createServiceRoleClient()

  // N65: last owner protection
  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role, user_id')
    .eq('id', membershipId)
    .single()

  if (!membership) return { error: 'Member not found.' }

  if (membership.role === 'owner') {
    const { data: owners } = await supabase
      .from('church_memberships')
      .select('id')
      .eq('church_id', membership.church_id)
      .eq('role', 'owner')
      .eq('is_active', true)
    if ((owners?.length ?? 0) <= 1) return { error: 'Cannot remove the last owner.' }
  }

  // N64: delete membership + revoke session
  await admin.from('church_memberships').update({ is_active: false }).eq('id', membershipId)
  await admin.auth.admin.signOut(membership.user_id, 'global')

  revalidatePath('/onboarding/invite')
  return {}
}

export async function cancelInviteAction(inviteId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  // Soft-cancel via status (keeps an audit row) instead of a hard DELETE so the
  // canonical Members screen's status-based list (status IN pending/expired)
  // correctly hides cancelled invites.
  await supabase.from('church_invites').update({ status: 'cancelled' }).eq('id', inviteId)
  revalidatePath('/onboarding/invite')
  return {}
}
