'use client'

// AppLayout — main app layout with role-aware bottom tab bar.
// Used for all post-onboarding screens. (NAV_MANIFEST: AppLayout)

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
    label: 'Services',
    href: '/services',
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

export default function AppLayout({ children, role, fillHeight }: AppLayoutProps) {
  const pathname = usePathname()

  const visibleTabs = TABS.filter(tab => tab.roles.includes(role))

  function isActive(tab: Tab) {
    const href = tab.label === 'Dashboard' ? getDashboardHref(role) : tab.href
    if (href === '/services') return pathname.startsWith('/services')
    if (href === '/dashboard/ai') return pathname.startsWith('/dashboard/ai')
    if (href === '/dashboard') return pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/ai')
    if (href === '/settings') return pathname.startsWith('/settings')
    return false
  }

  function tabHref(tab: Tab) {
    if (tab.label === 'Dashboard') return getDashboardHref(role)
    return tab.href
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 w-full max-w-[100vw]">
      {/* Main content */}
      <main className={fillHeight
        ? 'flex-1 flex flex-col overflow-hidden'
        : 'flex-1 pb-24 overflow-y-auto'
      }>
        {children}
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex">
          {visibleTabs.map(tab => {
            const active = isActive(tab)
            return (
              <Link
                key={tab.label}
                href={tabHref(tab)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                  active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {active ? tab.activeIcon : tab.icon}
                <span className={`text-xs font-medium ${active ? 'text-blue-600' : ''}`}>{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
