import 'server-only'

// ─────────────────────────────────────────────────────────────────────────
// CANONICAL INVITE MECHANISM (D-009 / N60 / EMAIL_POLICY §2 row #3)
//
// ONE invite path for the whole product. The locked decision (CLAUDE.md) is:
//   "Invite token: crypto.randomBytes(32).toString('hex') — not Supabase built-in."
// So an invite is ALWAYS: a 32-byte token → a `church_invites` row (status
// 'pending' + expires_at) → a branded Resend `invite` email carrying the
// /auth/invite/[token] link. The viewer-vs-editor distinction is resolved at
// ACCEPTANCE (auth/invite/[token]/actions.ts), NOT at send time — so a single
// send path is correct for every role.
//
// Both the canonical Members screen (/settings/team) and the onboarding invite
// step (/onboarding/invite) go through here. Do NOT reintroduce Supabase
// admin.auth.admin.inviteUserByEmail / generateLink for invites.
//
// This module does NOT change the church_invites row shape or the acceptance
// flow. It is the send half only.
// ─────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/resend'

export type InviteRole = 'owner' | 'admin' | 'editor' | 'viewer'

export const INVITE_TTL_DAYS = 14 // O-3

/** Fresh 32-byte invite token (D-009). */
export function newInviteToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** Expiry timestamp INVITE_TTL_DAYS out from now, ISO. */
export function inviteExpiry(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString()
}

/** Build the canonical /auth/invite/[token] acceptance URL. */
export function inviteUrlFor(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundaytally.church'
  return `${appUrl}/auth/invite/${token}`
}

// ── invite delivery (N-3 / EMAIL_POLICY §2 #3): branded Resend invite ───────
// Returns true if an email was actually sent. Resend not configured → false
// (the caller surfaces "email not configured"); we do NOT fail the invite row.
export async function sendInviteEmail(params: {
  email: string
  role: InviteRole
  token: string
  churchId: string
  inviterUserId?: string | null
}): Promise<boolean> {
  const { email, role, token, churchId, inviterUserId } = params
  if (!process.env.RESEND_API_KEY) return false

  const inviteUrl = inviteUrlFor(token)

  const supabase = await createClient()
  const { data: ch } = await supabase.from('churches').select('name').eq('id', churchId).single()
  const churchName = (ch as { name?: string } | null)?.name ?? 'your church'

  // inviter display name (best-effort)
  let inviterName = 'A team member'
  if (inviterUserId) {
    const { data: prof } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', inviterUserId)
      .single()
    if ((prof as { full_name?: string } | null)?.full_name) {
      inviterName = (prof as { full_name: string }).full_name
    }
  }

  try {
    const res = await sendEmail(email, 'invite', { inviteUrl, inviterName, role, churchName, inviteExpiryDays: INVITE_TTL_DAYS })
    return !res.error
  } catch {
    return false
  }
}

// ── create + send: token → church_invites row → invite email ────────────────
// The single canonical "make an invite" entry point for callers that do NOT
// have their own row-insert/dedup logic (e.g. /onboarding/invite). The Members
// screen keeps its own insert because it is interleaved with duplicate-guard
// checks, but uses sendInviteEmail() above for the delivery half.
//
// Does NOT enforce role permissions or duplicate guards — the caller owns that.
// Returns the created token + whether the email actually went out.
export async function createAndSendInvite(params: {
  churchId: string
  email: string
  role: InviteRole
  invitedBy?: string | null
}): Promise<{ error?: string; token?: string; emailSent?: boolean }> {
  const { churchId, email, role, invitedBy } = params

  const token = newInviteToken()
  const expiresAt = inviteExpiry()

  // Service-role insert: the invitee has no session yet, and the onboarding
  // caller may not satisfy RLS on church_invites for an arbitrary email row.
  const admin = createServiceRoleClient()
  const { error: insertError } = await admin
    .from('church_invites')
    .insert({
      church_id: churchId,
      email,
      role,
      token,
      status: 'pending',
      expires_at: expiresAt,
      invited_by: invitedBy ?? null,
    })
  if (insertError) return { error: 'Could not create the invite.' }

  const emailSent = await sendInviteEmail({
    email,
    role,
    token,
    churchId,
    inviterUserId: invitedBy ?? null,
  })

  return { token, emailSent }
}
