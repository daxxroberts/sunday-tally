'use client'

// T9_SETTINGS — /settings/team
// IRIS_T9_ELEMENT_MAP.md: E1-E8 — Settings context
// Shows current members (E2) + pending invites (E3) + invite form (E4)

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { getTeamData, sendInviteAction, removeMemberAction, cancelInviteAction } from '@/app/onboarding/invite/actions'
import type { UserRole } from '@/types'

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'Full access — can manage everything.',
  admin: 'Can enter data, view reports, invite Editors and Viewers.',
  editor: 'Can enter Sunday data only — no reports.',
  viewer: "Can view reports only. Gets a magic link — no password needed.",
}

const ROLE_OPTIONS_OWNER = ['admin', 'editor', 'viewer']
const ROLE_OPTIONS_ADMIN = ['editor', 'viewer']

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = { owner: 'bg-purple-100 text-purple-700', admin: 'bg-blue-100 text-blue-700', editor: 'bg-gray-100 text-gray-700', viewer: 'bg-green-100 text-green-700' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[role] ?? 'bg-gray-100 text-gray-600'}`}>{role}</span>
}

export default function SettingsTeamPage() {
  const [myRole, setMyRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState('')
  const [members, setMembers] = useState<{id: string; role: string; users: {email: string; raw_user_meta_data: {full_name?: string}}}[]>([])
  const [pending, setPending] = useState<{id: string; email: string; role: string}[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [lastSent, setLastSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function reload() {
    getTeamData().then(data => {
      if (!data) return
      setMyRole(data.myRole as UserRole)
      setChurchId(data.churchId)
      // @ts-expect-error join shape
      setMembers(data.members)
      setPending(data.pendingInvites)
      const opts = data.myRole === 'owner' ? ROLE_OPTIONS_OWNER : ROLE_OPTIONS_ADMIN
      setRole(opts[0])
    })
  }

  useEffect(() => { reload() }, [])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || isPending) return
    setError(null)
    startTransition(async () => {
      const result = await sendInviteAction(email.trim().toLowerCase(), role, churchId)
      if (result.error) { setError(result.error); return }
      setLastSent(email.trim().toLowerCase()); setEmail('')
      reload()
    })
  }

  function handleRemove(membershipId: string) {
    if (!confirm('Remove this person? They\'ll lose access immediately.')) return
    startTransition(async () => {
      const result = await removeMemberAction(membershipId)
      if (result.error) { alert(result.error); return }
      reload()
    })
  }

  function handleCancelInvite(inviteId: string) {
    startTransition(async () => { await cancelInviteAction(inviteId); reload() })
  }

  const roleOptions = myRole === 'owner' ? ROLE_OPTIONS_OWNER : ROLE_OPTIONS_ADMIN

  return (
    <AppLayout role={myRole}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Team</p>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* E2 — Current members */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Members</p>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {members.map((m: any) => (
              <div key={m.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.users?.raw_user_meta_data?.full_name ?? m.users?.email ?? 'Unknown'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <RoleBadge role={m.role} />
                    <span className="text-xs text-gray-400">{m.users?.email}</span>
                  </div>
                </div>
                {m.role !== 'owner' && (
                  <button onClick={() => handleRemove(m.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* E3 — Pending invites */}
        {pending.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Pending Invites</p>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {pending.map(inv => (
                <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-900">{inv.email}</p>
                    <RoleBadge role={inv.role} />
                    {inv.role === 'viewer' && <p className="text-xs text-gray-400 mt-1">Viewers can request a new link anytime from the login screen.</p>}
                  </div>
                  <button onClick={() => handleCancelInvite(inv.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Cancel</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* E4 — Invite form */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Invite Someone</p>
          {lastSent && <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">Invite sent to {lastSent}.</p>}
          <form onSubmit={handleSend} className="space-y-3">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@church.com" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <div className="space-y-2">
              {roleOptions.map(r => (
                <label key={r} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${role === r ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <input type="radio" name="settingsRole" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-gray-900 capitalize">{r}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[r]}</p>
                  </div>
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={!email.trim() || isPending} className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40">
              {isPending ? 'Sending...' : 'Send invite'}
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  )
}
