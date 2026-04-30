'use client'

// INVITE_ACCEPT — /auth/invite/[token]
// IRIS_INVITEACCEPT_ELEMENT_MAP.md: E1-E6 all implemented

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import AuthLayout from '@/components/layouts/AuthLayout'
import { getInviteByToken, acceptInviteAction, type InviteData } from './actions'

export default function InviteAcceptPage({ params }: { params: { token: string } }) {
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [inviteError, setInviteError] = useState<'expired' | 'already_accepted' | 'not_found' | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getInviteByToken(params.token).then(result => {
      if ('error' in result) setInviteError(result.error)
      else setInvite(result.data)
    })
  }, [params.token])

  const isViewer = invite?.role === 'viewer'
  const passwordsMatch = password === confirm
  const passwordValid = password.length >= 8

  function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    if (!invite || isPending) return
    if (!isViewer && (!passwordValid || !passwordsMatch)) return
    setFormError(null)

    startTransition(async () => {
      const result = await acceptInviteAction(
        invite.id,
        params.token,
        isViewer ? null : password,
        invite.role,
        invite.church_id
      )
      if (result?.error) setFormError(result.error)
    })
  }

  // Loading state
  if (!invite && !inviteError) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
        </div>
      </AuthLayout>
    )
  }

  // E4 — Token expired
  if (inviteError === 'expired' || inviteError === 'not_found') {
    return (
      <AuthLayout>
        <div className="text-center py-8">
          <p className="text-lg font-medium text-gray-900">This invite link has expired.</p>
          <p className="mt-2 text-sm text-gray-500">Ask your church admin to send a new invite.</p>
        </div>
      </AuthLayout>
    )
  }

  // E5 — Already accepted
  if (inviteError === 'already_accepted') {
    return (
      <AuthLayout>
        <div className="text-center py-8">
          <p className="text-lg font-medium text-gray-900">You&apos;ve already joined.</p>
          <Link href="/auth/login" className="mt-3 inline-block text-sm text-gray-600 underline hover:text-gray-900">
            Sign in instead
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      {/* E1 — Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          You&apos;ve been invited to {invite!.church_name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isViewer
            ? "You're all set — no password needed."
            : 'Set a password to get started.'}
        </p>
      </div>

      <form onSubmit={handleAccept} className="space-y-4">
        {/* E2 — Password fields (non-viewers only) */}
        {!isViewer && (
          <>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Choose a password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isPending}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
              />
              {password.length > 0 && !passwordValid && (
                <p className="mt-1 text-xs text-red-600">Password must be at least 8 characters.</p>
              )}
            </div>
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Same password again"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                disabled={isPending}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
              />
              {confirm.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-600">Passwords don&apos;t match.</p>
              )}
            </div>
          </>
        )}

        {formError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}

        {/* E3 — Accept button */}
        <button
          type="submit"
          disabled={isPending || (!isViewer && (!passwordValid || !passwordsMatch))}
          className="w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending
            ? 'Joining...'
            : isViewer
              ? 'View dashboard →'
              : 'Set password and join →'}
        </button>
      </form>
    </AuthLayout>
  )
}
