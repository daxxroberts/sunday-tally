'use client'

// T8 — Stats — /settings/stats
// Manage response_categories: seeded defaults + custom | InlineEditField | soft-delete

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, StatScope } from '@/types'

interface StatCategory { id: string; category_name: string; category_code: string; stat_scope: string; is_active: boolean; is_custom: boolean; display_order: number }

export default function SettingsStatsPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState('')
  const [cats, setCats] = useState<StatCategory[]>([])
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState<StatScope>('audience')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole); setChurchId(membership.church_id)
      const { data } = await supabase.from('response_categories').select('*').eq('church_id', membership.church_id).eq('is_active', true).order('display_order')
      setCats(data ?? [])
    })
  }, [])

  async function saveName(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('response_categories').update({ category_name: name }).eq('id', id)
    setCats(prev => prev.map(c => c.id === id ? { ...c, category_name: name } : c))
  }

  function addStat() {
    const name = newName.trim()
    if (!name) return
    startTransition(async () => {
      const supabase = createClient()
      const code = `CUSTOM_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now()}`
      const { data } = await supabase.from('response_categories').insert({ church_id: churchId, category_name: name, category_code: code, stat_scope: newScope, is_active: true, is_custom: true, display_order: cats.length + 1 }).select('*').single()
      if (data) { setCats(prev => [...prev, data]); setNewName('') }
    })
  }

  function deactivate(id: string) {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('response_categories').update({ is_active: false }).eq('id', id)
      setCats(prev => prev.filter(c => c.id !== id))
    })
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Stats</p>
      </div>

      <div className="px-4 py-4">
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {cats.map(cat => (
            <div key={cat.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1">
                <InlineEditField value={cat.category_name} onSave={v => saveName(cat.id, v)} aria-label={cat.category_name} disabled={!cat.is_custom} />
                <p className="text-xs text-gray-400 mt-0.5">{{ audience: 'Per audience', service: 'Whole service', day: 'Per day', week: 'Per week', month: 'Per month' }[cat.stat_scope] ?? cat.stat_scope} {!cat.is_custom ? '· Default' : '· Custom'}</p>
              </div>
              {cat.is_custom && (
                <button onClick={() => deactivate(cat.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
              )}
            </div>
          ))}
          <div className="px-4 py-3 space-y-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStat()} placeholder="Add a custom stat..." className="w-full text-sm border-b border-gray-200 focus:border-gray-900 outline-none py-1 text-gray-900 placeholder-gray-400 bg-transparent" />
            <div className="flex items-center gap-3">
              <select value={newScope} onChange={e => setNewScope(e.target.value as StatScope)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none">
                <option value="audience">Per audience (Main/Kids/Youth)</option>
                <option value="service">Whole service</option>
                <option value="day">Per day</option>
                <option value="week">Per week</option>
                <option value="month">Per month</option>
              </select>
              <button onClick={addStat} disabled={!newName.trim() || isPending} className="text-sm text-blue-600 font-semibold hover:text-blue-700 disabled:opacity-40 ml-auto transition-colors">Add</button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
