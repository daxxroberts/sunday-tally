'use client'

// ─────────────────────────────────────────────────────────────────────────
// T_TRACK — /settings/track — "What we track" tree editor
// IRIS_TTRACK_ELEMENT_MAP.md · Phase 1 · 2026-06-07
//
// Two-pane: Left = ministry/group tree (service_tags adjacency)
//           Right = selected node detail (name/role edit, Kind sections,
//                   count rows with rename/remove/reorder)
//
// Roles: owner/admin → full edit. editor/viewer → read-only (E-10).
// No drag-and-drop (Phase 1 = "Move under…" menu only, E-4).
// DS-2: no red. Fira numerals on counts.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import { Ico, accentForRole, roleLabel } from '@/app/(app)/entries/ui'
import type { UserRole } from '@/types'
import {
  createMinistry,
  updateMinistry,
  deactivateMinistry,
  addCount,
  renameCount,
  deactivateCount,
  reorderCounts,
} from './actions'
import type { TagRole, MetricRow } from './actions'

// ── Data shapes ────────────────────────────────────────────────────────────

interface ReportingTag { id: string; code: string; name: string }

interface Ministry {
  id: string
  code: string
  name: string
  tag_role: TagRole
  parent_tag_id: string | null
  display_order: number | null
  is_active: boolean
}

// Counts grouped by reporting_tag_id
type CountsByKind = Record<string, MetricRow[]>

// Phase-1 Kinds shown (not Giving — church-wide, not per-ministry here per IRIS E-6)
const PHASE1_KINDS = ['ATTENDANCE', 'VOLUNTEERS', 'RESPONSE_STAT'] as const
type KindCode = (typeof PHASE1_KINDS)[number]

const KIND_LABEL: Record<KindCode, string> = {
  ATTENDANCE: 'Attendance',
  VOLUNTEERS: 'Volunteers',
  RESPONSE_STAT: 'Stats',
}

const ROLE_OPTIONS: { value: TagRole; label: string }[] = [
  { value: 'ADULT_SERVICE', label: 'Adults' },
  { value: 'KIDS_MINISTRY', label: 'Kids' },
  { value: 'YOUTH_MINISTRY', label: 'Youth' },
  { value: 'OTHER', label: 'Other' },
]

function canWrite(role: UserRole) {
  return role === 'owner' || role === 'admin'
}

// ─────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────

