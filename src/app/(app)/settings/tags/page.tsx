'use client'

// T_TAGS — /settings/tags
// Manage service_tags: list + add + InlineEditField + date ranges for subtags

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

interface Tag { id: string; tag_name: string; tag_code: string; is_active: boolean; effective_start_date: string | null; effective_end_date: string | null }

export default function SettingsTagsPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [newName, setNewName] = useState('')
  // Subtag form state
  const [newSubName, setNewSubName] = useState('')
  const [newSubStart, setNewSubStart] = useState('')
  const [newSubEnd, setNewSubEnd] = useState('')
  const [showSubForm, setShowSubForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole); setChurchId(membership.church_id)
      const { data } = await supabase.from('service_tags').select('*').eq('church_id', membership.church_id).eq('is_active', true)
      setTags(data ?? [])
    })
  }, [])

  async function saveName(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('service_tags').update({ tag_name: name }).eq('id', id)
    setTags(prev => prev.map(t => t.id === id ? { ...t, tag_name: name } : t))
  }

  function addTag() {
    const name = newName.trim()
    if (!name) return
    startTransition(async () => {
      const supabase = createClient()
      const code = `TAG_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now()}`
      const { data } = await supabase.from('service_tags').insert({ church_id: churchId, tag_name: name, tag_code: code, is_active: true, effective_start_date: null, effective_end_date: null }).select('*').single()
      if (data) { setTags(prev => [...prev, data]); setNewName('') }
    })
  }

  function addSubtag() {
    const name = newSubName.trim()
    if (!name || !newSubStart) return
    startTransition(async () => {
      const supabase = createClient()
      const code = `SUBTAG_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now()}`
      const { data } = await supabase.from('service_tags').insert({
        church_id: churchId,
        tag_name: name,
        tag_code: code,
        is_active: true,
        effective_start_date: newSubStart,
        effective_end_date: newSubEnd || null,
      }).select('*').single()
      if (data) {
        setTags(prev => [...prev, data])
        setNewSubName(''); setNewSubStart(''); setNewSubEnd(''); setShowSubForm(false)
      }
    })
  }

  function deactivateSubtag(id: string) {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('service_tags').update({ is_active: false }).eq('id', id)
      setTags(prev => prev.filter(t => t.id !== id))
    })
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const primaryTags = tags.filter(t => !t.effective_start_date && !t.effective_end_date)
  const subtags = tags.filter(t => t.effective_start_date || t.effective_end_date)

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-bold text-gray-900 text-sm">Service Tags</p>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Primary tags */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Primary Tags</p>
          <p className="text-xs text-gray-500 mb-3">These permanently group your services in the dashboard — Morning, Evening, Midweek, etc.</p>
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.04)]">
            {primaryTags.map(tag => (
              <div key={tag.id} className="px-4 py-3">
                <InlineEditField value={tag.tag_name} onSave={v => saveName(tag.id, v)} aria-label={tag.tag_name} />
              </div>
            ))}
            <div className="px-4 py-3 flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add a tag..."
                className="flex-1 text-sm border-b border-gray-200 focus:border-blue-500 outline-none py-1 text-gray-900 placeholder-gray-400 bg-transparent"
              />
              <button onClick={addTag} disabled={!newName.trim() || isPending} className="text-sm text-blue-600 font-semibold hover:text-blue-700 disabled:opacity-40 transition-colors">Add</button>
            </div>
          </div>
        </div>

        {/* Campaign / Series subtags */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Campaign &amp; Series Tags</p>
          <p className="text-xs text-gray-500 mb-3">Time-bounded tags for campaigns or series — appear in the dashboard during their active date range.</p>

          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.04)]">
            {subtags.length === 0 && !showSubForm && (
              <div className="px-4 py-4 text-center">
                <p className="text-sm text-gray-400">No campaign tags yet.</p>
              </div>
            )}

            {subtags.map(tag => (
              <div key={tag.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <InlineEditField value={tag.tag_name} onSave={v => saveName(tag.id, v)} aria-label={tag.tag_name} />
                  <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                    {formatDate(tag.effective_start_date)} → {tag.effective_end_date ? formatDate(tag.effective_end_date) : 'ongoing'}
                  </p>
                </div>
                <button onClick={() => deactivateSubtag(tag.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5">Remove</button>
              </div>
            ))}

            {/* Add subtag form */}
            {showSubForm ? (
              <div className="px-4 py-4 space-y-3">
                <input
                  type="text"
                  value={newSubName}
                  onChange={e => setNewSubName(e.target.value)}
                  placeholder="Campaign name (e.g. Easter Series)"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Start date</label>
                    <input
                      type="date"
                      value={newSubStart}
                      onChange={e => setNewSubStart(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">End date <span className="normal-case font-normal">(optional)</span></label>
                    <input
                      type="date"
                      value={newSubEnd}
                      onChange={e => setNewSubEnd(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addSubtag}
                    disabled={!newSubName.trim() || !newSubStart || isPending}
                    className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40"
                  >
                    {isPending ? 'Saving...' : 'Add campaign tag'}
                  </button>
                  <button
                    onClick={() => { setShowSubForm(false); setNewSubName(''); setNewSubStart(''); setNewSubEnd('') }}
                    className="px-4 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3">
                <button
                  onClick={() => setShowSubForm(true)}
                  className="text-sm text-blue-600 font-semibold hover:text-blue-700 transition-colors"
                >
                  + Add campaign tag
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
