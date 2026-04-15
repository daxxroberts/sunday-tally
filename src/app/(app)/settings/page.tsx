'use client'

// T_SETTINGS — Settings Hub — /settings
// IRIS_TSETTINGS_ELEMENT_MAP.md: E1-E4 all implemented
// Copy rule: name — one-line reason why (instructional rule)

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

function SettingsRow({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors group">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 ml-3 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 pt-6 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [role, setRole] = useState<UserRole>('admin')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (\!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (membership) setRole(membership.role as UserRole)
    })
  }, [])

  return (
    <AppLayout role={role}>
      {/* E1 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <p className="font-semibold text-gray-900">Settings</p>
      </div>

      <div className="px-4 pb-8 space-y-2">
        {/* E2 — Your Church */}
        <Section title="Your Church">
          <SettingsRow href="/settings/locations" label="Locations" description="Where your services meet" />
          <SettingsRow href="/settings/services" label="Services" description="The services that appear each Sunday" />
        </Section>

        {/* E3 — Your Team */}
        <Section title="Your Team">
          <SettingsRow href="/settings/team" label="Members" description="Who has access and what they can do" />
        </Section>

        {/* E4 — What You Track */}
        <Section title="What You Track">
          <SettingsRow href="/settings/tracking" label="Tracking" description="Turn audiences and modules on or off" />
          <SettingsRow href="/settings/volunteer-roles" label="Volunteer Roles" description="The roles you track each week" />
          <SettingsRow href="/settings/stats" label="Stats" description="Decisions, baptisms, and anything else you count" />
          <SettingsRow href="/settings/giving-sources" label="Giving Sources" description="Plate, Online, and any other sources you track" />
          <SettingsRow href="/settings/tags" label="Service Tags" description="The tags that group your services in the dashboard" />
        </Section>
      </div>
    </AppLayout>
  )
}
