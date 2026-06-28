'use client'

// BILLING client surface — IRIS_BILLING_ELEMENT_MAP (Zones A–D).
// DESIGN_SYSTEM: brand #4F6EF7 (DS-1) · NO RED (DS-2) · status circle not pill
// (DS-6/DS-8) · Fira Code numerals (DS-4) · rounded-2xl cards (DS-5) · SVG icons
// (DS-14) · focus-visible rings (DS-19). Reuses Dot/Ico from entries/ui.

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import MaybeLayout from '@/components/layouts/MaybeLayout'
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
  aiAddonTier: string
  /** When mounted inside the Account workspace tabs, drop the AppLayout + header. */
  embedded?: boolean
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
  aiAddonTier,
  embedded = false,
}: Props) {
  const state = resolveState(phase, subscriptionStatus)
  const isOwnerOrAdmin = role === 'owner' || role === 'admin'
  const params = useSearchParams()
  const router = useRouter()
  const checkout = params.get('checkout') // 'success' | 'cancelled' (N-6)

  // Trial AI-budget exhaustion: status.ts forces 'expired' while trial calendar
  // days remain. Distinguish that from plain calendar expiry (E-14).
  const budgetExhausted =
    state === 'expired' && !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()

  return (
    <MaybeLayout embedded={embedded} role={role}>
      <div className="mx-auto w-full max-w-2xl px-5 py-8 space-y-6">
        {/* Zone A — Header (E-1, E-2). Hidden when embedded — the Account
            workspace's header + tab strip provide the context instead. */}
        {!embedded && (
          <header className="flex items-start gap-3">
            <button onClick={() => router.push('/settings')} aria-label="Back to Settings"
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
              <Ico.left className="h-5 w-5" />
            </button>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#3D5BD4]">
                Billing & Subscriptions
              </p>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{churchName}</h1>
              <p className="text-sm text-slate-600">
                Sunday Tally Base <span className="text-slate-400">·</span>{' '}
                <span className="font-num">$22</span> / month per location
              </p>
            </div>
          </header>
        )}

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

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
             <span className="text-sm font-medium text-slate-500">AI Add-on Tier</span>
             <span className="text-sm font-bold text-slate-900 capitalize">{aiAddonTier === 'none' ? 'No Add-on' : aiAddonTier}</span>
          </div>

          {state === 'trial' && (
            <p className="text-sm text-slate-600 pt-4">
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
            <p className="text-sm text-slate-600 pt-4">
              Renews <span className="font-num">{fmtDate(currentPeriodEnd)}</span>.
            </p>
          )}

          {state === 'past_due' && (
            <p className="flex items-start gap-2 text-sm text-[#B45309] pt-4">
              <Ico.ban className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Your last payment didn&apos;t go through. Update your card to keep editing.</span>
            </p>
          )}

          {state === 'expired' && (
            <div className="space-y-1 pt-4">
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
          <BillingActions state={state} currentTier={aiAddonTier} />
        ) : (
          <p className="text-sm text-slate-500">Only owners and admins can manage billing.</p>
        )}
      </div>
    </MaybeLayout>
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
function BillingActions({ state, currentTier }: { state: RenderState, currentTier: string }) {
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<string>('none')

  // trial/expired → Subscribe (checkout). active/past_due → Manage billing (portal).
  const showSubscribe = state === 'trial' || state === 'expired'

  async function go(endpoint: string, kind: 'checkout' | 'portal') {
    setBusy(kind)
    setError(null)
    try {
      const res = await fetch(endpoint, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiTier: selectedTier })
      })
      
      const text = await res.text()
      let body: any = {}
      try {
        if (text) body = JSON.parse(text)
      } catch (err) {
        throw new Error(`Server returned an invalid response (${res.status})`)
      }
      
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Something went wrong')
      window.location.href = body.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      {showSubscribe && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Select an AI Add-on</h3>
          <div className="grid grid-cols-1 gap-3">
             <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${selectedTier === 'none' ? 'border-[#4F6EF7] bg-blue-50/50 ring-1 ring-[#4F6EF7]' : 'border-slate-200 hover:border-slate-300'}`}>
               <input type="radio" name="ai_tier" value="none" checked={selectedTier === 'none'} onChange={() => setSelectedTier('none')} className="sr-only" />
               <div className="flex-1">
                 <p className="text-sm font-bold text-slate-900">No AI Add-on</p>
                 <p className="text-xs text-slate-500">Base platform only</p>
               </div>
               <span className="text-sm font-semibold text-slate-900">$0</span>
             </label>
             <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${selectedTier === 'starter' ? 'border-[#4F6EF7] bg-blue-50/50 ring-1 ring-[#4F6EF7]' : 'border-slate-200 hover:border-slate-300'}`}>
               <input type="radio" name="ai_tier" value="starter" checked={selectedTier === 'starter'} onChange={() => setSelectedTier('starter')} className="sr-only" />
               <div className="flex-1">
                 <p className="text-sm font-bold text-slate-900">Starter AI</p>
                 <p className="text-xs text-slate-500">15 dashboard widgets</p>
               </div>
               <span className="text-sm font-semibold text-slate-900">+$15<span className="text-slate-400 font-normal">/mo per location</span></span>
             </label>
             <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${selectedTier === 'plus' ? 'border-[#4F6EF7] bg-blue-50/50 ring-1 ring-[#4F6EF7]' : 'border-slate-200 hover:border-slate-300'}`}>
               <input type="radio" name="ai_tier" value="plus" checked={selectedTier === 'plus'} onChange={() => setSelectedTier('plus')} className="sr-only" />
               <div className="flex-1">
                 <p className="text-sm font-bold text-slate-900">Plus AI</p>
                 <p className="text-xs text-slate-500">40 dashboard widgets</p>
               </div>
               <span className="text-sm font-semibold text-slate-900">+$29<span className="text-slate-400 font-normal">/mo</span></span>
             </label>
             <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${selectedTier === 'pro' ? 'border-[#4F6EF7] bg-blue-50/50 ring-1 ring-[#4F6EF7]' : 'border-slate-200 hover:border-slate-300'}`}>
               <input type="radio" name="ai_tier" value="pro" checked={selectedTier === 'pro'} onChange={() => setSelectedTier('pro')} className="sr-only" />
               <div className="flex-1">
                 <p className="text-sm font-bold text-slate-900">Pro AI</p>
                 <p className="text-xs text-slate-500">Unlimited widgets & advanced models</p>
               </div>
               <span className="text-sm font-semibold text-slate-900">+$49<span className="text-slate-400 font-normal">/mo</span></span>
             </label>
          </div>
        </div>
      )}

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
              <>Subscribe — Checkout</>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => go('/api/stripe/portal', 'portal')}
            disabled={busy !== null}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'portal' ? 'Redirecting…' : 'Manage billing, add-ons & campuses'}
          </button>
        )}

        {error && (
          <p className="flex items-start gap-2 text-sm text-[#B45309]">
            <Ico.ban className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  )
}
