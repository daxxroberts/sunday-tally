'use server'

// ─────────────────────────────────────────────────────────────────────────
// MEMBERS & INVITATIONS — server actions for /(app)/settings/team
// IRIS_MEMBERS_ELEMENT_MAP.md — canonical team surface (D-096 reconciliation).
//
// EVERY mutation re-asserts the caller's role server-side (N-7 / audit S1/S2/S3):
// these actions run through the service-role client, which BYPASSES RLS, so the
// only enforcement until migration 0029 lands is this in-action check. Each one:
//   1. resolves the caller via the cookie-bound anon client (real session),
//   2. re-reads the caller's active membership (role + church_id),
//   3. asserts owner/admin (and admin ≠ owner-target / admin ≠ assign-owner),
//   4. tenant-scopes the target row to the caller's church_id.
//
// Names: user_profiles.full_name (N-5). Emails: service-role admin, church-scoped
// to this church's member user_ids only (NOT the broken auth.users PostgREST
// embed that was the Surface-1 bug). Invite lifecycle rides the `status` column
// (N-4): create → 'pending', revoke → 'cancelled' (soft), resend → refresh
// token/expires_at + 'pending'. List = status IN ('pending','expired').
// ─────────────────────────────────────────────────────────────────────────

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { newInviteToken, inviteExpiry, sendInviteEmail } from '@/lib/invites'
import { revalidatePath } from 'next/cache'

const PAGE = 1000 // PostgREST row cap (N-2)

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface TeamMember {
  id: string                       // church_memberships.id
  user_id: string
  role: TeamRole
  default_location_id: string | null
  name: string | null             // user_profiles.full_name (null pre-0029 for teammates)
  email: string | null            // service-role resolved; null if not available
  isSelf: boolean
}

export interface TeamInvite {
  id: string
  email: string
  role: TeamRole
  status: string
  expires_at: string | null
  created_at: string | null
}

export interface TeamCampus {
  id: string
  name: string
  is_active: boolean
  sort_order: number
}

export interface TeamData {
  churchId: string
  churchName: string
  myRole: TeamRole
  selfUserId: string
  members: TeamMember[]
  invites: TeamInvite[]
  campuses: TeamCampus[]
  emailConfigured: boolean
}

// ── caller resolution (used by every mutation) ──────────────────────────────
type Caller = { userId: string; churchId: string; role: TeamRole }

async function resolveCaller(): Promise<Caller | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return { error: 'No active membership.' }
  return { userId: user.id, churchId: membership.church_id, role: membership.role as TeamRole }
}

function isWriter(role: TeamRole) {
  return role === 'owner' || role === 'admin'
}

