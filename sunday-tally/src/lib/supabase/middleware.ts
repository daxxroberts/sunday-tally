import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getBillingStatus } from '@/lib/billing/status'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Refresh session — do not remove this, it keeps the session alive
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes — allow unauthenticated. Stripe webhooks and cron
  // jobs authenticate via their own signatures/bearer tokens.
  // API routes (/api/*) are also excluded — they return JSON 401, not HTML redirects.
  // Broadened to '/auth/' so every auth surface is reachable while logged out:
  // login, invite, forgot, reset, and the recovery/OTP landing at /auth/callback.
  // The forgot/reset flow specifically depends on an unauthenticated user (they
  // forgot their password) being able to load /auth/reset to process the token.
  const exactPublicRoutes = [
    '/',
    '/pricing',
    '/features',
    '/contact',
    '/terms',
    '/privacy',
  ]
  const prefixPublicRoutes = [
    '/auth/',
    '/signup',
    '/api/',
    '/services-prototype',
  ]
  const isPublic = 
    exactPublicRoutes.includes(pathname) ||
    prefixPublicRoutes.some(r => pathname.startsWith(r))

  // Not logged in and not on a public route → redirect to login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Logged in — fetch membership for role-based gate checks
  if (user) {
    const { data: membership } = await supabase
      .from('church_memberships')
      .select('role, church_id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    // No active membership and not on a public/onboarding route → login
    if (!membership && !isPublic && !pathname.startsWith('/onboarding')) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    const role = membership?.role

    // Retired Sunday-loop routes (T1–T5). The legacy /services tree was deleted
    // when entry moved to /entries and History moved to /history (SESSION_HANDOFF
    // item 8). NOTE: flow/NAV_MANIFEST.json does not exist in this repo, so there
    // is no manifest authority — the Builder's logged instruction is the authority.
    // /services/history → /history specifically; everything else under /services
    // bounces role-aware. Guard against matching /services-prototype (public) or
    // any future /services... by requiring an exact match or a trailing slash.
    const isRetiredServices =
      pathname === '/services' || pathname.startsWith('/services/')
    if (isRetiredServices) {
      const url = request.nextUrl.clone()
      if (pathname === '/services/history') {
        url.pathname = '/history'
      } else if (role === 'viewer') {
        url.pathname = '/dashboard/viewer'
      } else {
        url.pathname = '/entries'
      }
      return NextResponse.redirect(url)
    }

    // /settings/account is role-agnostic (display name, default campus, password) and the
    // Settings nav tab is exposed to ALL roles specifically so everyone can reach it. Every
    // /settings/* gate below makes an exception for it; the rest of /settings/* (hub config)
    // stays owner/admin-only.
    const isAccountSettings = pathname.startsWith('/settings/account')

    // Gate 3 — Viewer containment: viewers live in /dashboard*, plus the shared
    // /settings/account page. Anything else bounces them to the viewer dashboard.
    if (
      role === 'viewer' &&
      !pathname.startsWith('/dashboard') &&
      !isAccountSettings &&
      !isPublic
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/viewer'
      return NextResponse.redirect(url)
    }

    // Gate: Editor trying to access dashboard or settings — but allow /settings/account.
    // Editors land on /entries (the retired /services route is gone).
    if (role === 'editor') {
      if (
        pathname.startsWith('/dashboard') ||
        (pathname.startsWith('/settings') && !isAccountSettings)
      ) {
        const url = request.nextUrl.clone()
        url.pathname = '/entries'
        return NextResponse.redirect(url)
      }
    }

    // Gate: hub config under /settings is owner/admin-only. /settings/account is allowed for
    // every authenticated member. Non-owner/admin hitting other /settings/* bounces
    // role-aware: editors → /entries, viewers → /dashboard/viewer.
    if (
      pathname.startsWith('/settings') &&
      !isAccountSettings &&
      role !== 'owner' &&
      role !== 'admin'
    ) {
      const url = request.nextUrl.clone()
      url.pathname = role === 'viewer' ? '/dashboard/viewer' : '/entries'
      return NextResponse.redirect(url)
    }

    // Gate: AI analytics chat excludes viewers
    if (pathname.startsWith('/dashboard/ai') && role === 'viewer') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/viewer'
      return NextResponse.redirect(url)
    }

    // Paywall — runs after role gates. Viewers pass through untouched.
    // Expired churches can still read dashboard/services and reach /billing,
    // but every write surface and /settings redirects to /billing.
    if (
      membership &&
      role !== 'viewer' &&
      !pathname.startsWith('/settings/billing') &&
      !pathname.startsWith('/billing') &&
      !pathname.startsWith('/onboarding') &&
      !pathname.startsWith('/api/stripe') &&
      !pathname.startsWith('/api/cron') &&
      !pathname.startsWith('/api/ai/')   // AI routes enforce their own auth + budget
    ) {
      const billing = await getBillingStatus(supabase, membership.church_id)
      if (billing.phase === 'expired') {
        const isWriteSurface =
          pathname.startsWith('/settings') ||
          request.method !== 'GET'
        if (isWriteSurface) {
          const url = request.nextUrl.clone()
          url.pathname = '/settings/billing'
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}
