'use client'

// BillingChrome — the visible billing surfaces layered over the app shell:
//   • TrialBanner     — slim countdown + live cost estimate (trial)
//   • BillingOverlay  — centered upgrade card over blurred content (ask-ai / expired)
//   • SoftDeletedPanel — full Reactivate screen (soft-deleted)
// AppLayout owns the blur class on <main> and the body replacement; this file
// owns the copy + CTAs. DS: brand #4F6EF7, amber #B45309 for attention, no red.

import Link from 'next/link'
import type { BillingSummary } from '@/lib/billing/summary'

const BILLING_HREF = '/settings/account?tab=billing'

const TIER_LABEL: Record<string, string> = {
  none: 'no AI',
  starter: 'Starter AI',
  plus: 'Plus AI',
  pro: 'Pro AI',
}

function dayPhrase(n: number): string {
  if (n <= 0) return 'today'
  return `in ${n} day${n === 1 ? '' : 's'}`
}

/** Trial: countdown + what their plan will cost once they go live. */
export function TrialBanner({ summary }: { summary: BillingSummary }) {
  const { daysLeft, estimate, recommendedTier } = summary
  const tier = TIER_LABEL[recommendedTier] ?? 'AI'
  const locs = `${estimate.locations} location${estimate.locations === 1 ? '' : 's'}`

  return (
    <div className="w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
        <span className="font-semibold">Free trial ends {dayPhrase(daysLeft)}.</span>
        <span className="text-amber-800">
          Your plan will be{' '}
          <span className="font-semibold">${estimate.totalMonthly}/mo</span>{' '}
          ({locs} + {tier}).
        </span>
        <Link
          href={BILLING_HREF}
          className="font-semibold text-[#3D5BD4] underline underline-offset-2 hover:text-[#4F6EF7]"
        >
          Choose your plan
        </Link>
      </div>
    </div>
  )
}

/** Centered card over blurred content — Ask AI upgrade gate or expired-trial wall. */
export function BillingOverlay({
  summary,
  mode,
}: {
  summary: BillingSummary
  mode: 'ask-ai' | 'expired'
}) {
  const copy =
    mode === 'ask-ai'
      ? {
          title: "Tally AI isn't on your plan yet",
          body: 'Turn it on to ask questions about your numbers and build your own charts.',
          cta: 'Upgrade AI',
        }
      : {
          title: 'Your free trial has ended',
          body:
            summary.graceDaysLeft != null
              ? `Your data is safe — you have ${summary.graceDaysLeft} day${summary.graceDaysLeft === 1 ? '' : 's'} before it's archived. Pick a plan to pick up right where you left off.`
              : 'Pick a plan to pick up right where you left off — your data is safe.',
          cta: 'Purchase a plan',
        }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 top-16 z-40 flex items-center justify-center px-6">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl backdrop-blur-sm">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{copy.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy.body}</p>
        <Link
          href={BILLING_HREF}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[#4F6EF7] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3D5BD4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
        >
          {copy.cta}
        </Link>
      </div>
    </div>
  )
}

/** Soft-deleted: the app body is replaced with a recover-your-church screen. */
export function SoftDeletedPanel({ summary }: { summary: BillingSummary }) {
  const days = summary.purgeDaysLeft
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Your church is archived</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {days != null ? (
            <>
              You have <span className="font-semibold text-amber-700">{days} day{days === 1 ? '' : 's'}</span> to
              recover everything. Purchase a plan and your data comes right back.
            </>
          ) : (
            <>Purchase a plan and your data comes right back.</>
          )}
        </p>
        <Link
          href={BILLING_HREF}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#4F6EF7] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3D5BD4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
        >
          Restore my church
        </Link>
        <p className="mt-4 text-xs text-slate-400">After that, your church and its data are permanently deleted.</p>
      </div>
    </div>
  )
}