// ── READ: full team payload ─────────────────────────────────────────────────
export async function getTeamData(): Promise<TeamData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role, churches(name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return null

  const churchId = membership.church_id
  const ch = Array.isArray(membership.churches) ? membership.churches[0] : membership.churches
  const churchName = (ch as { name?: string } | null)?.name ?? ''

  // ── members (active), paginated past the 1000-row cap (QP-MEMBERS-ACTIVE) ──
  type MemberRow = { id: string; user_id: string; role: string; default_location_id: string | null }
  const memberRows: MemberRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: batch } = await supabase
      .from('church_memberships')
      .select('id, user_id, role, default_location_id')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    const rows = (batch ?? []) as MemberRow[]
    memberRows.push(...rows)
    if (rows.length < PAGE) break
  }

  const userIds = Array.from(new Set(memberRows.map(m => m.user_id)))

  // ── names: user_profiles (QP-MEMBER-PROFILES; co-member read needs 0029) ──
  const nameById = new Map<string, string | null>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', userIds)
      .range(0, PAGE - 1)
    for (const p of ((profiles ?? []) as { id: string; full_name: string | null }[])) {
      nameById.set(p.id, p.full_name ?? null)
    }
  }

  // ── emails: service-role admin, church-scoped to THESE member ids (N-5) ──
  // Only owner/admin get teammate emails (O-2); editor/viewer see names only.
  const emailById = new Map<string, string>()
  if (isWriter(membership.role as TeamRole) && userIds.length > 0) {
    const admin = createServiceRoleClient()
    await Promise.all(userIds.map(async (uid) => {
      try {
        const { data } = await admin.auth.admin.getUserById(uid)
        const em = data?.user?.email
        if (em) emailById.set(uid, em)
      } catch {
        /* email unavailable — surface row without it (N-5 minimal surface) */
      }
    }))
  }

  const members: TeamMember[] = memberRows.map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role as TeamRole,
    default_location_id: m.default_location_id ?? null,
    name: nameById.get(m.user_id) ?? null,
    email: emailById.get(m.user_id) ?? null,
    isSelf: m.user_id === user.id,
  }))

  // ── invitations: status IN ('pending','expired'), paginated (QP-INVITES-OPEN) ──
  type InviteRow = { id: string; email: string; role: string; status: string; expires_at: string | null; created_at: string | null }
  const inviteRows: InviteRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: batch } = await supabase
      .from('church_invites')
      .select('id, email, role, status, expires_at, created_at')
      .eq('church_id', churchId)
      .in('status', ['pending', 'expired'])
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    const rows = (batch ?? []) as InviteRow[]
    inviteRows.push(...rows)
    if (rows.length < PAGE) break
  }
  const invites: TeamInvite[] = inviteRows.map(r => ({
    id: r.id, email: r.email, role: r.role as TeamRole, status: r.status,
    expires_at: r.expires_at, created_at: r.created_at,
  }))

  // ── campuses (active) for the default-campus picker ──────────────────────
  const { data: locRows } = await supabase
    .from('church_locations')
    .select('id, name, is_active, sort_order')
    .eq('church_id', churchId)
    .order('sort_order', { ascending: true })
    .range(0, PAGE - 1)
  const campuses: TeamCampus[] = ((locRows ?? []) as TeamCampus[])

  return {
    churchId,
    churchName,
    myRole: membership.role as TeamRole,
    selfUserId: user.id,
    members,
    invites,
    campuses,
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
  }
}

// ── helper: load a target membership scoped to the caller's church ──────────
async function loadTarget(membershipId: string, churchId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('church_memberships')
    .select('id, church_id, user_id, role, is_active')
    .eq('id', membershipId)
    .eq('church_id', churchId)
    .single()
  return data as { id: string; church_id: string; user_id: string; role: TeamRole; is_active: boolean } | null
}

