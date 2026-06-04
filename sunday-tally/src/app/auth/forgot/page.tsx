'use client'

// AUTH RESET — /auth/forgot (request a password-reset email)
// IRIS_AUTHRESET_ELEMENT_MAP.md: E-1…E-14
// D-096 (account portal — password reset is a named MISSING piece)
// DESIGN_SYSTEM.md: brand #4F6EF7 (DS-1), NO RED (DS-2 — attention=amber, success=sage),
//   focus-visible rings (DS-19), Fira Sans body (DS-4).
// Public, tenant-agnostic, role-less. Pure Supabase Auth (auth.users) — no DB read/write.
// Enumeration-safe (N-6/S5): generic confirmation regardless of account existence.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import AuthLayout from '@/components/layouts/AuthLayout'
import { createClient } from '@/lib/supabase/client'

export default function AuthForgotPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState<string | null>(null) // amber attention, transport only
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Reuse login's resend-cooldown pattern (E-12)
  function startResendCooldown() {
    setResendCooldown(60)
    const interval = setInterval(() => {
      setResendCooldown(v => {
        if (v <= 1) { clearInterval(interval); return 0 }
        return v - 1
      })
    }, 1000)
  }

  // E-11 — request reset. Enumeration-safe: treat "no such user" as success (S5).
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPending || resendCooldown > 0) return
    setError(null)
    const normalized = email.trim().toLowerCase()
    startTransition(async () => {
      const supabase = createClient()
      // Route the recovery link through /auth/callback so the PKCE `?code=` is
      // exchanged for a session server-side before /auth/reset renders (N-3 / B5).
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset`
      const { error: err } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo })
      // Only surface transport/network failures (E-13) — never account-existence signals.
      if (err && err.status && err.status >= 500) {
        setError('We couldn’t send that just now. Check your connection and try again.')
        return
      }
      setSentTo(normalized)
      setSent(true)
      startResendCooldown()
    })
  }

  return (
    <AuthLayout>
      {/* E-1 — Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-wide uppercase text-[#3D5BD4]">Reset password</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Forgot your password?</h1>
        {/* E-2 — Subtext */}
        <p className="mt-1 text-sm text-slate-600">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      {sent ? (
        // E-12 — Sent confirmation (in-place), sage info panel (NOT red). Enumeration-safe copy.
        <div className="rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/5 px-4 py-3">
          <p className="text-sm font-semibold text-[#15803D]">Check your email</p>
          <p className="mt-1 text-sm text-slate-600">
            If an account exists for <span className="font-medium text-slate-900">{sentTo}</span>,
            a reset link is on its way. The link expires shortly, so use it soon.
          </p>
          <form onSubmit={handleSubmit} className="mt-3">
            <button
              type="submit"
              disabled={resendCooldown > 0 || isPending}
              className="text-sm font-medium text-[#3D5BD4] hover:text-[#4F6EF7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus-visible:ring-offset-2 rounded"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : isPending ? 'Sending…' : 'Resend link'}
            </button>
          </form>
        </div>
      ) : (
        // E-10 / E-11 — Request form
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus:border-transparent disabled:opacity-50"
            />
          </div>

          {/* E-13 — Attention text (amber, NO RED). Transport failures only. */}
          {error && (
            <p className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-sm text-[#B45309]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!email || isPending}
            className="w-full rounded-xl bg-[#4F6EF7] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] focus-visible:ring-offset-2"
          >
            {isPending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      {/* E-14 — Back to sign in (low-key, DS-15) */}
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
