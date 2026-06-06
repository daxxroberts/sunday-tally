'use client'

// ─────────────────────────────────────────────────────────────────────────
// DASHBOARD — D1 full dashboard — /(app)/dashboard (editor/admin/owner).
// Build spec: IRIS_DASHBOARD_ELEMENT_MAP.md (E-1..E-83). UI rules: DESIGN_SYSTEM.md.
// Reference look (wired + verified): /(app)/entries — primitives reused via dashboard/ui.
//
// This is a VISUAL + CONTEXT redesign over the existing dashboard.ts data layer.
// The 4-window math (FourWin, D-053/055), deltas, tagSections, reportingMetrics,
// highlights shapes are PRESERVED verbatim — only the JSX changes to the
// DESIGN_SYSTEM/Entries look, plus campus context (E-2) + scope toggle (E-3).
//
// SCOPE (O-1 / N-3): dashboard.ts is currently church-wide (no campus filter).
// MVP ships church-wide; the E-3 toggle is rendered locked to "All campuses"
// with an honest title. Campus-scoped fetch is a flagged fast-follow (see report).
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import {
  fetchDashboardData,
  emptyFourWin,
  type DashboardData,
  type FourWin,
  type TagSection,
  type ReportingMetrics,
} from '@/lib/dashboard'
import {
  loadSummaryMetrics,
  saveSummaryMetrics,
  SUMMARY_METRIC_LABELS,
  SUMMARY_METRIC_ORDER,
  DEFAULT_SUMMARY_METRICS,
  type SummaryMetricFlags,
  type SummaryMetricKey,
} from '@/lib/dashboardPrefs'
import type { UserRole, Church } from '@/types'
import {
  DashHeader, ColumnHeaders, FourColRow, CardHeader, NotInTotalTag, KpiCard,
  KeyMetricCard, LaneLabel, EmptyState, fmtVal, Ico, accentForRole,
} from './ui'

type Tracks = { tracks_volunteers: boolean; tracks_responses: boolean; tracks_giving: boolean }
interface GridPrefs { excludedTotalMinistries?: string[] }

// ── derive a grandTotal FourWin honouring excludedTotalMinistries (E-22/E-54).
//
//    IMPORTANT (correctness — see review of D-082): dashboard.ts builds every
//    TagSection's `attendance` via attendanceForRole(tag.tag_role) — the FULL
//    audience aggregate for that role (all ADULT_SERVICE tags share one adults
//    pivot, all KIDS_MINISTRY share kids, etc.). It is NOT a per-tag slice.
//    Re-summing per-section attendance therefore double-counts the moment two
//    tags share a role. So we MUST NOT sum section pivots.
//
//    Instead we work at the ROLE level, off summary.{adults,kids,youth,other}:
//    a role's audience total is subtracted from the grand total only when EVERY
//    tag carrying that role is excluded. Excluding one of several same-role
//    ministries cannot be sliced from the role aggregate (the data layer does
//    not expose a per-tag contribution), so that role stays fully counted and
//    its excluded card is badged "not in total" (E-54 visual) — honest, never
//    double-counted. Single-tag-per-role (the common case, incl. the demo
//    church) behaves exactly as the map intends. DS-9 derived; metric_entries
//    untouched. (To make partial same-role exclusion subtract precisely, the
//    data layer would need a per-tag attendance contribution — flagged.) ───────

type AudienceRole = 'ADULT_SERVICE' | 'KIDS_MINISTRY' | 'YOUTH_MINISTRY'

// role → summary key whose FourWin is that role's full audience aggregate
const ROLE_TO_SUMMARY: Record<AudienceRole, 'adults' | 'kids' | 'youth'> = {
  ADULT_SERVICE: 'adults',
  KIDS_MINISTRY: 'kids',
  YOUTH_MINISTRY: 'youth',
}

// subtract `b` from `a` window-by-window (nulls treated as 0 contribution; a
// null in `a` stays null since there's nothing to subtract from).
function subtractFourWin(a: FourWin, b: FourWin): FourWin {
  const sub = (av: number | null, bv: number | null): number | null =>
    av === null ? null : av - (bv ?? 0)
  const pct = (cur: number | null, prior: number | null) =>
    cur === null || prior === null || prior === 0 ? null : Math.round(((cur - prior) / prior) * 100)
  const w = sub(a.w, b.w), m4 = sub(a.m4, b.m4), ytd = sub(a.ytd, b.ytd), priorYtd = sub(a.priorYtd, b.priorYtd)
  return { w, m4, ytd, priorYtd, delta_w_m4: pct(w, m4), delta_ytd_prior: pct(ytd, priorYtd) }
}

