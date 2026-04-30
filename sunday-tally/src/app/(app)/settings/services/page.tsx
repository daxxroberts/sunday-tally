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

interface ScheduleSummary { day_of_week: number; start_time: string | null; end_time: string | null; timezone: string | null; is_active: boolean }
interface Template { id: string; display_name: string; is_active: boolean; location_name: string; primary_tag_name: string; subtag_names: string[]; schedules: ScheduleSummary[] }
interface ServiceTag { id: string; tag_name: string; effective_start_date: string | null; effective_end_date: string | null }
interface Location { id: string; name: string }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function fmtTime(t: string | null) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

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
    const { data } = await supabase
      .from('service_templates')
      .select(`id, display_name, is_active,
        church_locations(name),
        service_tags!primary_tag_id(tag_name),
        service_schedule_versions(day_of_week, start_time, end_time, timezone, is_active)
      `)
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('sort_order')
    const ids = (data ?? []).map((t: any) => t.id)
    const templateSubtags: Record<string, string[]> = {}
    if (ids.length > 0) {
      const { data: stTagsFull } = await supabase
        .from('service_template_tags')
        .select('service_template_id, service_tags(tag_name)')
        .in('service_template_id', ids)
      for (const row of (stTagsFull ?? [])) {
        const tid = (row as any).service_template_id
        const name = (row as any).service_tags?.tag_name
        if (name) {
          if (!templateSubtags[tid]) templateSubtags[tid] = []
          templateSubtags[tid].push(name)
        }
      }
    }
    setTemplates((data ?? []).map((t: any) => ({
      id: t.id, display_name: t.display_name, is_active: t.is_active,
      location_name: Array.isArray(t.church_locations) ? t.church_locations[0]?.name ?? '' : t.church_locations?.name ?? '',
      primary_tag_name: Array.isArray(t.service_tags) ? t.service_tags[0]?.tag_name ?? 'No tag' : t.service_tags?.tag_name ?? 'No tag',
      subtag_names: templateSubtags[t.id] ?? [],
      schedules: (Array.isArray(t.service_schedule_versions) ? t.service_schedule_versions : []).filter((s: any) => s.is_active),
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
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {locations.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={newForm.location_id}
                  onChange={e => setNewForm(f => ({ ...f, location_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a tag</option>
                {allTags.filter(t => !t.effective_start_date && !t.effective_end_date).map(t => (
                  <option key={t.id} value={t.id}>{t.tag_name}</option>
                ))}
              </select>
            </div>

            {(() => {
              const subtags = allTags.filter(t => t.effective_start_date || t.effective_end_date)
              if (subtags.length === 0) return null
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Campaign &amp; Series Tags <span className="font-normal text-gray-400">(optional)</span></label>
                  <div className="space-y-1">
                    {subtags.map(t => {
                      const checked = newForm.subtag_ids.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setNewForm(f => ({
                            ...f,
                            subtag_ids: checked
                              ? f.subtag_ids.filter(id => id !== t.id)
                              : [...f.subtag_ids, t.id],
                          }))}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}
                        >
                          <span className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                            {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </span>
                          <span className="text-sm text-gray-900 flex-1">{t.tag_name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {addError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>}

            <button
              onClick={handleAdd}
              disabled={!newForm.display_name.trim() || !newForm.primary_tag_id || !newForm.location_id || isPending}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              {isPending ? 'Saving...' : 'Add service'}
            </button>
            <button onClick={() => setShowAdd(false)} className="w-full text-gray-400 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-3">
        {templates.map(tmpl => (
          <div key={tmpl.id} className="bg-white border border-gray-100 rounded-2xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] overflow-hidden">
            {/* Card Header */}
            <div className="px-4 pt-4 pb-3">
              <InlineEditField value={tmpl.display_name} onSave={v => saveName(tmpl.id, v)} aria-label={tmpl.display_name} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100 uppercase tracking-wide">
                  {tmpl.primary_tag_name}
                </span>
                {tmpl.location_name && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 text-gray-500 text-[10px] font-bold border border-gray-100">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {tmpl.location_name}
                  </span>
                )}
                {(tmpl.subtag_names ?? []).map(tag => (
                  <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-600 text-[10px] font-bold border border-purple-100">{tag}</span>
                ))}
              </div>
            </div>

            {/* Schedule Section */}
            <div className="border-t border-gray-50 px-4 py-3 bg-gray-50/60">
              {(tmpl.schedules ?? []).length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Schedule</p>
                  {tmpl.schedules.map((sched, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-center text-[10px] font-black bg-gray-900 text-white rounded px-1.5 py-0.5">{DAYS[sched.day_of_week]?.substring(0, 3).toUpperCase()}</span>
                      <span className="text-sm font-semibold text-gray-900">{fmtTime(sched.start_time)}</span>
                      {sched.end_time && <span className="text-xs text-gray-400">&ndash; {fmtTime(sched.end_time)}</span>}
                      {sched.timezone && <span className="text-[10px] text-gray-400 ml-auto">{sched.timezone.replace('America/', '')}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No active schedule &mdash; <Link href={`/settings/services/${tmpl.id}/schedule`} className="text-blue-500 not-italic font-medium">add one</Link></p>
              )}
            </div>

            {/* Actions Footer */}
            <div className="border-t border-gray-100 px-4 py-2.5 flex items-center">
              <Link href={`/settings/services/${tmpl.id}/schedule`} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Manage Schedule
              </Link>
              <button onClick={() => deactivate(tmpl.id)} className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors">
                Deactivate
              </button>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">No services yet. Tap <strong>+ Add</strong> to create your first.</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
