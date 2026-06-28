// Server layout for all authenticated (app) routes. Resolves the church's
// billing summary ONCE on the server and provides it to the client shell via
// BillingProvider — so the trial banner + blur-gating render without a
// per-page client fetch and without a flash of unblurred content (H5/FOUC).
//
// Persists across client-side navigations within (app); re-resolves on full
// load. Falls back to null (no chrome) when there's no membership yet —
// middleware handles the redirects.

import { createClient } from '@/lib/supabase/server'
import { resolveMember } from '@/lib/supabase/auth-helpers'
import { getBillingSummary, type BillingSummary } from '@/lib/billing/summary'
import { BillingProvider } from '@/components/billing/BillingProvider'

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  let summary: BillingSummary | null = null
  try {
    const supabase = await createClient()
    const resolved = await resolveMember(supabase)
    if (resolved.ok) {
      summary = await getBillingSummary(supabase, resolved.member.churchId)
    }
  } catch {
    // Never block the app shell on a billing read — render without chrome.
    summary = null
  }

  return <BillingProvider summary={summary}>{children}</BillingProvider>
}
