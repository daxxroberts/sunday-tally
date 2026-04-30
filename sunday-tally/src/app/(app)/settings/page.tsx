'use client'

// T_SETTINGS — Settings Hub — /settings
// IRIS_TSETTINGS_ELEMENT_MAP.md: E1-E4 all implemented

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

function SettingsRow({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-4 py-3.5 hover:bg-blue-50/50 active:bg-blue-50 transition-colors group cursor-pointer">
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 flex-shrink-0 ml-3 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-1 pt-5 pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.04)]">
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
      if (!user) return
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
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <p className="font-bold text-gray-900">Settings</p>
      </div>

      <div className="px-4 pb-8 space-y-1">
        {/* E2 — Your Church */}
        <Section title="Your Church">
          <SettingsRow href="/settings/locations" label="Locations" description="Where your services meet" />
          <SettingsRow href="/settings/services" label="Services" description="The services that appear each Sunday" />
        </Section>

        {/* E3 — Your Team */}
        <Section title="Your Team">
          <SettingsRow href="/settings/team" label="Members" description="Who has access and what they can do" />
        </Section>

        {/* Data */}
        <Section title="Data">
          <SettingsRow
            href="/onboarding/import"
            label="AI Data Import"
            description="Upload CSVs or Sheets — AI maps your columns and imports your history"
          />
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
