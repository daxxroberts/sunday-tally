import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL\!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY\!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — do not remove this, it keeps the session alive
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes — allow unauthenticated
  const publicRoutes = ['/auth/login', '/auth/invite', '/signup']
  const isPublic = publicRoutes.some(r => pathname.startsWith(r))

  // Not logged in and not on a public route → redirect to login
  if (\!user && \!isPublic) {
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
    if (\!membership && \!isPublic && \!pathname.startsWith('/onboarding')) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    const role = membership?.role

    // Gate 3 — Viewer containment: viewer trying to access non-dashboard routes
    if (role === 'viewer' && \!pathname.startsWith('/dashboard') && \!isPublic) {
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
    if (pathname.startsWith('/settings') && role \!== 'owner' && role \!== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/services'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
