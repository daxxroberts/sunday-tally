'use client'

// BILLING client surface — IRIS_BILLING_ELEMENT_MAP (Zones A–D).
// DESIGN_SYSTEM: brand #4F6EF7 (DS-1) · NO RED (DS-2) · status circle not pill
// (DS-6/DS-8) · Fira Code numerals (DS-4) · rounded-2xl cards (DS-5) · SVG icons
// (DS-14) · focus-visible rings (DS-19). Reuses Dot/Ico from entries/ui.

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import type { UserRole } from '@/types'
import { Dot, Ico } from '@/app/(app)/entries/ui'

interface Props {
  role: UserRole
  churchName: string
  phase: 'trial' | 'active' | 'expired'
  subscriptionStatus: string
  daysLeft: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
}

// Render-state model (IRIS_BILLING "Phase → State"): the page surfaces four
// visible states by reading subscriptionStatus alongside phase. past_due stays
// phase='active' in status.ts (PAID_ACTIVE_STATES) — this is the one repair.
type RenderState = 'trial' | 'active' | 'past_due' | 'expired'

function resolveState(phase: Props['phase'], subscriptionStatus: string): RenderState {
  if (phase === 'active' && subscriptionStatus === 'past_due') return 'past_due'
  return phase
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

export default function BillingClient({
  role,
  churchName,
  phase,
  subscriptionStatus,
  daysLeft,
  trialEndsAt,
  currentPeriodEnd,
}: Props) {
  const state = resolveState(phase, subscriptionStatus)
  const isOwnerOrAdmin = role === 'owner' || role === 'admin'
  const params = useSearchParams()
  const checkout = params.get('checkout') // 'success' | 'cancelled' (N-6)

  // Trial AI-budget exhaustion: status.ts forces 'expired' while trial calendar
  // days remain. Distinguish that from plain calendar expiry (E-14).
  const budgetExhausted =
    state === 'expired' && !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()

  return (
    <AppLayout role={role}>
      <div className="mx-auto w-full max-w-2xl px-5 py-8 space-y-6">
        {/* Zone A — Header (E-1, E-2) */}
        <header className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#3D5BD4]">
            Billing
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{churchName}</h1>
          <p className="text-sm text-slate-600">
            Sunday Tally <span className="text-slate-400">·</span>{' '}
            <span className="font-num">$22</span> / month
          </p>
        </header>

        {/* N-6 return-from-Stripe notice */}
        {checkout === 'success' && (
          <p className="rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/5 px-4 py-3 text-sm text-[#15803D]">
            Thanks — your subscription is being confirmed. This page updates as soon as it&apos;s active.
          </p>
        )}
        {checkout === 'cancelled' && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Checkout was cancelled. You can subscribe whenever you&apos;re ready.
          </p>
        )}

        {/* Zone B — Status card (E-10..E-14) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Plan status</span>
            <PhaseIndicator state={state} />
          </div>

          {state === 'trial' && (
            <p className="text-sm text-slate-600">
              <span className="font-num font-semibold text-slate-900">{daysLeft}</span>{' '}
              day{daysLeft === 1 ? '' : 's'} left in your free trial
              {trialEndsAt && (
                <>
                  {' '}— ends <span className="font-num">{fmtDate(trialEndsAt)}</span>
                </>
              )}
              .
            </p>
          )}

          {state === 'active' && currentPeriodEnd && (
            <p className="text-sm text-slate-600">
              Renews <span className="font-num">{fmtDate(currentPeriodEnd)}</span>.
            </p>
          )}

          {state === 'past_due' && (
            <p className="flex items-start gap-2 text-sm text-[#B45309]">
              <Ico.ban className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Your last payment didn&apos;t go through. Update your card to keep editing.</span>
            </p>
          )}

          {state === 'expired' && (
            <div className="space-y-1">
              <p className="text-sm text-slate-600">
                Your trial has ended. Subscribe to keep entering and viewing your data.
              </p>
              {budgetExhausted && (
                <p className="text-sm text-[#B45309]">Your trial AI budget is used up.</p>
              )}
            </div>
          )}
        </section>

        {/* Zone C — Actions (owner/admin) · Zone D — read-only notice */}
        {isOwnerOrAdmin ? (
          <BillingActions state={state} />
        ) : (
          <p className="text-sm text-slate-500">Only owners and admins can manage billing.</p>
        )}
      </div>
    </AppLayout>
  )
}

/* ── E-10 phase indicator: status circle (DS-6) + plain-text label (DS-8) ──── */
function PhaseIndicator({ state }: { state: RenderState }) {
  const label: Record<RenderState, string> = {
    trial: 'Trial',
    active: 'Active',
    past_due: 'Past due',
    expired: 'Expired',
  }
  // complete (sage check) for healthy states; needs (amber outline) for attention.
  const dot = state === 'trial' || state === 'active' ? 'complete' : 'needs'
  return (
    <span className="inline-flex items-center gap-2 align-middle leading-none">
      <Dot s={dot} />
      <span className="text-sm font-semibold text-slate-900">{label[state]}</span>
    </span>
  )
}

/* ── Zone C actions (E-20 Subscribe / E-21 Manage billing / E-22 error) ────── */
function BillingActions({ state }: { state: RenderState }) {
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // trial/expired → Subscribe (checkout). active/past_due → Manage billing (portal).
  const showSubscribe = state === 'trial' || state === 'expired'

  async function go(endpoint: string, kind: 'checkout' | 'portal') {
    setBusy(kind)
    setError(null)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Something went wrong')
      window.location.href = body.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {showSubscribe ? (
        <button
          type="button"
          onClick={() => go('/api/stripe/checkout', 'checkout')}
          disabled={busy !== null}
          className="w-full rounded-xl bg-[#4F6EF7] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3D5BD4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'checkout' ? (
            'Redirecting…'
          ) : (
            <>Subscribe — <span className="font-num">$22</span>/month</>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => go('/api/stripe/portal', 'portal')}
          disabled={busy !== null}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'portal' ? 'Redirecting…' : 'Manage billing'}
        </button>
      )}

      {error && (
        <p className="flex items-start gap-2 text-sm text-[#B45309]">
          <Ico.ban className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
