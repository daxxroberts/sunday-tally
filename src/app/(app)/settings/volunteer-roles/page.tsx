'use client'

// T7 — Volunteer Roles — /settings/volunteer-roles
// IRIS_T7_ELEMENT_MAP.md — list + InlineEditField + add + soft-delete
// D-005: category_code immutable | soft-delete only

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, AudienceGroupCode } from '@/types'

interface Category { id: string; category_name: string; category_code: string; audience_group_code: AudienceGroupCode; sort_order: number; is_active: boolean }

const GROUPS: AudienceGroupCode[] = ['MAIN', 'KIDS', 'YOUTH']
const GROUP_LABELS: Record<AudienceGroupCode, string> = { MAIN: 'Main', KIDS: 'Kids', YOUTH: 'Youth' }

export default function SettingsVolunteerRolesPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [newName, setNewName] = useState<Record<AudienceGroupCode, string>>({ MAIN: '', KIDS: '', YOUTH: '' })
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole); setChurchId(membership.church_id)
      const { data } = await supabase.from('volunteer_categories').select('*').eq('church_id', membership.church_id).eq('is_active', true).order('audience_group_code').order('sort_order')
      setCategories(data ?? [])
    })
  }, [])

  async function saveName(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('volunteer_categories').update({ category_name: name }).eq('id', id)
    setCategories(prev => prev.map(c => c.id === id ? { ...c, category_name: name } : c))
  }

  function addCategory(group: AudienceGroupCode) {
    const name = newName[group].trim()
    if (!name) return
    startTransition(async () => {
      const supabase = createClient()
      const code = `${group}_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now()}`
      const { data } = await supabase.from('volunteer_categories').insert({ church_id: churchId, category_name: name, category_code: code, audience_group_code: group, sort_order: categories.filter(c => c.audience_group_code === group).length + 1, is_active: true }).select('*').single()
      if (data) { setCategories(prev => [...prev, data]); setNewName(n => ({ ...n, [group]: '' })) }
    })
  }

  function deactivate(id: string) {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('volunteer_categories').update({ is_active: false }).eq('id', id)
      setCategories(prev => prev.filter(c => c.id !== id))
    })
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Volunteer Roles</p>
      </div>

      <div className="px-4 py-4 space-y-6">
        {GROUPS.map(group => (
          <div key={group}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{GROUP_LABELS[group]}</p>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {categories.filter(c => c.audience_group_code === group).map(cat => (
                <div key={cat.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <InlineEditField value={cat.category_name} onSave={v => saveName(cat.id, v)} aria-label={cat.category_name} />
                  </div>
                  <button onClick={() => deactivate(cat.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
                </div>
              ))}
              <div className="px-4 py-3 flex items-center gap-2">
                <input
                  type="text"
                  value={newName[group]}
                  onChange={e => setNewName(n => ({ ...n, [group]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addCategory(group)}
                  placeholder="Add a role..."
                  className="flex-1 text-sm border-b border-gray-200 focus:border-gray-900 outline-none py-1 text-gray-900 placeholder-gray-400 bg-transparent"
                />
                <button onClick={() => addCategory(group)} disabled={!newName[group].trim() || isPending} className="text-sm text-gray-900 font-medium disabled:opacity-40">Add</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}
