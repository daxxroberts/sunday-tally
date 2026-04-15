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
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (\!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (\!membership) return
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
    if (\!name) return
    startTransition(async () => {
      const supabase = createClient()
      const code = `TAG_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now()}`
      const { data } = await supabase.from('service_tags').insert({ church_id: churchId, tag_name: name, tag_code: code, is_active: true, effective_start_date: null, effective_end_date: null }).select('*').single()
      if (data) { setTags(prev => [...prev, data]); setNewName('') }
    })
  }

  const primaryTags = tags.filter(t => \!t.effective_start_date && \!t.effective_end_date)
  const subtags = tags.filter(t => t.effective_start_date || t.effective_end_date)

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Service Tags</p>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Primary tags */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Primary Tags</p>
          <p className="text-xs text-gray-500 mb-3">These group your services in the dashboard — Morning, Evening, Midweek, etc.</p>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {primaryTags.map(tag => (
              <div key={tag.id} className="px-4 py-3">
                <InlineEditField value={tag.tag_name} onSave={v => saveName(tag.id, v)} aria-label={tag.tag_name} />
              </div>
            ))}
            <div className="px-4 py-3 flex items-center gap-2">
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Add a tag..." className="flex-1 text-sm border-b border-gray-200 focus:border-gray-900 outline-none py-1 text-gray-900 placeholder-gray-400 bg-transparent" />
              <button onClick={addTag} disabled={\!newName.trim() || isPending} className="text-sm text-gray-900 font-medium disabled:opacity-40">Add</button>
            </div>
          </div>
        </div>

        {/* Subtags */}
        {subtags.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Campaign / Series Tags</p>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {subtags.map(tag => (
                <div key={tag.id} className="px-4 py-3">
                  <InlineEditField value={tag.tag_name} onSave={v => saveName(tag.id, v)} aria-label={tag.tag_name} />
                  <p className="text-xs text-gray-400 mt-0.5">{tag.effective_start_date} → {tag.effective_end_date ?? 'ongoing'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
