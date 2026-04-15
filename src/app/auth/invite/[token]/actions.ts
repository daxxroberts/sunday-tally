'use server'

// INVITE_ACCEPT server actions
// N85: validate token | N86: atomic membership + accepted_at | N87: viewer auto | N89: routing

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type InviteData = {
  id: string
  email: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  church_id: string
  church_name: string
  accepted_at: string | null
  expires_at: string | null
}

export async function getInviteByToken(token: string): Promise<
  | { data: InviteData }
  | { error: 'expired' | 'already_accepted' | 'not_found' }
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('church_invites')
    .select(`id, email, role, church_id, accepted_at, expires_at, churches(name)`)
    .eq('token', token)
    .single()

  if (error || !data) return { error: 'not_found' }
  if (data.accepted_at) return { error: 'already_accepted' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { error: 'expired' }

  return {
    data: {
      id: data.id,
      email: data.email,
      role: data.role,
      church_id: data.church_id,
      // @ts-expect-error supabase join type
      church_name: data.churches?.name ?? 'Your church',
      accepted_at: data.accepted_at,
      expires_at: data.expires_at,
    },
  }
}

export async function acceptInviteAction(
  inviteId: string,
  token: string,
  password: string | null,  // null for viewers (magic link already authenticated)
  role: string,
  churchId: string
): Promise<{ error: string } | never> {
  const admin = createServiceRoleClient()
  const supabase = await createClient()

  // Get current user (viewer arrives already authenticated via magic link)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired. Please use the link from your email again.' }

  // Set password for non-viewers (N87)
  if (role !== 'viewer' && password) {
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) return { error: 'Could not set password. Try again.' }
  }

  // Atomic: INSERT membership + UPDATE accepted_at (N86)
  const { error: memberError } = await admin
    .from('church_memberships')
    .insert({ user_id: user.id, church_id: churchId, role, is_active: true })

  if (memberError) {
    // Already a member — still mark invite accepted
    if (!memberError.message.includes('duplicate') && !memberError.message.includes('unique')) {
      return { error: 'Something went wrong joining the church. Try again.' }
    }
  }

  await admin
    .from('church_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inviteId)

  // N89 routing
  if (role === 'viewer') redirect('/dashboard/viewer')
  redirect('/services')
}
