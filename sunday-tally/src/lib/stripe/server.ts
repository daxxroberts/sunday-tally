import 'server-only'
import Stripe from 'stripe'

let _client: Stripe | null = null

export function stripe(): Stripe {
  if (_client) return _client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  _client = new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
  return _client
}

export function stripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID
  if (!id) throw new Error('STRIPE_PRICE_ID is not set')
  return id
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}