export default function TrackPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('viewer')
  const [churchId, setChurchId] = useState<string | null>(null)
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [reportingTags, setReportingTags] = useState<ReportingTag[]>([])
  const [countsByMinistry, setCountsByMinistry] = useState<Record<string, CountsByKind>>({})
  const [loading, setLoading] = useState(true)

  // Selected node in the tree
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // "Add ministry" inline form
  const [addingMinistry, setAddingMinistry] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<TagRole>('ADULT_SERVICE')

  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const write = canWrite(role)

  // ── Load ────────────────────────────────────────────────────────────────

  const load = useCallback(async (cid: string) => {
    // 1. All active ministries for this church
    const { data: tagRows } = await supabase
      .from('service_tags')
      .select('id, code, name, tag_role, parent_tag_id, display_order, is_active')
      .eq('church_id', cid)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    const mins = (tagRows ?? []) as Ministry[]
    setMinistries(mins)

    // 2. Reporting tags (the 4 Kinds, system-seeded per church)
    const { data: rtRows } = await supabase
      .from('reporting_tags')
      .select('id, code, name')
      .eq('church_id', cid)
    setReportingTags((rtRows ?? []) as ReportingTag[])

    // 3. Metrics for all ministries (active, instance-scope)
    const minIds = mins.map(m => m.id)
    if (minIds.length > 0) {
      const { data: metricRows } = await supabase
        .from('metrics')
        .select('id, code, name, reporting_tag_id, is_canonical, is_active, display_order, ministry_tag_id')
        .eq('church_id', cid)
        .eq('is_active', true)
        .eq('scope', 'instance')
        .in('ministry_tag_id', minIds)
        .order('display_order', { ascending: true })

      type MetricWithMin = MetricRow & { ministry_tag_id: string }
      const grouped: Record<string, CountsByKind> = {}
      for (const m of (metricRows ?? []) as MetricWithMin[]) {
        if (!grouped[m.ministry_tag_id]) grouped[m.ministry_tag_id] = {}
        const kinds = grouped[m.ministry_tag_id]
        // group by reporting_tag_id
        if (!kinds[m.reporting_tag_id]) kinds[m.reporting_tag_id] = []
        kinds[m.reporting_tag_id].push({ id: m.id, code: m.code, name: m.name, reporting_tag_id: m.reporting_tag_id, is_canonical: m.is_canonical, is_active: m.is_active, display_order: m.display_order })
      }
      setCountsByMinistry(grouped)
    } else {
      setCountsByMinistry({})
    }
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership || cancelled) { if (!cancelled) setLoading(false); return }
      setRole(membership.role as UserRole)
      setChurchId(membership.church_id)
      await load(membership.church_id)
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, load])

  // ── Tree helpers ─────────────────────────────────────────────────────────

  function getChildren(parentId: string) {
    return ministries.filter(m => m.parent_tag_id === parentId)
  }
  function descendantIds(id: string): Set<string> {
    const result = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      for (const m of ministries) {
        if (m.parent_tag_id === cur && !result.has(m.id)) {
          result.add(m.id)
          stack.push(m.id)
        }
      }
    }
    return result
  }
  function validParentsFor(min: Ministry): Ministry[] {
    const blocked = descendantIds(min.id)
    return ministries.filter(m => m.id !== min.id && !blocked.has(m.id))
  }

  // Count summary for a tree node: "Attendance · Volunteers · Stats"
  function countSummary(minId: string): string {
    const kindCounts = countsByMinistry[minId] ?? {}
    const parts: string[] = []
    for (const [rtId, counts] of Object.entries(kindCounts)) {
      const rt = reportingTags.find(r => r.id === rtId)
      if (!rt) continue
      if (counts.length === 0) continue
      const label = KIND_LABEL[rt.code as KindCode] ?? rt.name
      parts.push(`${counts.length} ${label}`)
    }
    return parts.join(' · ') || 'No counts yet'
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  function handleAddMinistry() {
    const name = newName.trim()
    if (!name || !churchId) return
    setBusy(true)
    startTransition(async () => {
      const result = await createMinistry({ name, tag_role: newRole })
      if (result.ok && result.data) {
        setMinistries(prev => [...prev, result.data!])
        setSelectedId(result.data!.id)
        setNewName('')
        setNewRole('ADULT_SERVICE')
        setAddingMinistry(false)
        // reload metrics so the auto-seeded Attendance count appears
        if (churchId) await load(churchId)
      }
      setBusy(false)
    })
  }

  async function handleRenameMinistry(id: string, name: string) {
    await updateMinistry(id, { name })
    setMinistries(prev => prev.map(m => m.id === id ? { ...m, name } : m))
  }

  async function handleRoleChange(id: string, tag_role: TagRole) {
    await updateMinistry(id, { tag_role })
    setMinistries(prev => prev.map(m => m.id === id ? { ...m, tag_role } : m))
  }

  async function handleReparent(id: string, parentId: string | null) {
    await updateMinistry(id, { parent_tag_id: parentId })
    setMinistries(prev => prev.map(m => m.id === id ? { ...m, parent_tag_id: parentId } : m))
  }

  async function handleDeactivateMinistry(id: string) {
    if (!confirm('Remove this ministry? This cannot be undone.')) return
    const result = await deactivateMinistry(id)
    if (result.ok) {
      setMinistries(prev => prev.filter(m => m.id !== id))
      if (selectedId === id) setSelectedId(null)
    } else {
      alert(result.error ?? 'Could not remove ministry.')
    }
  }

  async function handleAddCount(ministryId: string, reportingTagCode: string, name: string) {
    const rt = reportingTags.find(r => r.code === reportingTagCode)
    if (!rt) return
    const result = await addCount({ ministryId, reportingTagCode, name })
    if (result.ok && result.data) {
      setCountsByMinistry(prev => {
        const copy = { ...prev }
        const kinds = { ...(copy[ministryId] ?? {}) }
        const list = [...(kinds[rt.id] ?? []), result.data!]
        kinds[rt.id] = list
        copy[ministryId] = kinds
        return copy
      })
    }
  }

  async function handleRenameCount(ministryId: string, rtId: string, metricId: string, name: string) {
    await renameCount(metricId, name)
    setCountsByMinistry(prev => {
      const copy = { ...prev }
      const kinds = { ...(copy[ministryId] ?? {}) }
      kinds[rtId] = (kinds[rtId] ?? []).map(m => m.id === metricId ? { ...m, name } : m)
      copy[ministryId] = kinds
      return copy
    })
  }

  async function handleDeactivateCount(ministryId: string, rtId: string, metricId: string) {
    await deactivateCount(metricId)
    setCountsByMinistry(prev => {
      const copy = { ...prev }
      const kinds = { ...(copy[ministryId] ?? {}) }
      kinds[rtId] = (kinds[rtId] ?? []).filter(m => m.id !== metricId)
      copy[ministryId] = kinds
      return copy
    })
  }

  async function handleReorder(ministryId: string, rtId: string, fromIdx: number, dir: -1 | 1) {
    const list = [...(countsByMinistry[ministryId]?.[rtId] ?? [])]
    const toIdx = fromIdx + dir
    if (toIdx < 0 || toIdx >= list.length) return
    const tmp = list[fromIdx]; list[fromIdx] = list[toIdx]; list[toIdx] = tmp
    // Optimistic update
    setCountsByMinistry(prev => {
      const copy = { ...prev }
      const kinds = { ...(copy[ministryId] ?? {}) }
      kinds[rtId] = list
      copy[ministryId] = kinds
      return copy
    })
    // Persist
    await reorderCounts(list.map(m => m.id))
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  const rootMinistries = ministries.filter(m => m.parent_tag_id === null)
  const selected = ministries.find(m => m.id === selectedId) ?? null

  return (
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>

        {/* ── E-1 · Header ──────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3.5">
            <button
              onClick={() => router.push('/settings')}
              aria-label="Back to Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.left className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#3D5BD4]">Settings</div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">What we track</h1>
            </div>
          </div>
          <p className="mx-auto max-w-5xl px-4 pb-3 text-[13px] text-slate-500">
            Each ministry and the numbers you count for it.
          </p>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

              {/* ── E-3 · Left tree panel ────────────────────────────── */}
              <div className="lg:w-72 lg:shrink-0">
                {/* E-2: Add ministry or group (owner/admin only) */}
                {write && !addingMinistry && (
                  <button
                    onClick={() => setAddingMinistry(true)}
                    className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#4F6EF7]/40 bg-[#4F6EF7]/5 px-4 py-3 text-[14px] font-semibold text-[#3D5BD4] transition-colors duration-200 hover:bg-[#4F6EF7]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                    aria-label="Add ministry or group"
                  >
                    <Ico.plus className="h-4 w-4" />
                    Add ministry or group
                  </button>
                )}

                {/* Inline add form */}
                {write && addingMinistry && (
                  <div className="mb-3 rounded-2xl border border-[#4F6EF7]/30 bg-white p-4 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">New ministry or group</p>
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddMinistry(); if (e.key === 'Escape') { setAddingMinistry(false); setNewName('') } }}
                      placeholder="Name (e.g. LifeKids)"
                      autoFocus
                      className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
                    />
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as TagRole)}
                      aria-label="Role"
                      className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-700 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30 bg-white"
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddMinistry}
                        disabled={!newName.trim() || busy}
                        className="flex-1 rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setAddingMinistry(false); setNewName('') }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Tree */}
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {ministries.length === 0 ? (
                    /* E-9: no ministries empty state */
                    <div className="px-6 py-10 text-center">
                      <p className="text-[14px] font-semibold text-slate-600">Add your first ministry.</p>
                      <p className="mt-1 text-[12px] text-slate-400">Use the button above to get started.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-50">
                      {rootMinistries.map(m => (
                        <MinistryTreeNode
                          key={m.id}
                          ministry={m}
                          level={0}
                          selectedId={selectedId}
                          onSelect={setSelectedId}
                          allMinistries={ministries}
                          getChildren={getChildren}
                          countsByMinistry={countsByMinistry}
                          reportingTags={reportingTags}
                          write={write}
                          onReparent={handleReparent}
                          validParentsFor={validParentsFor}
                          countSummary={countSummary}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* ── E-5 / E-6 / E-7 / E-8 · Right detail panel ─────── */}
              <div className="flex-1 min-w-0">
                {!selected ? (
                  <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <p className="text-[14px] text-slate-400">
                      {ministries.length === 0 ? 'Add a ministry to get started.' : 'Select a ministry to see its counts.'}
                    </p>
                  </div>
                ) : (
                  <DetailPanel
                    key={selected.id}
                    ministry={selected}
                    write={write}
                    countsByMinistry={countsByMinistry[selected.id] ?? {}}
                    reportingTags={reportingTags}
                    onRename={name => handleRenameMinistry(selected.id, name)}
                    onRoleChange={role => handleRoleChange(selected.id, role)}
                    onDeactivate={() => handleDeactivateMinistry(selected.id)}
                    onAddCount={(rtCode, name) => handleAddCount(selected.id, rtCode, name)}
                    onRenameCount={(rtId, metricId, name) => handleRenameCount(selected.id, rtId, metricId, name)}
                    onDeactivateCount={(rtId, metricId) => handleDeactivateCount(selected.id, rtId, metricId)}
                    onReorder={(rtId, fromIdx, dir) => handleReorder(selected.id, rtId, fromIdx, dir)}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MinistryTreeNode — E-3 + E-4
// ─────────────────────────────────────────────────────────────────────────

function MinistryTreeNode({
  ministry, level, selectedId, onSelect,
  allMinistries, getChildren, countsByMinistry, reportingTags, write,
  onReparent, validParentsFor, countSummary,
}: {
  ministry: Ministry
  level: number
  selectedId: string | null
  onSelect: (id: string) => void
  allMinistries: Ministry[]
  getChildren: (id: string) => Ministry[]
  countsByMinistry: Record<string, CountsByKind>
  reportingTags: ReportingTag[]
  write: boolean
  onReparent: (id: string, parentId: string | null) => void
  validParentsFor: (m: Ministry) => Ministry[]
  countSummary: (id: string) => string
}) {
  const [expanded, setExpanded] = useState(true)
  const [showMove, setShowMove] = useState(false)
  const children = getChildren(ministry.id)
  const hasChildren = children.length > 0
  const isSelected = selectedId === ministry.id
  const validParents = validParentsFor(ministry)

  return (
    <li>
      <div
        className={`group flex cursor-pointer items-center gap-2 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 ${isSelected ? 'bg-[#4F6EF7]/8 border-l-2 border-[#4F6EF7]' : ''}`}
        style={{ paddingLeft: `${1 + level * 1.25}rem` }}
        onClick={() => onSelect(ministry.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ministry.id) } }}
        aria-selected={isSelected}
      >
        {/* expand/collapse caret */}
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-700"
          >
            <Ico.chevron className={`h-4 w-4 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" aria-hidden />
        )}

        {/* accent bar + name */}
        <span className={`h-5 w-1 shrink-0 rounded-full ${accentForRole(ministry.tag_role)}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-slate-800">{ministry.name}</span>
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rolePillClasses(ministry.tag_role)}`}>
              {roleLabel(ministry.tag_role)}
            </span>
          </div>
          <div className="font-num mt-0.5 truncate text-[11px] text-slate-400">{countSummary(ministry.id)}</div>
        </div>

        {/* E-4: ▾ actions menu (owner/admin only) */}
        {write && (
          <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowMove(x => !x)}
              aria-label="Ministry actions"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.chevron className="h-4 w-4" />
            </button>
            {showMove && (
              <div className="absolute right-0 top-8 z-20 min-w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Move under…</p>
                <ul className="max-h-48 overflow-y-auto">
                  <li>
                    <button
                      onClick={() => { onReparent(ministry.id, null); setShowMove(false) }}
                      className="w-full px-3 py-2 text-left text-[13px] text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Top level
                    </button>
                  </li>
                  {validParents.map(p => (
                    <li key={p.id}>
                      <button
                        onClick={() => { onReparent(ministry.id, p.id); setShowMove(false) }}
                        className="w-full px-3 py-2 text-left text-[13px] text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                  {validParents.length === 0 && (
                    <li className="px-3 py-2 text-[12px] text-slate-400">No other ministries</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <ul className="divide-y divide-slate-50/50">
          {children.map(child => (
            <MinistryTreeNode
              key={child.id}
              ministry={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              allMinistries={allMinistries}
              getChildren={getChildren}
              countsByMinistry={countsByMinistry}
              reportingTags={reportingTags}
              write={write}
              onReparent={onReparent}
              validParentsFor={validParentsFor}
              countSummary={countSummary}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// DetailPanel — E-5 + E-6 + E-7 + E-8 + E-9 + E-10
// ─────────────────────────────────────────────────────────────────────────

function DetailPanel({
  ministry, write, countsByMinistry, reportingTags,
  onRename, onRoleChange, onDeactivate,
  onAddCount, onRenameCount, onDeactivateCount, onReorder,
}: {
  ministry: Ministry
  write: boolean
  countsByMinistry: CountsByKind
  reportingTags: ReportingTag[]
  onRename: (name: string) => Promise<void>
  onRoleChange: (role: TagRole) => Promise<void>
  onDeactivate: () => void
  onAddCount: (rtCode: string, name: string) => Promise<void>
  onRenameCount: (rtId: string, metricId: string, name: string) => Promise<void>
  onDeactivateCount: (rtId: string, metricId: string) => Promise<void>
  onReorder: (rtId: string, fromIdx: number, dir: -1 | 1) => Promise<void>
}) {
  return (
    <div className="space-y-4">
      {/* E-5: Detail header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className={`h-8 w-1.5 shrink-0 rounded-full ${accentForRole(ministry.tag_role)}`} aria-hidden />
          <div className="flex-1 min-w-0">
            {write ? (
              <InlineEditField
                value={ministry.name}
                onSave={onRename}
                aria-label="Ministry name"
                className="text-[17px] font-bold text-slate-900"
                inputClassName="text-[17px] font-bold"
              />
            ) : (
              <h2 className="text-[17px] font-bold text-slate-900">{ministry.name}</h2>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 px-5 py-3">
          {/* Role select */}
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-semibold text-slate-400">Role</label>
            {write ? (
              <select
                value={ministry.tag_role}
                onChange={e => onRoleChange(e.target.value as TagRole)}
                aria-label="Ministry role"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
              >
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            ) : (
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${rolePillClasses(ministry.tag_role)}`}>
                {roleLabel(ministry.tag_role)}
              </span>
            )}
          </div>

          {/* Mode chip (read-only Phase 1) */}
          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
            Counts each service
          </span>

          {/* Deactivate (owner/admin, amber confirm) */}
          {write && (
            <button
              onClick={onDeactivate}
              className="ml-auto rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-3 py-1.5 text-[12px] font-semibold text-[#B45309] transition-colors hover:bg-[#F59E0B]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/40"
            >
              Remove ministry
            </button>
          )}
        </div>
      </div>

      {/* E-6: Kind sections (Attendance, Volunteers, Stats) */}
      {PHASE1_KINDS.map(kindCode => {
        const rt = reportingTags.find(r => r.code === kindCode)
        if (!rt) return null
        const counts = countsByMinistry[rt.id] ?? []
        return (
          <KindSection
            key={kindCode}
            kindCode={kindCode}
            kindLabel={KIND_LABEL[kindCode]}
            rtId={rt.id}
            counts={counts}
            write={write}
            onAddCount={name => onAddCount(kindCode, name)}
            onRenameCount={(metricId, name) => onRenameCount(rt.id, metricId, name)}
            onDeactivateCount={metricId => onDeactivateCount(rt.id, metricId)}
            onReorder={(fromIdx, dir) => onReorder(rt.id, fromIdx, dir)}
          />
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// KindSection — E-6 + E-7 + E-8 + E-9
// ─────────────────────────────────────────────────────────────────────────

function KindSection({
  kindCode, kindLabel, counts, write,
  onAddCount, onRenameCount, onDeactivateCount, onReorder,
}: {
  kindCode: KindCode
  kindLabel: string
  rtId: string
  counts: MetricRow[]
  write: boolean
  onAddCount: (name: string) => Promise<void>
  onRenameCount: (metricId: string, name: string) => Promise<void>
  onDeactivateCount: (metricId: string) => Promise<void>
  onReorder: (fromIdx: number, dir: -1 | 1) => Promise<void>
}) {
  const [addingCount, setAddingCount] = useState(false)
  const [countName, setCountName] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAdd() {
    const name = countName.trim()
    if (!name) return
    setBusy(true)
    await onAddCount(name)
    setCountName('')
    setAddingCount(false)
    setBusy(false)
  }

  // Kind-specific accent colour (subtle header)
  const kindAccent = kindCode === 'ATTENDANCE'
    ? 'bg-[#4F6EF7]/8 border-[#4F6EF7]/20'
    : kindCode === 'VOLUNTEERS'
    ? 'bg-[#22C55E]/8 border-[#22C55E]/20'
    : 'bg-[#8B5CF6]/8 border-[#8B5CF6]/20'

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Section header */}
      <div className={`flex items-center justify-between gap-3 border-b px-5 py-3 ${kindAccent}`}>
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-700">{kindLabel}</h3>
        <span className="font-num text-[12px] font-semibold text-slate-400">{counts.length}</span>
      </div>

      {/* E-8: Count rows */}
      {counts.length === 0 ? (
        /* E-9: empty state within section */
        <div className="px-5 py-4 text-[13px] text-slate-400">
          {kindCode === 'ATTENDANCE'
            ? 'No attendance count yet — add one below.'
            : `No ${kindLabel.toLowerCase()} count yet.`}
          {!write && counts.length === 0 && ' Nothing tracked here yet.'}
        </div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {counts.map((metric, i) => (
            <CountRow
              key={metric.id}
              metric={metric}
              index={i}
              total={counts.length}
              write={write}
              onRename={name => onRenameCount(metric.id, name)}
              onDeactivate={() => onDeactivateCount(metric.id)}
              onMoveUp={() => onReorder(i, -1)}
              onMoveDown={() => onReorder(i, 1)}
            />
          ))}
        </ul>
      )}

      {/* E-9: "Add more above" hint when only seeded count present */}
      {counts.length === 1 && kindCode === 'ATTENDANCE' && write && (
        <p className="px-5 pb-1 text-[11px] text-slate-400">Add more above if needed.</p>
      )}

      {/* E-7: "+ Add a count" (owner/admin) */}
      {write && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          {!addingCount ? (
            <button
              onClick={() => setAddingCount(true)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[#3D5BD4] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.plus className="h-4 w-4" />
              + Add a count
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={countName}
                onChange={e => setCountName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAddingCount(false); setCountName('') } }}
                placeholder={`e.g. ${kindCode === 'ATTENDANCE' ? 'Main count' : kindCode === 'VOLUNTEERS' ? 'Band' : 'Decisions'}`}
                autoFocus
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
              />
              <button
                onClick={handleAdd}
                disabled={!countName.trim() || busy}
                className="rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
              >
                Add
              </button>
              <button
                onClick={() => { setAddingCount(false); setCountName('') }}
                className="rounded-lg px-2 py-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CountRow — E-8
// ─────────────────────────────────────────────────────────────────────────

function CountRow({
  metric, index, total, write,
  onRename, onDeactivate, onMoveUp, onMoveDown,
}: {
  metric: MetricRow
  index: number
  total: number
  write: boolean
  onRename: (name: string) => Promise<void>
  onDeactivate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <li className="group flex items-center gap-3 px-5 py-3 transition-colors duration-200 hover:bg-slate-50">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {/* E-8: ★ headline marker (read-only, auto) */}
        {metric.is_canonical && (
          <span className="font-num shrink-0 text-[13px] text-[#F59E0B]" title="Primary count for this kind" aria-label="Primary count">★</span>
        )}
        {write ? (
          <InlineEditField
            value={metric.name}
            onSave={onRename}
            aria-label={metric.name}
            className="text-[14px] font-medium text-slate-800"
          />
        ) : (
          <span className="text-[14px] font-medium text-slate-800">{metric.name}</span>
        )}
      </div>

      {write && (
        <div className="flex shrink-0 items-center gap-1">
          {/* E-8 ▴▾ reorder */}
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
          >
            <Ico.up className="h-4 w-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
          >
            <Ico.down className="h-4 w-4" />
          </button>

          {/* E-8 Remove — amber confirm, no red (DS-2) */}
          {confirmRemove ? (
            <span className="flex items-center gap-1">
              <button
                onClick={() => { onDeactivate(); setConfirmRemove(false) }}
                className="rounded-lg px-2 py-1 text-[12px] font-semibold text-[#B45309] transition-colors hover:bg-[#F59E0B]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/40"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="rounded-lg px-2 py-1 text-[12px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              aria-label={`Remove ${metric.name}`}
              className="ml-1 flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.trash className="h-3.5 w-3.5" />Remove
            </button>
          )}
        </div>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Role pill colour helper (no red — DS-2)
// ─────────────────────────────────────────────────────────────────────────
function rolePillClasses(role: string | null | undefined): string {
  switch (role) {
    case 'KIDS_MINISTRY': return 'bg-[#8B5CF6]/10 text-[#6D28D9]'
    case 'YOUTH_MINISTRY': return 'bg-[#06B6D4]/10 text-[#0E7490]'
    case 'ADULT_SERVICE': return 'bg-[#4F6EF7]/10 text-[#3D5BD4]'
    default: return 'bg-slate-100 text-slate-500'
  }
}
