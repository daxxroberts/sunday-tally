'use client'

// T_GIVING_SOURCES — /settings/giving-sources
// Manage giving_sources: InlineEditField + add + soft-delete
// D-036: sources are persistent | Cannot delete if giving_entries reference it

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

interface Source { id: string; source_name: string; source_code: string; is_active: boolean }

export default function SettingsGivingSourcesPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [newName, setNewName] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole); setChurchId(membership.church_id)
      const { data } = await supabase.from('giving_sources').select('*').eq('church_id', membership.church_id).eq('is_active', true).order('sort_order')
      setSources(data ?? [])
    })
  }, [])

  async function saveName(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('giving_sources').update({ source_name: name }).eq('id', id)
    setSources(prev => prev.map(s => s.id === id ? { ...s, source_name: name } : s))
  }

  function addSource() {
    const name = newName.trim()
    if (!name) return
    startTransition(async () => {
      const supabase = createClient()
      const code = `SOURCE_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now()}`
      const { data } = await supabase.from('giving_sources').insert({ church_id: churchId, source_name: name, source_code: code, is_active: true, sort_order: sources.length + 1 }).select('*').single()
      if (data) { setSources(prev => [...prev, data]); setNewName('') }
    })
  }

  function deactivate(id: string) {
    startTransition(async () => {
      const supabase = createClient()
      const { data: refs } = await supabase.from('giving_entries').select('id').eq('giving_source_id', id).limit(1)
      if ((refs?.length ?? 0) > 0) { alert('Cannot remove — this source has giving entries.'); return }
      await supabase.from('giving_sources').update({ is_active: false }).eq('id', id)
      setSources(prev => prev.filter(s => s.id !== id))
    })
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Giving Sources</p>
      </div>
      <div className="px-4 py-4">
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {sources.map(src => (
            <div key={src.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1">
                <InlineEditField value={src.source_name} onSave={v => saveName(src.id, v)} aria-label={src.source_name} />
              </div>
              <button onClick={() => deactivate(src.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
            </div>
          ))}
          <div className="px-4 py-3 flex items-center gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSource()} placeholder="Add a giving source..." className="flex-1 text-sm border-b border-gray-200 focus:border-gray-900 outline-none py-1 text-gray-900 placeholder-gray-400 bg-transparent" />
            <button onClick={addSource} disabled={!newName.trim() || isPending} className="text-sm text-blue-600 font-semibold hover:text-blue-700 disabled:opacity-40 transition-colors">Add</button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
