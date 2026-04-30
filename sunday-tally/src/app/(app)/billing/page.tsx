import { createClient } from '@/lib/supabase/server'
import { getBillingStatus } from '@/lib/billing/status'
import { redirect } from 'next/navigation'
import BillingActions from './BillingActions'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!membership) redirect('/auth/login')

  const isOwnerOrAdmin = membership.role === 'owner' || membership.role === 'admin'
  const billing = await getBillingStatus(supabase, membership.church_id)
  const hasSubscription = billing.subscriptionStatus !== 'trialing' || billing.phase === 'active'

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-gray-600">Sunday Tally — $22/month</p>
      </header>

      <section className="rounded-lg border border-gray-200 p-5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Status</span>
          <PhaseBadge phase={billing.phase} />
        </div>
        {billing.phase === 'trial' && (
          <p className="text-sm text-gray-600">
            {billing.daysLeft} day{billing.daysLeft === 1 ? '' : 's'} left in your free trial.
          </p>
        )}
        {billing.phase === 'active' && billing.currentPeriodEnd && (
          <p className="text-sm text-gray-600">
            Renews {new Date(billing.currentPeriodEnd).toLocaleDateString()}.
          </p>
        )}
        {billing.phase === 'expired' && (
          <p className="text-sm text-gray-600">
            Your trial has ended. Subscribe to continue editing and managing services.
          </p>
        )}
      </section>

      {isOwnerOrAdmin ? (
        <BillingActions hasSubscription={hasSubscription} phase={billing.phase} />
      ) : (
        <p className="text-sm text-gray-500">
          Only owners and admins can manage billing.
        </p>
      )}
    </div>
  )
}

function PhaseBadge({ phase }: { phase: 'trial' | 'active' | 'expired' }) {
  const styles: Record<typeof phase, string> = {
    trial:   'bg-blue-100 text-blue-800',
    active:  'bg-green-100 text-green-800',
    expired: 'bg-red-100 text-red-800',
  }
  const label: Record<typeof phase, string> = {
    trial: 'Trial',
    active: 'Active',
    expired: 'Expired',
  }
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles[phase]}`}>
      {label[phase]}
    </span>
  )
}
