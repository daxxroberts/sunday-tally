'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import AuthLayout from '@/components/layouts/AuthLayout'
import { signupAction } from './actions'

export default function SignupPage() {
  const [churchName, setChurchName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isValid =
    churchName.trim().length > 0 &&
    ownerName.trim().length > 0 &&
    email.trim().includes('@') &&
    password.length >= 8

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || isPending) return
    setError(null)

    startTransition(async () => {
      const result = await signupAction({
        churchName: churchName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      if (result?.error) setError(result.error)
    })
  }

  const inputClass = "w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7] focus:border-transparent disabled:opacity-50 text-sm transition-all shadow-inner"
  const labelClass = "block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2"

  return (
    <AuthLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">Register</h1>
        <p className="mt-2 text-stone-500 text-sm font-medium">Get your team tracking in minutes.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Church name */}
        <div>
          <label htmlFor="churchName" className={labelClass}>
            Church name
          </label>
          <input
            id="churchName"
            type="text"
            autoComplete="organization"
            placeholder="Grace Community Church"
            value={churchName}
            onChange={e => setChurchName(e.target.value)}
            disabled={isPending}
            required
            className={inputClass}
          />
        </div>

        {/* Owner name */}
        <div>
          <label htmlFor="ownerName" className={labelClass}>
            Your name
          </label>
          <input
            id="ownerName"
            type="text"
            autoComplete="name"
            placeholder="Sarah Johnson"
            value={ownerName}
            onChange={e => setOwnerName(e.target.value)}
            disabled={isPending}
            required
            className={inputClass}
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className={labelClass}>
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="sarah@gracechurch.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={isPending}
            required
            className={inputClass}
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isPending}
              required
              minLength={8}
              className={`${inputClass} pr-14`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
              tabIndex={-1}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {password.length > 0 && password.length < 8 && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1.5 text-xs font-semibold text-rose-600"
            >
              At least 8 characters required.
            </motion.p>
          )}
        </div>

        {/* Error alert */}
        {error && (
          <motion.p 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3"
          >
            {error}{' '}
            {error.includes('already has an account') && (
              <Link href="/auth/login" className="underline font-bold">Sign in</Link>
            )}
          </motion.p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!isValid || isPending}
          className="w-full bg-[#4F6EF7] text-white rounded-xl py-3.5 font-bold text-sm hover:bg-[#3D5BD4] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(79,110,247,0.15)] cursor-pointer"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Setting up your church...
            </span>
          ) : (
            'Create my church →'
          )}
        </button>
      </form>

      {/* Redirect back to sign in */}
      <p className="mt-8 text-center text-xs text-stone-400">
        Already set up?{' '}
        <Link href="/auth/login" className="text-[#4F6EF7] hover:text-[#3D5BD4] font-bold transition-colors">
          Sign in →
        </Link>
      </p>
    </AuthLayout>
  )
}
