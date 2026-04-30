import { createClient } from '@/lib/supabase/server'
import { stripe, stripePriceId, appUrl } from '@/lib/stripe/server'
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
    .select('stripe_customer_id, name')
    .eq('id', membership.church_id)
    .single()

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: stripePriceId(), quantity: 1 }],
    client_reference_id: membership.church_id,
    customer: church?.stripe_customer_id ?? undefined,
    customer_email: church?.stripe_customer_id ? undefined : user.email,
    metadata: { church_id: membership.church_id },
    subscription_data: {
      metadata: { church_id: membership.church_id },
    },
    success_url: `${appUrl()}/billing?checkout=success`,
    cancel_url: `${appUrl()}/billing?checkout=cancelled`,
    allow_promotion_codes: false,
  })

  return NextResponse.json({ url: session.url })
}
