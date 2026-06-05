'use client'

// ─────────────────────────────────────────────────────────────────────────
// DASHBOARD — D2 viewer summary — /(app)/dashboard/viewer (viewer role).
// Build spec: IRIS_DASHBOARD_ELEMENT_MAP.md (D2 column). UI rules: DESIGN_SYSTEM.md.
// Same look as D1, simplified: D-026 → NO Volunteers anywhere (KPI, summary,
// key-metrics, per-ministry); no customize (E-32) / no include-in-total (E-22);
// attendance + giving + decisions only. D-048 → re-auth note at foot.
// Visual redesign over the existing dashboard.ts data layer (shape preserved).
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { fetchDashboardData, type DashboardData, type TagSection } from '@/lib/dashboard'
import type { Church } from '@/types'
import {
  DashHeader, ColumnHeaders, FourColRow, CardHeader, KpiCard,
  KeyMetricCard, LaneLabel, EmptyState, accentForRole, Ico,
} from '../ui'

export default function ViewerDashboardPage() {
  const supabase = useMemo(() => createClient(), [])

  const [church, setChurch] = useState<Church | null>(null)
  const [campus, setCampus] = useState<{ id: string; name: string } | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [roleByTag, setRoleByTag] = useState<Map<string, string | null>>(new Map())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('church_id, default_location_id, churches(*)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership || cancelled) { if (!cancelled) setLoading(false); return }

      const ch = (Array.isArray(membership.churches) ? membership.churches[0] : membership.churches) as Church
      setChurch(ch)

      // active campus (N-2 / D-088): default → first active by sort_order
      let campusRow: { id: string; name: string } | null = null
      if (membership.default_location_id) {
        const { data: loc } = await supabase
          .from('church_locations').select('id, name').eq('id', membership.default_location_id).maybeSingle()
        if (loc) campusRow = loc
      }
      if (!campusRow) {
        const { data: locs } = await supabase
          .from('church_locations').select('id, name')
          .eq('church_id', membership.church_id).eq('is_active', true)
          .order('sort_order', { ascending: true }).limit(1)
        if (locs && locs[0]) campusRow = locs[0]
      }
      if (!cancelled) setCampus(campusRow)

      const { data: tagRows } = await supabase
        .from('service_tags').select('id, tag_role')
        .eq('church_id', membership.church_id).eq('is_active', true)
      const rbt = new Map<string, string | null>()
      for (const t of (tagRows ?? []) as { id: string; tag_role: string | null }[]) rbt.set(t.id, t.tag_role)
      if (!cancelled) setRoleByTag(rbt)

      // D-026: viewer never sees volunteers — pass tracks_volunteers=false so they
      // vanish from every shape (summary, key-metrics, per-ministry, breakout).
      const d = await fetchDashboardData(membership.church_id, {
        tracks_volunteers: false,
        tracks_responses:  ch.tracks_responses,
        tracks_giving:     ch.tracks_giving,
      })
      if (!cancelled) { setData(d); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [supabase])

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    [],
  )
  const hideComparisons = !!data && data.weeksWithData < 2
  const highlightDelta = (h: { current: number; prior: number }) =>
    h.prior === 0 ? null : Math.round(((h.current - h.prior) / h.prior) * 100)

  return (
    <AppLayout role="viewer">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {!church ? (
          <div className="mx-auto max-w-3xl px-4 py-10">
            <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ) : (
          <>
            {/* ── Zone A — Header (E-1/E-2/E-4) — no scope toggle for viewer ── */}
            <DashHeader
              eyebrow="Dashboard"
              churchName={church.name}
              campusName={campus?.name ?? null}
              todayLabel={todayLabel}
            />

            <main className="mx-auto max-w-3xl px-4 py-6">
              {loading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
                  </div>
                  <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
                </div>
              ) : !data || !data.hasAnyData ? (
                <>
                  <EmptyState message="Data appears here after your first service entry." />
                  <ReAuthNote />
                </>
              ) : (
                <div className="space-y-5">
                  {/* ── Zone B — KPI cards: attendance + giving only (D-026) ── */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <KpiCard
                      label="Attendance"
                      value={data.highlights.attendance.current}
                      delta={highlightDelta(data.highlights.attendance)}
                      prior={data.highlights.attendance.prior}
                    />
                    {church.tracks_giving && (
                      <KpiCard
                        label="Giving" prefix="$"
                        value={data.highlights.giving.current}
                        delta={highlightDelta(data.highlights.giving)}
                        prior={data.highlights.giving.prior}
                      />
                    )}
                  </div>

                  <ColumnHeaders />

                  {/* ── Zone D — Summary (fixed row set, no customize / no edit) ── */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader label="Totals" accentStyle={{ background: '#4F6EF7' }} />
                    <FourColRow label="Grand Total" values={data.summary.grandTotal} hideComparisons={hideComparisons} />
                    <FourColRow label="Adults" values={data.summary.adults} hideComparisons={hideComparisons} />
                    <FourColRow label="Kids" values={data.summary.kids} hideComparisons={hideComparisons} />
                    <FourColRow label="Youth" values={data.summary.youth} hideComparisons={hideComparisons} />
                    {church.tracks_responses && (
                      <FourColRow label="First-Time Decisions" values={data.summary.firstTimeDecisions} hideComparisons={hideComparisons} />
                    )}
                    {church.tracks_giving && (
                      <FourColRow label="Giving" values={data.summary.giving} prefix="$" hideComparisons={hideComparisons} />
                    )}
                  </div>

                  {/* ── Zone E — Key Metrics (no volunteers % on D2 per D-026) ── */}
                  <div>
                    <LaneLabel label="Key Metrics" accentStyle={{ background: '#06B6D4' }} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <KeyMetricCard label="Avg Weekly Attendance" values={data.reportingMetrics.weeklyAvgAttendance} />
                      {church.tracks_giving && (
                        <KeyMetricCard label="Per-Capita Giving" values={data.reportingMetrics.perCapitaGiving} prefix="$" />
                      )}
                    </div>
                  </div>

                  {/* ── Zone F — per-ministry breakdown (attendance + stats; no volunteers) ── */}
                  {data.tagSections.map(section => (
                    <ViewerTagBlock
                      key={section.tag_id}
                      section={section}
                      role={roleByTag.get(section.tag_id) ?? null}
                      tracksResponses={church.tracks_responses}
                      hideComparisons={hideComparisons}
                    />
                  ))}

                  {hideComparisons && (
                    <p className="flex items-center justify-center gap-1.5 py-2 text-center text-[12px] text-slate-400">
                      <Ico.calendar className="h-3.5 w-3.5" />Comparisons appear after two weeks of data.
                    </p>
                  )}

                  <ReAuthNote />
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </AppLayout>
  )
}

// per-ministry card for D2 — attendance + response stats only (no volunteers)
function ViewerTagBlock({ section, role, tracksResponses, hideComparisons }: {
  section: TagSection
  role: string | null
  tracksResponses: boolean
  hideComparisons: boolean
}) {
  const isUnassigned = section.tag_id === 'UNASSIGNED'
  // On D2 an unassigned section only carries stats (volunteers hidden); skip if empty.
  if (isUnassigned && (!tracksResponses || section.stats.length === 0)) return null
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader
        label={section.tag_name}
        role={isUnassigned ? undefined : role}
        accentClass={isUnassigned ? 'bg-slate-300' : accentForRole(role)}
      />
      <div>
        {!isUnassigned && <FourColRow label="Attendance" values={section.attendance} hideComparisons={hideComparisons} />}
        {tracksResponses && section.stats.map(s => (
          <FourColRow key={s.category_id} label={s.category_name} values={s.values} hideComparisons={hideComparisons} />
        ))}
      </div>
    </div>
  )
}

// D-048 — viewer re-auth note
function ReAuthNote() {
  return (
    <p className="mt-8 text-center text-[11px] text-slate-400">
      Need a new link? Enter your email on the login screen.
    </p>
  )
}
