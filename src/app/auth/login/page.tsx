'use client'

// AUTH screen — /auth/login
// IRIS_AUTH_ELEMENT_MAP.md: E1-E8 all implemented
// D-015: magic link for viewers. D-048: viewer re-auth self-serve.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import AuthLayout from '@/components/layouts/AuthLayout'
import { signInWithPasswordAction, sendMagicLinkAction } from './actions'

type Mode = 'password' | 'magic'

export default function AuthLoginPage() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isPending, startTransition] = useTransition()

  function startResendCooldown() {
    setResendCooldown(60)
    const interval = setInterval(() => {
      setResendCooldown(v => {
        if (v <= 1) { clearInterval(interval); return 0 }
        return v - 1
      })
    }, 1000)
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const result = await signInWithPasswordAction(email.trim().toLowerCase(), password)
      if (result?.error) setError(result.error)
    })
  }

  function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPending || resendCooldown > 0) return
    setError(null)
    startTransition(async () => {
      const result = await sendMagicLinkAction(email.trim().toLowerCase())
      if (result.error) { setError(result.error); return }
      setMagicSent(true)
      startResendCooldown()
    })
  }

  return (
    <AuthLayout>
      {/* E1 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Sign in</h1>
        <p className="mt-1 text-gray-500 text-sm">Track what matters. See what&apos;s growing.</p>
      </div>

      {/* Tab toggle — password vs magic link */}
      <div className="flex border border-gray-200 rounded-xl p-0.5 mb-6 bg-gray-50">
        <button
          type="button"
          onClick={() => { setMode('password'); setError(null); setMagicSent(false) }}
          className={`flex-1 text-sm py-1.5 rounded-lg transition-all font-medium ${
            mode === 'password' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => { setMode('magic'); setError(null) }}
          className={`flex-1 text-sm py-1.5 rounded-lg transition-all font-medium ${
            mode === 'magic' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Email link
        </button>
      </div>

      {/* E2 — Email field (shared) */}
      <div className="mb-4">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={isPending}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm"
        />
      </div>

      {/* Password path — E3 + E5 */}
      {mode === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isPending}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!email || !password || isPending}
            className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Signing in...' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={() => { setMode('magic'); setError(null) }}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            Sign in with a link instead
          </button>
        </form>
      )}

      {/* Magic link path — E4 */}
      {mode === 'magic' && (
        <form onSubmit={handleMagicSubmit} className="space-y-4">
          {magicSent ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <p className="text-sm text-blue-800 font-semibold">Check your email</p>
              <p className="text-xs text-blue-600 mt-1">
                We sent a link to {email}. Click it to sign in.
              </p>
              <button
                type="submit"
                disabled={resendCooldown > 0 || isPending}
                className="mt-3 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend link'}
              </button>
            </div>
          ) : (
            <>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!email || isPending}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? 'Sending...' : 'Send me a link'}
              </button>
            </>
          )}
        </form>
      )}

      {/* E8 — Viewer re-auth note */}
      <p className="mt-6 text-xs text-gray-400 text-center">
        Looking for your dashboard link? Enter your email above and we&apos;ll send you a new one.
      </p>

      {/* New church */}
      <p className="mt-3 text-center text-xs text-gray-400">
        New church?{' '}
        <Link href="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
          Set up your account →
        </Link>
      </p>
    </AuthLayout>
  )
}
