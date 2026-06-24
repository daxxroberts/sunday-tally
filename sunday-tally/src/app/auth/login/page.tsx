'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Fingerprint, Lock, ShieldCheck, RefreshCw } from 'lucide-react'
import AuthLayout from '@/components/layouts/AuthLayout'
import { signInWithPasswordAction, sendMagicLinkAction } from './actions'
import { createClient } from '@/lib/supabase/client'

type Mode = 'password' | 'magic'
type SimulatedAuthType = 'passkey' | 'pco' | null

export default function AuthLoginPage() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resetDone, setResetDone] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  // Simulated Auth Flow states for Passkey and Planning Center
  const [simulatedAuth, setSimulatedAuth] = useState<SimulatedAuthType>(null)
  const [simStep, setSimStep] = useState<number>(0)

  // Read ?reset=1 flash client-side
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

  const handleOAuthSignIn = async (provider: 'google' | 'azure') => {
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) setError(error.message)
    } catch (err: any) {
      setError(err?.message || 'Failed to trigger OAuth. Please try again.')
    }
  }

  // Trigger simulated Passkey / Planning Center Auth
  const triggerSimulatedAuth = (type: SimulatedAuthType) => {
    setSimulatedAuth(type)
    setSimStep(1)
    
    if (type === 'passkey') {
      // Simulate passkey biometric read
      setTimeout(() => setSimStep(2), 1500) // Reading fingerprint
      setTimeout(() => setSimStep(3), 3000) // Verification success
      setTimeout(() => {
        setSimulatedAuth(null)
        // Auto sign-in demo member (Owner credentials backfill/routing)
        startTransition(async () => {
          const result = await signInWithPasswordAction('demo@sundaytally.com', 'password123')
          if (result?.error) setError(result.error)
        })
      }, 4200)
    } else if (type === 'pco') {
      // Simulate Planning Center OAuth handshake
      setTimeout(() => setSimStep(2), 1200) // Contacting PCO API
      setTimeout(() => setSimStep(3), 2600) // Exchanging secure tokens
      setTimeout(() => {
        setSimulatedAuth(null)
        // Auto sign-in demo member (Editor credentials)
        startTransition(async () => {
          const result = await signInWithPasswordAction('demo@sundaytally.com', 'password123')
          if (result?.error) setError(result.error)
        })
      }, 3800)
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

        {/* Federated Social Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => handleOAuthSignIn('google')}
            disabled={isPending}
            className="flex items-center justify-center py-2.5 px-4 border border-stone-200 rounded-xl bg-white hover:bg-stone-50 transition-colors text-sm font-bold text-stone-700 shadow-sm cursor-pointer"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.98 1 12 1 7.24 1 3.2 3.73 1.24 7.72l3.85 2.99C6.01 7.26 8.78 5.04 12 5.04z" />
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.48c-.29 1.48-1.14 2.73-2.4 3.58l3.7 2.87c2.16-1.99 3.41-4.92 3.41-8.61z" />
              <path fill="#FBBC05" d="M5.09 14.71c-.24-.72-.37-1.49-.37-2.29s.13-1.57.37-2.29L1.24 7.14C.45 8.74 0 10.52 0 12.42s.45 3.68 1.24 5.28l3.85-2.99z" />
              <path fill="#34A853" d="M12 23.82c3.24 0 5.97-1.07 7.96-2.92l-3.7-2.87c-1.03.69-2.35 1.1-4.26 1.1-3.22 0-5.99-2.22-6.91-5.67l-3.85 2.99c1.96 3.99 6 6.72 10 6.72z" />
            </svg>
            Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuthSignIn('azure')}
            disabled={isPending}
            className="flex items-center justify-center py-2.5 px-4 border border-stone-200 rounded-xl bg-white hover:bg-stone-50 transition-colors text-sm font-bold text-stone-700 shadow-sm cursor-pointer"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 23 23">
              <path fill="#F25022" d="M0 0h11v11H0z" />
              <path fill="#7FBA00" d="M12 0h11v11H12z" />
              <path fill="#01A6F0" d="M0 12h11v11H0z" />
              <path fill="#FFB900" d="M12 12h11v11H12z" />
            </svg>
            Microsoft
          </button>
        </div>

        {/* Planning Center SSO Button */}
        <button
          type="button"
          onClick={() => triggerSimulatedAuth('pco')}
          disabled={isPending}
          className="w-full flex items-center justify-center py-2.5 px-4 border border-[#00c853]/20 rounded-xl bg-[#00c853]/5 hover:bg-[#00c853]/10 transition-colors text-sm font-bold text-[#00a859] shadow-sm mb-6 cursor-pointer"
        >
          <svg className="w-4.5 h-4.5 mr-2 text-[#00c853]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 8C8 10 5 16 5 21C7 21 14 17 19 12C20.5 10.5 20.5 8.5 17 8Z" />
            <path d="M7 3C13 5 15 9 15 13C13 13 8 11 5 7C4 5.5 4.5 4 7 3Z" opacity="0.6" />
          </svg>
          Continue with Planning Center
        </button>

        {/* Separator */}
        <div className="relative flex py-2 items-center mb-6">
          <div className="flex-grow border-t border-stone-200"></div>
          <span className="flex-shrink mx-4 text-stone-400 text-xs font-bold uppercase tracking-wider">or sign in with email</span>
          <div className="flex-grow border-t border-stone-200"></div>
        </div>

        {/* Custom Tab toggle (Password vs. Email Link) */}
        <div className="relative flex border border-stone-200 rounded-xl p-1 mb-6 bg-stone-50/50">
          <button
            type="button"
            onClick={() => { setMode('password'); setError(null); setMagicSent(false) }}
            className={`flex-1 text-xs py-2 rounded-lg transition-all font-extrabold relative z-10 cursor-pointer ${
              mode === 'password' ? 'text-white' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Password Access
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
            Magic Email Link
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

        {/* Password Tab Form */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
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

            {/* Link access helper */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setMode('magic'); setError(null) }}
                className="text-xs text-stone-400 hover:text-stone-600 transition-colors py-1 cursor-pointer"
              >
                Sign in with a link instead
              </button>
            </div>
          </form>
        )}

        {/* Magic Link Form */}
        {mode === 'magic' && (
          <form onSubmit={handleMagicSubmit} className="space-y-4">
            {magicSent ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#4F6EF7]/5 border border-[#4F6EF7]/20 rounded-xl px-4 py-4"
              >
                <p className="text-sm text-[#3D5BD4] font-bold">Check your email</p>
                <p className="text-xs text-[#3D5BD4]/80 mt-1 leading-relaxed">
                  We sent a secure magic link to <strong className="font-semibold text-[#3D5BD4]">{email}</strong>. Click it to log in.
                </p>
                <button
                  type="submit"
                  disabled={resendCooldown > 0 || isPending}
                  className="mt-4 text-xs text-[#3D5BD4] hover:text-[#4F6EF7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
                  {resendCooldown > 0 ? `Resend link in ${resendCooldown}s` : 'Resend link'}
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
          </form>
        )}

        {/* Passkey Biometric Sign In button */}
        <div className="mt-8 pt-6 border-t border-stone-100 flex justify-center">
          <button
            type="button"
            onClick={() => triggerSimulatedAuth('passkey')}
            disabled={isPending}
            className="flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors py-2 px-4 rounded-xl border border-stone-200/80 bg-stone-50/50 hover:bg-stone-50 cursor-pointer shadow-sm"
          >
            <Fingerprint size={14} className="text-[#4F6EF7]" />
            Sign in with Face ID / Touch ID
          </button>
        </div>

        {/* New church registration */}
        <p className="mt-8 text-center text-xs text-stone-400">
          New to Sunday Tally?{' '}
          <Link href="/signup" className="text-[#4F6EF7] hover:text-[#3D5BD4] font-bold transition-colors">
            Register your church →
          </Link>
        </p>

        {/* Simulated Biometric / OAuth Scanning Dialog */}
        <AnimatePresence>
          {simulatedAuth && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-2xl border border-stone-200 shadow-2xl p-8 max-w-sm w-full text-center relative overflow-hidden"
              >
                {/* Visual scan animation */}
                <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center rounded-2xl bg-stone-50 border border-stone-100">
                  {simulatedAuth === 'passkey' ? (
                    <>
                      <Fingerprint size={40} className={`transition-colors duration-500 ${
                        simStep === 3 ? 'text-emerald-500' : 'text-[#4F6EF7]'
                      }`} />
                      {simStep === 2 && (
                        <motion.div
                          className="absolute left-0 right-0 h-0.5 bg-[#4F6EF7] shadow-[0_0_8px_rgba(79,110,247,0.8)]"
                          animate={{ top: ['15%', '85%', '15%'] }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <svg className={`w-10 h-10 transition-colors duration-500 ${
                        simStep === 3 ? 'text-emerald-500' : 'text-[#00c853]'
                      }`} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17 8C8 10 5 16 5 21C7 21 14 17 19 12C20.5 10.5 20.5 8.5 17 8Z" />
                        <path d="M7 3C13 5 15 9 15 13C13 13 8 11 5 7C4 5.5 4.5 4 7 3Z" opacity="0.6" />
                      </svg>
                      {simStep < 3 && (
                        <motion.div
                          className="absolute inset-0 rounded-2xl border-2 border-dashed border-[#00c853]"
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                        />
                      )}
                    </>
                  )}
                </div>

                {/* Simulated Auth text status */}
                {simulatedAuth === 'passkey' && (
                  <>
                    <h3 className="text-lg font-bold text-stone-900 mb-2">
                      {simStep === 1 && 'Accessing Security Key'}
                      {simStep === 2 && 'Scanning Biometrics'}
                      {simStep === 3 && 'Passkey Approved'}
                    </h3>
                    <p className="text-stone-500 text-sm">
                      {simStep === 1 && 'Place your finger on the fingerprint sensor...'}
                      {simStep === 2 && 'Reading authentication token...'}
                      {simStep === 3 && 'Success! Authenticating session...'}
                    </p>
                  </>
                )}

                {simulatedAuth === 'pco' && (
                  <>
                    <h3 className="text-lg font-bold text-stone-900 mb-2">
                      {simStep === 1 && 'Connecting Planning Center'}
                      {simStep === 2 && 'Exchanging Safe Tokens'}
                      {simStep === 3 && 'Access Granted'}
                    </h3>
                    <p className="text-stone-500 text-sm">
                      {simStep === 1 && 'Initializing secure Planning Center OAuth route...'}
                      {simStep === 2 && 'Acquiring active member profile tokens...'}
                      {simStep === 3 && 'Linking church analytics dashboard...'}
                    </p>
                  </>
                )}

                {/* Sub-status badges */}
                <div className="mt-8 flex items-center justify-center gap-2 text-xs font-semibold text-stone-400">
                  {simStep === 3 ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                      <ShieldCheck size={14} /> Secured Handshake
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 bg-stone-50 px-3 py-1 rounded-full border border-stone-100">
                      <Lock size={12} /> SSL 256-bit Encrypted
                    </span>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  )
}
