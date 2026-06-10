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
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, useDraggable, useDroppable, closestCenter,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import AppLayout from '@/components/layouts/AppLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import { Ico, roleLabel } from '@/app/(app)/entries/ui'
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
  linkMinistryToServices,
  convertMinistryToWeekly,
} from './actions'
import type { TagRole, MetricRow, MetricMode, RollupOp } from './actions'

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

/** A metric with its owning node id (flat list is the source of truth). */
type Metric = MetricRow & { ministry_tag_id: string }

const PHASE1_KINDS = ['ATTENDANCE', 'VOLUNTEERS', 'RESPONSE_STAT'] as const
type KindCode = (typeof PHASE1_KINDS)[number]

const KIND_LABEL: Record<KindCode, string> = {
  ATTENDANCE: 'Attendance',
  VOLUNTEERS: 'Volunteers',
  RESPONSE_STAT: 'Stats',
}
const KIND_PLACEHOLDER: Record<KindCode, string> = {
  ATTENDANCE: 'Attendance',
  VOLUNTEERS: 'Band',
  RESPONSE_STAT: 'Baptisms',
}

const ROLE_OPTIONS: { value: TagRole; label: string }[] = [
  { value: 'ADULT_SERVICE', label: 'Adults' },
  { value: 'KIDS_MINISTRY', label: 'Kids' },
  { value: 'YOUTH_MINISTRY', label: 'Youth' },
  { value: 'OTHER', label: 'Other' },
]

const OP_LABEL: Record<RollupOp, string> = { sum: 'Sum', avg: 'Average', max: 'Largest' }

function canWrite(role: UserRole) {
  return role === 'owner' || role === 'admin'
}

