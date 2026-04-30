import { createClient } from '@/lib/supabase/server'
import { stripe, appUrl } from '@/lib/stripe/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: church } = await supabase
    .from('churches')
    .select('stripe_customer_id')
    .eq('id', membership.church_id)
    .single()

  if (!church?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No Stripe customer on file. Subscribe first.' },
      { status: 400 },
    )
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: church.stripe_customer_id,
    return_url: `${appUrl()}/billing`,
  })

  return NextResponse.json({ url: session.url })
}