async function activeOwnerCount(churchId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('church_memberships')
    .select('id')
    .eq('church_id', churchId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .range(0, PAGE - 1)
  return (data ?? []).length
}

// ── WRITE: change a member's role (QP-MEMBER-ROLE-UPDATE) ────────────────────
export async function setMemberRoleAction(
  membershipId: string,
  nextRole: TeamRole,
): Promise<{ error?: string }> {
  const caller = await resolveCaller()
  if ('error' in caller) return { error: caller.error }
  if (!isWriter(caller.role)) return { error: 'Not allowed.' }

  const target = await loadTarget(membershipId, caller.churchId)
  if (!target) return { error: 'Member not found.' }

  // admin cannot touch an owner row, nor assign owner (N-9)
  if (caller.role === 'admin' && (target.role === 'owner' || nextRole === 'owner')) {
    return { error: 'Only an owner can manage owners.' }
  }
  // last-owner guard
  if (target.role === 'owner' && nextRole !== 'owner' && (await activeOwnerCount(caller.churchId)) <= 1) {
    return { error: 'The church must keep at least one owner.' }
  }
  // self-demote into lockout guard (caller is sole owner demoting self)
  if (target.user_id === caller.userId && caller.role === 'owner' && nextRole !== 'owner' && (await activeOwnerCount(caller.churchId)) <= 1) {
    return { error: 'You are the last owner — promote someone first.' }
  }

  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('church_memberships')
    .update({ role: nextRole })
    .eq('id', membershipId)
    .eq('church_id', caller.churchId)
  if (error) return { error: 'Could not update role.' }
  revalidatePath('/settings/team')
  return {}
}

// ── WRITE: set a member's default campus (QP-MEMBER-CAMPUS-UPDATE) ───────────
export async function setMemberDefaultCampusAction(
  membershipId: string,
  locationId: string | null,
): Promise<{ error?: string }> {
  const caller = await resolveCaller()
  if ('error' in caller) return { error: caller.error }
  if (!isWriter(caller.role)) return { error: 'Not allowed.' }

  const target = await loadTarget(membershipId, caller.churchId)
  if (!target) return { error: 'Member not found.' }
  if (caller.role === 'admin' && target.role === 'owner') {
    return { error: 'Only an owner can manage owners.' }
  }
  // validate location belongs to this church (or null)
  if (locationId) {
    const supabase = await createClient()
    const { data: loc } = await supabase
      .from('church_locations')
      .select('id')
      .eq('id', locationId)
      .eq('church_id', caller.churchId)
      .single()
    if (!loc) return { error: 'Unknown campus.' }
  }

  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('church_memberships')
    .update({ default_location_id: locationId })
    .eq('id', membershipId)
    .eq('church_id', caller.churchId)
  if (error) return { error: 'Could not set default campus.' }
  revalidatePath('/settings/team')
  return {}
}

// ── WRITE: deactivate a member, soft + global session revoke (N-6) ───────────
export async function deactivateMemberAction(
  membershipId: string,
): Promise<{ error?: string }> {
  const caller = await resolveCaller()
  if ('error' in caller) return { error: caller.error }
  if (!isWriter(caller.role)) return { error: 'Not allowed.' }

  const target = await loadTarget(membershipId, caller.churchId)
  if (!target) return { error: 'Member not found.' }

  if (target.user_id === caller.userId) return { error: 'You can’t remove yourself.' }
  if (caller.role === 'admin' && target.role === 'owner') {
    return { error: 'Only an owner can remove an owner.' }
  }
  if (target.role === 'owner' && (await activeOwnerCount(caller.churchId)) <= 1) {
    return { error: 'Cannot remove the last owner.' }
  }

  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('church_memberships')
    .update({ is_active: false })
    .eq('id', membershipId)
    .eq('church_id', caller.churchId)
  if (error) return { error: 'Could not remove member.' }
  try { await admin.auth.admin.signOut(target.user_id, 'global') } catch { /* best-effort revoke */ }
  revalidatePath('/settings/team')
  return {}
}

// ── role options a caller may assign (mirrors onboarding/invite) ─────────────
function allowedInviteRoles(callerRole: TeamRole): TeamRole[] {
  if (callerRole === 'owner') return ['admin', 'editor', 'viewer']
  if (callerRole === 'admin') return ['editor', 'viewer']
  return []
}

// ── WRITE: create an invite (status='pending'+expires_at+token) + email (N-3,N-4) ──
export async function sendInviteAction(
  emailRaw: string,
  role: TeamRole,
): Promise<{ error?: string; sent?: boolean; emailSent?: boolean }> {
  const caller = await resolveCaller()
  if ('error' in caller) return { error: caller.error }
  if (!isWriter(caller.role)) return { error: 'Not allowed.' }
  if (!allowedInviteRoles(caller.role).includes(role)) {
    return { error: 'You can’t assign that role.' }
  }

  const email = emailRaw.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email.' }

  const supabase = await createClient()

  // ── duplicate guard (E-45): already an active member or a pending invite ──
  const admin = createServiceRoleClient()
  // existing pending invite for this church + email?
  const { data: existingInvite } = await supabase
    .from('church_invites')
    .select('id')
    .eq('church_id', caller.churchId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()
  if (existingInvite) return { error: 'There’s already a pending invite for that email.' }

  // existing active member with that email (resolve via service-role)?
  // listUsers() is PAGINATED (default ~50/page) — page through all users so the
  // duplicate-email match is correct for churches with many users (N-2).
  try {
    const AUTH_PAGE = 1000
    let match: { id: string; email?: string } | undefined
    for (let page = 1; ; page++) {
      const { data: byEmail } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE })
      const users = (byEmail?.users ?? []) as { id: string; email?: string }[]
      match = users.find((u) => u.email?.toLowerCase() === email)
      if (match || users.length < AUTH_PAGE) break
    }
    if (match) {
      const { data: existingMember } = await supabase
        .from('church_memberships')
        .select('id')
        .eq('church_id', caller.churchId)
        .eq('user_id', match.id)
        .eq('is_active', true)
        .maybeSingle()
      if (existingMember) return { error: 'That person is already a member.' }
    }
  } catch { /* listUsers unavailable — proceed; duplicate insert still guarded by status */ }

  const token = newInviteToken() // D-009
  const expiresAt = inviteExpiry()

  const { error: insertError } = await admin
    .from('church_invites')
    .insert({
      church_id: caller.churchId,
      email,
      role,
      token,
      status: 'pending',
      expires_at: expiresAt,
      invited_by: caller.userId,
    })
  if (insertError) return { error: 'Could not create the invite.' }

  const emailSent = await sendInviteEmail({ email, role, token, churchId: caller.churchId, inviterUserId: caller.userId })
  revalidatePath('/settings/team')
  return { sent: true, emailSent }
}

