'use client'

export const dynamic = 'force-dynamic'

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

import { useState, useEffect, useMemo, useRef } from 'react'
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
import { readChurchPrefs, saveChurchPrefs } from '@/lib/churchPrefs'
import type { UserRole, Church } from '@/types'
import {
  buildKeyMetricCatalog, resolveKeyMetricKeys, resolveKeyMetricTargets, featuredEntries,
  type KeyMetricsConfig, type KeyMetricTargetsConfig,
} from '@/lib/dashboardKeyMetrics'
import {
  fetchMetricSeries,
  type MetricSelector, type DrillWindow, type MetricSeries, type AttendanceColumn,
  type RatioOperand,
} from '@/lib/dashboardDrilldown'
import { DrillDownDrawer } from './drilldown'
import { buildGroupColorMap } from '@/components/history-grid/group-colors'
import {
  DashHeader, ColumnHeaders, FourColRow, CardHeader, NotInTotalTag, KpiCard,
  KeyMetricCard, KeyMetricsPicker, LaneLabel, EmptyState, fmtVal, Ico, accentForRole,
} from './ui'

// role → the attendance-view column its audience aggregate reads (mirrors
// dashboard.ts attendanceForRole). Used to build per-ministry drill selectors.
const ROLE_TO_ATT_COLUMN: Record<string, AttendanceColumn> = {
  ADULT_SERVICE: 'adults_attendance',
  KIDS_MINISTRY: 'kids_attendance',
  YOUTH_MINISTRY: 'youth_attendance',
  OTHER: 'other_attendance',
}

