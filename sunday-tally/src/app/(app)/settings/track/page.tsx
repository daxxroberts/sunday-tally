'use client'

// ─────────────────────────────────────────────────────────────────────────
// T_TRACK — /settings/track — "What we track" tree editor (overhaul)
// IRIS_TTRACK_ELEMENT_MAP.md · 2026-06-08
//
// Nodes (service_tags) nest freely → ministries = groups = same table.
// Metrics (the leaves) carry a Kind (Attendance/Volunteers/Stats) and a MODE:
//   • Entry  — a number typed at this node; may point UP to a roll-up it feeds.
//   • Roll-up — lives on a parent; sums/avgs/maxes the children that point at it.
// Children point up EXPLICITLY (parent_metric_id). A roll-up with nobody pointing
// at it shows a setup warning.
//
// Left = tree (drag-to-nest via @dnd-kit + "Move under…" portaled fallback).
// Right = selected node: child groups (drill-in) + its metrics by Kind.
// Roles: owner/admin → full edit. editor/viewer → read-only.
// DS-2: no red. Fira numerals on counts.
//
// Shared types/helpers live in ./types.ts; sub-components in ./components/.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import MaybeLayout from '@/components/layouts/MaybeLayout'
import { createClient } from '@/lib/supabase/client'
import { fetchActiveServiceTags } from '@/lib/service-tags'
import { Ico } from '@/app/(app)/entries/ui'
import { buildGroupColorMap, type GroupColor } from '@/components/history-grid/group-colors'
import type { UserRole } from '@/types'
import { getOrphanMinistries, type OrphanMinistry } from '@/lib/ministryLinks'
import {
  createMinistry,
  updateMinistry,
  deactivateMinistry,
  addCount,
  renameCount,
  deactivateCount,
  setMetricMode,
  setMetricParent,
  setRollupOp,
} from './actions'
import type { TagRole, MetricMode, RollupOp } from './actions'
import {
  KIND_LABEL, canWrite,
  type KindCode, type Metric, type Ministry, type ReportingTag,
} from './types'
import { WhereCountedModal } from './components/WhereCountedModal'
import { AddNodeForm } from './components/AddNodeForm'
import { RootDropZone } from './components/RootDropZone'
import { MinistryTreeNode } from './components/MinistryTreeNode'
import { DetailPanel } from './components/DetailPanel'

// ─────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────

