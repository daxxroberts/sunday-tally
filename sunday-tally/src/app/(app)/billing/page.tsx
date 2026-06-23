import { redirect } from 'next/navigation'

export default function LegacyBillingRedirect() {
  redirect('/settings/billing')
}
