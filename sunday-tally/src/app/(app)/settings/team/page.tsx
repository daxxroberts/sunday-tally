'use client'

// ─────────────────────────────────────────────────────────────────────────
// MEMBERS & INVITATIONS — /(app)/settings/team (CANONICAL team surface, D-096).
//
// Redesign (R7): one "Invite a member" button opens an invite popup; each member
// is edited in a "Manage" panel with a single Save (no auto-save — changes stage
// in the panel, then run on Save). ONE campus control per member: "Can access"
// (All campuses, or a multi-select of specific campuses) — this is the 0042
// RLS boundary. Role governs see-vs-edit; a roles legend explains each role.
// All writes owner/admin-gated in UI AND re-asserted server-side (N-7).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { Ico, Dot, membershipRoleLabel } from '@/app/(app)/entries/ui'
import {
  getTeamData,
  setMemberRoleAction,
  setMemberCampusScopeAction,
  deactivateMemberAction,
  sendInviteAction,
  resendInviteAction,
  revokeInviteAction,
  type TeamMember,
  type TeamInvite,
  type TeamRole,
} from './actions'
import type { UserRole } from '@/types'

const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: 'Full access. Manages everything, including other owners and billing.',
  admin: 'Sets up the church and enters data. Invites Editors and Viewers. Can’t manage owners.',
  editor: 'Enters the week’s numbers. No setup, no member management.',
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
function expiryHint(expiresAt: string | null): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  const days = Math.round(Math.abs(ms) / 86400_000)
  if (ms >= 0) return days === 0 ? 'expires today' : `expires in ${days} day${days === 1 ? '' : 's'}`
  return days === 0 ? 'expired today' : `expired ${days} day${days === 1 ? '' : 's'} ago`
}
function inviteStatus(inv: TeamInvite): { dot: 'needs' | 'empty'; label: string } {
  const expired = inv.status === 'expired' || (inv.expires_at != null && new Date(inv.expires_at) < new Date())
  return expired ? { dot: 'empty', label: 'Expired' } : { dot: 'needs', label: 'Pending' }
}

type Campus = { id: string; name: string; is_active: boolean; sort_order: number }