export function TrackPanel({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('viewer')
  const [churchId, setChurchId] = useState<string | null>(null)
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [reportingTags, setReportingTags] = useState<ReportingTag[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [addingMinistry, setAddingMinistry] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<TagRole>('ADULT_SERVICE')

  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  // TK2/TK5 — ministries whose instance metrics have no service to render on,
  // and the "Where is this counted?" modal target.
  const [orphans, setOrphans] = useState<OrphanMinistry[]>([])
  const [fixTagId, setFixTagId] = useState<string | null>(null)

  const write = canWrite(role)

  // ── Load ────────────────────────────────────────────────────────────────

  const load = useCallback(async (cid: string) => {
    // Canonical palette order (incl. the 0040 color fallback) lives in
    // fetchActiveServiceTags — keeps track / dashboard / History identical.
    const { rows } = await fetchActiveServiceTags(supabase, cid)
    const mins = rows as unknown as Ministry[]
    setMinistries(mins)

    const { data: rtRows } = await supabase
      .from('reporting_tags')
      .select('id, code, name')
      .eq('church_id', cid)
    setReportingTags((rtRows ?? []) as ReportingTag[])

    const minIds = mins.map(m => m.id)
    if (minIds.length === 0) { setMetrics([]); return }

    // ALL active metrics — instance AND period. Period metrics (weekly/monthly
    // church-wide, e.g. Giving) are shown with a cadence badge so they're
    // findable/editable here ("where do I edit Giving" — Builder 2026-06-10).
    // Defensive: select the roll-up columns; if they don't exist yet (migration
    // 0034 not applied), fall back to the base columns and treat all as 'entry'.
    const full = await supabase
      .from('metrics')
      .select('id, code, name, reporting_tag_id, is_canonical, is_active, ministry_tag_id, mode, rollup_op, parent_metric_id, scope, cadence')
      .eq('church_id', cid)
      .eq('is_active', true)
      .in('ministry_tag_id', minIds)
      .order('is_canonical', { ascending: false })

    if (!full.error && full.data) {
      setMetrics((full.data as Metric[]).map(m => ({ ...m, mode: m.mode ?? 'entry', rollup_op: m.rollup_op ?? null, parent_metric_id: m.parent_metric_id ?? null })))
      return
    }

    const basic = await supabase
      .from('metrics')
      .select('id, code, name, reporting_tag_id, is_canonical, is_active, ministry_tag_id, scope, cadence')
      .eq('church_id', cid)
      .eq('is_active', true)
      .in('ministry_tag_id', minIds)
      .order('is_canonical', { ascending: false })
    setMetrics(((basic.data ?? []) as Array<Omit<Metric, 'mode' | 'rollup_op' | 'parent_metric_id'>>)
      .map(m => ({ ...m, mode: 'entry' as MetricMode, rollup_op: null, parent_metric_id: null })))
  }, [supabase])

  // TK2/TK4 — recompute orphans whenever the tree reloads (cheap, 3 reads).
  const refreshOrphans = useCallback(async (cid: string) => {
    setOrphans(await getOrphanMinistries(supabase, cid))
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
      await refreshOrphans(membership.church_id)
      if (!cancelled) {
        setLoading(false)
        // Deep-links (window.location instead of useSearchParams: no Suspense
        // requirement). ?fix=<tagId> → open the "Where is this counted?" picker
        // (S2 banner on Services). ?select=<tagId> → just select that node —
        // the "Add metrics now" jump from a metric-less ministry on Services.
        const params = new URLSearchParams(window.location.search)
        const fix = params.get('fix')
        if (fix) setFixTagId(fix)
        const select = params.get('select')
        if (select) setSelectedId(select)
      }
    })()
    return () => { cancelled = true }
  }, [supabase, load, refreshOrphans])

  // ── Tree helpers ─────────────────────────────────────────────────────────

  const childrenOf = useCallback((parentId: string | null) =>
    ministries.filter(m => m.parent_tag_id === parentId), [ministries])

  const descendantIds = useCallback((id: string): Set<string> => {
    const result = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      for (const m of ministries) {
        if (m.parent_tag_id === cur && !result.has(m.id)) { result.add(m.id); stack.push(m.id) }
      }
    }
    return result
  }, [ministries])

  const ancestorIds = useCallback((id: string): Set<string> => {
    const out = new Set<string>()
    const byId = new Map(ministries.map(m => [m.id, m] as const))
    let cur = byId.get(id)?.parent_tag_id ?? null
    while (cur && !out.has(cur)) { out.add(cur); cur = byId.get(cur)?.parent_tag_id ?? null }
    return out
  }, [ministries])

  const validParentsFor = useCallback((min: Ministry): Ministry[] => {
    const blocked = descendantIds(min.id)
    return ministries.filter(m => m.id !== min.id && !blocked.has(m.id))
  }, [ministries, descendantIds])

  // Root-ancestor color, reusing the History palette so the two views match.
  const rootAncestorId = useCallback((id: string): string => {
    const byId = new Map(ministries.map(m => [m.id, m] as const))
    let cur = byId.get(id)
    while (cur && cur.parent_tag_id) cur = byId.get(cur.parent_tag_id)
    return cur?.id ?? id
  }, [ministries])

  const colorMap = useMemo(() => {
    const roots = ministries.filter(m => m.parent_tag_id === null)
    // Church-chosen ministry colors (0040) override the positional palette.
    const overrides = new Map<string, string>()
    for (const r of roots) if (r.color) overrides.set(r.id.toLowerCase(), r.color)
    return buildGroupColorMap(roots.map(m => `group_${m.id}`), overrides)
  }, [ministries])

  const colorForNode = useCallback((id: string): GroupColor | undefined =>
    colorMap.get(rootAncestorId(id).toLowerCase()), [colorMap, rootAncestorId])

  // Derived metric lookups
  const metricsByMinistry = useMemo(() => {
    const map = new Map<string, Metric[]>()
    for (const m of metrics) {
      const list = map.get(m.ministry_tag_id) ?? []
      list.push(m)
      map.set(m.ministry_tag_id, list)
    }
    return map
  }, [metrics])

  const unreferencedRollupIds = useMemo(() => {
    const referenced = new Set<string>()
    for (const m of metrics) if (m.parent_metric_id) referenced.add(m.parent_metric_id)
    const out = new Set<string>()
    for (const m of metrics) if (m.mode === 'rollup' && !referenced.has(m.id)) out.add(m.id)
    return out
  }, [metrics])

  const rtById = useMemo(() => new Map(reportingTags.map(r => [r.id, r] as const)), [reportingTags])

  const orphanIds = useMemo(() => new Set(orphans.map(o => o.tag_id)), [orphans])

  // Eligible roll-ups an entry metric may point at: same Kind, on an ancestor node.
  const eligibleParentsFor = useCallback((metric: Metric): Metric[] => {
    const anc = ancestorIds(metric.ministry_tag_id)
    return metrics.filter(m =>
      m.mode === 'rollup' && m.is_active &&
      m.reporting_tag_id === metric.reporting_tag_id &&
      anc.has(m.ministry_tag_id))
  }, [metrics, ancestorIds])

  // Fully-qualified label for a roll-up target: "Ministry › Kind › Metric name".
  // Includes the metric's own name so two same-kind roll-ups on one node (e.g.
  // two Volunteers roll-ups) are distinguishable — the name is the disambiguator.
  const ministryNameById = useMemo(() => new Map(ministries.map(m => [m.id, m.name] as const)), [ministries])
  const parentLabel = useCallback((m: Metric): string => {
    const minName = ministryNameById.get(m.ministry_tag_id) ?? 'Group'
    const rt = rtById.get(m.reporting_tag_id)
    const kind = rt ? (KIND_LABEL[rt.code as KindCode] ?? rt.name) : ''
    return kind ? `${minName} › ${kind} › ${m.name}` : `${minName} › ${m.name}`
  }, [ministryNameById, rtById])

  function countSummary(minId: string): string {
    const list = metricsByMinistry.get(minId) ?? []
    if (list.length === 0) {
      const kids = childrenOf(minId).length
      return kids > 0 ? `${kids} group${kids === 1 ? '' : 's'}` : 'No counts yet'
    }
    const byKind = new Map<string, number>()
    for (const m of list) byKind.set(m.reporting_tag_id, (byKind.get(m.reporting_tag_id) ?? 0) + 1)
    const parts: string[] = []
    for (const [rtId, n] of byKind) {
      const rt = rtById.get(rtId)
      if (!rt) continue
      parts.push(`${n} ${KIND_LABEL[rt.code as KindCode] ?? rt.name}`)
    }
    return parts.join(' · ') || 'No counts yet'
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  function addMinistry(parentId: string | null, name: string, tag_role: TagRole) {
    const trimmed = name.trim()
    if (!trimmed || !churchId) return
    setBusy(true)
    startTransition(async () => {
      const result = await createMinistry({ name: trimmed, tag_role, parent_tag_id: parentId })
      if (result.ok && result.data) {
        setSelectedId(result.data.id)
        setNewName('')
        setNewRole('ADULT_SERVICE')
        setAddingMinistry(false)
        await load(churchId)   // pick up the auto-seeded (maybe auto-wired) Attendance
        await refreshOrphans(churchId)
        // TK3 "Where is this counted?": children inherit their nearest linked
        // ancestor's services server-side (auto-link); a TOP-LEVEL ministry has
        // nothing to inherit, so open the two-door picker. Closable = "decide
        // later" (the orphan chip keeps pointing at it until resolved).
        if (!parentId) setFixTagId(result.data.id)
      } else if (result.error) {
        alert(result.error)
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
  async function handleColorChange(id: string, colorHex: string | null) {
    const res = await updateMinistry(id, { color: colorHex })
    if (!res.ok) { alert(res.error ?? 'Could not save the color (is migration 0040 applied?)'); return }
    setMinistries(prev => prev.map(m => m.id === id ? { ...m, color: colorHex } : m))
  }
  async function handleReparent(id: string, parentId: string | null) {
    setMinistries(prev => prev.map(m => m.id === id ? { ...m, parent_tag_id: parentId } : m))
    await updateMinistry(id, { parent_tag_id: parentId })
    // Always reload: applies the move authoritatively and picks up any roll-up
    // links the server self-healed (a node dragged out of its roll-up's subtree).
    if (churchId) await load(churchId)
  }
  async function handleDeactivateMinistry(id: string) {
    if (!confirm('Remove this ministry? This cannot be undone.')) return
    const result = await deactivateMinistry(id)
    if (result.ok) {
      setMinistries(prev => prev.filter(m => m.id !== id))
      setMetrics(prev => prev.filter(m => m.ministry_tag_id !== id))
      if (selectedId === id) setSelectedId(null)
    } else {
      alert(result.error ?? 'Could not remove ministry.')
    }
  }

  async function handleAddMetric(ministryId: string, kindCode: KindCode, name: string) {
    const result = await addCount({ ministryId, reportingTagCode: kindCode, name })
    if (result.ok && result.data) {
      setMetrics(prev => [...prev, { ...result.data!, ministry_tag_id: ministryId }])
    } else if (result.error) {
      alert(result.error)
    }
  }
  async function handleRenameMetric(metricId: string, name: string) {
    await renameCount(metricId, name)
    setMetrics(prev => prev.map(m => m.id === metricId ? { ...m, name } : m))
  }
  async function handleRemoveMetric(metricId: string) {
    await deactivateCount(metricId)
    // also unwire any children that pointed at it (mirror ON DELETE SET NULL intent)
    setMetrics(prev => prev
      .filter(m => m.id !== metricId)
      .map(m => m.parent_metric_id === metricId ? { ...m, parent_metric_id: null } : m))
  }
  async function handleSetMode(metricId: string, mode: MetricMode, op?: RollupOp) {
    const result = await setMetricMode(metricId, mode, op)
    if (result.ok && result.data) {
      setMetrics(prev => prev.map(m => m.id === metricId ? { ...m, ...result.data! } : m))
    } else if (result.error) {
      alert(result.error)
    }
  }
  async function handleSetParent(metricId: string, parentId: string | null) {
    const result = await setMetricParent(metricId, parentId)
    if (result.ok && result.data) {
      setMetrics(prev => prev.map(m => m.id === metricId ? { ...m, ...result.data! } : m))
    } else if (result.error) {
      alert(result.error)
    }
  }
  async function handleSetOp(metricId: string, op: RollupOp) {
    const result = await setRollupOp(metricId, op)
    if (result.ok && result.data) {
      setMetrics(prev => prev.map(m => m.id === metricId ? { ...m, ...result.data! } : m))
    } else if (result.error) {
      alert(result.error)
    }
  }

  // ── DnD ───────────────────────────────────────────────────────────────────
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )
  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId) return
    if (overId === '__root__') { if (ministries.find(m => m.id === activeId)?.parent_tag_id !== null) handleReparent(activeId, null); return }
    if (overId === activeId) return
    if (descendantIds(activeId).has(overId)) return
    if (ministries.find(m => m.id === activeId)?.parent_tag_id === overId) return
    handleReparent(activeId, overId)
  }

  const rootMinistries = childrenOf(null)
  const selected = ministries.find(m => m.id === selectedId) ?? null

  return (
    <MaybeLayout embedded={embedded} role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* Header hidden when embedded in the Setup workspace (tabs provide it). */}
        {!embedded && (
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
            Each ministry, the groups inside it, and the numbers you count.
          </p>
        </header>
        )}

        <main className="mx-auto max-w-5xl px-4 py-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(e: DragStartEvent) => setActiveDragId(String(e.active.id))}
              onDragCancel={() => setActiveDragId(null)}
              onDragEnd={(e) => { setActiveDragId(null); onDragEnd(e) }}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

                {/* Left tree */}
                <div className="lg:w-72 lg:shrink-0">
                  {write && !addingMinistry && (
                    <button
                      onClick={() => setAddingMinistry(true)}
                      title="Start something new at the top level — its own dashboard card, its own color, its own story. Good for a whole service (Experience, LifeKids), a campus, or something church-wide like Giving. If it's a breakdown of something that already exists, click that ministry first and use 'Add a group inside' instead."
                      className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#4F6EF7]/40 bg-[#4F6EF7]/5 px-4 py-3 text-[14px] font-semibold text-[#3D5BD4] transition-colors duration-200 hover:bg-[#4F6EF7]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                    >
                      <Ico.plus className="h-4 w-4" />
                      Add ministry or group
                    </button>
                  )}

                  {write && addingMinistry && (
                    <AddNodeForm
                      title="New ministry or group"
                      name={newName} setName={setNewName}
                      role={newRole} setRole={setNewRole}
                      busy={busy}
                      onAdd={() => addMinistry(null, newName, newRole)}
                      onCancel={() => { setAddingMinistry(false); setNewName('') }}
                    />
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {ministries.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-[14px] font-semibold text-slate-600">Add your first ministry.</p>
                        <p className="mt-1 text-[12px] text-slate-400">Use the button above to get started.</p>
                      </div>
                    ) : (
                      <>
                        {write && <RootDropZone />}
                        <ul>
                          {rootMinistries.map(m => (
                            <MinistryTreeNode
                              key={m.id}
                              ministry={m}
                              level={0}
                              selectedId={selectedId}
                              onSelect={setSelectedId}
                              childrenOf={childrenOf}
                              countSummary={countSummary}
                              colorForNode={colorForNode}
                              hasUnreferenced={(id) => (metricsByMinistry.get(id) ?? []).some(m2 => unreferencedRollupIds.has(m2.id))}
                              isOrphan={(id) => orphanIds.has(id)}
                              onFixOrphan={setFixTagId}
                              write={write}
                              onReparent={handleReparent}
                              validParentsFor={validParentsFor}
                            />
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>

                {/* Right detail */}
                <div className="flex-1 min-w-0">
                  {!selected ? (
                    <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <p className="text-[14px] text-slate-400">
                        {ministries.length === 0 ? 'Add a ministry to get started.' : 'Select a ministry to see its groups and counts.'}
                      </p>
                    </div>
                  ) : (
                    <DetailPanel
                      key={selected.id}
                      ministry={selected}
                      write={write}
                      metricsForNode={metricsByMinistry.get(selected.id) ?? []}
                      childNodes={childrenOf(selected.id)}
                      reportingTags={reportingTags}
                      color={colorForNode(selected.id)}
                      eligibleParentsFor={eligibleParentsFor}
                      parentLabel={parentLabel}
                      unreferencedRollupIds={unreferencedRollupIds}
                      childCountFor={(rollupId) => metrics.filter(m => m.parent_metric_id === rollupId && m.is_active).length}
                      onSelectChild={setSelectedId}
                      onAddGroupHere={(name, tag_role) => addMinistry(selected.id, name, tag_role)}
                      onRename={name => handleRenameMinistry(selected.id, name)}
                      onRoleChange={r => handleRoleChange(selected.id, r)}
                      onColorChange={c => handleColorChange(selected.id, c)}
                      onDeactivate={() => handleDeactivateMinistry(selected.id)}
                      onAddMetric={(kind, name) => handleAddMetric(selected.id, kind, name)}
                      onRenameMetric={handleRenameMetric}
                      onRemoveMetric={handleRemoveMetric}
                      onSetMode={handleSetMode}
                      onSetParent={handleSetParent}
                      onSetOp={handleSetOp}
                    />
                  )}
                </div>
              </div>
              <DragOverlay dropAnimation={null}>
                {activeDragId ? (
                  <div className="flex items-center gap-2 rounded-xl border-2 border-[#4F6EF7] bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-2xl">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-400" fill="currentColor" aria-hidden><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>
                    {ministries.find(m => m.id === activeDragId)?.name ?? 'Moving…'}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </main>

        {/* TK5 — "Where is this counted?" two-door picker */}
        {fixTagId && (
          <WhereCountedModal
            tagId={fixTagId}
            tagName={ministries.find(m => m.id === fixTagId)?.name ?? 'this ministry'}
            supabase={supabase}
            onClose={() => setFixTagId(null)}
            onDone={async () => {
              setFixTagId(null)
              if (churchId) { await load(churchId); await refreshOrphans(churchId) }
            }}
          />
        )}
      </div>
    </MaybeLayout>
  )
}

export default function TrackPage() {
  // /settings/track is retired — access goes through /settings/setup?tab=track.
  // This redirect preserves ?fix= and ?select= deep-link params.
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const qs = new URLSearchParams({ tab: 'track' })
    if (params.get('fix')) qs.set('fix', params.get('fix')!)
    if (params.get('select')) qs.set('select', params.get('select')!)
    window.location.replace(`/settings/setup?${qs}`)
  }
  return null
}
