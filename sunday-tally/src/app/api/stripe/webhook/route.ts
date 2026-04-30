import { stripe } from '@/lib/stripe/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !secret) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const churchId = extractChurchId(event)

  // Idempotent insert — UNIQUE on stripe_event_id short-circuits replays.
  const { error: insertErr } = await supabase
    .from('billing_events')
    .insert({
      church_id: churchId,
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as object,
    })

  if (insertErr && insertErr.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(supabase, event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(supabase, event.data.object as Stripe.Invoice)
        break
    }

    await supabase
      .from('billing_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('stripe_event_id', event.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Handler failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

function extractChurchId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>
  const metadata = (obj.metadata as Record<string, string> | undefined) ?? undefined
  if (metadata?.church_id) return metadata.church_id
  const clientRef = obj.client_reference_id as string | undefined
  if (clientRef) return clientRef
  return null
}

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createServiceRoleClient>,
  session: Stripe.Checkout.Session,
) {
  const churchId = session.client_reference_id ?? session.metadata?.church_id
  if (!churchId) return
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

  await supabase
    .from('churches')
    .update({
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: subscriptionId ?? null,
      subscription_status: 'active',
    })
    .eq('id', churchId)
}

async function handleSubscriptionChange(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sub: Stripe.Subscription,
) {
  const churchId = sub.metadata?.church_id
  if (!churchId) return
  const periodEndUnix = (sub as unknown as { current_period_end?: number }).current_period_end
  const periodEnd = typeof periodEndUnix === 'number'
    ? new Date(periodEndUnix * 1000).toISOString()
    : null

  await supabase
    .from('churches')
    .update({
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      current_period_end: periodEnd,
    })
    .eq('id', churchId)
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sub: Stripe.Subscription,
) {
  const churchId = sub.metadata?.church_id
  if (!churchId) return
  await supabase
    .from('churches')
    .update({
      subscription_status: 'canceled',
      stripe_subscription_id: null,
    })
    .eq('id', churchId)
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createServiceRoleClient>,
  invoice: Stripe.Invoice,
) {
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id
  if (!customerId) return
  await supabase
    .from('churches')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_customer_id', customerId)

  const { data: church } = await supabase
    .from('churches')
    .select('id, name')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (!church) return

  const { data: owner } = await supabase
    .from('church_memberships')
    .select('user_id')
    .eq('church_id', church.id)
    .eq('role', 'owner')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!owner) return

  const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id)
  const email = userData?.user?.email
  if (!email) return

  const { sendEmail } = await import('@/lib/email/resend')
  await sendEmail(email, 'paymentFailed', { churchName: church.name })
}
