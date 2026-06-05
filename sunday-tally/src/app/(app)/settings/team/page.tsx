'use client'

// ─────────────────────────────────────────────────────────────────────────
// MEMBERS & INVITATIONS — /(app)/settings/team (CANONICAL team surface, D-096).
// IRIS_MEMBERS_ELEMENT_MAP.md · DESIGN_SYSTEM DS-1..DS-25.
//
// This route is the single source of truth for who has access (active members)
// and who's been invited (pending/expired). It replaces the old T9 invite form
// (broken auth.users join, red pills) AND absorbs the Team zone formerly in
// settings/locations (role/default-campus/deactivate). Locations now keeps
// Campuses only and links here.
//
// Zones: A header (E-1..3) · B Members (E-10..22) · C Invitations (E-30..38)
//        · D Invite form (E-40..45, owner/admin only).
// Reuses entries/ui primitives (Ico, Dot, membershipRoleLabel). No red (DS-2);
// plain "· Role" labels (DS-8); status circles (DS-6/E-50); optimistic + revert
// (E-51); all writes owner/admin-gated in UI AND re-asserted server-side (N-7).
// DB-level enforcement of role-restricted writes depends on migration 0029 (N-1).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { Ico, Dot, membershipRoleLabel } from '@/app/(app)/entries/ui'
import {
  getTeamData,
  setMemberRoleAction,
  setMemberDefaultCampusAction,
  deactivateMemberAction,
  sendInviteAction,
  resendInviteAction,
  revokeInviteAction,
  type TeamData,
  type TeamMember,
  type TeamInvite,
  type TeamRole,
} from './actions'
import type { UserRole } from '@/types'

const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: 'Full access — manages everything.',
  admin: 'Enters data, views reports, invites Editors and Viewers.',
  editor: 'Enters Sunday data only — no reports.',
  viewer: 'Views reports only. Signs in with a magic link, no password.',
}

const ROLE_OPTIONS: TeamRole[] = ['owner', 'admin', 'editor', 'viewer']

function isWriter(role: TeamRole) {
  return role === 'owner' || role === 'admin'
}

function inviteRoleOptions(callerRole: TeamRole): TeamRole[] {
  if (callerRole === 'owner') return ['admin', 'editor', 'viewer']
  if (callerRole === 'admin') return ['editor', 'viewer']
  return []
}

// relative expiry hint (E-35) — quiet, no red
function expiryHint(expiresAt: string | null): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  const days = Math.round(Math.abs(ms) / 86400_000)
  if (ms >= 0) {
    if (days === 0) return 'expires today'
    return `expires in ${days} day${days === 1 ? '' : 's'}`
  }
  if (days === 0) return 'expired today'
  return `expired ${days} day${days === 1 ? '' : 's'} ago`
}

// derived invite state (E-34): pending&fresh → needs (orange) · else → empty (gray)
function inviteStatus(inv: TeamInvite): { dot: 'needs' | 'empty'; label: string } {
  const expired = inv.status === 'expired' || (inv.expires_at != null && new Date(inv.expires_at) < new Date())
  return expired ? { dot: 'empty', label: 'Expired' } : { dot: 'needs', label: 'Pending' }
}

