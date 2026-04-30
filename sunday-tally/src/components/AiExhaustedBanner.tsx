'use client'

// D-059: paid AI budget is not advertised — message shows no numbers.

import { useState, useRef, useEffect } from 'react'

interface Props {
  /** When provided, shows the owner PIN override flow instead of the plain banner. */
  onOverride?: () => void
}

export default function AiExhaustedBanner({ onOverride }: Props) {
  const [showPin,  setShowPin]  = useState(false)
  const [pin,      setPin]      = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showPin) inputRef.current?.focus()
  }, [showPin])

  async function submitPin(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length < 4 || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/override', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pin }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'invalid_pin') setError('Wrong PIN. Try again.')
        else if (body.error === 'owner_only') setError('Owner role required.')
        else if (body.error === 'unauthorized') setError('Session expired — please refresh the page.')
        else setError('Something went wrong.')
        return
      }
      setShowPin(false)
      setPin('')
      onOverride?.()
    } catch {
      setError('Network error. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  // ── Plain banner (no owner callback) ──
  if (!onOverride) {
    return (
      <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">You&rsquo;ve used all your AI for this period.</p>
        <p className="mt-1 text-amber-800">AI will be available again in your next billing period.</p>
      </div>
    )
  }

  // ── Owner banner with PIN toggle ──
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">AI limit reached for this period.</p>
          {!showPin && (
            <p className="mt-0.5 text-amber-700 text-xs">Owner override available.</p>
          )}
        </div>
        {!showPin && (
          <button
            type="button"
            onClick={() => setShowPin(true)}
            className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 transition-colors"
          >
            Override
          </button>
        )}
      </div>

      {showPin && (
        <form onSubmit={submitPin} className="mt-3 flex items-center gap-2">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder="PIN"
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null) }}
            disabled={loading}
            className="w-24 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pin.length < 4 || loading}
            className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-40 transition-colors"
          >
            {loading ? '…' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={() => { setShowPin(false); setPin(''); setError(null) }}
            className="text-xs text-amber-600 hover:text-amber-800"
          >
            Cancel
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  )
}
