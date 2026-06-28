'use client'

// BillingProvider — carries the server-resolved billing summary down to the
// client shell (AppLayout) so the trial banner + blur-gating render with zero
// client refetch and no flash of unblurred content. Resolved once in the
// server (app)/layout.tsx; persists across client navigations within (app).

import { createContext, useContext } from 'react'
import type { BillingSummary } from '@/lib/billing/summary'

const BillingContext = createContext<BillingSummary | null>(null)

export function BillingProvider({
  summary,
  children,
}: {
  summary: BillingSummary | null
  children: React.ReactNode
}) {
  return <BillingContext.Provider value={summary}>{children}</BillingContext.Provider>
}

/** The current church's billing summary, or null if unresolved (e.g. no membership). */
export function useBilling(): BillingSummary | null {
  return useContext(BillingContext)
}