export default function MembersPage() {
  const router = useRouter()

  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)        // row id in flight
  const [notice, setNotice] = useState<string | null>(null)    // quiet inline message
  const [resentId, setResentId] = useState<string | null>(null) // "Sent ✓" cooldown

  // invite form state (Zone D)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamRole>('editor')
  const [sending, setSending] = useState(false)

  const reload = useCallback(async () => {
    const next = await getTeamData()
    setData(next)
    if (next) {
      const opts = inviteRoleOptions(next.myRole)
      setInviteRole(prev => (opts.includes(prev) ? prev : (opts[0] ?? 'editor')))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = await getTeamData()
      if (cancelled) return
      setData(next)
      if (next) {
        const opts = inviteRoleOptions(next.myRole)
        setInviteRole(opts[0] ?? 'editor')
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const myRole: TeamRole = data?.myRole ?? 'viewer'
  const write = isWriter(myRole)
  const members = data?.members ?? []
  const invites = data?.invites ?? []
  const activeCampuses = useMemo(
    () => (data?.campuses ?? []).filter(c => c.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [data],
  )
  const ownerCount = members.filter(m => m.role === 'owner').length
  const pendingCount = invites.filter(i => inviteStatus(i).dot === 'needs').length

  // ── optimistic member patch + revert-on-error (E-51) ──────────────────────
  const patchMember = useCallback((id: string, patch: Partial<TeamMember>) => {
    setData(d => d ? { ...d, members: d.members.map(m => m.id === id ? { ...m, ...patch } : m) } : d)
  }, [])

  const onSetRole = useCallback(async (m: TeamMember, nextRole: TeamRole) => {
    if (nextRole === m.role) return
    setNotice(null)
    setBusy(m.id)
    const prevRole = m.role
    patchMember(m.id, { role: nextRole })
    const res = await setMemberRoleAction(m.id, nextRole)
    setBusy(null)
    if (res.error) { patchMember(m.id, { role: prevRole }); setNotice(res.error) }
  }, [patchMember])

  const onSetCampus = useCallback(async (m: TeamMember, locId: string | null) => {
    setNotice(null)
    setBusy(m.id)
    const prev = m.default_location_id
    patchMember(m.id, { default_location_id: locId })
    const res = await setMemberDefaultCampusAction(m.id, locId)
    setBusy(null)
    if (res.error) { patchMember(m.id, { default_location_id: prev }); setNotice(res.error) }
  }, [patchMember])

  const onDeactivate = useCallback(async (m: TeamMember) => {
    const label = m.name ?? m.email ?? 'this member'
    if (!confirm(`Remove ${label}? They’ll lose access immediately.`)) return
    setNotice(null)
    setBusy(m.id)
    const snapshot = members
    setData(d => d ? { ...d, members: d.members.filter(x => x.id !== m.id) } : d)
    const res = await deactivateMemberAction(m.id)
    setBusy(null)
    if (res.error) { setData(d => d ? { ...d, members: snapshot } : d); setNotice(res.error) }
  }, [members])

  // ── invitations ───────────────────────────────────────────────────────────
  const onResend = useCallback(async (inv: TeamInvite) => {
    setNotice(null)
    setBusy(inv.id)
    const res = await resendInviteAction(inv.id)
    setBusy(null)
    if (res.error) { setNotice(res.error); return }
    if (res.emailSent === false) setNotice('Invite refreshed, but email isn’t configured yet.')
    setResentId(inv.id)
    setTimeout(() => setResentId(prev => (prev === inv.id ? null : prev)), 2500)
    reload()
  }, [reload])

  const onRevoke = useCallback(async (inv: TeamInvite) => {
    if (!confirm(`Revoke the invite for ${inv.email}?`)) return
    setNotice(null)
    setBusy(inv.id)
    const snapshot = invites
    setData(d => d ? { ...d, invites: d.invites.filter(x => x.id !== inv.id) } : d)
    const res = await revokeInviteAction(inv.id)
    setBusy(null)
    if (res.error) { setData(d => d ? { ...d, invites: snapshot } : d); setNotice(res.error) }
  }, [invites])

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail.trim())

  const onSendInvite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailValid || sending) return
    setNotice(null)
    setSending(true)
    const res = await sendInviteAction(inviteEmail, inviteRole)
    setSending(false)
    if (res.error) { setNotice(res.error); return }
    setInviteEmail('')
    if (res.emailSent === false) setNotice('Invite created. Add a Resend key to email it automatically.')
    else setNotice(`Invite sent.`)
    reload()
  }, [emailValid, sending, inviteEmail, inviteRole, reload])

  const fieldRing = 'outline-none transition focus-visible:border-[#4F6EF7] focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/25'

  return (
    <AppLayout role={myRole as UserRole}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="min-h-full bg-slate-50" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* ── Zone A — header (E-1..3) ────────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
            <button onClick={() => router.push('/settings')} aria-label="Back to Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
              <Ico.left className="h-5 w-5" />
            </button>
            <div>
              {data?.churchName && <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>{data.churchName}</div>}
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Members &amp; Invitations</h1>
              {!loading && (
                <p className="mt-0.5 text-[12px] text-slate-500">
                  <span className="font-num">{members.length}</span> member{members.length === 1 ? '' : 's'}
                  {pendingCount > 0 && <> · <span className="font-num">{pendingCount}</span> pending</>}
                </p>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          {/* quiet inline notice (E-51 / DS-2 — never red) */}
          {notice && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600 shadow-sm">{notice}</div>
          )}

          {loading ? (
            <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : !data ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-[13px] text-slate-400 shadow-sm">No team to show.</div>
          ) : (
            <>
              {/* ── Zone B — Members (E-10..22) ─────────────────────────────── */}
              <div className="mb-2 flex items-center justify-between px-1 pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Members</span>
                <Ico.users className="h-4 w-4 text-slate-300" />
              </div>
              <div className="mb-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* E-22 single-member state */}
                {members.length <= 1 && (
                  <div className="px-4 pt-3 text-[12px] text-slate-400">Just you for now.</div>
                )}
                {members.map(m => {
                  const isLastOwner = m.role === 'owner' && ownerCount <= 1
                  const adminBlocked = myRole === 'admin' && m.role === 'owner' // admin can't touch owner rows
                  const displayName = m.name ?? (m.isSelf ? 'You' : `Member · ${m.user_id.slice(0, 4)}`)
                  const rowBusy = busy === m.id
                  const canEditThisRole = write && !adminBlocked && !isLastOwner
                  const canEditCampus = write && !adminBlocked
                  const canRemove = write && !adminBlocked && !m.isSelf && !isLastOwner
                  return (
                    <div key={m.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-opacity ${rowBusy ? 'opacity-60' : ''}`}>
                      {/* E-12 name · E-13 email · E-21 You badge */}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold text-slate-800">{displayName}</span>
                          {m.isSelf && (
                            <span className="rounded-md border border-[#4F6EF7]/30 bg-[#4F6EF7]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3D5BD4]">You</span>
                          )}
                          {/* E-14 read-only role meta for non-writers */}
                          {!canEditThisRole && <span className="text-[12px] font-medium text-slate-400">· {membershipRoleLabel(m.role)}</span>}
                        </span>
                        {m.email && <span className="truncate text-[12px] text-slate-500">{m.email}</span>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* E-15 default-campus picker */}
                        {canEditCampus ? (
                          <select
                            value={m.default_location_id ?? ''}
                            disabled={rowBusy || activeCampuses.length === 0}
                            onChange={(e) => onSetCampus(m, e.target.value || null)}
                            aria-label={`Default campus for ${displayName}`}
                            className={`rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${fieldRing}`}
                          >
                            <option value="">First active campus</option>
                            {activeCampuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        ) : null}

                        {/* E-14 role picker */}
                        {canEditThisRole ? (
                          <select
                            value={m.role}
                            disabled={rowBusy}
                            onChange={(e) => onSetRole(m, e.target.value as TeamRole)}
                            aria-label={`Role for ${displayName}`}
                            className={`rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${fieldRing}`}
                          >
                            {ROLE_OPTIONS
                              // admin select omits owner (N-9)
                              .filter(r => !(myRole === 'admin' && r === 'owner'))
                              .map(r => <option key={r} value={r}>{membershipRoleLabel(r)}</option>)}
                          </select>
                        ) : null}

                        {/* E-16 remove (soft deactivate) */}
                        {canRemove && (
                          <button onClick={() => onDeactivate(m)} disabled={rowBusy}
                            className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── Zone C — Invitations (E-30..38) ─────────────────────────── */}
              <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Invitations</p>
              <div className="mb-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* E-38 empty state */}
                {invites.length === 0 && (
                  <div className="px-4 py-6 text-center text-[13px] text-slate-400">No open invitations.</div>
                )}
                {invites.map(inv => {
                  const st = inviteStatus(inv)
                  const rowBusy = busy === inv.id
                  return (
                    <div key={inv.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-opacity ${rowBusy ? 'opacity-60' : ''}`}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        {/* E-34 status circle (E-50) */}
                        <Dot s={st.dot} />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            {/* E-32 email · E-33 role meta */}
                            <span className="truncate text-[14px] font-medium text-slate-800">{inv.email}</span>
                            <span className="text-[12px] font-medium text-slate-400">· {membershipRoleLabel(inv.role)}</span>
                          </span>
                          {/* E-34 label + E-35 expires-in hint */}
                          <span className="text-[11px] text-slate-400">{st.label}{inv.expires_at ? ` · ${expiryHint(inv.expires_at)}` : ''}</span>
                        </div>
                      </div>

                      {/* E-36 resend · E-37 revoke (owner/admin) */}
                      {write && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => onResend(inv)} disabled={rowBusy}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#3D5BD4] transition-colors duration-200 hover:bg-[#4F6EF7]/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                            {resentId === inv.id ? <><Ico.check className="h-3.5 w-3.5 text-[#22C55E]" />Sent</> : 'Resend'}
                          </button>
                          <button onClick={() => onRevoke(inv)} disabled={rowBusy}
                            className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                            Revoke
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Zone D — Invite a member (E-40..45; owner/admin only) ───── */}
              {write && (
                <>
                  <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Invite a member</p>
                  <form onSubmit={onSendInvite} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    {/* E-41 email */}
                    <label htmlFor="invite-email" className="mb-1 block text-[12px] font-medium text-slate-600">Email</label>
                    <input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@church.org"
                      className={`mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-300 ${fieldRing}`}
                    />

                    {/* E-42 role radios + E-43 helper */}
                    <span className="mb-1 block text-[12px] font-medium text-slate-600">Role</span>
                    <div className="mb-4 space-y-2">
                      {inviteRoleOptions(myRole).map(r => {
                        const selected = inviteRole === r
                        return (
                          <label key={r}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-200 ${selected ? 'border-[#4F6EF7] bg-[#4F6EF7]/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <input type="radio" name="invite-role" value={r} checked={selected} onChange={() => setInviteRole(r)}
                              className="mt-0.5 accent-[#4F6EF7]" />
                            <span className="min-w-0">
                              <span className="text-[14px] font-semibold text-slate-800">{membershipRoleLabel(r)}</span>
                              <span className="mt-0.5 block text-[12px] text-slate-500">{ROLE_DESCRIPTIONS[r]}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>

                    {/* E-44 send */}
                    <button type="submit" disabled={!emailValid || sending}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-sm transition-opacity duration-200 hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                      style={{ background: '#4F6EF7' }}>
                      <Ico.plus className="h-4 w-4" />{sending ? 'Sending…' : 'Send invite'}
                    </button>

                    {/* E-45 duplicate-guard / config note surfaces via top notice */}
                    {!data.emailConfigured && (
                      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                        Email delivery isn’t configured yet — invites are created and can be resent once a sending domain is added.
                      </p>
                    )}
                  </form>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </AppLayout>
  )
}