export default function MembersPage() {
  const router = useRouter()

  const [data, setData] = useState<Awaited<ReturnType<typeof getTeamData>>>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resentId, setResentId] = useState<string | null>(null)
  const [manageId, setManageId] = useState<string | null>(null)   // member being managed
  const [inviteOpen, setInviteOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)

  const reload = useCallback(async () => { setData(await getTeamData()) }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = await getTeamData()
      if (!cancelled) { setData(next); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  const myRole: TeamRole = data?.myRole ?? 'viewer'
  const write = isWriter(myRole)
  const members = data?.members ?? []
  const invites = data?.invites ?? []
  const activeCampuses = useMemo<Campus[]>(
    () => (data?.campuses ?? []).filter(c => c.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [data],
  )
  const ownerCount = members.filter(m => m.role === 'owner').length
  const pendingCount = invites.filter(i => inviteStatus(i).dot === 'needs').length
  const managed = members.find(m => m.id === manageId) ?? null

  // Save a member's staged changes (role + campus access) in one go.
  const onSaveMember = useCallback(async (m: TeamMember, nextRole: TeamRole, scope: 'all' | 'restricted', ids: string[]) => {
    setNotice(null); setBusy(m.id)
    let err: string | undefined
    if (nextRole !== m.role) err = (await setMemberRoleAction(m.id, nextRole)).error
    if (!err && (scope !== m.location_scope || ids.slice().sort().join() !== m.location_ids.slice().sort().join())) {
      err = (await setMemberCampusScopeAction(m.id, scope, ids)).error
    }
    setBusy(null)
    if (err) { setNotice(err); return false }
    setManageId(null)
    await reload()
    return true
  }, [reload])

  const onDeactivate = useCallback(async (m: TeamMember) => {
    const label = m.name ?? m.email ?? 'this member'
    if (!confirm(`Remove ${label}? They’ll lose access immediately.`)) return
    setNotice(null); setBusy(m.id)
    const res = await deactivateMemberAction(m.id)
    setBusy(null)
    if (res.error) { setNotice(res.error); return }
    setManageId(null)
    await reload()
  }, [reload])

  const onResend = useCallback(async (inv: TeamInvite) => {
    setNotice(null); setBusy(inv.id)
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
    setNotice(null); setBusy(inv.id)
    const res = await revokeInviteAction(inv.id)
    setBusy(null)
    if (res.error) { setNotice(res.error); return }
    reload()
  }, [reload])

  return (
    <AppLayout role={myRole as UserRole}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="min-h-full bg-slate-50" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
            <button onClick={() => router.push('/settings')} aria-label="Back to Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
              <Ico.left className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              {data?.churchName && <div className="truncate text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>{data.churchName}</div>}
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
          {notice && (
            <div className="mb-4 rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-[13px] text-[#B45309] shadow-sm">{notice}</div>
          )}

          {loading ? (
            <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : !data ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-[13px] text-slate-400 shadow-sm">No team to show.</div>
          ) : (
            <>
              {/* One invite button — opens the invite popup. */}
              {write && (
                <button onClick={() => setInviteOpen(true)}
                  className="mb-5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#4F6EF7]/40 bg-[#4F6EF7]/5 px-4 py-3 text-[14px] font-semibold text-[#3D5BD4] transition-colors hover:bg-[#4F6EF7]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                  <Ico.plus className="h-4 w-4" /> Invite a member
                </button>
              )}

              {/* ── Members ──────────────────────────────────────────────── */}
              <div className="mb-2 flex items-center justify-between px-1 pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Members</span>
                <button
                  onClick={() => setLegendOpen(o => !o)}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4M12 8h.01" /></svg> What do roles mean?
                </button>
              </div>
              {legendOpen && (
                <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <dl className="space-y-1.5">
                    {ROLE_OPTIONS.map(r => (
                      <div key={r} className="flex gap-2 text-[12px]">
                        <dt className="w-14 shrink-0 font-semibold text-slate-700">{membershipRoleLabel(r)}</dt>
                        <dd className="text-slate-500">{ROLE_DESCRIPTIONS[r]}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="mb-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {members.map(m => {
                  const isLastOwner = m.role === 'owner' && ownerCount <= 1
                  const adminBlocked = myRole === 'admin' && m.role === 'owner'
                  const displayName = m.name ?? (m.isSelf ? 'You' : `Member · ${m.user_id.slice(0, 4)}`)
                  const campusLabel = activeCampuses.length < 2 ? null
                    : m.location_scope === 'all' ? 'All campuses'
                    : m.location_ids.length === 1 ? (activeCampuses.find(c => c.id === m.location_ids[0])?.name ?? '1 campus')
                    : `${m.location_ids.length} campuses`
                  const canManage = write && !adminBlocked
                  return (
                    <div key={m.id} className={`flex items-center justify-between gap-3 px-4 py-3 transition-opacity ${busy === m.id ? 'opacity-60' : ''}`}>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold text-slate-800">{displayName}</span>
                          {m.isSelf && <span className="rounded-md border border-[#4F6EF7]/30 bg-[#4F6EF7]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3D5BD4]">You</span>}
                        </span>
                        {m.email && <span className="truncate text-[12px] text-slate-500">{m.email}</span>}
                        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400">
                          <span className="font-medium text-slate-500">{membershipRoleLabel(m.role)}</span>
                          {campusLabel && <><span aria-hidden>·</span><Ico.pin className="h-3 w-3 text-[#4F6EF7]" />{campusLabel}</>}
                        </span>
                      </div>
                      {canManage ? (
                        <button onClick={() => setManageId(m.id)} disabled={busy === m.id}
                          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-[#4F6EF7]/40 hover:text-[#3D5BD4] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                          Manage
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/* ── Invitations ──────────────────────────────────────────── */}
              <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Invitations</p>
              <div className="mb-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {invites.length === 0 && (
                  <div className="px-4 py-6 text-center text-[13px] text-slate-400">No open invitations.</div>
                )}
                {invites.map(inv => {
                  const st = inviteStatus(inv)
                  const rowBusy = busy === inv.id
                  return (
                    <div key={inv.id} className={`flex items-center justify-between gap-3 px-4 py-3 transition-opacity ${rowBusy ? 'opacity-60' : ''}`}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Dot s={st.dot} />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-medium text-slate-800">{inv.email}</span>
                            <span className="text-[12px] font-medium text-slate-400">· {membershipRoleLabel(inv.role)}</span>
                          </span>
                          <span className="text-[11px] text-slate-400">{st.label}{inv.expires_at ? ` · ${expiryHint(inv.expires_at)}` : ''}</span>
                        </div>
                      </div>
                      {write && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button onClick={() => onResend(inv)} disabled={rowBusy}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#3D5BD4] transition-colors hover:bg-[#4F6EF7]/10 disabled:opacity-40">
                            {resentId === inv.id ? <><Ico.check className="h-3.5 w-3.5 text-[#22C55E]" />Sent</> : 'Resend'}
                          </button>
                          <button onClick={() => onRevoke(inv)} disabled={rowBusy}
                            className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40">
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {!data.emailConfigured && write && (
                <p className="px-1 text-[11px] leading-relaxed text-slate-400">
                  Email delivery isn’t set up yet. Invites are created and can be resent once a sending domain is added.
                </p>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Manage member panel ─────────────────────────────────────────── */}
      {managed && (
        <ManageMemberModal
          member={managed}
          campuses={activeCampuses}
          myRole={myRole}
          isLastOwner={managed.role === 'owner' && ownerCount <= 1}
          busy={busy === managed.id}
          onSave={(role, scope, ids) => onSaveMember(managed, role, scope, ids)}
          onRemove={() => onDeactivate(managed)}
          onClose={() => setManageId(null)}
        />
      )}

      {/* ── Invite popup ────────────────────────────────────────────────── */}
      {inviteOpen && write && data && (
        <InviteModal
          campuses={activeCampuses}
          roleOptions={inviteRoleOptions(myRole)}
          emailConfigured={data.emailConfigured}
          onClose={() => setInviteOpen(false)}
          onSent={(msg) => { setInviteOpen(false); setNotice(msg); reload() }}
        />
      )}
    </AppLayout>
  )
}

// ── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── Role radios (with descriptions) ──────────────────────────────────────────
function RoleRadios({ name, value, options, onChange }: {
  name: string; value: TeamRole; options: TeamRole[]; onChange: (r: TeamRole) => void
}) {
  return (
    <div className="space-y-2">
      {options.map(r => {
        const on = value === r
        return (
          <label key={r} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${on ? 'border-[#4F6EF7] bg-[#4F6EF7]/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name={name} value={r} checked={on} onChange={() => onChange(r)} className="mt-0.5 accent-[#4F6EF7]" />
            <span className="min-w-0">
              <span className="text-[14px] font-semibold text-slate-800">{membershipRoleLabel(r)}</span>
              <span className="mt-0.5 block text-[12px] text-slate-500">{ROLE_DESCRIPTIONS[r]}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

// ── Campus access — ONE control: All campuses, or pick specific (multi-select) ─
function CampusAccessField({ scope, ids, campuses, onChange }: {
  scope: 'all' | 'restricted'; ids: string[]; campuses: Campus[]
  onChange: (scope: 'all' | 'restricted', ids: string[]) => void
}) {
  if (campuses.length < 2) return null
  return (
    <div>
      <p className="mb-1 text-[12px] font-semibold text-slate-700">Can access</p>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-400">Which campuses this member can see and work in. Everything else stays hidden.</p>
      <div className="space-y-2">
        <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-[14px] transition-colors ${scope === 'all' ? 'border-[#4F6EF7] bg-[#4F6EF7]/5 text-[#3D5BD4]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
          <input type="radio" name="campus-scope" checked={scope === 'all'} onChange={() => onChange('all', [])} className="accent-[#4F6EF7]" />
          <span className="font-medium">All campuses</span>
        </label>
        <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-[14px] transition-colors ${scope === 'restricted' ? 'border-[#4F6EF7] bg-[#4F6EF7]/5 text-[#3D5BD4]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
          <input type="radio" name="campus-scope" checked={scope === 'restricted'} onChange={() => onChange('restricted', ids)} className="accent-[#4F6EF7]" />
          <span className="font-medium">Specific campuses</span>
        </label>
        {scope === 'restricted' && (
          <div className="ml-1 space-y-1 border-l-2 border-slate-100 pl-3">
            {campuses.map(c => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={ids.includes(c.id)}
                  onChange={() => onChange('restricted', ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id])}
                  className="rounded accent-[#4F6EF7]"
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Manage member modal — staged role + campus + remove, one Save ────────────
function ManageMemberModal({ member, campuses, myRole, isLastOwner, busy, onSave, onRemove, onClose }: {
  member: TeamMember
  campuses: Campus[]
  myRole: TeamRole
  isLastOwner: boolean
  busy: boolean
  onSave: (role: TeamRole, scope: 'all' | 'restricted', ids: string[]) => Promise<boolean>
  onRemove: () => void
  onClose: () => void
}) {
  const [role, setRole] = useState<TeamRole>(member.role)
  const [scope, setScope] = useState<'all' | 'restricted'>(member.location_scope)
  const [ids, setIds] = useState<string[]>(member.location_ids)

  // admin can't assign owner; the last owner can't be demoted (kept out of options)
  const roleOptions = ROLE_OPTIONS.filter(r => {
    if (myRole === 'admin' && r === 'owner') return false
    if (isLastOwner && member.role === 'owner' && r !== 'owner') return false
    return true
  })

  const dirty = role !== member.role || scope !== member.location_scope
    || ids.slice().sort().join() !== member.location_ids.slice().sort().join()
  const canRemove = !member.isSelf && !isLastOwner

  return (
    <Modal title={member.name ?? member.email ?? 'Manage member'} onClose={onClose}>
      {member.email && <p className="-mt-1 mb-4 text-[12px] text-slate-500">{member.email}</p>}

      <p className="mb-1 text-[12px] font-semibold text-slate-700">Role</p>
      {isLastOwner && member.role === 'owner' && (
        <p className="mb-2 text-[11px] text-slate-400">This is the church’s only owner. Add another owner before changing this.</p>
      )}
      <RoleRadios name="manage-role" value={role} options={roleOptions} onChange={setRole} />

      <div className="mt-4">
        <CampusAccessField scope={scope} ids={ids} campuses={campuses} onChange={(s, i) => { setScope(s); setIds(i) }} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
        {canRemove ? (
          <button onClick={onRemove} disabled={busy}
            className="rounded-lg px-2.5 py-2 text-[13px] font-medium text-[#B45309] transition-colors hover:bg-[#F59E0B]/10 disabled:opacity-40">
            Remove
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-800">Cancel</button>
          <button
            onClick={() => onSave(role, scope, scope === 'restricted' ? ids : [])}
            disabled={busy || !dirty || (scope === 'restricted' && ids.length === 0)}
            className="rounded-lg bg-[#4F6EF7] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Invite modal — email + role + campus access ──────────────────────────────
function InviteModal({ campuses, roleOptions, emailConfigured, onClose, onSent }: {
  campuses: Campus[]
  roleOptions: TeamRole[]
  emailConfigured: boolean
  onClose: () => void
  onSent: (msg: string) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TeamRole>(roleOptions[0] ?? 'editor')
  const [scope, setScope] = useState<'all' | 'restricted'>('all')
  const [ids, setIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const blocked = scope === 'restricted' && ids.length === 0

  async function send() {
    if (!emailValid || sending || blocked) return
    setSending(true); setErr(null)
    const res = await sendInviteAction(email, role, scope, scope === 'restricted' ? ids : [])
    setSending(false)
    if (res.error) { setErr(res.error); return }
    onSent(res.emailSent === false ? 'Invite created. Add a sending domain to email it automatically.' : 'Invite sent.')
  }

  return (
    <Modal title="Invite a member" onClose={onClose}>
      <label htmlFor="invite-email" className="mb-1 block text-[12px] font-semibold text-slate-700">Email</label>
      <input id="invite-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@church.org" autoFocus
        className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-300 outline-none transition focus-visible:border-[#4F6EF7] focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/25" />

      <p className="mb-1 text-[12px] font-semibold text-slate-700">Role</p>
      <RoleRadios name="invite-role" value={role} options={roleOptions} onChange={setRole} />

      <div className="mt-4">
        <CampusAccessField scope={scope} ids={ids} campuses={campuses} onChange={(s, i) => { setScope(s); setIds(i) }} />
      </div>

      {err && <p className="mt-3 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-[12px] font-medium text-[#B45309]">{err}</p>}
      {!emailConfigured && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Email delivery isn’t set up yet. The invite is created and can be resent later.</p>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button onClick={onClose} disabled={sending} className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-800">Cancel</button>
        <button onClick={send} disabled={!emailValid || sending || blocked}
          className="flex items-center gap-1.5 rounded-lg bg-[#4F6EF7] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40">
          <Ico.plus className="h-4 w-4" />{sending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </Modal>
  )
}
