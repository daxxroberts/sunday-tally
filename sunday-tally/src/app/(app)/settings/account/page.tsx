'use client'

// ─────────────────────────────────────────────────────────────────────────
// ACCOUNT — /(app)/settings/account — IRIS_ACCOUNT_ELEMENT_MAP (E-1..E-51).
// Self-service profile + default campus + password. ROLE-AGNOSTIC (N-6):
// every member (owner/admin/editor/viewer) edits only their OWN account.
// All reads/writes are scoped to the caller's own ids via the user client
// (RLS-scoped) — no other-member data, single-row fetches (N-7).
//
// Design system (DS-1..DS-25): brand blue #4F6EF7, Fira Sans + Fira Code
// numerals, sage/amber status vocabulary, NO RED anywhere (DS-2) incl.
// password errors + strength, SVG icons only (DS-14), focus-visible brand
// rings (DS-19), reduced-motion (DS-17). Mirrors Entries/Settings language.
//
// RLS NOTES:
//  - user_profiles self read+write works under existing profiles_own_access
//    (own row only). We UPSERT on id=user.id, creating the row if signup
//    never populated it (audit B-finding: signup stuffs name into
//    user_metadata only) — N-2.
//  - church_memberships.default_location_id self-update (E-30): the Locations
//    page already performs this exact write for m.isSelf with the user client
//    and it succeeds, so no new policy is required (N-5/O-4 resolved by
//    precedent). E-30 surfaces an amber error if the write is ever blocked.
//  - Password change (E-40): reauth via signInWithPassword before
//    auth.updateUser({ password }) (N-3). OTP/magic-link-only accounts have
//    no password → "Set a password" branch (E-46), no reauth step.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { Ico, membershipRoleLabel } from '@/app/(app)/entries/ui'
import type { UserRole } from '@/types'

type Saved = 'idle' | 'saving' | 'saved' | 'error'

interface Campus {
  id: string
  name: string
}

const PAGE = 1000 // PostgREST cap

/* ── password strength (sage/amber only — NEVER red, DS-2/E-44) ──────────── */
type Strength = 'weak' | 'ok' | 'strong'
function scorePassword(pw: string): Strength {
  if (pw.length < 8) return 'weak'
  let score = 0
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score >= 3) return 'strong'
  if (score >= 1) return 'ok'
  return 'weak'
}

