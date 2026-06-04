'use client'

// T_TAGS — /settings/tags
// Manage service_tags (unified schema): list + add + InlineEditField + parent/child tree.
// Hierarchy is adjacency via parent_tag_id (no closure table, no RPC).

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

type TagRole = 'ADULT_SERVICE' | 'KIDS_MINISTRY' | 'YOUTH_MINISTRY' | 'OTHER'

interface Tag {
  id: string
  code: string
  name: string
  tag_role: TagRole
  parent_tag_id: string | null
  display_order: number | null
  is_active: boolean
}

const ROLE_OPTIONS: { value: TagRole; label: string }[] = [
  { value: 'ADULT_SERVICE', label: 'Adults' },
  { value: 'KIDS_MINISTRY', label: 'Kids' },
  { value: 'YOUTH_MINISTRY', label: 'Youth' },
  { value: 'OTHER', label: 'Other' },
]

function roleLabel(role: TagRole): string {
  return ROLE_OPTIONS.find(r => r.value === role)?.label ?? 'Other'
}

// Slug a name into an UPPERCASE code (non-alphanumeric → _, collapse repeats, trim).
function slugifyCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function SettingsTagsPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [churchId, setChurchId] = useState('')
  const [tags, setTags] = useState<Tag[]>([])

  // Add-tag form state
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<TagRole>('OTHER')
  const [newParentId, setNewParentId] = useState('')

  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership) return
      setRole(membership.role as UserRole)
      setChurchId(membership.church_id)

      const { data: tagsData } = await supabase
        .from('service_tags')
        .select('id, code, name, tag_role, parent_tag_id, display_order, is_active')
        .eq('church_id', membership.church_id)
        .eq('is_active', true)
        .order('display_order')
      setTags((tagsData as Tag[] | null) ?? [])
    })
  }, [])

  async function saveName(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('service_tags').update({ name }).eq('id', id)
    setTags(prev => prev.map(t => (t.id === id ? { ...t, name } : t)))
  }

  function saveRole(id: string, tag_role: TagRole) {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('service_tags').update({ tag_role }).eq('id', id)
      setTags(prev => prev.map(t => (t.id === id ? { ...t, tag_role } : t)))
    })
  }

  function saveParent(id: string, parentId: string) {
    const parent_tag_id = parentId || null
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('service_tags').update({ parent_tag_id }).eq('id', id)
      setTags(prev => prev.map(t => (t.id === id ? { ...t, parent_tag_id } : t)))
    })
  }

  function addTag() {
    const name = newName.trim()
    if (!name) return
    startTransition(async () => {
      const supabase = createClient()

      // Generate a unique code (per church) from the name slug.
      const base = slugifyCode(name) || 'TAG'
      const existing = new Set(tags.map(t => t.code))
      let code = base
      let suffix = 1
      while (existing.has(code)) {
        code = `${base}_${suffix}`
        suffix++
      }

      const { data, error } = await supabase
        .from('service_tags')
        .insert({
          church_id: churchId,
          name,
          code,
          tag_role: newRole,
          parent_tag_id: newParentId || null,
          is_active: true,
          is_custom: true,
        })
        .select('id, code, name, tag_role, parent_tag_id, display_order, is_active')
        .single()

      if (data && !error) {
        setTags(prev => [...prev, data as Tag])
        setNewName('')
        setNewRole('OTHER')
        setNewParentId('')
      }
    })
  }

  function removeTag(id: string) {
    // Block removal if this tag has active children (re-parent them first).
    const hasChildren = tags.some(t => t.parent_tag_id === id)
    if (hasChildren) {
      window.alert('This tag has child tags. Re-parent or remove its children first.')
      return
    }
    // Soft-delete only — a hard delete would cascade-delete this ministry's metrics.
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('service_tags').update({ is_active: false }).eq('id', id)
      setTags(prev => prev.filter(t => t.id !== id))
    })
  }

  // --- Tree helpers (adjacency via parent_tag_id) ---
  function getChildren(parentId: string): Tag[] {
    return tags.filter(t => t.parent_tag_id === parentId)
  }

  // Collect the set of descendant ids of `id` (for cycle-guarding reparent options).
  function descendantIds(id: string): Set<string> {
    const result = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const current = stack.pop()!
      for (const t of tags) {
        if (t.parent_tag_id === current && !result.has(t.id)) {
          result.add(t.id)
          stack.push(t.id)
        }
      }
    }
    return result
  }

  // Valid parent options for `tag`: any other tag that is not itself and not one
  // of its own descendants (prevents cycles).
  function parentOptionsFor(tag: Tag): Tag[] {
    const blocked = descendantIds(tag.id)
    return tags.filter(t => t.id !== tag.id && !blocked.has(t.id))
  }

  const rootTags = tags.filter(t => t.parent_tag_id === null)

  function renderTagNode(tag: Tag, level: number = 0) {
    const children = getChildren(tag.id)
    const parentOptions = parentOptionsFor(tag)
    return (
      <div key={tag.id}>
        <div
          className="px-4 py-3 flex items-center gap-3 bg-white border-b border-gray-100"
          style={{ paddingLeft: `${1 + Math.max(0, level * 2)}rem` }}
        >
          {level > 0 && <span className="text-gray-300 flex-shrink-0">↳</span>}
          <div className="flex-1 min-w-0">
            <InlineEditField value={tag.name} onSave={v => saveName(tag.id, v)} aria-label={tag.name} />
          </div>

          {/* Role */}
          <select
            value={tag.tag_role}
            onChange={e => saveRole(tag.id, e.target.value as TagRole)}
            disabled={isPending}
            aria-label={`Role for ${tag.name}`}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none text-gray-600 bg-white flex-shrink-0"
          >
            {ROLE_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* Parent (reparent) */}
          <select
            value={tag.parent_tag_id ?? ''}
            onChange={e => saveParent(tag.id, e.target.value)}
            disabled={isPending}
            aria-label={`Parent for ${tag.name}`}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none text-gray-600 bg-white flex-shrink-0 max-w-[8rem]"
          >
            <option value="">No parent (root)</option>
            {parentOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <button
            onClick={() => removeTag(tag.id)}
            disabled={isPending}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          >
            Remove
          </button>
        </div>
        {children.map(child => renderTagNode(child, level + 1))}
      </div>
    )
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="font-bold text-gray-900 text-sm">Ministry Tags</p>
      </div>

      <div className="px-4 py-4 space-y-6">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tags &amp; Hierarchies</p>
          <p className="text-xs text-gray-500 mb-3">Organize your ministries here. Nest a tag under a parent to build groups (e.g. Experience &rarr; LifeKids).</p>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.04)]">
            {rootTags.length === 0 && (
              <div className="px-4 py-4 text-center">
                <p className="text-sm text-gray-400">No tags yet.</p>
              </div>
            )}

            {rootTags.map(tag => renderTagNode(tag, 0))}

            {/* Add tag form */}
            <div className="px-4 py-3 flex flex-wrap items-center gap-2 bg-gray-50/50">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add a new tag..."
                className="flex-1 min-w-[8rem] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 placeholder-gray-400 bg-white"
              />
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as TagRole)}
                aria-label="New tag role"
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none text-gray-600 bg-white"
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <select
                value={newParentId}
                onChange={e => setNewParentId(e.target.value)}
                aria-label="New tag parent"
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none text-gray-600 bg-white"
              >
                <option value="">No parent (root)</option>
                {tags.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                onClick={addTag}
                disabled={!newName.trim() || isPending}
                className="text-sm bg-blue-600 text-white rounded-lg px-4 py-1.5 font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