// ── Zone D — Summary card (E-30..E-33) + include-in-total edit (E-22 / I) ─────
function SummaryCard({
  summary, grandTotalOverride, tagSections, roleByTag, excluded, flags, onChangeFlags, onSavePrefs,
  tracks, hideComparisons, readOnly, windows,
}: {
  summary: DashboardData['summary']
  grandTotalOverride: FourWin
  tagSections: TagSection[]
  roleByTag: Map<string, string | null>
  excluded: Set<string>
  flags: SummaryMetricFlags
  onChangeFlags: (flags: SummaryMetricFlags) => void
  onSavePrefs: (next: GridPrefs) => void
  tracks: Tracks
  hideComparisons: boolean
  readOnly: boolean
  windows: DashboardData['windows']
}) {
  const [customize, setCustomize] = useState(false)
  const [editTotals, setEditTotals] = useState(false)
  const [draft, setDraft] = useState<Set<string>>(new Set(excluded))
  useEffect(() => { setDraft(new Set(excluded)) }, [editTotals, excluded])

  // ministries eligible for the include-in-total panel: real (non-unassigned) sections
  const ministrySections = tagSections.filter(s => s.tag_id !== 'UNASSIGNED')

  // E-50 — when a church has exactly ONE ministry per audience role, show its real
  // name ("Experience Total" / "LifeKids Total" / "Switch Total") instead of the
  // generic role label; fall back to the generic label for 0 or 2+ tags (multi-tenant
  // safe). These three audience rows are attendance, so they get a gray "attendance" tag.
  const ATTENDANCE_AUDIENCE = new Set<SummaryMetricKey>(['adults', 'kids', 'youth'])
  const ROLE_OF: Record<'adults' | 'kids' | 'youth', AudienceRole> = {
    adults: 'ADULT_SERVICE', kids: 'KIDS_MINISTRY', youth: 'YOUTH_MINISTRY',
  }
  function attendanceLabel(key: SummaryMetricKey): string {
    if (key === 'adults' || key === 'kids' || key === 'youth') {
      const named = tagSections.filter(s => s.tag_id !== 'UNASSIGNED' && roleByTag.get(s.tag_id) === ROLE_OF[key])
      if (named.length === 1) return `${named[0].tag_name} Total`
    }
    return SUMMARY_METRIC_LABELS[key]
  }

  const effectivelyHidden = (k: SummaryMetricKey): boolean => {
    if (k === 'volunteers' && !tracks.tracks_volunteers) return true
    if (k === 'firstTimeDecisions' && !tracks.tracks_responses) return true
    if (k === 'giving' && !tracks.tracks_giving) return true
    return !flags[k]
  }

  const metricValues: Record<SummaryMetricKey, { values: FourWin; prefix?: string }> = {
    grandTotal:         { values: grandTotalOverride },          // honours exclusions (E-54)
    adults:             { values: summary.adults },
    kids:               { values: summary.kids },
    youth:              { values: summary.youth },
    volunteers:         { values: summary.volunteers },
    firstTimeDecisions: { values: summary.firstTimeDecisions },
    giving:             { values: summary.giving, prefix: '$' },
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader
        label="Totals"
        accentStyle={{ background: '#4F6EF7' }}
        trailing={
          !readOnly && (
            <div className="flex items-center gap-1">
              {/* E-22 — include-in-total edit (filled pencil, chrome on hover, DS-15) */}
              <button
                onClick={() => { setEditTotals(e => !e); setCustomize(false) }}
                title="Edit what counts toward the grand total"
                aria-label="Edit what counts toward the grand total"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
              >
                <Ico.pencilFill className="h-3 w-3" />
              </button>
              {/* E-32 — per-user customize (cog only, no label) */}
              <button
                onClick={() => { setCustomize(c => !c); setEditTotals(false) }}
                title={customize ? 'Done customizing' : 'Customize which metrics show'}
                aria-label="Customize which metrics show"
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 ${customize ? 'bg-slate-100 text-[#4F6EF7]' : 'text-slate-400 hover:text-slate-700'}`}
              >
                <Ico.gear className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        }
      />

      {/* E-33 — per-user visibility checkboxes */}
      {customize && !readOnly && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Show which metrics?</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {SUMMARY_METRIC_ORDER.map(key => {
              const disabled =
                (key === 'volunteers' && !tracks.tracks_volunteers) ||
                (key === 'firstTimeDecisions' && !tracks.tracks_responses) ||
                (key === 'giving' && !tracks.tracks_giving)
              return (
                <label key={key} className={`flex items-center gap-2 text-[12px] ${disabled ? 'text-slate-400' : 'cursor-pointer text-slate-700'}`}>
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-[#4F6EF7] focus:ring-[#4F6EF7]"
                    checked={!disabled && flags[key]}
                    disabled={disabled}
                    onChange={e => onChangeFlags({ ...flags, [key]: e.target.checked })}
                  />
                  <span>{SUMMARY_METRIC_LABELS[key]}{disabled && ' (tracking off)'}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* E-22 panel — church-wide include-in-total (mirrors Entries TotalsView) */}
      {editTotals && !readOnly && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Include in grand total</p>
          <div className="space-y-1.5">
            {ministrySections.map(s => {
              const included = !draft.has(s.tag_id)
              return (
                <button
                  key={s.tag_id}
                  onClick={() => setDraft(d => { const n = new Set(d); if (included) n.add(s.tag_id); else n.delete(s.tag_id); return n })}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors duration-200 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2.5">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors duration-200 ${included ? 'border-transparent' : 'border-slate-300'}`} style={included ? { background: '#4F6EF7' } : undefined}>
                      {included && <Ico.check className="h-3 w-3 text-white" />}
                    </span>
                    <span className={`h-4 w-1.5 rounded-full ${accentForRole(roleByTag.get(s.tag_id) ?? null)}`} aria-hidden />
                    <span className="text-[14px] font-semibold text-slate-800">{s.tag_name}</span>
                  </span>
                  <span className="font-num text-[13px] text-slate-500">{fmtVal(s.attendance.w)}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Saved for the whole church · doesn’t change entered numbers</span>
            <button
              onClick={() => { onSavePrefs({ excludedTotalMinistries: Array.from(draft) }); setEditTotals(false) }}
              className="cursor-pointer rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-opacity duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
              style={{ background: '#4F6EF7' }}
            >Save</button>
          </div>
        </div>
      )}

      <ColumnHeaders windows={windows} />
      <div>
        {SUMMARY_METRIC_ORDER.filter(k => !effectivelyHidden(k)).map(key => (
          <FourColRow
            key={key}
            label={attendanceLabel(key)}
            sub={ATTENDANCE_AUDIENCE.has(key) ? 'attendance' : undefined}
            values={metricValues[key].values}
            prefix={metricValues[key].prefix}
            hideComparisons={hideComparisons}
          />
        ))}
      </div>
    </div>
  )
}

