import { createClient } from '@/lib/supabase/server'
import { stripe, stripePriceId, appUrl } from '@/lib/stripe/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
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

  let campuses = 1
  let aiTier = 'none'

  try {
    const body = await req.json()
    if (body.campuses) campuses = body.campuses
    if (body.aiTier) aiTier = body.aiTier
  } catch (e) {
    // If no body provided, defaults apply
  }

  const lineItems: any[] = [
    { price: stripePriceId(), quantity: campuses }
  ]

  if (aiTier === 'starter' && process.env.STRIPE_PRICE_AI_STARTER) {
    lineItems.push({ price: process.env.STRIPE_PRICE_AI_STARTER, quantity: campuses })
  } else if (aiTier === 'plus' && process.env.STRIPE_PRICE_AI_PLUS) {
    lineItems.push({ price: process.env.STRIPE_PRICE_AI_PLUS, quantity: 1 })
  } else if (aiTier === 'pro' && process.env.STRIPE_PRICE_AI_PRO) {
    lineItems.push({ price: process.env.STRIPE_PRICE_AI_PRO, quantity: 1 })
  }

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: lineItems,
    client_reference_id: membership.church_id,
    customer: church?.stripe_customer_id ?? undefined,
    customer_email: church?.stripe_customer_id ? undefined : user.email,
    metadata: { church_id: membership.church_id },
    subscription_data: {
      metadata: { church_id: membership.church_id },
    },
    success_url: `${appUrl()}/settings/billing?checkout=success`,
    cancel_url: `${appUrl()}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: false,
  })

  return NextResponse.json({ url: session.url })
}
