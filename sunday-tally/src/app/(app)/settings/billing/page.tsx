import { redirect } from 'next/navigation'

// /settings/billing is now a tab inside the Account workspace. This route
// forwards there (preserving the Stripe ?checkout= return param) so bookmarks
// and Stripe redirect URLs keep working. The billing UI lives in BillingPanel
// (client) → BillingClient, mounted by /settings/account?tab=billing.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const sp = await searchParams
  const checkout = sp?.checkout ? `&checkout=${encodeURIComponent(sp.checkout)}` : ''
  redirect(`/settings/account?tab=billing${checkout}`)
}
