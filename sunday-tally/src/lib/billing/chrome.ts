// resolveChrome — pure decision for what billing chrome the app shell shows on
// a given route. Keeps the policy testable and out of the React component.
//
// Real enforcement is server-side (middleware + entitlements + AI route gates);
// this only drives the cosmetic banner / blur / upgrade funnel.

import type { BillingSummary } from './summary'

export type ChromeMode = 'none' | 'trial-banner' | 'ask-ai' | 'expired' | 'soft-deleted'

export interface Chrome {
  mode: ChromeMode
  /** Apply a blur+inert filter to the page content (nav stays interactive). */
  blurMain: boolean
  /** Replace the page body entirely (soft-deleted Reactivate screen). */
  replaceBody: boolean
}

const NONE: Chrome = { mode: 'none', blurMain: false, replaceBody: false }

/** Account + billing are always reachable and never blurred, so the owner can pay. */
function isPayReachable(pathname: string): boolean {
  return pathname.startsWith('/settings/account') || pathname.startsWith('/settings/billing')
}

export function resolveChrome(summary: BillingSummary | null, pathname: string): Chrome {
  if (!summary) return NONE
  const { lifecycleStage, aiEnabled } = summary

  if (lifecycleStage === 'soft-deleted') {
    return isPayReachable(pathname) ? NONE : { mode: 'soft-deleted', blurMain: false, replaceBody: true }
  }

  if (lifecycleStage === 'expired-grace') {
    return isPayReachable(pathname) ? NONE : { mode: 'expired', blurMain: true, replaceBody: false }
  }

  // Active, paid church without the AI add-on → blur only the Ask AI screen.
  // (Trial churches keep full AI access; budget exhaustion is handled on the
  // page itself, not here — so we scope this to active/no-AI only.)
  if (lifecycleStage === 'active' && !aiEnabled && pathname.startsWith('/dashboard/ai')) {
    return { mode: 'ask-ai', blurMain: true, replaceBody: false }
  }

  if (lifecycleStage === 'trial') {
    return { mode: 'trial-banner', blurMain: false, replaceBody: false }
  }

  return NONE
}
