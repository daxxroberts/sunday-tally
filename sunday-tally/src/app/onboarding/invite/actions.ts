'use server'

// T9 invite actions
// N60: token = crypto.randomBytes(32) | N61: viewer signInWithOtp, others inviteUserByEmail
// N64: remove = delete memberships + revoke sessions | N65: last owner protection

import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
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
  const admin = createServiceRoleClient()

  const token = crypto.randomBytes(32).toString('hex') // N60 / D-009
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/auth/invite/${token}`

  // INSERT church_invites
  const { error: insertError } = await supabase
    .from('church_invites')
    .insert({ church_id: churchId, email, role, token })

  if (insertError) return { error: 'Failed to create invite.' }

  if (role === 'viewer') {
    // N61: Viewer — magic link via signInWithOtp
    const { error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: inviteUrl },
    })
    if (error) return { error: 'Failed to send invite email.' }
  } else {
    // N61: Editor/Admin — inviteUserByEmail (password setup)
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteUrl,
    })
    if (error && !error.message.includes('already registered')) {
      return { error: 'Failed to send invite email.' }
    }
  }

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
  await supabase.from('church_invites').delete().eq('id', inviteId)
  revalidatePath('/onboarding/invite')
  return {}
}
