'use client'

// T6_SETTINGS — /settings/services — Settings version of T6
// Lists services with edit + navigate to schedule settings per service

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

interface Template { id: string; display_name: string; is_active: boolean; location_name: string; primary_tag_name: string }

export default function SettingsServicesPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [templates, setTemplates] = useState<Template[]>([])
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (\!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (\!membership) return
      setRole(membership.role as UserRole)
      const { data } = await supabase.from('service_templates').select('id, display_name, is_active, church_locations(name), service_tags(tag_name)').eq('church_id', membership.church_id).eq('is_active', true).order('sort_order')
      setTemplates((data ?? []).map((t: any) => ({
        id: t.id, display_name: t.display_name, is_active: t.is_active,
        location_name: t.church_locations?.name ?? '',
        primary_tag_name: t.service_tags?.tag_name ?? 'No tag',
      })))
    })
  }, [])

  async function saveName(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('service_templates').update({ display_name: name }).eq('id', id)
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, display_name: name } : t))
  }

  function deactivate(id: string) {
    if (\!confirm('Deactivate this service? It won\'t appear on future Sundays. History is kept.')) return
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('service_templates').update({ is_active: false }).eq('id', id)
      setTemplates(prev => prev.filter(t => t.id \!== id))
    })
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Services</p>
      </div>
      <div className="px-4 py-4">
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {templates.map(tmpl => (
            <div key={tmpl.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <InlineEditField value={tmpl.display_name} onSave={v => saveName(tmpl.id, v)} aria-label={tmpl.display_name} />
                  <p className="text-xs text-gray-400 mt-0.5">{tmpl.primary_tag_name}{tmpl.location_name ? ` · ${tmpl.location_name}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Link href={`/settings/services/${tmpl.id}/schedule`} className="text-xs text-blue-600 hover:underline">Schedule</Link>
                  <button onClick={() => deactivate(tmpl.id)} className="text-xs text-gray-400 hover:text-red-500">Deactivate</button>
                </div>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-500">No services yet.</p>
              <Link href="/onboarding/services" className="mt-2 inline-block text-sm text-gray-900 underline">Set up services</Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
