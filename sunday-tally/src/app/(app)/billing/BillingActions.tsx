'use client'

import { useState } from 'react'

interface Props {
  hasSubscription: boolean
  phase: 'trial' | 'active' | 'expired'
}

export default function BillingActions({ hasSubscription, phase }: Props) {
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function go(endpoint: string, kind: 'checkout' | 'portal') {
    setBusy(kind)
    setError(null)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Request failed')
      window.location.href = body.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {!hasSubscription || phase === 'expired' ? (
        <button
          onClick={() => go('/api/stripe/checkout', 'checkout')}
          disabled={busy !== null}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium disabled:opacity-50"
        >
          {busy === 'checkout' ? 'Redirecting…' : 'Subscribe — $22/month'}
        </button>
      ) : null}

      {hasSubscription && phase !== 'expired' ? (
        <button
          onClick={() => go('/api/stripe/portal', 'portal')}
          disabled={busy !== null}
          className="w-full rounded-md border border-gray-300 px-4 py-2 font-medium disabled:opacity-50"
        >
          {busy === 'portal' ? 'Redirecting…' : 'Manage billing'}
        </button>
      ) : null}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
