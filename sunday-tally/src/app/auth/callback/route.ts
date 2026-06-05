// AUTH CALLBACK — /auth/callback (server-side PKCE/OTP code exchange)
// IRIS_AUTHRESET_ELEMENT_MAP.md N-3 / O-1 / audit B5 — the shared recovery-session
// handshake the reset flow depends on.
//
// @supabase/ssr's createBrowserClient defaults to the PKCE flow. resetPasswordForEmail
// (and magic-link / invite) deliver the token as `?code=...`, which must be exchanged
// for a real session via exchangeCodeForSession BEFORE the destination page renders.
// Doing the exchange here (server-side, where the cookie store is writable) establishes
// the session cookie, then we redirect to `next` (e.g. /auth/reset) which now reads a
// live session instead of racing an onAuthStateChange event.
//
// Public + tenant-agnostic. Pure Supabase Auth — no DB read/write.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Only allow same-origin relative paths as redirect targets (open-redirect guard).
function safeNext(next: string | null): string {
  if (!next) return '/auth/reset'
  if (!next.startsWith('/') || next.startsWith('//')) return '/auth/reset'
  return next
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // No code, or exchange failed → send to reset, which renders E-23 (expired). Never throw.
  const failUrl = new URL('/auth/reset', origin)
  failUrl.searchParams.set('error', 'recovery')
  return NextResponse.redirect(failUrl)
}
