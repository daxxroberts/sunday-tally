'use client'

// AUTH RESET — /auth/reset (set a new password from the recovery session)
// IRIS_AUTHRESET_ELEMENT_MAP.md: E-20…E-34 + terminal E-22 (success) / E-23 (expired)
// D-096 (account portal — password reset is a named MISSING piece)
// DESIGN_SYSTEM.md: brand #4F6EF7 (DS-1), NO RED (DS-2 — attention=amber, success=sage),
//   SVG-only show/hide icon (DS-14), focus-visible rings (DS-19), prefers-reduced-motion (DS-17).
// Public, tenant-agnostic, role-less. Pure Supabase Auth (auth.users) — no DB read/write.
//
// N-3 recovery-session handshake (option (a), client-only — FLAGGED: shared /auth/callback not built):
//   supabase-js auto-processes the recovery hash/code on mount and fires PASSWORD_RECOVERY.
//   We gate the form on a resolved recovery session; if none resolves within a short window
//   → render E-23 (expired), NEVER throw (N-3 / SUNDAY_SESSION discipline).

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthLayout from '@/components/layouts/AuthLayout'
import { createClient } from '@/lib/supabase/client'

type SessionState = 'checking' | 'ready' | 'expired' | 'done'

const MIN_LEN = 8 // E-32 — match Supabase default policy (O-2: confirm in dashboard)

function strengthOf(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length < MIN_LEN) return { score: 0, label: `At least ${MIN_LEN} characters` }
  let bonus = 0
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) bonus++
  if (/\d/.test(pw)) bonus++
  if (/[^A-Za-z0-9]/.test(pw)) bonus++
  if (pw.length >= 12) bonus++
  if (bonus <= 1) return { score: 1, label: 'Weak' }
  if (bonus === 2) return { score: 2, label: 'Good' }
  return { score: 3, label: 'Strong' }
}

export default function AuthResetPage() {
  const router = useRouter()
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null) // amber attention, NO RED
  const [isPending, startTransition] = useTransition()
  const resolvedRef = useRef(false)

  // N-3 — resolve recovery session.
  // Primary path: /auth/callback exchanged the PKCE `?code=` for a session server-side
  // (cookie now set), so getSession() resolves immediately on mount.
  // Fallback path: implicit-flow recovery hash still fires PASSWORD_RECOVERY in-page.
  // If the callback signalled a failed exchange (?error=recovery), go straight to E-23.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('error')) {
        setSessionState('expired')
        resolvedRef.current = true
        return
      }
    }

    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout>

    const markReady = () => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      clearTimeout(timer)
      setSessionState('ready')
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) markReady()
    })

    // Primary: session already established by /auth/callback (or event already fired).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady()
    })

    // E-23 — if nothing resolves shortly, treat the link as expired. Never throw (N-3).
    timer = setTimeout(() => {
      if (!resolvedRef.current) setSessionState('expired')
    }, 4000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  const strength = strengthOf(password)
  const lengthOk = password.length >= MIN_LEN
  const match = password.length > 0 && password === confirm
  const canSubmit = sessionState === 'ready' && lengthOk && match && !isPending

  // E-33 — set new password under the recovery session.
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) {
        // E-34 — friendly, amber. Map known cases; generic fallback otherwise. NO RED.
        const msg = err.message?.toLowerCase() ?? ''
        if (msg.includes('different from the old') || msg.includes('same'))
          setError('Choose a password that’s different from your current one.')
        else if (msg.includes('weak') || msg.includes('characters') || msg.includes('length'))
          setError(`That password is too weak. Use at least ${MIN_LEN} characters.`)
        else if (msg.includes('session') || msg.includes('expired') || err.status === 401)
          setSessionState('expired')
        else
          setError('We couldn’t update your password just now. Please try again.')
        return
      }
      // E-22 — success. Sign out the transient recovery session, then redirect to login.
      setSessionState('done')
      await supabase.auth.signOut()
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      setTimeout(() => router.push('/auth/login?reset=1'), reduce ? 0 : 2200)
    })
  }, [canSubmit, password, router])

  // E-23 — expired/invalid-link terminal state. Replaces the form.
  if (sessionState === 'expired') {
    return (
      <AuthLayout>
        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-4 py-3">
          <p className="text-sm font-semibold text-[#B45309]">Link expired</p>
          <p className="mt-1 text-sm text-slate-600">
            This reset link has expired or was already used. Request a new one to continue.
          </p>
        </div>
        <Link
          href="/auth/forgot"
          className="mt-5 block w-full rounded-xl bg-[#4F6EF7] py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#3D5BD4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus-visible:ring-offset-2"
        >
          Request a new link
        </Link>
        <p className="mt-4 text-center text-xs text-slate-400">
          <Link href="/auth/login" className="text-[#3D5BD4] hover:text-[#4F6EF7] font-medium">
            ← Back to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  // E-22 — success terminal state (sage), auto-redirecting.
  if (sessionState === 'done') {
    return (
      <AuthLayout>
        <div className="rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/5 px-4 py-3">
          <p className="text-sm font-semibold text-[#15803D]">Password updated</p>
          <p className="mt-1 text-sm text-slate-600">
            Sign in with your new password. Taking you there now…
          </p>
        </div>
        <Link
          href="/auth/login?reset=1"
          className="mt-5 block w-full rounded-xl bg-[#4F6EF7] py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#3D5BD4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus-visible:ring-offset-2"
        >
          Go to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      {/* E-20 — Header (hidden in expired/done states above) */}
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-wide uppercase text-[#3D5BD4]">Reset password</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Set a new password</h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose a strong password you don&apos;t use anywhere else.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* E-30 — New password + show/hide toggle (SVG only, DS-14) */}
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1.5">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isPending || sessionState !== 'ready'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus:border-transparent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              title={show ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] rounded-r-xl"
            >
              {show ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>

          {/* E-32 — strength: plain text + thin meter, shape-not-color-only (DS-18). NO RED. */}
          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      strength.score > i
                        ? strength.score >= 3
                          ? 'bg-[#22C55E]'
                          : 'bg-[#F59E0B]'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <p
                className={`mt-1 text-xs ${
                  !lengthOk
                    ? 'text-[#B45309]'
                    : strength.score >= 3
                      ? 'text-[#15803D]'
                      : 'text-[#B45309]'
                }`}
              >
                {!lengthOk ? `At least ${MIN_LEN} characters` : `Strength: ${strength.label}`}
              </p>
            </div>
          )}
        </div>

        {/* E-31 — Confirm password; mismatch → amber inline note */}
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            disabled={isPending || sessionState !== 'ready'}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus:border-transparent disabled:opacity-50"
          />
          {confirm.length > 0 && !match && (
            <p className="mt-1 text-xs text-[#B45309]">Passwords don&apos;t match yet.</p>
          )}
        </div>

        {/* E-34 — attention text (amber, NO RED) */}
        {error && (
          <p className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-sm text-[#B45309]">
            {error}
          </p>
        )}

        {/* E-33 — Update password */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-[#4F6EF7] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus-visible:ring-offset-2"
        >
          {isPending
            ? 'Updating…'
            : sessionState === 'checking'
              ? 'Verifying link…'
              : 'Update password'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        <Link
          href="/auth/login"
          className="text-[#3D5BD4] hover:text-[#4F6EF7] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus-visible:ring-offset-2 rounded"
        >
          ← Back to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