// Muted, low-emphasis role chip — the colored accent bar already carries the
// group color, so the role reads as quiet metadata (Builder feedback 2026-06-08).
function rolePillClasses(): string {
  return 'bg-slate-100 text-slate-400'
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
    const { data: tagRows } = await supabase
      .from('service_tags')
      .select('id, code, name, tag_role, parent_tag_id, display_order, is_active')
      .eq('church_id', cid)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    const mins = (tagRows ?? []) as Ministry[]
    setMinistries(mins)

    const { data: rtRows } = await supabase
      .from('reporting_tags')
      .select('id, code, name')
      .eq('church_id', cid)
    setReportingTags((rtRows ?? []) as ReportingTag[])

    const minIds = mins.map(m => m.id)
    if (minIds.length === 0) { setMetrics([]); return }

    // Defensive: select the roll-up columns; if they don't exist yet (migration
    // 0034 not applied), fall back to the base columns and treat all as 'entry'.
    const full = await supabase
      .from('metrics')
      .select('id, code, name, reporting_tag_id, is_canonical, is_active, ministry_tag_id, mode, rollup_op, parent_metric_id')
      .eq('church_id', cid)
      .eq('is_active', true)
      .eq('scope', 'instance')
      .in('ministry_tag_id', minIds)
      .order('is_canonical', { ascending: false })

    if (!full.error && full.data) {
      setMetrics((full.data as Metric[]).map(m => ({ ...m, mode: m.mode ?? 'entry', rollup_op: m.rollup_op ?? null, parent_metric_id: m.parent_metric_id ?? null })))
      return
    }

    const basic = await supabase
      .from('metrics')
      .select('id, code, name, reporting_tag_id, is_canonical, is_active, ministry_tag_id')
      .eq('church_id', cid)
      .eq('is_active', true)
      .eq('scope', 'instance')
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
        // ?fix=<tagId> deep-link (S2 banner on Services) → open the picker.
        // window.location instead of useSearchParams: no Suspense requirement.
        const fix = new URLSearchParams(window.location.search).get('fix')
        if (fix) setFixTagId(fix)
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
    return buildGroupColorMap(roots.map(m => `group_${m.id}`))
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
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
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
    </AppLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// WhereCountedModal — TK5 (IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md §3).
// Two doors, plain labels: count it AT services (Door A → junction links) or
// JUST weekly/monthly church-wide (Door B → metrics become period-scoped and
// live in the Stat Entries tab — the Giving model: convert, never link).
// ─────────────────────────────────────────────────────────────────────────
function WhereCountedModal({ tagId, tagName, supabase, onClose, onDone }: {
  tagId: string
  tagName: string
  supabase: ReturnType<typeof createClient>
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const [services, setServices] = useState<{ id: string; name: string; locationName: string | null }[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [cadence, setCadence] = useState<'week' | 'month'>('week')
  const [working, setWorking] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loadingSvcs, setLoadingSvcs] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('service_templates')
        .select('id, display_name, church_locations(name)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      type Row = { id: string; display_name: string | null; church_locations: { name: string } | { name: string }[] | null }
      setServices(((data ?? []) as Row[]).map(r => ({
        id: r.id,
        name: r.display_name ?? 'Service',
        locationName: (Array.isArray(r.church_locations) ? r.church_locations[0]?.name : r.church_locations?.name) ?? null,
      })))
      setLoadingSvcs(false)
    })()
    return () => { cancelled = true }
  }, [supabase])

  async function doorA() {
    if (checked.size === 0 || working) return
    setWorking(true); setErr(null)
    const res = await linkMinistryToServices({ tagId, templateIds: Array.from(checked) })
    setWorking(false)
    if (!res.ok) { setErr(res.error ?? 'Could not link.'); return }
    await onDone()
  }

  async function doorB() {
    if (working) return
    setWorking(true); setErr(null)
    const res = await convertMinistryToWeekly({ tagId, cadence })
    setWorking(false)
    if (!res.ok) { setErr(res.error ?? 'Could not convert.'); return }
    await onDone()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-[16px] font-bold text-slate-900">Where is <span className="text-[#3D5BD4]">{tagName}</span> counted?</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          Its counts won&apos;t appear on any entry screen until you pick one.
        </p>

        {/* Door A — at a service */}
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <p className="text-[13px] font-semibold text-slate-800">At a service</p>
          <p className="text-[11px] text-slate-400">Each gathering gets its own count.</p>
          {loadingSvcs ? (
            <div className="mt-2 h-8 animate-pulse rounded-lg bg-slate-100" />
          ) : services.length === 0 ? (
            <p className="mt-2 text-[12px] text-slate-400">No active services yet — create one under Settings → Services.</p>
          ) : (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {services.map(s => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked.has(s.id)}
                    onChange={() => setChecked(prev => {
                      const next = new Set(prev)
                      if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                      return next
                    })}
                    className="h-4 w-4 rounded border-slate-300 text-[#4F6EF7] focus:ring-[#4F6EF7]/40"
                  />
                  <span className="font-medium">{s.name}</span>
                  {s.locationName && <span className="text-[11px] text-slate-400">· {s.locationName}</span>}
                </label>
              ))}
            </div>
          )}
          <button
            onClick={() => void doorA()}
            disabled={working || checked.size === 0}
            className="mt-2 rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40"
          >
            {working ? 'Saving…' : `Count it ${checked.size > 1 ? 'at these services' : 'there'}`}
          </button>
        </div>

        {/* Door B — weekly/monthly church-wide */}
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <p className="text-[13px] font-semibold text-slate-800">Just weekly or monthly, church-wide</p>
          <p className="text-[11px] text-slate-400">No service — it shows in the Stat Entries tab. (How Giving works.)</p>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={cadence}
              onChange={e => setCadence(e.target.value as 'week' | 'month')}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
            >
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <button
              onClick={() => void doorB()}
              disabled={working}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-[#4F6EF7]/40 hover:bg-[#4F6EF7]/5 disabled:opacity-40"
            >
              {working ? 'Converting…' : 'Make it a stat entry'}
            </button>
          </div>
        </div>

        {err && (
          <p className="mt-3 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-[12px] font-medium text-[#B45309]">{err}</p>
        )}

        <button onClick={onClose} className="mt-3 w-full rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600">
          Decide later
        </button>
      </div>
    </div>,
    document.body,
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Add-node form (top-level or "inside a group")
// ─────────────────────────────────────────────────────────────────────────
function AddNodeForm({
  title, name, setName, role, setRole, busy, onAdd, onCancel,
}: {
  title: string
  name: string; setName: (v: string) => void
  role: TagRole; setRole: (v: TagRole) => void
  busy: boolean
  onAdd: () => void; onCancel: () => void
}) {
  return (
    <div className="mb-3 rounded-2xl border border-[#4F6EF7]/30 bg-white p-4 shadow-sm">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onAdd(); if (e.key === 'Escape') onCancel() }}
        placeholder="Name (e.g. LifeKids)"
        autoFocus
        className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
      />
      <select
        value={role}
        onChange={e => setRole(e.target.value as TagRole)}
        aria-label="Role"
        className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-700 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
      >
        {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <div className="flex gap-2">
        <button
          onClick={onAdd}
          disabled={!name.trim() || busy}
          className="flex-1 rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Root drop zone (drag a node here → top level)
// ─────────────────────────────────────────────────────────────────────────
function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: '__root__' })
  return (
    <div
      ref={setNodeRef}
      className={`border-b border-dashed px-4 py-1.5 text-center text-[9px] font-medium uppercase tracking-wider transition-colors ${isOver ? 'border-[#4F6EF7] bg-[#4F6EF7]/20 text-[#3D5BD4] ring-2 ring-inset ring-[#4F6EF7]' : 'border-slate-200 text-slate-300'}`}
    >
      Top level
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MinistryTreeNode — draggable + droppable
// ─────────────────────────────────────────────────────────────────────────
function MinistryTreeNode({
  ministry, level, selectedId, onSelect,
  childrenOf, countSummary, colorForNode, hasUnreferenced, isOrphan, onFixOrphan, write,
  onReparent, validParentsFor,
}: {
  ministry: Ministry
  level: number
  selectedId: string | null
  onSelect: (id: string) => void
  childrenOf: (id: string | null) => Ministry[]
  countSummary: (id: string) => string
  colorForNode: (id: string) => GroupColor | undefined
  hasUnreferenced: (id: string) => boolean
  /** TK2 — instance metrics with no service to render on (the invisible-ministry trap). */
  isOrphan: (id: string) => boolean
  onFixOrphan: (id: string) => void
  write: boolean
  onReparent: (id: string, parentId: string | null) => void
  validParentsFor: (m: Ministry) => Ministry[]
}) {
  const [expanded, setExpanded] = useState(true)
  const [movePos, setMovePos] = useState<{ top: number; left: number } | null>(null)
  const children = childrenOf(ministry.id)
  const hasChildren = children.length > 0
  const isSelected = selectedId === ministry.id
  const color = colorForNode(ministry.id)

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: ministry.id })
  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({ id: ministry.id })

  return (
    <li>
      <div
        ref={setDropRef}
        className={`group flex cursor-pointer items-center gap-2 border-b border-slate-50 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 ${isSelected ? 'bg-[#4F6EF7]/8' : ''} ${isOver ? 'bg-[#4F6EF7]/20 ring-2 ring-inset ring-[#4F6EF7]' : ''} ${isDragging ? 'opacity-30' : ''}`}
        style={{ paddingLeft: `${0.75 + level * 1.1}rem`, ...(isSelected ? { boxShadow: `inset 2px 0 0 ${color?.strong ?? '#4F6EF7'}` } : {}) }}
        onClick={() => onSelect(ministry.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ministry.id) } }}
      >
        {/* drag handle (owner/admin) */}
        {write ? (
          <button
            ref={setDragRef}
            {...attributes}
            {...listeners}
            onClick={e => e.stopPropagation()}
            aria-label="Drag to move"
            className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>
          </button>
        ) : <span className="h-5 w-4 shrink-0" aria-hidden />}

        {/* expand/collapse caret */}
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-700"
          >
            <Ico.chevron className={`h-4 w-4 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
          </button>
        ) : <span className="h-5 w-5 shrink-0" aria-hidden />}

        {/* accent + name */}
        <span className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: color?.strong ?? '#cbd5e1' }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-slate-800">{ministry.name}</span>
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${rolePillClasses()}`}>
              {roleLabel(ministry.tag_role)}
            </span>
            {hasUnreferenced(ministry.id) && (
              <span className="shrink-0 text-[11px] text-[#B45309]" title="A roll-up here has nothing pointing at it">⚠</span>
            )}
            {/* TK2 — orphan chip: counted nowhere → click opens "Where is this counted?" */}
            {isOrphan(ministry.id) && (
              <button
                onClick={e => { e.stopPropagation(); onFixOrphan(ministry.id) }}
                title="This ministry's counts have no service to appear on — click to fix"
                className="shrink-0 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#B45309] transition-colors hover:bg-[#F59E0B]/10"
              >
                Not counted anywhere
              </button>
            )}
          </div>
          <div className="font-num mt-0.5 truncate text-[11px] text-slate-400">{countSummary(ministry.id)}</div>
        </div>

        {/* Move under… portaled menu (keyboard/click fallback) */}
        {write && (
          <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={(e) => {
                if (movePos) { setMovePos(null); return }
                const r = e.currentTarget.getBoundingClientRect()
                setMovePos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 200) })
              }}
              aria-label="Move under…"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <Ico.chevron className="h-4 w-4" />
            </button>
            {movePos && (
              <MoveMenu
                pos={movePos}
                validParents={validParentsFor(ministry)}
                onPick={(pid) => { onReparent(ministry.id, pid); setMovePos(null) }}
                onClose={() => setMovePos(null)}
              />
            )}
          </div>
        )}
      </div>

      {hasChildren && expanded && (
        <ul>
          {children.map(child => (
            <MinistryTreeNode
              key={child.id}
              ministry={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              childrenOf={childrenOf}
              countSummary={countSummary}
              colorForNode={colorForNode}
              hasUnreferenced={hasUnreferenced}
              isOrphan={isOrphan}
              onFixOrphan={onFixOrphan}
              write={write}
              onReparent={onReparent}
              validParentsFor={validParentsFor}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MoveMenu — portaled so it can't be clipped by the tree column overflow
// ─────────────────────────────────────────────────────────────────────────
function MoveMenu({
  pos, validParents, onPick, onClose,
}: {
  pos: { top: number; left: number }
  validParents: Ministry[]
  onPick: (parentId: string | null) => void
  onClose: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [onClose])
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        style={{ top: pos.top, left: pos.left }}
      >
        <p className="px-3 pt-2 pb-1 text-[9px] font-medium uppercase tracking-wider text-slate-400">Move under…</p>
        <ul className="max-h-60 overflow-y-auto">
          <li>
            <button onClick={() => onPick(null)} className="w-full px-3 py-2 text-left text-[13px] text-slate-600 transition-colors hover:bg-slate-50">Top level</button>
          </li>
          {validParents.map(p => (
            <li key={p.id}>
              <button onClick={() => onPick(p.id)} className="w-full px-3 py-2 text-left text-[13px] text-slate-600 transition-colors hover:bg-slate-50">{p.name}</button>
            </li>
          ))}
          {validParents.length === 0 && <li className="px-3 py-2 text-[12px] text-slate-400">No other ministries</li>}
        </ul>
      </div>
    </>,
    document.body,
  )
}

// ─────────────────────────────────────────────────────────────────────────
// DetailPanel
// ─────────────────────────────────────────────────────────────────────────
function DetailPanel({
  ministry, write, metricsForNode, childNodes, reportingTags, color,
  eligibleParentsFor, parentLabel, unreferencedRollupIds, childCountFor,
  onSelectChild, onAddGroupHere,
  onRename, onRoleChange, onDeactivate,
  onAddMetric, onRenameMetric, onRemoveMetric, onSetMode, onSetParent, onSetOp,
}: {
  ministry: Ministry
  write: boolean
  metricsForNode: Metric[]
  childNodes: Ministry[]
  reportingTags: ReportingTag[]
  color?: GroupColor
  eligibleParentsFor: (m: Metric) => Metric[]
  parentLabel: (m: Metric) => string
  unreferencedRollupIds: Set<string>
  childCountFor: (rollupId: string) => number
  onSelectChild: (id: string) => void
  onAddGroupHere: (name: string, role: TagRole) => void
  onRename: (name: string) => Promise<void>
  onRoleChange: (role: TagRole) => Promise<void>
  onDeactivate: () => void
  onAddMetric: (kind: KindCode, name: string) => Promise<void>
  onRenameMetric: (metricId: string, name: string) => Promise<void>
  onRemoveMetric: (metricId: string) => Promise<void>
  onSetMode: (metricId: string, mode: MetricMode, op?: RollupOp) => Promise<void>
  onSetParent: (metricId: string, parentId: string | null) => Promise<void>
  onSetOp: (metricId: string, op: RollupOp) => Promise<void>
}) {
  const [addingGroup, setAddingGroup] = useState(false)
  const [gName, setGName] = useState('')
  const [gRole, setGRole] = useState<TagRole>(ministry.tag_role)

  const byKind = useMemo(() => {
    const map = new Map<string, Metric[]>()
    for (const m of metricsForNode) {
      const list = map.get(m.reporting_tag_id) ?? []
      list.push(m); map.set(m.reporting_tag_id, list)
    }
    return map
  }, [metricsForNode])

  const accent = color?.strong ?? '#4F6EF7'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
          <div className="flex-1 min-w-0">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 cursor-help"
              title={ministry.parent_tag_id
                ? 'A group lives inside a ministry. It can hold its own groups and counts, and roll its numbers up into its parent.'
                : 'A ministry is a top-level group. It reports on its own and can hold groups inside it. Everything you track lives under a ministry.'}
            >
              {ministry.parent_tag_id ? 'Group' : 'Ministry'}
            </span>
            {write ? (
              <InlineEditField value={ministry.name} onSave={onRename} aria-label="Ministry name" className="text-[17px] font-bold text-slate-900" inputClassName="text-[17px] font-bold" />
            ) : (
              <h2 className="text-[17px] font-bold text-slate-900">{ministry.name}</h2>
            )}
            <p className="mt-0.5 text-[12px] text-slate-400">Everything below belongs to {ministry.name}.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-semibold text-slate-400">Role</label>
            {write ? (
              <select value={ministry.tag_role} onChange={e => onRoleChange(e.target.value as TagRole)} aria-label="Ministry role" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30">
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            ) : (
              <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${rolePillClasses()}`}>{roleLabel(ministry.tag_role)}</span>
            )}
          </div>
          {write && (
            <button onClick={onDeactivate} className="ml-auto rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-3 py-1.5 text-[12px] font-semibold text-[#B45309] transition-colors hover:bg-[#F59E0B]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/40">
              Remove ministry
            </button>
          )}
        </div>
      </div>

      {/* Groups inside this node */}
      {(childNodes.length > 0 || write) && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-600">Groups inside {ministry.name}</h3>
            <span className="font-num text-[12px] font-semibold text-slate-400">{childNodes.length}</span>
          </div>
          {childNodes.length > 0 && (
            <ul className="divide-y divide-slate-50">
              {childNodes.map(c => (
                <li key={c.id}>
                  <button onClick={() => onSelectChild(c.id)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-slate-50">
                    <Ico.chevron className="h-3.5 w-3.5 -rotate-90 text-slate-300" />
                    <span className="text-[14px] font-medium text-slate-700">{c.name}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${rolePillClasses()}`}>{roleLabel(c.tag_role)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {write && (
            <div className="border-t border-slate-100 px-5 py-3">
              {!addingGroup ? (
                <button onClick={() => { setAddingGroup(true); setGRole(ministry.tag_role) }} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[#3D5BD4] transition-colors hover:bg-slate-50">
                  <Ico.plus className="h-4 w-4" /> Add a group inside {ministry.name}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text" value={gName} onChange={e => setGName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && gName.trim()) { onAddGroupHere(gName, gRole); setGName(''); setAddingGroup(false) } if (e.key === 'Escape') { setAddingGroup(false); setGName('') } }}
                    placeholder="Group name (e.g. Tabors)" autoFocus
                    className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
                  />
                  <select value={gRole} onChange={e => setGRole(e.target.value as TagRole)} aria-label="Group role" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7]">
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={() => { if (gName.trim()) { onAddGroupHere(gName, gRole); setGName(''); setAddingGroup(false) } }} disabled={!gName.trim()} className="rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40">Add</button>
                  <button onClick={() => { setAddingGroup(false); setGName('') }} className="rounded-lg px-2 py-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-700">Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Metric Kind sections — only Kinds that have ≥1 metric here */}
      {PHASE1_KINDS.map(kindCode => {
        const rt = reportingTags.find(r => r.code === kindCode)
        if (!rt) return null
        const list = byKind.get(rt.id) ?? []
        if (list.length === 0) return null
        return (
          <KindSection
            key={kindCode}
            kindCode={kindCode}
            kindLabel={KIND_LABEL[kindCode]}
            metrics={list}
            write={write}
            eligibleParentsFor={eligibleParentsFor}
            parentLabel={parentLabel}
            unreferencedRollupIds={unreferencedRollupIds}
            childCountFor={childCountFor}
            onRenameMetric={onRenameMetric}
            onRemoveMetric={onRemoveMetric}
            onSetMode={onSetMode}
            onSetParent={onSetParent}
            onSetOp={onSetOp}
          />
        )
      })}

      {/* Add a metric */}
      {write && (
        <AddMetricControl
          reportingTags={reportingTags}
          onAdd={onAddMetric}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// AddMetricControl — pick a Kind, name it
// ─────────────────────────────────────────────────────────────────────────
function AddMetricControl({
  reportingTags, onAdd,
}: {
  reportingTags: ReportingTag[]
  onAdd: (kind: KindCode, name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<KindCode>('VOLUNTEERS')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const available = PHASE1_KINDS.filter(k => reportingTags.some(r => r.code === k))

  async function submit() {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    await onAdd(kind, n)
    setName(''); setBusy(false); setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#4F6EF7]/40 bg-[#4F6EF7]/5 px-4 py-3 text-[14px] font-semibold text-[#3D5BD4] transition-colors hover:bg-[#4F6EF7]/10">
        <Ico.plus className="h-4 w-4" /> Add a count
      </button>
    )
  }
  return (
    <div className="rounded-2xl border border-[#4F6EF7]/30 bg-white p-4 shadow-sm">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Add a count</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={e => setKind(e.target.value as KindCode)} aria-label="Kind" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7]">
          {available.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setName('') } }}
          placeholder={`e.g. ${KIND_PLACEHOLDER[kind]}`} autoFocus
          className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
        />
        <button onClick={submit} disabled={!name.trim() || busy} className="rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40">Add</button>
        <button onClick={() => { setOpen(false); setName('') }} className="rounded-lg px-2 py-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-700">Cancel</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// KindSection
// ─────────────────────────────────────────────────────────────────────────
function KindSection({
  kindCode, kindLabel, metrics, write,
  eligibleParentsFor, parentLabel, unreferencedRollupIds, childCountFor,
  onRenameMetric, onRemoveMetric, onSetMode, onSetParent, onSetOp,
}: {
  kindCode: KindCode
  kindLabel: string
  metrics: Metric[]
  write: boolean
  eligibleParentsFor: (m: Metric) => Metric[]
  parentLabel: (m: Metric) => string
  unreferencedRollupIds: Set<string>
  childCountFor: (rollupId: string) => number
  onRenameMetric: (metricId: string, name: string) => Promise<void>
  onRemoveMetric: (metricId: string) => Promise<void>
  onSetMode: (metricId: string, mode: MetricMode, op?: RollupOp) => Promise<void>
  onSetParent: (metricId: string, parentId: string | null) => Promise<void>
  onSetOp: (metricId: string, op: RollupOp) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(true)

  const kindAccent = kindCode === 'ATTENDANCE'
    ? 'bg-[#4F6EF7]/8 border-[#4F6EF7]/20'
    : kindCode === 'VOLUNTEERS'
    ? 'bg-[#22C55E]/8 border-[#22C55E]/20'
    : 'bg-[#8B5CF6]/8 border-[#8B5CF6]/20'

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(x => !x)}
        aria-expanded={expanded}
        className={`flex w-full items-center justify-between gap-3 border-b px-5 py-3 text-left transition-colors ${kindAccent}`}
      >
        <div className="flex items-center gap-2">
          <Ico.chevron className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-700">{kindLabel}</h3>
          <span
            className="text-[10px] font-medium text-slate-400 cursor-help"
            title={`"${kindLabel}" is a reporting type — it tells the dashboard how to handle these numbers. The counts you add here all report as ${kindLabel}.`}
          >
            reporting type
          </span>
        </div>
        <span className="font-num text-[12px] font-semibold text-slate-400">
          {metrics.length} count{metrics.length === 1 ? '' : 's'}
        </span>
      </button>
      {expanded && (
      <ul className="divide-y divide-slate-50">
        {metrics.map(m => (
          <MetricRowItem
            key={m.id}
            metric={m}
            write={write}
            eligibleParents={eligibleParentsFor(m)}
            parentLabel={parentLabel}
            unreferenced={unreferencedRollupIds.has(m.id)}
            childCount={childCountFor(m.id)}
            onRename={name => onRenameMetric(m.id, name)}
            onRemove={() => onRemoveMetric(m.id)}
            onSetMode={(mode, op) => onSetMode(m.id, mode, op)}
            onSetParent={pid => onSetParent(m.id, pid)}
            onSetOp={op => onSetOp(m.id, op)}
          />
        ))}
      </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MetricRowItem — name + mode toggle + (entry: rolls-up-into) / (rollup: op)
// ─────────────────────────────────────────────────────────────────────────
function MetricRowItem({
  metric, write, eligibleParents, parentLabel, unreferenced, childCount,
  onRename, onRemove, onSetMode, onSetParent, onSetOp,
}: {
  metric: Metric
  write: boolean
  eligibleParents: Metric[]
  parentLabel: (m: Metric) => string
  unreferenced: boolean
  childCount: number
  onRename: (name: string) => Promise<void>
  onRemove: () => void
  onSetMode: (mode: MetricMode, op?: RollupOp) => void
  onSetParent: (parentId: string | null) => void
  onSetOp: (op: RollupOp) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const isRollup = metric.mode === 'rollup'

  return (
    <li className="group px-5 py-3 transition-colors duration-200 hover:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {write ? (
            <InlineEditField value={metric.name} onSave={onRename} aria-label={metric.name} className="text-[14px] font-medium text-slate-800" />
          ) : (
            <span className="text-[14px] font-medium text-slate-800">{metric.name}</span>
          )}
        </div>

        {write && (
          <div className="flex shrink-0 items-center gap-1">
            {/* mode toggle */}
            <div className="flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-semibold">
              <button
                onClick={() => onSetMode('entry')}
                className={`px-2 py-1 transition-colors ${!isRollup ? 'bg-[#4F6EF7] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >Entry</button>
              <button
                onClick={() => onSetMode('rollup', metric.rollup_op ?? 'sum')}
                className={`whitespace-nowrap px-2 py-1 transition-colors ${isRollup ? 'bg-[#4F6EF7] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >Roll up sub-entries</button>
            </div>
            {confirmRemove ? (
              <span className="flex items-center gap-1">
                <button onClick={() => { onRemove(); setConfirmRemove(false) }} className="rounded-lg px-2 py-1 text-[12px] font-semibold text-[#B45309] transition-colors hover:bg-[#F59E0B]/10">Confirm</button>
                <button onClick={() => setConfirmRemove(false)} className="rounded-lg px-2 py-1 text-[12px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmRemove(true)} aria-label={`Remove ${metric.name}`} className="ml-1 flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus-visible:opacity-100">
                <Ico.trash className="h-3.5 w-3.5" />Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* second line: entry → rolls up into; rollup → op + child count + warning */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-0 text-[12px] text-slate-500">
        {isRollup ? (
          <>
            <span className="text-slate-400">Combines its children:</span>
            {write ? (
              <select value={metric.rollup_op ?? 'sum'} onChange={e => onSetOp(e.target.value as RollupOp)} aria-label="Roll-up operation" className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[12px] text-slate-700 outline-none focus:border-[#4F6EF7]">
                {(['sum', 'avg', 'max'] as RollupOp[]).map(op => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
              </select>
            ) : (
              <span className="font-medium text-slate-600">{OP_LABEL[metric.rollup_op ?? 'sum']}</span>
            )}
            {unreferenced ? (
              <span className="rounded-md bg-[#F59E0B]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#B45309]">⚠ Nothing points up to this yet</span>
            ) : (
              <span className="font-num text-[11px] text-slate-400">{childCount} pointing up</span>
            )}
          </>
        ) : (
          <>
            <span className="text-slate-400">Rolls up into:</span>
            {write ? (
              eligibleParents.length > 0 ? (
                <select
                  value={metric.parent_metric_id ?? ''}
                  onChange={e => onSetParent(e.target.value || null)}
                  aria-label="Rolls up into"
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[12px] text-slate-700 outline-none focus:border-[#4F6EF7]"
                >
                  <option value="">— stays local —</option>
                  {eligibleParents.map(p => <option key={p.id} value={p.id}>{parentLabel(p)}</option>)}
                </select>
              ) : (
                <span className="text-slate-400">— stays local (make a roll-up on a parent first)</span>
              )
            ) : (
              <span className="font-medium text-slate-600">
                {metric.parent_metric_id ? (() => { const p = eligibleParents.find(x => x.id === metric.parent_metric_id); return p ? parentLabel(p) : 'a parent roll-up' })() : 'stays local'}
              </span>
            )}
          </>
        )}
      </div>
    </li>
  )
}
