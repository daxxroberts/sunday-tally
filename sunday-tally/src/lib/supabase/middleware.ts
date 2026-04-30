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
  const publicRoutes = [
    '/auth/login',
    '/auth/invite',
    '/signup',
    '/api/',
  ]
  const isPublic = publicRoutes.some(r => pathname.startsWith(r))

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

    // Gate 3 — Viewer containment: viewer trying to access non-dashboard routes
    if (role === 'viewer' && !pathname.startsWith('/dashboard') && !isPublic) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/viewer'
      return NextResponse.redirect(url)
    }

    // Gate: Editor trying to access dashboard or settings
    if (role === 'editor') {
      if (pathname.startsWith('/dashboard') || pathname.startsWith('/settings')) {
        const url = request.nextUrl.clone()
        url.pathname = '/services'
        return NextResponse.redirect(url)
      }
    }

    // Gate: Settings only for owner/admin
    if (pathname.startsWith('/settings') && role !== 'owner' && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/services'
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
          url.pathname = '/billing'
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}
