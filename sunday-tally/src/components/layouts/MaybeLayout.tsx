'use client'

// MaybeLayout — wraps children in AppLayout when standalone, or renders them
// bare when embedded inside another shell (e.g. the Setup workspace tabs, which
// provides the single AppLayout + bottom nav for all three panels).

import AppLayout from '@/components/layouts/AppLayout'
import type { UserRole } from '@/types'

export default function MaybeLayout({
  embedded,
  role,
  children,
}: {
  embedded: boolean
  role: UserRole
  children: React.ReactNode
}) {
  if (embedded) return <>{children}</>
  return <AppLayout role={role}>{children}</AppLayout>
}