// ── WRITE: resend / refresh an invite (QP-INVITE-RESEND) ────────────────────
export async function resendInviteAction(
  inviteId: string,
): Promise<{ error?: string; emailSent?: boolean }> {
  const caller = await resolveCaller()
  if ('error' in caller) return { error: caller.error }
  if (!isWriter(caller.role)) return { error: 'Not allowed.' }

  const supabase = await createClient()
  const { data: invite } = await supabase
    .from('church_invites')
    .select('id, email, role, church_id, status')
    .eq('id', inviteId)
    .eq('church_id', caller.churchId)
    .single()
  if (!invite) return { error: 'Invite not found.' }
  if (!['pending', 'expired'].includes(invite.status)) return { error: 'That invite is no longer open.' }
  if (caller.role === 'admin' && invite.role === 'owner') return { error: 'Only an owner can manage owner invites.' }

  const token = newInviteToken()
  const expiresAt = inviteExpiry()
  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('church_invites')
    .update({ token, expires_at: expiresAt, status: 'pending' })
    .eq('id', inviteId)
    .eq('church_id', caller.churchId)
  if (error) return { error: 'Could not resend the invite.' }

  const emailSent = await sendInviteEmail({ email: invite.email, role: invite.role as TeamRole, token, churchId: caller.churchId, inviterUserId: caller.userId })
  revalidatePath('/settings/team')
  return { emailSent }
}

// ── WRITE: revoke an invite, soft via status='cancelled' (QP-INVITE-REVOKE) ──
export async function revokeInviteAction(
  inviteId: string,
): Promise<{ error?: string }> {
  const caller = await resolveCaller()
  if ('error' in caller) return { error: caller.error }
  if (!isWriter(caller.role)) return { error: 'Not allowed.' }

  const supabase = await createClient()
  const { data: invite } = await supabase
    .from('church_invites')
    .select('id, role, status')
    .eq('id', inviteId)
    .eq('church_id', caller.churchId)
    .single()
  if (!invite) return { error: 'Invite not found.' }
  if (caller.role === 'admin' && invite.role === 'owner') return { error: 'Only an owner can manage owner invites.' }

  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('church_invites')
    .update({ status: 'cancelled' })
    .eq('id', inviteId)
    .eq('church_id', caller.churchId)
  if (error) return { error: 'Could not revoke the invite.' }
  revalidatePath('/settings/team')
  return {}
}

// Invite delivery (N-3) is now the canonical shared helper sendInviteEmail()
// in @/lib/invites — both this Members screen and /onboarding/invite send
// through it so invitees get one identical branded Resend invite experience.