// tag_role lives on the underlying service_tag; dashboard.ts doesn't surface it on
// TagSection. The page fetches a tag_id → tag_role lookup (roleByTag) so per-ministry
// cards bind their accent lane / role label deterministically (E-50, D-074/081/082).

// ── Zone F — per-ministry breakdown card (E-50..E-54) ─────────────────────────
function TagBlock({
  section, role, excluded, tracks, hideComparisons, windows,
}: {
  section: TagSection
  role: string | null
  excluded: boolean
  tracks: { tracks_volunteers: boolean; tracks_responses: boolean }
  hideComparisons: boolean
  windows: DashboardData['windows']
}) {
  const isUnassigned = section.tag_id === 'UNASSIGNED'
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-opacity duration-200 ${excluded ? 'opacity-60' : ''}`}>
      <CardHeader
        label={section.tag_name}
        role={isUnassigned ? undefined : role}
        accentClass={isUnassigned ? 'bg-slate-300' : accentForRole(role)}
        suffix={excluded ? <NotInTotalTag /> : undefined}
      />
      <ColumnHeaders windows={windows} />
      <div>
        {!isUnassigned && <FourColRow label="Attendance" values={section.attendance} hideComparisons={hideComparisons} />}
        {tracks.tracks_volunteers && <FourColRow label="Volunteers" values={section.volunteers} hideComparisons={hideComparisons} />}
        {tracks.tracks_responses && section.stats.map(s => (
          <FourColRow key={s.category_id} label={s.category_name} values={s.values} hideComparisons={hideComparisons} />
        ))}
      </div>
    </div>
  )
}

// ── Zone G — Volunteer breakout (E-60..E-62), editor+ only ────────────────────
function VolunteerBreakoutBlock({ breakout, hideComparisons, windows }: {
  breakout: DashboardData['volunteerBreakout']
  hideComparisons: boolean
  windows: DashboardData['windows']
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader label="Volunteer Breakout" accentStyle={{ background: '#8B5CF6' }} />
      <ColumnHeaders windows={windows} />
      <div>
        <FourColRow label="Total" sub="calculated" values={breakout.total} hideComparisons={hideComparisons} />
        {breakout.rows.map(r => (
          <FourColRow
            key={r.category_id}
            label={`${r.tag_id !== 'UNASSIGNED' ? 'Assigned' : 'General'} · ${r.category_name}`}
            values={r.values}
            indent
            hideComparisons={hideComparisons}
          />
        ))}
      </div>
    </div>
  )
}

// ── Zone H — Other stats (church-wide remainder, E-70) ────────────────────────
function OtherStatsBlock({ rows, hideComparisons, windows }: {
  rows: DashboardData['otherStats']
  hideComparisons: boolean
  windows: DashboardData['windows']
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader label="Other Stats" accentClass="bg-slate-300" />
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[12px] text-slate-400">No other stats tracked.</p>
      ) : (
        <>
          <ColumnHeaders windows={windows} />
          <div>
            {rows.map(r => (
              <FourColRow key={r.key} label={r.category_name} values={r.values} hideComparisons={hideComparisons} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])

  const [role, setRole] = useState<UserRole>('admin')
  const [church, setChurch] = useState<Church | null>(null)
  const [churchId, setChurchId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [campus, setCampus] = useState<{ id: string; name: string } | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [flags, setFlags] = useState<SummaryMetricFlags>(DEFAULT_SUMMARY_METRICS)
  const [gridPrefs, setGridPrefs] = useState<GridPrefs>({})
  const [roleByTag, setRoleByTag] = useState<Map<string, string | null>>(new Map())

  const readOnly = role === 'viewer'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }
      setUserId(user.id)

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, default_location_id, churches(*)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership || cancelled) { if (!cancelled) setLoading(false); return }

      const ch = (Array.isArray(membership.churches) ? membership.churches[0] : membership.churches) as Church
      setRole(membership.role as UserRole)
      setChurch(ch)
      setChurchId(membership.church_id)
      setFlags(loadSummaryMetrics(user.id, membership.church_id))
      setGridPrefs(((ch as unknown as { grid_config?: GridPrefs })?.grid_config as GridPrefs) ?? {})

      // active campus (N-2 / D-088): default_location_id → fallback first active by sort_order
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

      // tag_role lookup so per-ministry cards bind accent/label by role (E-50, D-074/081)
      const { data: tagRows } = await supabase
        .from('service_tags').select('id, tag_role')
        .eq('church_id', membership.church_id).eq('is_active', true)
      const rbt = new Map<string, string | null>()
      for (const t of (tagRows ?? []) as { id: string; tag_role: string | null }[]) rbt.set(t.id, t.tag_role)
      if (!cancelled) setRoleByTag(rbt)

      const d = await fetchDashboardData(membership.church_id, {
        tracks_volunteers: ch.tracks_volunteers,
        tracks_responses:  ch.tracks_responses,
        tracks_giving:     ch.tracks_giving,
      })
      if (!cancelled) { setData(d); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [supabase])

  function handleFlagsChange(next: SummaryMetricFlags) {
    setFlags(next)
    if (userId && church) saveSummaryMetrics(userId, church.id, next)
  }

  // E-22 / N-6 — persist church-wide include-in-total to churches.grid_config
  async function handleSavePrefs(next: GridPrefs) {
    if (!churchId) return
    setGridPrefs(next)
    const existing = ((church as unknown as { grid_config?: object } | null)?.grid_config as object) ?? {}
    await supabase.from('churches').update({ grid_config: { ...existing, ...next } }).eq('id', churchId)
  }

  // E-4 — "as of" anchor. Defaults to today (current week); picking a past date
  // re-fetches every 4-window relative to it. asOfStr === '' means today.
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [asOfStr, setAsOfStr] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function handleAnchorChange(next: string) {
    if (!church) return
    setAsOfStr(next === todayStr ? '' : next)
    setRefreshing(true)
    const anchor = next && next !== todayStr ? new Date(next + 'T12:00:00') : undefined
    const d = await fetchDashboardData(church.id, {
      tracks_volunteers: church.tracks_volunteers,
      tracks_responses:  church.tracks_responses,
      tracks_giving:     church.tracks_giving,
    }, anchor)
    setData(d)
    setRefreshing(false)
  }

  const highlightDelta = (h: { current: number; prior: number }) =>
    h.prior === 0 ? null : Math.round(((h.current - h.prior) / h.prior) * 100)

  const hideComparisons = !!data && data.weeksWithData < 2
  const excluded = useMemo(() => new Set(gridPrefs.excludedTotalMinistries ?? []), [gridPrefs])

  // E-54 — recompute the headline grandTotal honouring exclusions, at the ROLE
  // level (never by summing per-section pivots — those share a role aggregate and
  // would double-count). Subtract a role's audience aggregate only when EVERY tag
  // of that role is excluded; partial same-role exclusion leaves the role counted.
  const grandTotalOverride = useMemo(() => {
    if (!data) return emptyFourWin()
    // if nothing is excluded, trust the data layer's grandTotal verbatim (D-082)
    if (excluded.size === 0) return data.summary.grandTotal

    // group real ministry tags by their audience role
    const tagsByRole = new Map<AudienceRole, string[]>()
    for (const s of data.tagSections) {
      if (s.tag_id === 'UNASSIGNED') continue
      const role = roleByTag.get(s.tag_id) ?? null
      if (role !== 'ADULT_SERVICE' && role !== 'KIDS_MINISTRY' && role !== 'YOUTH_MINISTRY') continue
      const arr = tagsByRole.get(role) ?? []
      arr.push(s.tag_id)
      tagsByRole.set(role, arr)
    }

    let total = data.summary.grandTotal
    for (const [role, tagIds] of tagsByRole) {
      const allExcluded = tagIds.length > 0 && tagIds.every(id => excluded.has(id))
      if (allExcluded) {
        total = subtractFourWin(total, data.summary[ROLE_TO_SUMMARY[role]])
      }
    }
    return total
  }, [data, excluded, roleByTag])

  const tracks: Tracks = church
    ? { tracks_volunteers: church.tracks_volunteers, tracks_responses: church.tracks_responses, tracks_giving: church.tracks_giving }
    : { tracks_volunteers: false, tracks_responses: false, tracks_giving: false }

  return (
    <AppLayout role={readOnly ? 'viewer' : role}>
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
            {/* ── Zone A — Header (E-1/E-2/E-3/E-4) ───────────────────────── */}
            <DashHeader
              eyebrow="Dashboard"
              churchName={church.name}
              campusName={campus?.name ?? null}
              todayLabel={
                // E-4 — subtle "as of" date chip. Defaults to today; pick a past
                // date to re-anchor every window; "today" resets to current week.
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="date"
                    value={asOfStr || todayStr}
                    max={todayStr}
                    onChange={e => handleAnchorChange(e.target.value)}
                    title="Showing this date's week — pick another date to look back, or reset to today"
                    className="cursor-pointer bg-transparent font-num text-[11px] font-medium text-slate-600 outline-none"
                  />
                  {asOfStr && (
                    <button
                      onClick={() => handleAnchorChange(todayStr)}
                      title="Back to the current week"
                      className="rounded px-1 text-[10px] font-semibold text-[#4F6EF7] hover:underline"
                    >today</button>
                  )}
                </span>
              }
              scope={
                // E-3 — scope toggle. MVP: data layer is church-wide (O-1/N-3),
                // so this reflects "All campuses" and is locked with an honest hint.
                <span
                  title="Showing all campuses. Per-campus scoping is coming soon — campus is selected on the Locations page."
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600"
                >
                  <Ico.layers className="h-3.5 w-3.5 text-[#4F6EF7]" />All campuses
                </span>
              }
            />

            <main className="mx-auto max-w-3xl px-4 py-6">
              {loading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
                  </div>
                  <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
                </div>
              ) : !data || !data.hasAnyData ? (
                <EmptyState message="Data appears here after your first Sunday entry." />
              ) : (
                <div className={`space-y-5 transition-opacity duration-200 ${refreshing ? 'pointer-events-none opacity-50' : ''}`}>
                  {/* ── Zone B — highlight KPI cards (E-10..E-13) ───────────── */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <KpiCard
                      label="Attendance"
                      value={data.highlights.attendance.current}
                      delta={highlightDelta(data.highlights.attendance)}
                      prior={data.highlights.attendance.prior}
                    />
                    {tracks.tracks_giving && (
                      <KpiCard
                        label="Giving" prefix="$"
                        value={data.highlights.giving.current}
                        delta={highlightDelta(data.highlights.giving)}
                        prior={data.highlights.giving.prior}
                      />
                    )}
                    {tracks.tracks_volunteers && (
                      <KpiCard
                        label="Serving"
                        value={data.highlights.volunteers.current}
                        delta={highlightDelta(data.highlights.volunteers)}
                        prior={data.highlights.volunteers.prior}
                      />
                    )}
                  </div>

                  {/* ── Zone E — Key Metrics strip (E-40..E-43) — moved up to sit with the top KPI cards ─ */}
                  <div>
                    <LaneLabel label="Key Metrics" accentStyle={{ background: '#06B6D4' }} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <KeyMetricCard label="Avg Weekly Attendance" values={data.reportingMetrics.weeklyAvgAttendance} />
                      {tracks.tracks_volunteers && (
                        <KeyMetricCard label="Volunteers / Attendance" values={data.reportingMetrics.volToAttendancePct} suffix="%" />
                      )}
                      {tracks.tracks_giving && (
                        <KeyMetricCard label="Per-Capita Giving" values={data.reportingMetrics.perCapitaGiving} prefix="$" />
                      )}
                    </div>
                  </div>

                  {/* ── Zone D — Summary card (E-30..E-33) + E-22 edit. Column headers (E-20)
                       now render INSIDE each 4-col card so they stay visible while scrolling. ─ */}
                  <SummaryCard
                    summary={data.summary}
                    grandTotalOverride={grandTotalOverride}
                    tagSections={data.tagSections}
                    roleByTag={roleByTag}
                    excluded={excluded}
                    flags={flags}
                    onChangeFlags={handleFlagsChange}
                    onSavePrefs={handleSavePrefs}
                    tracks={tracks}
                    hideComparisons={hideComparisons}
                    readOnly={readOnly}
                    windows={data.windows}
                  />

                  {/* ── Zone F — per-ministry breakdown (E-50..E-55) ────────── */}
                  {data.tagSections.map(section => (
                    <TagBlock
                      key={section.tag_id}
                      section={section}
                      role={roleByTag.get(section.tag_id) ?? null}
                      excluded={excluded.has(section.tag_id)}
                      tracks={{ tracks_volunteers: tracks.tracks_volunteers, tracks_responses: tracks.tracks_responses }}
                      hideComparisons={hideComparisons}
                      windows={data.windows}
                    />
                  ))}

                  {/* ── Zone G — Volunteer breakout (E-60..E-62) ────────────── */}
                  {tracks.tracks_volunteers && (
                    <VolunteerBreakoutBlock breakout={data.volunteerBreakout} hideComparisons={hideComparisons} windows={data.windows} />
                  )}

                  {/* ── Zone H — Other stats (E-70) ─────────────────────────── */}
                  {tracks.tracks_responses && (
                    <OtherStatsBlock rows={data.otherStats} hideComparisons={hideComparisons} windows={data.windows} />
                  )}

                  {/* ── E-82 — comparisons-pending note ─────────────────────── */}
                  {hideComparisons && (
                    <p className="flex items-center justify-center gap-1.5 py-2 text-center text-[12px] text-slate-400">
                      <Ico.calendar className="h-3.5 w-3.5" />Comparisons appear after two weeks of data.
                    </p>
                  )}

                  <p className="px-1 text-[12px] leading-relaxed text-slate-400">
                    Every value is derived from your entries — never edited here. Totals roll up across the week’s sittings.
                  </p>
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </AppLayout>
  )
}
