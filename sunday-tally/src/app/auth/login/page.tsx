'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import AuthLayout from '@/components/layouts/AuthLayout'
import { signInWithPasswordAction, sendMagicLinkAction } from './actions'
import { createClient } from '@/lib/supabase/client'

type Mode = 'password' | 'magic'

export default function AuthLoginPage() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resetDone, setResetDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reset') === '1') setResetDone(true)
  }, [])

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
    const next = new URLSearchParams(window.location.search).get('next') ?? undefined
    startTransition(async () => {
      const result = await signInWithPasswordAction(email.trim().toLowerCase(), password, next)
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

  const handleGoogleSignIn = async () => {
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in with Google. Please try again.')
    }
  }

  return (
    <AuthLayout>
      <div className="relative">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">Sign in</h1>
          <p className="mt-2 text-stone-500 text-sm font-medium">Track what matters. See what&apos;s growing.</p>
        </div>

        {/* Password updated success alert */}
        {resetDone && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"
          >
            <p className="text-sm font-semibold text-emerald-800">
              Password updated — sign in with your new password.
            </p>
          </motion.div>
        )}

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isPending}
          className="w-full flex items-center justify-center py-2.5 px-4 border border-stone-200 rounded-xl bg-white hover:bg-stone-50 transition-colors text-sm font-bold text-stone-700 shadow-sm cursor-pointer mb-6"
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.98 1 12 1 7.24 1 3.2 3.73 1.24 7.72l3.85 2.99C6.01 7.26 8.78 5.04 12 5.04z" />
            <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.48c-.29 1.48-1.14 2.73-2.4 3.58l3.7 2.87c2.16-1.99 3.41-4.92 3.41-8.61z" />
            <path fill="#FBBC05" d="M5.09 14.71c-.24-.72-.37-1.49-.37-2.29s.13-1.57.37-2.29L1.24 7.14C.45 8.74 0 10.52 0 12.42s.45 3.68 1.24 5.28l3.85-2.99z" />
            <path fill="#34A853" d="M12 23.82c3.24 0 5.97-1.07 7.96-2.92l-3.7-2.87c-1.03.69-2.35 1.1-4.26 1.1-3.22 0-5.99-2.22-6.91-5.67l-3.85 2.99c1.96 3.99 6 6.72 10 6.72z" />
          </svg>
          Continue with Google
        </button>

        {/* Separator */}
        <div className="relative flex py-2 items-center mb-6">
          <div className="flex-grow border-t border-stone-200"></div>
          <span className="flex-shrink mx-4 text-stone-400 text-xs font-bold uppercase tracking-wider">or sign in with email</span>
          <div className="flex-grow border-t border-stone-200"></div>
        </div>

        {/* Tab toggle (Password vs. Magic Link) */}
        <div className="relative flex border border-stone-200 rounded-xl p-1 mb-6 bg-stone-50/50">
          <button
            type="button"
            onClick={() => { setMode('password'); setError(null); setMagicSent(false) }}
            className={`flex-1 text-xs py-2 rounded-lg transition-all font-extrabold relative z-10 cursor-pointer ${
              mode === 'password' ? 'text-white' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Password
            {mode === 'password' && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-[#4F6EF7] rounded-lg -z-10 shadow"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => { setMode('magic'); setError(null) }}
            className={`flex-1 text-xs py-2 rounded-lg transition-all font-extrabold relative z-10 cursor-pointer ${
              mode === 'magic' ? 'text-white' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Magic Link
            {mode === 'magic' && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-[#4F6EF7] rounded-lg -z-10 shadow"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        </div>

        {/* Email Field (Shared) */}
        <div className="mb-4">
          <label htmlFor="email" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="pastor@gracechurch.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={isPending}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7] focus:border-transparent disabled:opacity-50 text-sm transition-all shadow-inner"
          />
        </div>

        <motion.div
          layout
          className="overflow-hidden"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <AnimatePresence mode="wait">
            {mode === 'password' ? (
              <motion.form
                key="password-form"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18 }}
                onSubmit={handlePasswordSubmit}
                className="space-y-4"
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor="password" className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                      Password
                    </label>
                    <Link
                      href="/auth/forgot"
                      className="text-xs font-bold text-[#4F6EF7] hover:text-[#3D5BD4] transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={isPending}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7] focus:border-transparent disabled:opacity-50 text-sm transition-all shadow-inner"
                  />
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    className="text-sm font-semibold text-[#B45309] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-3"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  type="submit"
                  disabled={!email || !password || isPending}
                  className="w-full bg-[#4F6EF7] text-white rounded-xl py-3.5 font-bold text-sm hover:bg-[#3D5BD4] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(79,110,247,0.15)] cursor-pointer"
                >
                  {isPending ? 'Signing in...' : 'Sign in'}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setMode('magic'); setError(null) }}
                    className="text-xs text-stone-400 hover:text-stone-600 transition-colors py-1 cursor-pointer"
                  >
                    Sign in with a link instead
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.form
                key="magic-form"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleMagicSubmit}
                className="space-y-4"
              >
                {magicSent ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-[#4F6EF7]/5 border border-[#4F6EF7]/20 rounded-xl px-4 py-4"
                  >
                    <p className="text-sm text-[#3D5BD4] font-bold">Check your email</p>
                    <p className="text-xs text-[#3D5BD4]/80 mt-1 leading-relaxed">
                      We sent a secure link to <strong className="font-semibold text-[#3D5BD4]">{email}</strong>. Click it to sign in.
                    </p>
                    <button
                      type="submit"
                      disabled={resendCooldown > 0 || isPending}
                      className="mt-4 text-xs text-[#3D5BD4] hover:text-[#4F6EF7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend link'}
                    </button>
                  </motion.div>
                ) : (
                  <>
                    {error && (
                      <motion.p
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        role="alert"
                        className="text-sm font-semibold text-[#B45309] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-3"
                      >
                        {error}
                      </motion.p>
                    )}
                    <button
                      type="submit"
                      disabled={!email || isPending}
                      className="w-full bg-[#4F6EF7] text-white rounded-xl py-3.5 font-bold text-sm hover:bg-[#3D5BD4] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(79,110,247,0.15)] cursor-pointer"
                    >
                      {isPending ? 'Sending...' : 'Send me a magic link'}
                    </button>
                  </>
                )}
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Register a church — prominent divider section */}
        <div className="mt-8 pt-6 border-t border-stone-100">
          <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-5">
            <p className="text-sm font-bold text-stone-800 mb-0.5">New to Sunday Tally?</p>
            <p className="text-xs text-stone-500 mb-4">Set up your church in minutes — free to try.</p>
            <Link
              href="/signup"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-[#4F6EF7] rounded-xl text-sm font-bold text-[#4F6EF7] hover:bg-[#4F6EF7] hover:text-white transition-all cursor-pointer"
            >
              Register your church →
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
