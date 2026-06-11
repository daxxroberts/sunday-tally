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
  location_scope: 'all' | 'restricted'
  location_ids: string[]
}

export async function getInviteByToken(token: string): Promise<
  | { data: InviteData }
  | { error: 'expired' | 'already_accepted' | 'not_found' }
> {
  // B1: an unauthenticated invitee cannot satisfy RLS on church_invites, so the anon
  // server client always reads nothing → every invite looked "expired". The token is a
  // 32-byte secret, so an EXACT-match lookup via the service-role client is safe and is
  // the only way to resolve the invite before the invitee has a membership. We do NOT
  // broaden any RLS policy; status/expiry/accepted validation below still gates redemption.
  const admin = createServiceRoleClient()

  const { data, error } = await admin
    .from('church_invites')
    .select(`id, email, role, church_id, status, accepted_at, expires_at, location_scope, location_ids, churches(name)`)
    .eq('token', token)
    .single()

  if (error || !data) return { error: 'not_found' }
  // E-37: a revoked (cancelled) or otherwise non-pending invite must not resolve.
  // Only 'pending' invites are valid; treat cancelled/accepted/expired status as invalid.
  if (data.status && !['pending'].includes(data.status)) {
    if (data.status === 'accepted') return { error: 'already_accepted' }
    if (data.status === 'expired') return { error: 'expired' }
    return { error: 'not_found' }
  }
  if (data.accepted_at) return { error: 'already_accepted' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { error: 'expired' }

  return {
    data: {
      id: data.id,
      email: data.email,
      role: data.role,
      church_id: data.church_id,
      church_name:
        (Array.isArray(data.churches) ? data.churches[0]?.name : data.churches?.name) ??
        'Your church',
      accepted_at: data.accepted_at,
      expires_at: data.expires_at,
      location_scope: (data.location_scope as 'all' | 'restricted' | null) ?? 'all',
      location_ids: (data.location_ids as string[] | null) ?? [],
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

  // E-37 / S2: re-validate the invite server-side before doing anything. The page already
  // gates rendering on getInviteByToken, but a direct call to this action must not be
  // able to redeem a revoked (cancelled), expired, or already-accepted invite token.
  const validation = await getInviteByToken(token)
  if ('error' in validation) {
    return { error: 'This invite link is no longer valid. Ask your church admin to send a new one.' }
  }
  // S2: privilege binding — the membership role/church MUST come from the token's
  // invite row (server-validated), never from the client-passed `role`/`churchId`
  // args (those are advisory/UI only and could be tampered with).
  const invite = validation.data
  const grantedRole = invite.role
  const grantedChurchId = invite.church_id

  // Get current user (viewer arrives already authenticated via magic link)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired. Please use the link from your email again.' }

  // S2: the authenticated identity must match the invited email — an invite is bound to
  // one address and may not be redeemed by a different signed-in account.
  if ((user.email ?? '').toLowerCase() !== invite.email.toLowerCase()) {
    return { error: 'This invite was sent to a different email address. Sign in with the invited email.' }
  }

  // Set password for non-viewers (N87)
  if (grantedRole !== 'viewer' && password) {
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) return { error: 'Could not set password. Try again.' }
  }

  // S2: campus scope also comes from the SERVER-VALIDATED invite, never the client.
  const grantedScope = invite.location_scope === 'restricted' ? 'restricted' : 'all'
  const grantedCampusIds = grantedScope === 'restricted' ? (invite.location_ids ?? []) : []

  // Atomic: INSERT membership + UPDATE accepted_at (N86) — bind to invite's role/church
  const { data: newMember, error: memberError } = await admin
    .from('church_memberships')
    .insert({
      user_id: user.id, church_id: grantedChurchId, role: grantedRole, is_active: true,
      location_scope: grantedScope,
    })
    .select('id')
    .single()

  let membershipId: string | null = newMember?.id ?? null
  if (memberError) {
    // Already a member — still mark invite accepted; reuse the existing membership.
    if (!memberError.message.includes('duplicate') && !memberError.message.includes('unique')) {
      return { error: 'Something went wrong joining the church. Try again.' }
    }
    const { data: existing } = await admin
      .from('church_memberships')
      .select('id')
      .eq('user_id', user.id).eq('church_id', grantedChurchId)
      .maybeSingle()
    membershipId = existing?.id ?? null
    if (membershipId) {
      await admin.from('church_memberships').update({ location_scope: grantedScope }).eq('id', membershipId)
    }
  }

  // Apply the allowed-campus junction for a restricted invite (re-validate ⊆ church).
  if (membershipId && grantedScope === 'restricted' && grantedCampusIds.length > 0) {
    const { data: validLocs } = await admin
      .from('church_locations').select('id')
      .eq('church_id', grantedChurchId).in('id', grantedCampusIds)
    const validIds = ((validLocs ?? []) as { id: string }[]).map(l => l.id)
    await admin.from('church_membership_locations').delete().eq('membership_id', membershipId)
    if (validIds.length > 0) {
      await admin.from('church_membership_locations')
        .insert(validIds.map(location_id => ({ membership_id: membershipId, location_id })))
    }
  }

  await admin
    .from('church_invites')
    // status='accepted' (additive) so the canonical Members screen's status-based
    // open list (pending/expired) drops this invite once accepted.
    // Bind the update to the server-validated invite id, not the client-passed inviteId.
    .update({ accepted_at: new Date().toISOString(), status: 'accepted' })
    .eq('id', invite.id)

  // N89 routing — role-aware landing. /services is retired; editors/admins/owners land
  // on /entries, viewers on /dashboard/viewer.
  if (grantedRole === 'viewer') redirect('/dashboard/viewer')
  redirect('/entries')
}
