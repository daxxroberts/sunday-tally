'use client'

// T_GIVING_SOURCES — /settings/giving-sources
// Manage giving_sources: InlineEditField + add + soft-delete
// D-036: sources are persistent | Cannot delete if giving_entries reference it

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

interface Source {
  id: string
  source_name: string
  source_code: string
  is_active: boolean
  display_order: number
  serviceRows: number
  weeklyRows: number
  serviceTotal: number
  weeklyTotal: number
}

interface GivingSourceRow {
  id: string
  source_name: string
  source_code: string
  is_active: boolean
  display_order: number
}

interface GivingAmountRow {
  giving_source_id: string
  giving_amount: number | string | null
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function SettingsGivingSourcesPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [newName, setNewName] = useState('')
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const loadSources = useCallback(async (nextChurchId: string) => {
    const supabase = createClient()
    const { data: sourceRows } = await supabase
      .from('giving_sources')
      .select('id, source_name, source_code, is_active, display_order')
      .eq('church_id', nextChurchId)
      .order('is_active', { ascending: false })
      .order('display_order')

    const rows = (sourceRows ?? []) as GivingSourceRow[]
    const ids = rows.map(s => s.id)
    if (ids.length === 0) {
      setSources([])
      return
    }

    const [{ data: serviceRows }, { data: weeklyRows }] = await Promise.all([
      supabase
        .from('giving_entries')
        .select('giving_source_id, giving_amount')
        .in('giving_source_id', ids),
      supabase
        .from('church_period_giving')
        .select('giving_source_id, giving_amount')
        .in('giving_source_id', ids),
    ])

    const stats = new Map<string, { serviceRows: number; weeklyRows: number; serviceTotal: number; weeklyTotal: number }>()
    for (const id of ids) stats.set(id, { serviceRows: 0, weeklyRows: 0, serviceTotal: 0, weeklyTotal: 0 })

    for (const row of (serviceRows ?? []) as GivingAmountRow[]) {
      const stat = stats.get(row.giving_source_id)
      if (!stat) continue
      stat.serviceRows += 1
      stat.serviceTotal += Number(row.giving_amount ?? 0)
    }

    for (const row of (weeklyRows ?? []) as GivingAmountRow[]) {
      const stat = stats.get(row.giving_source_id)
      if (!stat) continue
      stat.weeklyRows += 1
      stat.weeklyTotal += Number(row.giving_amount ?? 0)
    }

    setSources(rows.map(src => ({ ...src, ...(stats.get(src.id) ?? { serviceRows: 0, weeklyRows: 0, serviceTotal: 0, weeklyTotal: 0 }) })))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase.from('church_memberships').select('role, church_id').eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole); setChurchId(membership.church_id)
      await loadSources(membership.church_id)
    })
  }, [loadSources])

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
      const { data } = await supabase.from('giving_sources').insert({ church_id: churchId, source_name: name, source_code: code, is_active: true, display_order: sources.length + 1 }).select('*').single()
      if (data) { setNewName(''); await loadSources(churchId) }
    })
  }

  function deactivate(id: string) {
    startTransition(async () => {
      const supabase = createClient()
      const [{ data: svcRefs }, { data: periodRefs }] = await Promise.all([
        supabase.from('giving_entries').select('id').eq('giving_source_id', id).limit(1),
        supabase.from('church_period_giving').select('id').eq('giving_source_id', id).limit(1),
      ])
      if ((svcRefs?.length ?? 0) > 0 || (periodRefs?.length ?? 0) > 0) {
        alert('Cannot remove — this source has giving history. Rename it instead.')
        return
      }
      await supabase.from('giving_sources').update({ is_active: false }).eq('id', id)
      await loadSources(churchId)
    })
  }

  function reactivate(id: string) {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('giving_sources').update({ is_active: true }).eq('id', id)
      await loadSources(churchId)
    })
  }

  function mergeSource(fromId: string) {
    const toId = mergeTargets[fromId]
    if (!toId) return
    const from = sources.find(s => s.id === fromId)
    const to = sources.find(s => s.id === toId)
    if (!from || !to) return

    if (!window.confirm(`Merge "${from.source_name}" into "${to.source_name}"? Existing rows for the same service or week will be summed.`)) {
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc('merge_giving_sources', {
        p_church_id: churchId,
        p_from_source_id: fromId,
        p_to_source_id: toId,
      })

      if (error) {
        alert(error.message || 'Merge failed')
        return
      }

      setMergeTargets(prev => {
        const next = { ...prev }
        delete next[fromId]
        return next
      })
      await loadSources(churchId)
    })
  }

  const activeSources = sources.filter(s => s.is_active)
  const inactiveSources = sources.filter(s => !s.is_active)

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-semibold text-gray-900 text-sm">Giving Sources</p>
      </div>
      <div className="px-4 py-4 space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Rename sources to preserve historical giving. Remove is only available for sources with no service or weekly giving rows.
        </div>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {activeSources.map(src => (
            <SourceRow
              key={src.id}
              source={src}
              sources={sources}
              mergeTarget={mergeTargets[src.id] ?? ''}
              isPending={isPending}
              onRename={saveName}
              onDeactivate={deactivate}
              onReactivate={reactivate}
              onMergeTargetChange={targetId => setMergeTargets(prev => ({ ...prev, [src.id]: targetId }))}
              onMerge={mergeSource}
            />
          ))}
          <div className="px-4 py-3 flex items-center gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSource()} placeholder="Add a giving source..." className="flex-1 text-sm border-b border-gray-200 focus:border-gray-900 outline-none py-1 text-gray-900 placeholder-gray-400 bg-transparent" />
            <button onClick={addSource} disabled={!newName.trim() || isPending} className="text-sm text-blue-600 font-semibold hover:text-blue-700 disabled:opacity-40 transition-colors">Add</button>
          </div>
        </div>

        {inactiveSources.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Inactive Sources With Audit Totals
            </div>
            {inactiveSources.map(src => (
              <SourceRow
                key={src.id}
                source={src}
                sources={sources}
                mergeTarget={mergeTargets[src.id] ?? ''}
                isPending={isPending}
                onRename={saveName}
                onDeactivate={deactivate}
                onReactivate={reactivate}
                onMergeTargetChange={targetId => setMergeTargets(prev => ({ ...prev, [src.id]: targetId }))}
                onMerge={mergeSource}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function SourceRow({
  source,
  sources,
  mergeTarget,
  isPending,
  onRename,
  onDeactivate,
  onReactivate,
  onMergeTargetChange,
  onMerge,
}: {
  source: Source
  sources: Source[]
  mergeTarget: string
  isPending: boolean
  onRename: (id: string, name: string) => Promise<void>
  onDeactivate: (id: string) => void
  onReactivate: (id: string) => void
  onMergeTargetChange: (targetId: string) => void
  onMerge: (id: string) => void
}) {
  const hasHistory = source.serviceRows > 0 || source.weeklyRows > 0
  const mergeOptions = sources.filter(s => s.id !== source.id && s.is_active)

  return (
    <div className={`px-4 py-3 ${source.is_active ? '' : 'bg-gray-50'}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <InlineEditField value={source.source_name} onSave={v => onRename(source.id, v)} aria-label={source.source_name} />
            {!source.is_active && (
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">Inactive</span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {source.serviceRows} service rows ({formatCurrency(source.serviceTotal)}) · {source.weeklyRows} weekly rows ({formatCurrency(source.weeklyTotal)})
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {!source.is_active && (
            <button onClick={() => onReactivate(source.id)} disabled={isPending} className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40">
              Reactivate
            </button>
          )}

          {hasHistory && mergeOptions.length > 0 && (
            <>
              <select
                value={mergeTarget}
                onChange={e => onMergeTargetChange(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-gray-400"
              >
                <option value="">Merge into...</option>
                {mergeOptions.map(target => (
                  <option key={target.id} value={target.id}>{target.source_name}</option>
                ))}
              </select>
              <button onClick={() => onMerge(source.id)} disabled={!mergeTarget || isPending} className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40">
                Merge
              </button>
            </>
          )}

          {!hasHistory && source.is_active && (
            <button onClick={() => onDeactivate(source.id)} disabled={isPending} className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40">
              Remove
            </button>
          )}

          {hasHistory && source.is_active && (
            <span className="text-xs text-gray-400">Rename or merge</span>
          )}
        </div>
      </div>
    </div>
  )
}
