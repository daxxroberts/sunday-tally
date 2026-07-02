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
  setCountSection,
  setCountDemographic,
} from './actions'
import type { TagRole, MetricRole } from './actions'
import {
  KIND_LABEL, canWrite,
  type KindCode, type Metric, type Ministry, type ReportingTag,
} from './types'
import { WhereCountedModal } from './components/WhereCountedModal'
import { AddNodeForm } from './components/AddNodeForm'
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
    // Keep the FULL active set here (incl. archived) so the positional color
    // palette (colorMap below) stays identical to the dashboard/History. Archived
    // ministries are hidden from the rendered tree in childrenOf() instead — that
    // way an archived ministry takes no new setup here (review finding #41) without
    // shifting every other ministry's color.
    const { rows } = await fetchActiveServiceTags(supabase, cid)
    const mins = rows as unknown as Ministry[]
    setMinistries(mins)

    const { data: rtRows } = await supabase
      .from('reporting_tags')
      .select('id, code, name')
      .or(`church_id.eq.${cid},church_id.is.null`)
    setReportingTags((rtRows ?? []) as ReportingTag[])

    const minIds = mins.map(m => m.id)
    if (minIds.length === 0) { setMetrics([]); return }

    // ALL active, non-archived metrics — instance AND period. Period metrics
    // (weekly/monthly church-wide, e.g. Giving) are shown with a cadence badge so
    // they're findable/editable here ("where do I edit Giving" — Builder 2026-06-10).
    // The editor never shows archived counts (archived_at IS NULL); their history
    // still rolls up on the dashboard/History, but they take no new setup here.
    // Defensive: select the mirrored-metrics columns; if they don't exist yet
    // (migration not applied), fall back to the base columns and treat every count
    // as a plain ministry_only entry.
    const full = await supabase
      .from('metrics')
      .select('id, code, name, reporting_tag_id, is_canonical, is_active, ministry_tag_id, mode, rollup_op, parent_metric_id, metric_role, archived_at, counted_demographic, scope, cadence')
      .eq('church_id', cid)
      .eq('is_active', true)
      .is('archived_at', null)
      .in('ministry_tag_id', minIds)
      .order('is_canonical', { ascending: false })

    if (!full.error && full.data) {
      setMetrics((full.data as Metric[]).map(m => ({
        ...m,
        mode: m.mode ?? 'entry',
        rollup_op: m.rollup_op ?? null,
        parent_metric_id: m.parent_metric_id ?? null,
        metric_role: m.metric_role ?? 'ministry_only',
        archived_at: m.archived_at ?? null,
      })))
      return
    }

    const basic = await supabase
      .from('metrics')
      .select('id, code, name, reporting_tag_id, is_canonical, is_active, ministry_tag_id, counted_demographic, scope, cadence')
      .eq('church_id', cid)
      .eq('is_active', true)
      .in('ministry_tag_id', minIds)
      .order('is_canonical', { ascending: false })
    setMetrics(((basic.data ?? []) as Array<Omit<Metric, 'mode' | 'rollup_op' | 'parent_metric_id' | 'metric_role' | 'archived_at'>>)
      .map(m => ({ ...m, mode: 'entry' as const, rollup_op: null, parent_metric_id: null, metric_role: 'ministry_only' as MetricRole, archived_at: null })))
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

  // Rendered tree excludes archived nodes (kept in `ministries` only for the
  // color palette + ancestor walk). Archived history lives on the dashboard/History.
  const childrenOf = useCallback((parentId: string | null) =>
    ministries.filter(m => m.parent_tag_id === parentId && !m.archived_at), [ministries])

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

  const rtById = useMemo(() => new Map(reportingTags.map(r => [r.id, r] as const)), [reportingTags])

  const orphanIds = useMemo(() => new Set(orphans.map(o => o.tag_id)), [orphans])

  // id → name, for a group's "from {ministry}" note in the detail panel.
  const ministryNameById = useMemo(() => new Map(ministries.map(m => [m.id, m.name] as const)), [ministries])

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
    const previous = ministries.find(m => m.id === id)?.name
    setMinistries(prev => prev.map(m => m.id === id ? { ...m, name } : m))
    const res = await updateMinistry(id, { name })
    if (!res.ok) {
      setMinistries(prev => prev.map(m => m.id === id ? { ...m, name: previous ?? m.name } : m))
      alert(res.error ?? 'Could not rename this ministry.')
    }
  }
  async function handleRoleChange(id: string, tag_role: TagRole) {
    const previous = ministries.find(m => m.id === id)?.tag_role
    setMinistries(prev => prev.map(m => m.id === id ? { ...m, tag_role } : m))
    const res = await updateMinistry(id, { tag_role })
    if (!res.ok) {
      setMinistries(prev => prev.map(m => m.id === id ? { ...m, tag_role: previous ?? m.tag_role } : m))
      alert(res.error ?? 'Could not change who this ministry is for.')
    }
  }
  async function handleColorChange(id: string, colorHex: string | null) {
    const res = await updateMinistry(id, { color: colorHex })
    if (!res.ok) { alert(res.error ?? 'Could not save the color (is migration 0040 applied?)'); return }
    setMinistries(prev => prev.map(m => m.id === id ? { ...m, color: colorHex } : m))
  }
  async function handleDeactivateMinistry(id: string) {
    // The server decides archive-vs-delete (decision 9): a ministry with recorded
    // history is archived (its numbers keep rolling up in History/dashboard, but
    // there's no restore path in this UI yet — see BUILD_FLAGS.md), one with no
    // history yet is deleted outright. The client can't know which ahead of the
    // server's probe, so the confirm copy names both outcomes instead of
    // promising a plain, always-permanent delete (review finding #44).
    if (!confirm('Remove this ministry? If it has recorded history, its past numbers are kept (they’ll still show in History), but it disappears from this list here. If it has no history yet, it’s deleted for good. Either way, this can’t be undone from here.')) return
    const result = await deactivateMinistry(id)
    if (result.ok) {
      setMinistries(prev => prev.filter(m => m.id !== id))
      setMetrics(prev => prev.filter(m => m.ministry_tag_id !== id))
      if (selectedId === id) setSelectedId(null)
    } else {
      alert(result.error ?? 'Could not remove ministry.')
    }
  }

  // Section-scoped add — the DetailPanel section sets `role` (which kind of
  // count). A template mirrors to every group server-side, so reload to pick up
  // the freshly-created mirrors; otherwise just append the new row. Throws on
  // failure (instead of alert-and-swallow) so AddMetricControl can keep the
  // typed name + form open and show the error inline (review finding #61).
  async function handleAddCount(ministryId: string, role: MetricRole, kindCode: KindCode, name: string) {
    const result = await addCount({ ministryId, reportingTagCode: kindCode, name, role })
    if (result.ok && result.data) {
      if (role === 'template') {
        if (churchId) await load(churchId)   // pull in the new mirrors on every group
      } else {
        setMetrics(prev => [...prev, { ...result.data!, ministry_tag_id: ministryId }])
      }
    } else {
      throw new Error(result.error ?? 'Could not add this count.')
    }
  }
  async function handleRenameMetric(metricId: string, name: string) {
    const result = await renameCount(metricId, name)
    if (!result.ok) { alert(result.error ?? 'Could not rename this count.'); return }
    // A template rename propagates to its mirrors server-side — reflect both.
    setMetrics(prev => prev.map(m => {
      if (m.id === metricId) return { ...m, name }
      if (m.parent_metric_id === metricId && m.metric_role === 'mirror') return { ...m, name }
      return m
    }))
  }
  // Remove = delete-or-archive server-side (and a template cascades to its
  // mirrors). Either way the row disappears from the editor; reload to reflect
  // the exact server outcome (deleted rows gone, archived rows filtered out).
  async function handleRemoveMetric(metricId: string) {
    const result = await deactivateCount(metricId)
    if (!result.ok) { alert(result.error ?? 'Could not remove this count.'); return }
    if (churchId) await load(churchId)
  }
  // Move a ministry count between "at the ministry" (ministry_only) and "every
  // group" (template). The server blocks a count that already has data and
  // handles the mirror creation — reload to reflect the new section + mirrors.
  async function handleMoveSection(metricId: string) {
    const current = metrics.find(m => m.id === metricId)
    const target = current?.metric_role === 'template' ? 'ministry_only' : 'template'
    const result = await setCountSection(metricId, target)
    if (!result.ok) { alert(result.error ?? 'Could not move this count.'); return }
    if (churchId) await load(churchId)
  }
  async function handleSetDemographic(metricId: string, demographic: TagRole | null) {
    const result = await setCountDemographic(metricId, demographic)
    if (result.ok && result.data) {
      // A template's demographic propagates to its mirrors server-side.
      setMetrics(prev => prev.map(m => {
        if (m.id === metricId) return { ...m, ...result.data! }
        if (m.parent_metric_id === metricId && m.metric_role === 'mirror') return { ...m, counted_demographic: demographic }
        return m
      }))
    } else if (result.error) {
      alert(result.error)
    }
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
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

                {/* Left tree */}
                <div className="lg:w-72 lg:shrink-0">
                  {write && !addingMinistry && (
                    <button
                      onClick={() => setAddingMinistry(true)}
                      title="A ministry gets its own dashboard card, color, and trend line — like Experience, LifeKids, or Giving. This is the main thing you'll set up; once it's here, add the numbers you count to it. (Want to break one ministry into smaller groups that total up? Open it and use 'Add a group inside' — most churches won't need that.)"
                      className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#4F6EF7]/40 bg-[#4F6EF7]/5 px-4 py-3 text-[14px] font-semibold text-[#3D5BD4] transition-colors duration-200 hover:bg-[#4F6EF7]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                    >
                      <Ico.plus className="h-4 w-4" />
                      Add a ministry
                    </button>
                  )}

                  {write && addingMinistry && (
                    <AddNodeForm
                      title="New ministry"
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
                        {write ? (
                          <>
                            <p className="text-[14px] font-semibold text-slate-600">Add your first ministry.</p>
                            <p className="mt-1 text-[12px] text-slate-400">Use the button above to get started.</p>
                          </>
                        ) : (
                          // Read-only roles (editor/viewer) can't add a ministry, so
                          // the owner-only "use the button above" copy doesn't apply
                          // to them — there is no button above (review finding #65).
                          <>
                            <p className="text-[14px] font-semibold text-slate-600">No ministries yet.</p>
                            <p className="mt-1 text-[12px] text-slate-400">Ask an owner or admin to add one.</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
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
                              hasUnreferenced={() => false}
                              isOrphan={(id) => orphanIds.has(id)}
                              onFixOrphan={setFixTagId}
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
                      ministryNameById={ministryNameById}
                      onSelectChild={setSelectedId}
                      onAddGroupHere={(name, tag_role) => addMinistry(selected.id, name, tag_role)}
                      onRename={name => handleRenameMinistry(selected.id, name)}
                      onRoleChange={r => handleRoleChange(selected.id, r)}
                      onColorChange={c => handleColorChange(selected.id, c)}
                      onDeactivate={() => handleDeactivateMinistry(selected.id)}
                      onAddCount={(role, kind, name) => handleAddCount(selected.id, role, kind, name)}
                      onRenameMetric={handleRenameMetric}
                      onRemoveMetric={handleRemoveMetric}
                      onSetDemographic={handleSetDemographic}
                      onMoveSection={handleMoveSection}
                    />
                  )}
                </div>
              </div>
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