export default function AccountPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  // identity / context
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [churchName, setChurchName] = useState('')
  const [hasPassword, setHasPassword] = useState(true) // E-46: false → set-first-password

  // E-20 display name
  const [fullName, setFullName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [nameEditing, setNameEditing] = useState(false)
  const [nameSaved, setNameSaved] = useState<Saved>('idle')

  // E-30 default campus
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [defaultCampusId, setDefaultCampusId] = useState<string | null>(null)
  const [campusSaved, setCampusSaved] = useState<Saved>('idle')
  const [campusError, setCampusError] = useState<string | null>(null)

  // E-40 password group
  const [pwOpen, setPwOpen] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwState, setPwState] = useState<Saved>('idle')
  const [pwError, setPwError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }
      if (cancelled) return
      setUserId(user.id)
      setEmail(user.email ?? '')

      // E-46 detect OTP/magic-link-only accounts: no 'email' (password)
      // provider in identities → no password set, offer "Set a password".
      const providers = (user.identities ?? []).map(i => i.provider)
      const appProviders = (user.app_metadata?.providers as string[] | undefined) ?? []
      setHasPassword(providers.includes('email') || appProviders.includes('email'))

      // QP-ACCOUNT-CONTEXT — membership (self row)
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, default_location_id, churches(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (cancelled) return
      if (membership) {
        setRole(membership.role as UserRole)
        setDefaultCampusId((membership.default_location_id as string | null) ?? null)
        const ch = Array.isArray(membership.churches) ? membership.churches[0] : membership.churches
        setChurchName((ch as { name?: string } | null)?.name ?? '')

        // QP-ACCOUNT-CAMPUSES — active campuses by sort_order (picker options)
        const churchId = membership.church_id as string
        const { data: locRows } = await supabase
          .from('church_locations')
          .select('id, name')
          .eq('church_id', churchId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .range(0, PAGE - 1)
        if (!cancelled) setCampuses((locRows ?? []) as Campus[])
      }

      // QP-ACCOUNT-CONTEXT — user_profiles self row (may not exist yet)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      const name = (profile as { full_name?: string | null } | null)?.full_name ?? ''
      setFullName(name)
      setNameDraft(name)

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase])

  /* ── E-21 save display name — upsert self row (creates if missing, N-2) ─── */
  const saveName = useCallback(async () => {
    if (!userId) return
    const next = nameDraft.trim()
    if (next === fullName.trim()) { setNameEditing(false); setNameSaved('idle'); return }
    setNameSaved('saving')
    const { error } = await supabase
      .from('user_profiles')
      .upsert({ id: userId, full_name: next || null }, { onConflict: 'id' })
    if (error) {
      setNameSaved('error')
      return
    }
    setFullName(next)
    setNameSaved('saved')
    setNameEditing(false)
  }, [supabase, userId, nameDraft, fullName])

  /* ── E-30 set default campus — own membership row (user client, RLS) ────── */
  const onChangeCampus = useCallback(async (val: string) => {
    if (!userId) return
    const next = val || null
    const prev = defaultCampusId
    setDefaultCampusId(next)
    setCampusSaved('saving')
    setCampusError(null)
    const { error } = await supabase
      .from('church_memberships')
      .update({ default_location_id: next })
      .eq('user_id', userId)
      .eq('is_active', true)
    if (error) {
      setDefaultCampusId(prev)
      setCampusSaved('error')
      // amber, never red — graceful if a self-update policy is ever missing (N-5)
      setCampusError('Could not save your default campus. Please try again.')
      return
    }
    setCampusSaved('saved')
  }, [supabase, userId, defaultCampusId])

  /* ── E-45 change / set password ────────────────────────────────────────── */
  const savePassword = useCallback(async () => {
    setPwError(null)
    if (pwNew.length < 8) {
      setPwError('Use at least 8 characters.')
      return
    }
    if (pwNew !== pwConfirm) {
      setPwError("Passwords don't match.")
      return
    }
    setPwState('saving')

    // E-41 reauth (only for accounts that already have a password)
    if (hasPassword) {
      if (!pwCurrent) {
        setPwState('error')
        setPwError('Enter your current password.')
        return
      }
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email,
        password: pwCurrent,
      })
      if (reauthErr) {
        setPwState('error')
        setPwError('Current password is incorrect.')
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password: pwNew })
    if (error) {
      setPwState('error')
      setPwError(error.message || 'Could not update your password. Please try again.')
      return
    }
    setPwState('saved')
    setHasPassword(true)
    setPwCurrent(''); setPwNew(''); setPwConfirm('')
  }, [supabase, email, hasPassword, pwCurrent, pwNew, pwConfirm])

  const strength = pwNew ? scorePassword(pwNew) : null

  return (
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* ── Zone A — header (E-1/E-2) ─────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
            <button onClick={() => router.push('/settings/setup')} aria-label="Back to Setup"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
              <Ico.left className="h-5 w-5" />
            </button>
            <div>
              {churchName && <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>{churchName}</div>}
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Account</h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          {loading ? (
            <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : (
            <>
              {/* ── Zone B — Profile ──────────────────────────────────── */}
              <Section title="Profile">
                {/* E-10 email (read-only) */}
                <Row label="Email" help="Sign-in email — contact support to change.">
                  <span className="text-[14px] text-slate-500">{email || '—'}</span>
                </Row>

                {/* E-11 role + church (read-only, DS-8 "· role" meta) */}
                <Row label="Role">
                  <span className="text-[14px] text-slate-700">
                    {membershipRoleLabel(role)}
                    {churchName && <span className="text-slate-400"> · {churchName}</span>}
                  </span>
                </Row>

                {/* E-20/E-21 display name (editable, InlineEditField pattern) */}
                <Row label="Display name" help="Shown to your team.">
                  <div className="flex items-center justify-end gap-2.5">
                    <SaveStatus state={nameSaved} />
                    {nameEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => { setNameDraft(e.target.value); setNameSaved('idle') }}
                        onBlur={saveName}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') { setNameDraft(fullName); setNameEditing(false); setNameSaved('idle') }
                        }}
                        placeholder={email || 'Your name'}
                        aria-label="Display name"
                        className="h-9 w-56 rounded-lg border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-300 focus-visible:border-[#4F6EF7] focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/25"
                      />
                    ) : (
                      <button
                        onClick={() => { setNameDraft(fullName); setNameEditing(true); setNameSaved('idle') }}
                        className="group flex items-center gap-2 rounded-lg px-2 py-1 text-[14px] text-slate-900 transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                      >
                        <span className={fullName ? '' : 'text-slate-400'}>{fullName || email || 'Add your name'}</span>
                        <Ico.pencilFill className="h-3.5 w-3.5 text-slate-300 transition-colors duration-200 group-hover:text-[#4F6EF7]" />
                      </button>
                    )}
                  </div>
                </Row>
              </Section>

              {/* ── Zone C — Default campus (D-088) ───────────────────── */}
              <Section title="Default campus">
                {campuses.length === 0 ? (
                  // E-32 zero-campus
                  <Row label="Campus">
                    <div className="text-right">
                      <span className="text-[13px] text-slate-400">No campuses configured</span>
                      {(role === 'owner' || role === 'admin') && (
                        <button onClick={() => router.push('/settings/locations')}
                          className="ml-2 text-[13px] font-semibold text-[#3D5BD4] hover:underline">
                          Add one
                        </button>
                      )}
                    </div>
                  </Row>
                ) : campuses.length === 1 ? (
                  // E-32 single-campus → read-only name
                  <Row label="Campus" help="The campus Entries opens to by default.">
                    <span className="text-[14px] text-slate-700">{campuses[0].name}</span>
                  </Row>
                ) : (
                  // E-30 picker
                  <Row label="Campus" help="The campus Entries opens to by default. You can switch campuses anytime.">
                    <div className="flex items-center justify-end gap-2.5">
                      <SaveStatus state={campusSaved} />
                      <select
                        value={defaultCampusId ?? ''}
                        onChange={(e) => onChangeCampus(e.target.value)}
                        disabled={campusSaved === 'saving'}
                        aria-label="Default campus"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-700 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-50 focus-visible:border-[#4F6EF7] focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/25"
                      >
                        <option value="">First active campus</option>
                        {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </Row>
                )}
                {campusError && (
                  <div className="px-4 pb-3 text-[12px] font-medium text-[#B45309]">{campusError}</div>
                )}
              </Section>

              {/* ── Zone D — Password (E-40 group) ────────────────────── */}
              <Section title="Password">
                {!pwOpen ? (
                  <button
                    onClick={() => setPwOpen(true)}
                    className="group flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4F6EF7]/40"
                  >
                    <div>
                      <p className="text-[14px] font-semibold text-slate-800">{hasPassword ? 'Change password' : 'Set a password'}</p>
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        {hasPassword ? 'Update the password you use to sign in.' : 'Add a password so you can sign in without a magic link.'}
                      </p>
                    </div>
                    <Ico.right className="h-4 w-4 shrink-0 text-slate-300 transition-colors duration-200 group-hover:text-[#4F6EF7]" />
                  </button>
                ) : (
                  <div className="space-y-4 px-4 py-4">
                    {/* E-41 current password (skip for OTP-only / set-first) */}
                    {hasPassword && (
                      <PwField label="Current password" value={pwCurrent}
                        onChange={(v) => { setPwCurrent(v); setPwError(null); setPwState('idle') }}
                        autoComplete="current-password" />
                    )}

                    {/* E-42 new password + E-44 strength */}
                    <div>
                      <PwField label="New password" value={pwNew}
                        onChange={(v) => { setPwNew(v); setPwError(null); setPwState('idle') }}
                        autoComplete="new-password" />
                      {strength && <StrengthMeter strength={strength} />}
                    </div>

                    {/* E-43 confirm */}
                    <PwField label="Confirm new password" value={pwConfirm}
                      onChange={(v) => { setPwConfirm(v); setPwError(null); setPwState('idle') }}
                      autoComplete="new-password" />

                    {/* error (amber, never red) */}
                    {pwError && <p className="text-[13px] font-medium text-[#B45309]">{pwError}</p>}

                    {/* E-45 actions */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={savePassword}
                        disabled={pwState === 'saving' || !pwNew || !pwConfirm || (hasPassword && !pwCurrent)}
                        className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-opacity duration-200 hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                        style={{ background: '#4F6EF7' }}
                      >
                        {pwState === 'saving' ? 'Saving…' : hasPassword ? 'Update password' : 'Set password'}
                      </button>
                      <button
                        onClick={() => {
                          setPwOpen(false); setPwError(null); setPwState('idle')
                          setPwCurrent(''); setPwNew(''); setPwConfirm('')
                        }}
                        className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                      >
                        Cancel
                      </button>
                      {pwState === 'saved' && (
                        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#15803D]">
                          <Ico.check className="h-3.5 w-3.5" />Password updated
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </Section>

              <p className="mt-6 px-1 text-[12px] leading-relaxed text-slate-400">
                These settings apply only to your account. To manage your team or campuses, go to{' '}
                <button onClick={() => router.push('/settings/locations')} className="font-semibold text-[#3D5BD4] hover:underline">Locations &amp; Team</button>.
              </p>
            </>
          )}
        </main>
      </div>
    </AppLayout>
  )
}

/* ── section group (DS-5 rounded-2xl + divide) ───────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {children}
      </div>
    </div>
  )
}

/* ── label/value row ─────────────────────────────────────────────────────── */
function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-700">{label}</p>
        {help && <p className="mt-0.5 text-[11px] text-slate-400">{help}</p>}
      </div>
      <div className="ml-auto">{children}</div>
    </div>
  )
}

/* ── save status indicator (DS-11 vocabulary; left of value; never red) ──── */
function SaveStatus({ state }: { state: Saved }) {
  if (state === 'saving') return <span className="text-[11px] text-slate-400">Saving…</span>
  if (state === 'saved') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#15803D]"><Ico.check className="h-3 w-3" />Saved</span>
  )
  if (state === 'error') return <span className="text-[11px] font-medium text-[#B45309]">Couldn’t save — retry</span>
  return null
}

/* ── password input ──────────────────────────────────────────────────────── */
function PwField({ label, value, onChange, autoComplete }: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-slate-600">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-300 focus-visible:border-[#4F6EF7] focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/25"
      />
    </label>
  )
}

/* ── strength meter (E-44): sage/amber only, shape+text not color-only ────── */
function StrengthMeter({ strength }: { strength: Strength }) {
  const cfg = {
    weak:   { label: 'Too short — use 8+ characters', color: '#B45309', bars: 1 },
    ok:     { label: 'OK — add length or symbols to strengthen', color: '#B45309', bars: 2 },
    strong: { label: 'Strong password', color: '#15803D', bars: 3 },
  }[strength]
  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2].map(i => (
          <span key={i} className="h-1.5 w-8 rounded-full transition-colors duration-200"
            style={{ background: i < cfg.bars ? cfg.color : '#E2E8F0' }} />
        ))}
      </div>
      <span className="text-[12px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  )
}
