'use client'

// AppLayout — main app layout with role-aware bottom tab bar.
// Used for all post-onboarding screens. (NAV_MANIFEST: AppLayout)

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBilling } from '@/components/billing/BillingProvider'
import { resolveChrome } from '@/lib/billing/chrome'
import { TrialBanner, BillingOverlay, SoftDeletedPanel } from '@/components/billing/BillingChrome'
import type { UserRole } from '@/types'

interface AppLayoutProps {
  children:    React.ReactNode
  role:        UserRole
  fillHeight?: boolean  // removes outer scroll; children manage their own overflow
}

interface Tab {
  label: string
  href: string
  roles: UserRole[]
  icon: React.ReactNode
  activeIcon: React.ReactNode
}

const CalendarIcon = ({ filled }: { filled?: boolean }) => (
  <svg className="w-6 h-6" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const ChartIcon = ({ filled }: { filled?: boolean }) => (
  <svg className="w-6 h-6" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

const SparkleIcon = ({ filled }: { filled?: boolean }) => (
  <svg className="w-6 h-6" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4m-2-2h4M6 17v4m-2-2h4m5-16l2.5 6L21 11l-5.5 2.5L13 20l-2.5-6.5L5 11l5.5-1.5L13 3z" />
  </svg>
)

const SettingsIcon = ({ filled }: { filled?: boolean }) => (
  <svg className="w-6 h-6" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const TABS: Tab[] = [
  {
    label: 'Entries',
    href: '/entries',
    roles: ['owner', 'admin', 'editor'],
    icon: <CalendarIcon />,
    activeIcon: <CalendarIcon filled />,
  },
  {
    label: 'Dashboard',
    href: '/dashboard',
    roles: ['owner', 'admin', 'viewer'],
    icon: <ChartIcon />,
    activeIcon: <ChartIcon filled />,
  },
  {
    label: 'Ask AI',
    href: '/dashboard/ai',
    roles: ['owner', 'admin', 'editor'],
    icon: <SparkleIcon />,
    activeIcon: <SparkleIcon filled />,
  },
  {
    // Settings hub is restricted to owner and admin only (hides for editor/viewer).
    label: 'Settings',
    href: '/settings',
    roles: ['owner', 'admin'],
    icon: <SettingsIcon />,
    activeIcon: <SettingsIcon filled />,
  },
]

function getDashboardHref(role: UserRole) {
  return role === 'viewer' ? '/dashboard/viewer' : '/dashboard'
}

function getInitials(name: string) {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function AppLayout({ children, role, fillHeight }: AppLayoutProps) {
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<{ fullName: string; avatarUrl: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const { data: prof } = await supabase
        .from('user_profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return
      setProfile({
        fullName: prof?.full_name || user.user_metadata?.full_name || 'User',
        avatarUrl: prof?.avatar_url || user.user_metadata?.avatar_url || null,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // Billing chrome (trial banner / blur-gating) — server-resolved via context.
  const billing = useBilling()
  const chrome = resolveChrome(billing, pathname)

  const visibleTabs = TABS.filter(tab => tab.roles.includes(role))

  function isActive(tab: Tab) {
    const href = tab.label === 'Dashboard' ? getDashboardHref(role) : tab.href
    if (href === '/entries') return pathname.startsWith('/entries')
    if (href === '/dashboard/ai') return pathname.startsWith('/dashboard/ai')
    if (href === '/dashboard') return pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/ai')
    // Active only if it's the settings hub path, not the account page
    if (href === '/settings') return pathname.startsWith('/settings') && !pathname.startsWith('/settings/account')
    return false
  }

  function tabHref(tab: Tab) {
    if (tab.label === 'Dashboard') return getDashboardHref(role)
    return tab.href
  }

  const baseMain = fillHeight
    ? 'flex-1 flex flex-col overflow-hidden'
    : 'flex-1 pb-24 overflow-y-auto'
  const mainClass = chrome.blurMain
    ? `${baseMain} blur-sm pointer-events-none select-none`
    : baseMain

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 w-full max-w-[100vw]">
      {/* Trial countdown + cost estimate banner */}
      {chrome.mode === 'trial-banner' && billing && <TrialBanner summary={billing} />}

      {/* Main content — replaced by the Reactivate screen when soft-deleted,
          otherwise blurred (and made inert) when gated. Nav stays interactive. */}
      {chrome.replaceBody && billing ? (
        <main className="flex-1 pb-24 overflow-y-auto">
          <SoftDeletedPanel summary={billing} />
        </main>
      ) : (
        <main className={mainClass} aria-hidden={chrome.blurMain || undefined}>
          {children}
        </main>
      )}

      {/* Upgrade card over blurred content (Ask AI gate / expired wall) */}
      {(chrome.mode === 'expired' || chrome.mode === 'ask-ai') && billing && (
        <BillingOverlay summary={billing} mode={chrome.mode} />
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex w-full">
          {visibleTabs.map(tab => {
            const active = isActive(tab)
            return (
              <Link
                key={tab.label}
                href={tabHref(tab)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                  active ? 'text-[#4F6EF7]' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {active ? tab.activeIcon : tab.icon}
                <span className={`text-xs font-medium ${active ? 'text-[#4F6EF7]' : ''}`}>{tab.label}</span>
              </Link>
            )
          })}

          {/* User Badge / Account Tab (Everyone) */}
          {(() => {
            const active = pathname.startsWith('/settings/account')
            return (
              <Link
                href="/settings/account"
                className="flex-1 flex items-center justify-center py-2 transition-colors"
              >
                <span className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-[11px] font-semibold ring-1 ring-inset transition-all ${
                  active 
                    ? 'ring-[#4F6EF7] text-[#4F6EF7] bg-[#4F6EF7]/5' 
                    : 'ring-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}>
                  {profile?.avatarUrl ? (
                    <img
                      className="inline-block size-5 rounded-full object-cover shrink-0"
                      src={profile.avatarUrl}
                      alt=""
                    />
                  ) : (
                    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold transition-colors ${
                      active ? 'bg-[#4F6EF7] text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {getInitials(profile?.fullName || 'User')}
                    </span>
                  )}
                  <span className="hidden sm:inline-block max-w-[80px] truncate">
                    {profile?.fullName ? profile.fullName.split(' ')[0] : 'User'}
                  </span>
                  <span className="sm:hidden font-medium">Me</span>
                </span>
              </Link>
            )
          })()}
        </div>
      </nav>
    </div>
  )
}

