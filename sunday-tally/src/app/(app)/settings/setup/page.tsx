'use client'

// SETUP WORKSPACE — /settings/setup
// One tabbed window for the screens you bounce between while setting a church
// up: Services & Occurrences, Ministries & Groups (What we track), Locations.
// Each tab is the SAME component the standalone route renders, mounted with
// `embedded` so it drops its own header/AppLayout. Tabs are lazy-mounted on
// first visit and then KEPT ALIVE (toggled with `hidden`), so flipping back and
// forth preserves each tab's state — selected ministry, scroll, expansions.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { Ico } from '@/app/(app)/entries/ui'
import type { UserRole } from '@/types'
import { ServicesPanel } from '@/app/(app)/settings/services/page'
import { TrackPanel } from '@/app/(app)/settings/track/page'
import { LocationsPanel } from '@/app/(app)/settings/locations/page'

type TabKey = 'services' | 'track' | 'locations'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'services',  label: 'Services' },
  { key: 'track',     label: 'Ministries' },
  { key: 'locations', label: 'Locations' },
]

export default function SetupWorkspacePage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('viewer')
  const [churchName, setChurchName] = useState('')
  const [active, setActive] = useState<TabKey>('services')
  // Lazy-mount + keep-alive: only render a tab once it's been opened, then
  // never unmount it (so its state survives switching away and back).
  const [mounted, setMounted] = useState<Set<TabKey>>(new Set(['services']))

  useEffect(() => {
    // Honor ?tab= so deep links / the Settings hub can open a specific tab.
    const t = new URLSearchParams(window.location.search).get('tab') as TabKey | null
    if (t && TABS.some(x => x.key === t)) {
      setActive(t)
      setMounted(prev => new Set(prev).add(t))
    }
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, churches(name)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole)
      const ch = Array.isArray(membership.churches) ? membership.churches[0] : membership.churches
      setChurchName((ch as { name?: string } | null)?.name ?? '')
    })()
  }, [supabase])

  function go(key: TabKey) {
    setActive(key)
    setMounted(prev => prev.has(key) ? prev : new Set(prev).add(key))
  }

  return (
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* ── Header + tab bar (the one header for all three panels) ──────── */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3.5">
            <button
              onClick={() => router.push('/settings')}
              aria-label="Back to Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.left className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              {churchName && <div className="truncate text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>{churchName}</div>}
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Setup</h1>
            </div>
          </div>
          {/* Tabs */}
          <div className="mx-auto flex max-w-5xl gap-1 px-3">
            {TABS.map(t => {
              const on = active === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => go(t.key)}
                  aria-current={on ? 'page' : undefined}
                  className={`relative flex-1 px-3 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none ${
                    on ? 'text-[#3D5BD4]' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                  <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors ${on ? 'bg-[#4F6EF7]' : 'bg-transparent'}`} />
                </button>
              )
            })}
          </div>
        </header>

        {/* ── Panels — lazy-mounted, kept alive, visibility-toggled ──────── */}
        {mounted.has('services')  && <div className={active === 'services'  ? '' : 'hidden'}><ServicesPanel  embedded /></div>}
        {mounted.has('track')     && <div className={active === 'track'     ? '' : 'hidden'}><TrackPanel     embedded /></div>}
        {mounted.has('locations') && <div className={active === 'locations' ? '' : 'hidden'}><LocationsPanel embedded /></div>}
      </div>
    </AppLayout>
  )
}
