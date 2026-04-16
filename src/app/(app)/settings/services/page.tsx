'use client'

// T6_SETTINGS — /settings/services — Settings version of T6
// Lists services with edit + navigate to schedule settings per service

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import { saveTemplatesAction, getChurchData } from '@/app/onboarding/services/actions'
import type { UserRole } from '@/types'

interface Template { id: string; display_name: string; is_active: boolean; location_name: string; primary_tag_name: string }
interface ServiceTag { id: string; tag_name: string; effective_start_date: string | null; effective_end_date: string | null }
interface Location { id: string; name: string }

const EMPTY_NEW = (locationId: string): NewForm => ({ display_name: '', location_id: locationId, primary_tag_id: '', subtag_ids: [] })
interface NewForm { display_name: string; location_id: string; primary_tag_id: string; subtag_ids: string[] }

export default function SettingsServicesPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [allTags, setAllTags] = useState<ServiceTag[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState<NewForm>({ display_name: '', location_id: '', primary_tag_id: '', subtag_ids: [] })
  const [addError, setAddError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function loadTemplates(churchId: string, supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase.from('service_templates').select('id, display_name, is_active, church_locations(name), service_tags!primary_tag_id(tag_name)').eq('church_id', churchId).eq('is_active', true).order('sort_order')
    setTemplates((data ?? []).map((t: any) => ({
      id: t.id, display_name: t.display_name, is_active: t.is_active,
      location_name: t.church_locations?.[0]?.name ?? '',
      primary_tag_name: t.service_tags?.tag_name ?? t.service_tags?.[0]?.tag_name ?? 'No tag',
    })))
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole)
      setChurchId(membership.church_id)
      await loadTemplates(membership.church_id, supabase)

      // Load locations + tags for the add form
      const churchData = await getChurchData()
      if (churchData) {
        setLocations(churchData.locations)
        setAllTags(churchData.tags)
        setNewForm(EMPTY_NEW(churchData.locations[0]?.id ?? ''))
      }
    })
  }, [])

  async function handleAdd() {
    if (!newForm.display_name.trim() || !newForm.primary_tag_id || !newForm.location_id) return
    setAddError(null)
    startTransition(async () => {
      const result = await saveTemplatesAction([{
        id: null,
        display_name: newForm.display_name,
        location_id: newForm.location_id,
        sort_order: templates.length + 1,
        primary_tag_id: newForm.primary_tag_id,
        subtag_ids: newForm.subtag_ids,
      }])
      if (result.error) { setAddError(result.error); return }
      setShowAdd(false)
      setNewForm(EMPTY_NEW(locations[0]?.id ?? ''))
      if (churchId) await loadTemplates(churchId, createClient())
    })
  }

  async function saveName(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('service_templates').update({ display_name: name }).eq('id', id)
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, display_name: name } : t))
  }

  function deactivate(id: string) {
    if (!confirm('Deactivate this service? It won\'t appear on future Sundays. History is kept.')) return
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('service_templates').update({ is_active: false }).eq('id', id)
      setTemplates(prev => prev.filter(t => t.id !== id))
    })
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <p className="font-semibold text-gray-900 text-sm">Services</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError(null) }} className="text-sm font-medium text-gray-900 hover:text-gray-600">+ Add</button>
      </div>

      {/* Add service sheet */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <p className="font-semibold text-gray-900">Add a service</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newForm.display_name}
                onChange={e => setNewForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="9am Service"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {locations.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={newForm.location_id}
                  onChange={e => setNewForm(f => ({ ...f, location_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select a location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tag — groups this service in the dashboard</label>
              <select
                value={newForm.primary_tag_id}
                onChange={e => setNewForm(f => ({ ...f, primary_tag_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Select a tag</option>
                {allTags.filter(t => !t.effective_start_date && !t.effective_end_date).map(t => (
                  <option key={t.id} value={t.id}>{t.tag_name}</option>
                ))}
              </select>
            </div>

            {addError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>}

            <button
              onClick={handleAdd}
              disabled={!newForm.display_name.trim() || !newForm.primary_tag_id || !newForm.location_id || isPending}
              className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40"
            >
              {isPending ? 'Saving...' : 'Add service'}
            </button>
            <button onClick={() => setShowAdd(false)} className="w-full text-gray-400 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

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
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
