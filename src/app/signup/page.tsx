'use client'

// SIGNUP screen — /signup
// IRIS_SIGNUP_ELEMENT_MAP.md: E1-E9 all implemented
// Provisioning: compensation pattern per D-051 and PROVISIONING.md

import { useState, useTransition } from 'react'
import Link from 'next/link'
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
    if (\!isValid || isPending) return
    setError(null)

    startTransition(async () => {
      const result = await signupAction({
        churchName: churchName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      // signupAction redirects on success — only reaches here on error
      if (result?.error) setError(result.error)
    })
  }

  return (
    <AuthLayout>
      {/* E1 — Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Set up your church</h1>
        <p className="mt-1 text-gray-500 text-sm">Get your team tracking in minutes.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* E2 — Church name */}
        <div>
          <label htmlFor="churchName" className="block text-sm font-medium text-gray-700 mb-1">
            What&apos;s your church called?
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {/* E3 — Owner name */}
        <div>
          <label htmlFor="ownerName" className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {/* E4 — Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Your email address
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {/* E5 — Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Choose a password
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => \!v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs"
              tabIndex={-1}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {password.length > 0 && password.length < 8 && (
            <p className="mt-1 text-xs text-red-600">Password must be at least 8 characters.</p>
          )}
        </div>

        {/* E8 — Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}{' '}
            {error.includes('already has an account') && (
              <Link href="/auth/login" className="underline font-medium">Sign in</Link>
            )}
          </p>
        )}

        {/* E6/E7 — Submit / Loading */}
        <button
          type="submit"
          disabled={\!isValid || isPending}
          className="w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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

      {/* E9 — Already have account */}
      <p className="mt-8 text-center text-xs text-gray-400">
        Already set up?{' '}
        <Link href="/auth/login" className="text-gray-600 hover:text-gray-900 underline">
          Sign in →
        </Link>
      </p>
    </AuthLayout>
  )
}