type Tracks = { tracks_volunteers: boolean; tracks_responses: boolean; tracks_giving: boolean }
interface GridPrefs {
  excludedTotalMinistries?: string[]
  keyMetrics?: KeyMetricsConfig            // #70 — ordered featured keys (church-wide)
  keyMetricTargets?: KeyMetricTargetsConfig // #70 — per-metric all-time targets
}

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
  summary, grandTotalOverride, tagSections, roleByTag, colorByTag, excluded, flags, onChangeFlags, onSavePrefs,
  tracks, hideComparisons, readOnly, windows, onDrill,
}: {
  summary: DashboardData['summary']
  grandTotalOverride: FourWin
  tagSections: TagSection[]
  roleByTag: Map<string, string | null>
  colorByTag: Map<string, string>   // resolved ministry colors (match Setup/History)
  excluded: Set<string>
  flags: SummaryMetricFlags
  onChangeFlags: (flags: SummaryMetricFlags) => void
  onSavePrefs: (next: GridPrefs) => void
  tracks: Tracks
  hideComparisons: boolean
  readOnly: boolean
  windows: DashboardData['windows']
  onDrill?: (selector: MetricSelector, window: DrillWindow) => void
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

  // Row accent — the SAME ministry color as Setup/History/the breakdown cards, so
  // "LifeKids Total" carries the LifeKids hue and the Giving row carries the Giving
  // ministry's hue. Only rows that map 1:1 to a ministry get a bar; aggregates
  // (Grand Total, Total Volunteers, First-Time Decisions) stay neutral.
  function accentFor(key: SummaryMetricKey): string | undefined {
    if (key === 'adults' || key === 'kids' || key === 'youth') {
      const named = tagSections.filter(s => s.tag_id !== 'UNASSIGNED' && roleByTag.get(s.tag_id) === ROLE_OF[key])
      if (named.length === 1) return colorByTag.get(named[0].tag_id)
      return undefined
    }
    if (key === 'giving') {
      const giving = tagSections.find(s => s.tag_code === 'GIVING')
      return giving ? colorByTag.get(giving.tag_id) : undefined
    }
    return undefined
  }

  const effectivelyHidden = (k: SummaryMetricKey): boolean => {
    if (k === 'volunteers' && !tracks.tracks_volunteers) return true
    if (k === 'firstTimeDecisions' && !tracks.tracks_responses) return true
    if (k === 'giving' && !tracks.tracks_giving) return true
    return !flags[k]
  }

  // #69/#73 — per-row drill selectors.
  // Attendance-backed summary rows + giving + volunteers are clickable.
  // first-time-decisions has no single metricId in the summary (it aggregates
  // all FTD-code metrics), so it remains non-drillable for now.
  const ATT_COLUMN_FOR_SUMMARY: Partial<Record<SummaryMetricKey, AttendanceColumn>> = {
    grandTotal: 'total_attendance',
    adults:     'adults_attendance',
    kids:       'kids_attendance',
    youth:      'youth_attendance',
  }
  const selectorFor = (key: SummaryMetricKey): MetricSelector | null => {
    const col = ATT_COLUMN_FOR_SUMMARY[key]
    if (col) return { label: attendanceLabel(key), source: { kind: 'attendance', column: col } }
    if (key === 'giving') return { label: 'Giving', prefix: '$', source: { kind: 'giving-weekly' } }
    if (key === 'volunteers') return { label: 'Total Volunteers', source: { kind: 'volunteers-total' } }
    return null
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
                    <span
                      className={`h-4 w-1.5 rounded-full ${colorByTag.has(s.tag_id) ? '' : accentForRole(roleByTag.get(s.tag_id) ?? null)}`}
                      style={colorByTag.has(s.tag_id) ? { backgroundColor: colorByTag.get(s.tag_id) } : undefined}
                      aria-hidden
                    />
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
            selector={selectorFor(key)}
            onDrill={onDrill}
            accentColor={accentFor(key)}
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
// Phase B: a container (parent) ministry can nest its children. When it has
// children, the header shows an expand chevron + a "N groups" label, and the
// expanded child cards render indented underneath (handled by the page).
function TagBlock({
  section, role, accentColorHex, excluded, tracks, hideComparisons, windows, onDrill,
  showExpandToggle, expanded, onToggleExpand,
}: {
  section: TagSection
  role: string | null
  accentColorHex?: string   // resolved ministry color (matches Setup/History); undefined → role fallback
  excluded: boolean
  tracks: { tracks_volunteers: boolean; tracks_responses: boolean }
  hideComparisons: boolean
  windows: DashboardData['windows']
  onDrill?: (selector: MetricSelector, window: DrillWindow) => void
  showExpandToggle?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
}) {
  const isUnassigned = section.tag_id === 'UNASSIGNED'
  // #69 — per-ministry attendance drillable via audience column.
  const attCol = role ? ROLE_TO_ATT_COLUMN[role] : undefined
  const attSelector: MetricSelector | null = !isUnassigned && attCol
    ? { label: `${section.tag_name} · Attendance`, source: { kind: 'attendance', column: attCol } }
    : null
  // #73 — per-ministry volunteers drillable via 'volunteers-ministry' source.
  const volSelector: MetricSelector | null = !isUnassigned
    ? { label: `${section.tag_name} · Volunteers`, source: { kind: 'volunteers-ministry', ministryTagId: section.tag_id } }
    : null
  const hasGroups = section.groupCount > 0
  // Accent comes from the ministry's Setup color (resolved to match the Setup tree
  // + History exactly) so the same thing reads the same hue everywhere ("giving is
  // green → green everywhere"). No resolved color → role lane (or slate for the
  // unassigned bucket).
  const accentStyle = !isUnassigned && accentColorHex ? { backgroundColor: accentColorHex } : undefined
  const accentClass = accentStyle ? undefined : (isUnassigned ? 'bg-slate-300' : accentForRole(role))
  return (
    // Excluded-from-total cards are NOT dimmed — the box stays full-strength and
    // legible; the "not in total" tag alone signals it sits outside the grand total.
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader
        label={section.tag_name}
        role={isUnassigned ? undefined : role}
        accentClass={accentClass}
        accentStyle={accentStyle}
        suffix={
          <>
            {excluded ? <NotInTotalTag /> : undefined}
            {hasGroups && (
              <span
                title="Number of ministries rolling up into this card"
                className="shrink-0 rounded-full bg-[#06B6D4]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0E7490]"
              >{section.groupCount} group{section.groupCount === 1 ? '' : 's'}</span>
            )}
          </>
        }
        trailing={
          showExpandToggle && onToggleExpand ? (
            <button
              onClick={onToggleExpand}
              title={expanded ? 'Collapse roll-up groups' : 'Expand roll-up groups'}
              aria-label={expanded ? 'Collapse roll-up groups' : 'Expand roll-up groups'}
              aria-expanded={expanded}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#06B6D4]/40"
            >
              <Ico.chevron className={`h-4 w-4 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} />
            </button>
          ) : undefined
        }
      />
      <ColumnHeaders windows={windows} />
      <div>
        {!isUnassigned && <FourColRow label="Attendance" values={section.attendance} hideComparisons={hideComparisons} selector={attSelector} onDrill={onDrill} />}
        {tracks.tracks_volunteers && (
          <FourColRow
            label="Volunteers"
            values={section.volunteers}
            hideComparisons={hideComparisons}
            selector={isUnassigned ? null : volSelector}
            onDrill={onDrill}
          />
        )}
        {tracks.tracks_responses && section.stats.map(s => (
          <FourColRow
            key={s.category_id}
            label={s.category_name}
            values={s.values}
            hideComparisons={hideComparisons}
            selector={{ label: `${section.tag_name} · ${s.category_name}`, source: { kind: 'stat', metricId: s.category_id } }}
            onDrill={onDrill}
          />
        ))}
      </div>
    </div>
  )
}

// ── Zone H — Other stats (church-wide remainder, E-70) ────────────────────────
function OtherStatsBlock({ rows, hideComparisons, windows, onDrill }: {
  rows: DashboardData['otherStats']
  hideComparisons: boolean
  windows: DashboardData['windows']
  onDrill?: (selector: MetricSelector, window: DrillWindow) => void
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
              <FourColRow
                key={r.key}
                label={r.category_name}
                values={r.values}
                hideComparisons={hideComparisons}
                selector={{ label: r.category_name, source: { kind: 'stat', metricId: r.category_id } }}
                onDrill={onDrill}
              />
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
      // 0039 split: prefs from dashboard_prefs (legacy grid_config keys pre-apply).
      setGridPrefs(readChurchPrefs(ch) as GridPrefs)

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

  // E-22 / N-6 — persist church-wide prefs (0039 split: churches.dashboard_prefs,
  // legacy grid_config fallback handled inside saveChurchPrefs). The argument is
  // a PATCH merged over the current gridPrefs, so saving one section (e.g.
  // include-in-total) never drops another saved earlier this session. #70.
  // Transient save status surfaces "Saved ✓" / "Couldn't save" and rolls back
  // the optimistic update on failure (incl. silent RLS zero-row writes). #70.
  const [prefsStatus, setPrefsStatus] = useState<null | 'saving' | 'saved' | 'error'>(null)
  const prefsStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  async function handleSavePrefs(patch: GridPrefs) {
    if (!churchId) return
    const prev = gridPrefs
    const next = { ...gridPrefs, ...patch }
    setGridPrefs(next)                 // optimistic
    setPrefsStatus('saving')
    const res = await saveChurchPrefs(supabase, churchId, next as Record<string, unknown>)
    if (!res.ok) {
      setGridPrefs(prev)               // roll back — never leave a false "saved" state on screen
      setPrefsStatus('error')
      console.error('dashboard prefs save failed:', res.message)
    } else {
      setPrefsStatus('saved')
    }
    if (prefsStatusTimer.current) clearTimeout(prefsStatusTimer.current)
    prefsStatusTimer.current = setTimeout(() => setPrefsStatus(null), 2500)
  }

  // ── Key Metrics (#70) — owner/admin only. Persist ordered featured keys +
  //    per-metric all-time targets church-wide (grid_config, no migration).
  const canEditKeyMetrics = role === 'owner' || role === 'admin'
  const [pickerOpen, setPickerOpen] = useState(false)

  function handleSaveKeyMetrics(keys: string[]) {
    handleSavePrefs({ keyMetrics: { ...(gridPrefs.keyMetrics ?? {}), churchWide: keys } })
  }
  function handleSaveTarget(metricKey: string, value: number | null) {
    const cur = { ...(gridPrefs.keyMetricTargets?.churchWide ?? {}) }
    if (value === null) delete cur[metricKey]
    else cur[metricKey] = value
    handleSavePrefs({ keyMetricTargets: { ...(gridPrefs.keyMetricTargets ?? {}), churchWide: cur } })
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

  // ── Drill-down (#69) — clicking a value cell opens a drawer with the 4-week
  //    sittings grid + YTD chart for that metric. Anchored to the same asOf date
  //    as the dashboard so the drawer numbers reconcile with the cards.
  const [drillOpen, setDrillOpen] = useState(false)
  const [drillLoading, setDrillLoading] = useState(false)
  const [drillSeries, setDrillSeries] = useState<MetricSeries | null>(null)
  const [drillWindow, setDrillWindow] = useState<DrillWindow | null>(null)

  async function handleDrill(selector: MetricSelector, window: DrillWindow) {
    if (!church) return
    setDrillWindow(window)
    setDrillSeries(null)
    setDrillLoading(true)
    setDrillOpen(true)
    const anchor = asOfStr ? new Date(asOfStr + 'T12:00:00') : undefined
    try {
      const series = await fetchMetricSeries(church.id, selector, anchor)
      setDrillSeries(series)
    } catch (e) {
      console.error('[dashboard] drill fetch failed:', e)
    } finally {
      setDrillLoading(false)
    }
  }

  const highlightDelta = (h: { current: number; prior: number }) =>
    h.prior === 0 ? null : Math.round(((h.current - h.prior) / h.prior) * 100)

  const hideComparisons = !!data && data.weeksWithData < 2
  const excluded = useMemo(() => new Set(gridPrefs.excludedTotalMinistries ?? []), [gridPrefs])

  // ── Phase B nesting — build parent→child tree from tagSections. Roots are
  //    sections with no parent (or whose parent isn't a rendered section, so an
  //    orphan never disappears). UNASSIGNED is always a root. ─────────────────
  const { roots, childrenByParent } = useMemo(() => {
    const sections = data?.tagSections ?? []
    const ids = new Set(sections.map(s => s.tag_id))
    const childrenByParent = new Map<string, TagSection[]>()
    const roots: TagSection[] = []
    for (const s of sections) {
      const p = s.tag_id === 'UNASSIGNED' ? null : s.parent_tag_id
      if (p && ids.has(p)) {
        const arr = childrenByParent.get(p) ?? []
        arr.push(s)
        childrenByParent.set(p, arr)
      } else {
        roots.push(s)
      }
    }
    return { roots, childrenByParent }
  }, [data])

  // ── Ministry colors — REPLICATE Setup/History exactly so the same thing reads
  //    the same hue everywhere ("giving is green → green on the dashboard too").
  //    Same recipe as settings/track: positional palette over the top-level
  //    ministries in display order, with each ministry's chosen color (0040,
  //    service_tags.color) as an override. Children inherit their root's color.
  //    Every ministry gets a color (palette never returns empty), so even an
  //    un-customized church matches between Setup, History, and here. ──────────
  const colorByTag = useMemo(() => {
    const sections = data?.tagSections ?? []
    const byId = new Map(sections.map(s => [s.tag_id, s]))
    const rootSections = sections.filter(
      s => s.tag_id !== 'UNASSIGNED' && !(s.parent_tag_id && byId.has(s.parent_tag_id)),
    )
    const overrides = new Map<string, string>()
    for (const r of rootSections) if (r.color) overrides.set(r.tag_id.toLowerCase(), r.color)
    const colorMap = buildGroupColorMap(rootSections.map(r => `group_${r.tag_id}`), overrides)
    // walk parent_tag_id up to the rendered root (cycle-guarded)
    const rootOf = (tagId: string): string => {
      let cur = byId.get(tagId)
      const seen = new Set<string>()
      while (cur && cur.parent_tag_id && byId.has(cur.parent_tag_id) && !seen.has(cur.tag_id)) {
        seen.add(cur.tag_id)
        cur = byId.get(cur.parent_tag_id)
      }
      return cur?.tag_id ?? tagId
    }
    const out = new Map<string, string>()
    for (const s of sections) {
      if (s.tag_id === 'UNASSIGNED') continue
      const gc = colorMap.get(rootOf(s.tag_id).toLowerCase())
      if (gc) out.set(s.tag_id, gc.strong)
    }
    return out
  }, [data])

  // The Giving ministry's resolved color — tints the top Giving KPI card so
  // giving reads the same hue from the very top of the page on down.
  const givingColor = useMemo(() => {
    const giving = (data?.tagSections ?? []).find(s => s.tag_code === 'GIVING')
    return giving ? colorByTag.get(giving.tag_id) : undefined
  }, [data, colorByTag])

  // Parents expanded by default so roll-up children are visible on first paint.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleExpand = (tagId: string) =>
    setCollapsed(c => { const n = new Set(c); if (n.has(tagId)) n.delete(tagId); else n.add(tagId); return n })

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

  // Stable across renders so dependent memos (keyMetricCatalog) actually cache
  // (FELIX #70 Finding 3 — a fresh object literal each render busted the memo).
  const tracks: Tracks = useMemo(
    () => church
      ? { tracks_volunteers: church.tracks_volunteers, tracks_responses: church.tracks_responses, tracks_giving: church.tracks_giving }
      : { tracks_volunteers: false, tracks_responses: false, tracks_giving: false },
    [church],
  )

  // Key Metrics (#70): build the catalog from already-derived dashboard values
  // (numbers reconcile with the cards verbatim — no new fetch), then resolve the
  // featured set + targets from grid_config (church-wide, Phase 1). Grand Total
  // uses the exclusion-adjusted override so it matches the Totals card (Finding 1).
  const keyMetricCatalog = useMemo(
    () => (data ? buildKeyMetricCatalog(data, roleByTag, tracks, grandTotalOverride) : []),
    [data, roleByTag, tracks, grandTotalOverride],
  )
  const keyMetricKeys = useMemo(() => resolveKeyMetricKeys(gridPrefs.keyMetrics), [gridPrefs])
  const keyMetricTargets = useMemo(() => resolveKeyMetricTargets(gridPrefs.keyMetricTargets), [gridPrefs])
  const featuredKeyMetrics = useMemo(
    () => featuredEntries(keyMetricKeys, keyMetricCatalog),
    [keyMetricKeys, keyMetricCatalog],
  )

  // #73 — resolve a catalog key → MetricSelector so KeyMetricCard cells can open
  // the drill drawer. Covers all catalog key shapes (see dashboardKeyMetrics.ts).
  // Returns null when no drill is possible (e.g. firstTimeDecisions aggregate).
  function selectorForKeyMetric(key: string, label: string, prefix?: string, suffix?: string): MetricSelector | null {
    // Totals (summary)
    if (key === 'summary:grandTotal') return { label, source: { kind: 'attendance', column: 'total_attendance' } }
    if (key === 'summary:adults')     return { label, source: { kind: 'attendance', column: 'adults_attendance' } }
    if (key === 'summary:kids')       return { label, source: { kind: 'attendance', column: 'kids_attendance' } }
    if (key === 'summary:youth')      return { label, source: { kind: 'attendance', column: 'youth_attendance' } }
    if (key === 'summary:volunteers') return { label, source: { kind: 'volunteers-total' } }
    if (key === 'summary:giving')     return { label, prefix: '$', source: { kind: 'giving-weekly' } }
    // summary:firstTimeDecisions — aggregates multiple FTD metrics; no single metricId → not drillable.

    // Per-ministry keys: "ministry:{tagId}:attendance" | "ministry:{tagId}:volunteers" | "ministry:{tagId}:stat:{metricId}"
    const ministryAttMatch = key.match(/^ministry:([^:]+):attendance$/)
    if (ministryAttMatch) {
      const tagId = ministryAttMatch[1]
      const role = roleByTag.get(tagId) ?? null
      const col: AttendanceColumn = role ? (ROLE_TO_ATT_COLUMN[role] ?? 'total_attendance') : 'total_attendance'
      return { label, source: { kind: 'attendance', column: col } }
    }
    const ministryVolMatch = key.match(/^ministry:([^:]+):volunteers$/)
    if (ministryVolMatch) {
      const tagId = ministryVolMatch[1]
      return { label, source: { kind: 'volunteers-ministry', ministryTagId: tagId } }
    }
    const ministryStatMatch = key.match(/^ministry:([^:]+):stat:(.+)$/)
    if (ministryStatMatch) {
      const metricId = ministryStatMatch[2]
      return { label, source: { kind: 'stat', metricId } }
    }

    // Other stats: "other:{metricId}|{tagCode}"
    const otherMatch = key.match(/^other:(.+)\|/)
    if (otherMatch) {
      const metricId = otherMatch[1]
      return { label, source: { kind: 'stat', metricId } }
    }

    // Reporting / ratio metrics
    if (key === 'reporting:weeklyAvgAttendance') {
      return { label, source: { kind: 'attendance', column: 'total_attendance' } }
    }
    if (key === 'reporting:volToAttendancePct') {
      return {
        label, suffix: '%',
        source: { kind: 'ratio', numerator: 'volunteers-total' as RatioOperand, denominator: 'attendance-total' as RatioOperand, scale: 100 },
      }
    }
    if (key === 'reporting:perCapitaGiving') {
      return {
        label, prefix: '$',
        source: { kind: 'ratio', numerator: 'giving' as RatioOperand, denominator: 'attendance-total' as RatioOperand, scale: 1 },
      }
    }

    return null
  }

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
                        accentColor={givingColor}
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

                  {/* ── Zone E — Key Metrics strip (#70) — curated + targets, moved up to
                       sit with the top KPI cards. Owner/admin pick ANY dashboard metric
                       via the gear and set an all-time target per card. ─ */}
                  <div>
                    <LaneLabel
                      label="Key Metrics"
                      accentStyle={{ background: '#06B6D4' }}
                      trailing={
                        <div className="flex items-center gap-2">
                          {prefsStatus === 'saved' && <span className="text-[11px] font-semibold text-emerald-600">Saved ✓</span>}
                          {prefsStatus === 'error' && <span className="text-[11px] font-semibold text-[#B45309]">Couldn’t save — try again</span>}
                          {canEditKeyMetrics && (
                            <button
                              onClick={() => setPickerOpen(o => !o)}
                              title={pickerOpen ? 'Done choosing Key Metrics' : 'Choose which Key Metrics show'}
                              aria-label="Choose which Key Metrics show"
                              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-[#06B6D4]/40 ${pickerOpen ? 'bg-slate-100 text-[#06B6D4]' : 'text-slate-400 hover:text-slate-700'}`}
                            >
                              <Ico.gear className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      }
                    />
                    {pickerOpen && canEditKeyMetrics && (
                      <KeyMetricsPicker
                        catalog={keyMetricCatalog}
                        selected={keyMetricKeys}
                        onSave={handleSaveKeyMetrics}
                        onClose={() => setPickerOpen(false)}
                      />
                    )}
                    {featuredKeyMetrics.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-[12px] text-slate-400">
                        No Key Metrics selected{canEditKeyMetrics ? ' — use the gear to choose some.' : '.'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {featuredKeyMetrics.map(m => (
                          <KeyMetricCard
                            key={m.key}
                            metricKey={m.key}
                            label={m.label}
                            values={m.values}
                            prefix={m.prefix}
                            suffix={m.suffix}
                            target={keyMetricTargets[m.key] ?? null}
                            canEdit={canEditKeyMetrics}
                            onSaveTarget={handleSaveTarget}
                            drillSelector={selectorForKeyMetric(m.key, m.label, m.prefix, m.suffix)}
                            onDrill={handleDrill}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Zone D — Summary card (E-30..E-33) + E-22 edit. Column headers (E-20)
                       now render INSIDE each 4-col card so they stay visible while scrolling. ─ */}
                  <SummaryCard
                    summary={data.summary}
                    grandTotalOverride={grandTotalOverride}
                    tagSections={data.tagSections}
                    roleByTag={roleByTag}
                    colorByTag={colorByTag}
                    excluded={excluded}
                    flags={flags}
                    onChangeFlags={handleFlagsChange}
                    onSavePrefs={handleSavePrefs}
                    tracks={tracks}
                    hideComparisons={hideComparisons}
                    readOnly={readOnly}
                    windows={data.windows}
                    onDrill={handleDrill}
                  />

                  {/* ── Zone F — per-ministry breakdown (E-50..E-55). Phase B:
                       parent (container) cards nest their roll-up children, which
                       render indented underneath when the parent is expanded. ── */}
                  {roots.map(section => {
                    const children = childrenByParent.get(section.tag_id) ?? []
                    const hasChildren = children.length > 0
                    const expanded = !collapsed.has(section.tag_id)
                    return (
                      <div key={section.tag_id} className="space-y-3">
                        <TagBlock
                          section={section}
                          role={roleByTag.get(section.tag_id) ?? null}
                          accentColorHex={colorByTag.get(section.tag_id)}
                          excluded={excluded.has(section.tag_id)}
                          tracks={{ tracks_volunteers: tracks.tracks_volunteers, tracks_responses: tracks.tracks_responses }}
                          hideComparisons={hideComparisons}
                          windows={data.windows}
                          onDrill={handleDrill}
                          showExpandToggle={hasChildren}
                          expanded={expanded}
                          onToggleExpand={() => toggleExpand(section.tag_id)}
                        />
                        {hasChildren && expanded && (
                          <div className="ml-4 space-y-3 border-l-2 border-slate-100 pl-3">
                            {children.map(child => (
                              <TagBlock
                                key={child.tag_id}
                                section={child}
                                role={roleByTag.get(child.tag_id) ?? null}
                                accentColorHex={colorByTag.get(child.tag_id)}
                                excluded={excluded.has(child.tag_id)}
                                tracks={{ tracks_volunteers: tracks.tracks_volunteers, tracks_responses: tracks.tracks_responses }}
                                hideComparisons={hideComparisons}
                                windows={data.windows}
                                onDrill={handleDrill}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Zone G (church-wide Volunteer breakout) removed 2026-06-08 —
                     per-ministry volunteers + drill-down replace it; nesting comes in Phase B. */}

                  {/* ── Zone H — Other stats (E-70) ─────────────────────────── */}
                  {tracks.tracks_responses && (
                    <OtherStatsBlock rows={data.otherStats} hideComparisons={hideComparisons} windows={data.windows} onDrill={handleDrill} />
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

      {/* ── #69 — drill-down drawer (portaled to body) ─────────────────────── */}
      <DrillDownDrawer
        open={drillOpen}
        loading={drillLoading}
        series={drillSeries}
        triggerWindow={drillWindow}
        onClose={() => setDrillOpen(false)}
      />
    </AppLayout>
  )
}
