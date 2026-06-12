'use client'

import Link from 'next/link'

/**
 * EMAIL_POLICY #13 (D-099) — IN-APP pop-up for the trial AI-import budget being
 * exhausted. The user is mid-import (looking at the screen), so per the channel
 * rule this is a pop-up, NOT an email. Offers two paths: finish setup manually,
 * or subscribe for a monthly AI budget. Primary CTA → /billing.
 *
 * DS-1 brand blue (#4F6EF7) primary button; DS-2 no red anywhere; DS-4 Fira via
 * inherited app font. Overlay click + secondary button dismiss to the manual path.
 */
export function BudgetExhaustedModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-budget-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(79,110,247,0.12)' }}
        >
          <svg
            className="h-6 w-6"
            style={{ color: '#4F6EF7' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>

        <h2
          id="ai-budget-modal-title"
          className="text-center text-lg font-bold text-slate-900"
        >
          You&apos;ve used your free AI-import budget
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          The AI assistant has reached the limit included with your free trial.
          You can finish setting up your data manually, or subscribe for a monthly
          AI budget that covers both setup and analytics chat.
        </p>

        <div className="mt-6 space-y-2">
          <Link
            href="/billing"
            className="block w-full rounded-xl py-3 text-center text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#4F6EF7' }}
          >
            See plans &amp; subscribe
          </Link>
          <button
            onClick={onClose}
            className="block w-full rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Continue setting up manually
          </button>
        </div>
      </div>
    </div>
  )
}
