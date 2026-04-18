'use client'

// D1 — Full Dashboard — /dashboard
// IRIS_D1_ELEMENT_MAP.md v2.0 · E1–E10
// D-033 revised (four columns) · D-041 revised (tag only in Other Stats) · D-044 superseded
// D-045 carries (tracking flags) · D-053 (delta placement) · D-054 (localStorage prefs) · D-055 (grand total)

import { useState, useEffect, useMemo } from 'react'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import {
  fetchDashboardData,
  type DashboardData,
  type FourWin,
  type AudienceSection,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[10px] text-gray-300 font-medium tabular-nums">—</span>
  const up = delta >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${
      up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
    }`}>
      {up ? '▲' : '▼'}{Math.abs(delta)}%
    </span>
  )
}

function fmtNum(n: number | null, prefix = '') {
  if (n === null) return <span className="text-gray-300">—</span>
  return <>{prefix}{n.toLocaleString()}</>
}

/**
 * A four-column value row with deltas beneath Col1 and Col3 (D-053).
 * If `hideComparisons`, only Col1 shows a value; Col2-4 show "—" and deltas hide.
 */
function FourColRow({
  label,
  values,
  prefix,
  indent,
  hideComparisons,
}: {
  label: string
  values: FourWin
  prefix?: string
  indent?: boolean
  hideComparisons?: boolean
}) {
  const dash = <span className="text-gray-300">—</span>
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-2 px-4 py-2 items-start border-b border-gray-50 last:border-b-0">
      <div className={`text-xs font-medium text-gray-600 leading-tight ${indent ? 'pl-4' : ''}`}>{label}</div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-900 tabular-nums leading-tight">{fmtNum(values.w, prefix)}</p>
        {!hideComparisons && <div className="mt-0.5"><DeltaBadge delta={values.delta_w_m4} /></div>}
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-700 tabular-nums leading-tight">{hideComparisons ? dash : fmtNum(values.m4, prefix)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-900 tabular-nums leading-tight">{hideComparisons ? dash : fmtNum(values.ytd, prefix)}</p>
        {!hideComparisons && <div className="mt-0.5"><DeltaBadge delta={values.delta_ytd_prior} /></div>}
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-700 tabular-nums leading-tight">{hideComparisons ? dash : fmtNum(values.priorYtd, prefix)}</p>
      </div>
    </div>
  )
}

function ColumnHeaders() {
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-2 px-4 pb-2 border-b border-gray-200">
      <div />
      <div className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wide">Curr Wk</div>
      <div className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wide">Last 4-Wk</div>
      <div className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wide">Curr YTD</div>
      <div className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wide">Prior YTD</div>
    </div>
  )
}

function SectionHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
      <div className={`w-1.5 h-4 rounded-full flex-shrink-0 ${accent}`} />
      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-widest">{label}</span>
    </div>
  )
}

// ─── Summary Card (E3) ────────────────────────────────────────────────────────

function SummaryCard({
  summary,
  flags,
  onChange,
  tracks,
  hideComparisons,
}: {
  summary: DashboardData['summary']
  flags: SummaryMetricFlags
  onChange: (flags: SummaryMetricFlags) => void
  tracks: { tracks_volunteers: boolean; tracks_responses: boolean; tracks_giving: boolean }
  hideComparisons: boolean
}) {
  const [open, setOpen] = useState(false)

  // Per D-045: tracking flags take precedence over user prefs — a metric is shown
  // only when BOTH its flag (if any) is true AND user has it toggled on.
  const effectivelyHidden = (k: SummaryMetricKey): boolean => {
    if (k === 'volunteers'         && !tracks.tracks_volunteers) return true
    if (k === 'firstTimeDecisions' && !tracks.tracks_responses)  return true
    if (k === 'giving'             && !tracks.tracks_giving)     return true
    return !flags[k]
  }

  const metricValues: Record<SummaryMetricKey, { values: FourWin; prefix?: string }> = {
    grandTotal:         { values: summary.grandTotal },
    adults:             { values: summary.adults },
    kids:               { values: summary.kids },
    youth:              { values: summary.youth },
    volunteers:         { values: summary.volunteers },
    firstTimeDecisions: { values: summary.firstTimeDecisions },
    giving:             { values: summary.giving, prefix: '$' },
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-50 to-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-[11px] font-bold text-blue-900 uppercase tracking-widest">Summary</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-[11px] font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
          aria-label="Customize summary metrics"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {open ? 'Done' : 'Customize'}
        </button>
      </div>

      {open && (
        <div className="px-4 py-3 bg-blue-50/40 border-b border-blue-100">
          <p className="text-[11px] font-semibold text-blue-900 mb-2">Show which metrics?</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {SUMMARY_METRIC_ORDER.map(key => {
              const disabled =
                (key === 'volunteers'         && !tracks.tracks_volunteers) ||
                (key === 'firstTimeDecisions' && !tracks.tracks_responses) ||
                (key === 'giving'             && !tracks.tracks_giving)
              return (
                <label key={key} className={`flex items-center gap-2 text-xs ${disabled ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={!disabled && flags[key]}
                    disabled={disabled}
                    onChange={e => onChange({ ...flags, [key]: e.target.checked })}
                  />
                  <span>{SUMMARY_METRIC_LABELS[key]}{disabled && ' (tracking off)'}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      <div>
        {SUMMARY_METRIC_ORDER.filter(k => !effectivelyHidden(k)).map(key => (
          <FourColRow
            key={key}
            label={SUMMARY_METRIC_LABELS[key]}
            values={metricValues[key].values}
            prefix={metricValues[key].prefix}
            hideComparisons={hideComparisons}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Audience Section (E4/E5/E6) ─────────────────────────────────────────────

function AudienceBlock({
  title,
  accent,
  section,
  tracks,
  attendanceLabel,
  hideComparisons,
}: {
  title: string
  accent: string
  section: AudienceSection
  tracks: { tracks_volunteers: boolean; tracks_responses: boolean }
  attendanceLabel?: string
  hideComparisons: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.06)]">
      <SectionHeader label={title} accent={accent} />
      <div>
        <FourColRow
          label={attendanceLabel ?? 'Attendance'}
          values={section.attendance}
          hideComparisons={hideComparisons}
        />
        {tracks.tracks_volunteers && (
          <FourColRow label="Volunteers" values={section.volunteers} hideComparisons={hideComparisons} />
        )}
        {tracks.tracks_responses && section.stats.map(s => (
          <FourColRow
            key={s.category_id}
            label={s.category_name}
            values={s.values}
            hideComparisons={hideComparisons}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Volunteer Breakout (E7) ─────────────────────────────────────────────────

function VolunteerBreakoutBlock({
  breakout,
  hideComparisons,
}: {
  breakout: DashboardData['volunteerBreakout']
  hideComparisons: boolean
}) {
  const audienceLabel = { MAIN: 'Adults', KIDS: 'Kids', YOUTH: 'Youth' } as const
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.06)]">
      <SectionHeader label="Volunteer Breakout" accent="bg-violet-500" />
      <div>
        <FourColRow label="Total" values={breakout.total} hideComparisons={hideComparisons} />
        {breakout.rows.map(r => (
          <FourColRow
            key={r.category_id}
            label={`${audienceLabel[r.audience_group_code]} · ${r.category_name}`}
            values={r.values}
            indent
            hideComparisons={hideComparisons}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Other Stats (E8) ────────────────────────────────────────────────────────

function OtherStatsBlock({
  rows,
  hideComparisons,
}: {
  rows: DashboardData['otherStats']
  hideComparisons: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.06)]">
      <SectionHeader label="Other Stats" accent="bg-amber-500" />
      <div>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-xs text-gray-400 italic">No other stats tracked.</p>
        ) : rows.map(r => (
          <FourColRow
            key={r.key}
            label={r.tag_code ? `${r.category_name} (${r.tag_code})` : r.category_name}
            values={r.values}
            hideComparisons={hideComparisons}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [church, setChurch] = useState<Church | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [flags, setFlags] = useState<SummaryMetricFlags>(DEFAULT_SUMMARY_METRICS)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(*)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole)
      // @ts-expect-error join
      const ch = membership.churches as Church
      setChurch(ch)
      setFlags(loadSummaryMetrics(user.id, membership.church_id))

      const d = await fetchDashboardData(membership.church_id, {
        tracks_volunteers: ch.tracks_volunteers,
        tracks_responses:  ch.tracks_responses,
        tracks_giving:     ch.tracks_giving,
      })
      setData(d)
      setLoading(false)
    })
  }, [])

  function handleFlagsChange(next: SummaryMetricFlags) {
    setFlags(next)
    if (userId && church) saveSummaryMetrics(userId, church.id, next)
  }

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    [],
  )

  const highlightDelta = (h: { current: number; prior: number }) =>
    h.prior === 0 ? null : Math.round(((h.current - h.prior) / h.prior) * 100)

  // E10 — one-week state: when there's data for a single week only, hide comparisons.
  const hideComparisons = !!data && data.weeksWithData < 2

  if (!church) return null

  return (
    <AppLayout role={role}>
      {/* E1 — Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900 text-base leading-tight">Dashboard</p>
            <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{church.name ?? 'Church Analytics'}</p>
          </div>
          <span className="text-[11px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">{todayLabel}</span>
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
            </div>
            <div className="h-48 bg-gray-100 rounded-2xl animate-pulse mt-4" />
            <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
          </div>
        ) : !data || !data.hasAnyData ? (
          /* E9 — Empty state */
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="font-semibold text-gray-900 mb-1">No data yet</p>
            <p className="text-sm text-gray-500">Data appears here after your first Sunday entry.</p>
          </div>
        ) : (
          <div className="space-y-5">

            {/* E2 — KPI Highlight Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative bg-white rounded-2xl border border-gray-100 p-4 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-2xl" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Attendance</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">{data.highlights.attendance.current.toLocaleString()}</p>
                  <DeltaBadge delta={highlightDelta(data.highlights.attendance)} />
                </div>
                <p className="text-[11px] text-gray-400 mt-2 tabular-nums">vs {data.highlights.attendance.prior.toLocaleString()} last week</p>
              </div>

              {church.tracks_giving && (
                <div className="relative bg-white rounded-2xl border border-gray-100 p-4 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-2xl" />
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Giving</p>
                  <div className="flex items-end justify-between gap-2">
                    <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">${data.highlights.giving.current.toLocaleString()}</p>
                    <DeltaBadge delta={highlightDelta(data.highlights.giving)} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 tabular-nums">vs ${data.highlights.giving.prior.toLocaleString()} last week</p>
                </div>
              )}

              {church.tracks_volunteers && (
                <div className="relative bg-white rounded-2xl border border-gray-100 p-4 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500 rounded-t-2xl" />
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Serving</p>
                  <div className="flex items-end justify-between gap-2">
                    <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">{data.highlights.volunteers.current.toLocaleString()}</p>
                    <DeltaBadge delta={highlightDelta(data.highlights.volunteers)} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 tabular-nums">vs {data.highlights.volunteers.prior.toLocaleString()} last week</p>
                </div>
              )}
            </div>

            {/* Column headers (shared across all sections) */}
            <ColumnHeaders />

            {/* E3 — Summary Card */}
            <SummaryCard
              summary={data.summary}
              flags={flags}
              onChange={handleFlagsChange}
              tracks={{
                tracks_volunteers: church.tracks_volunteers,
                tracks_responses:  church.tracks_responses,
                tracks_giving:     church.tracks_giving,
              }}
              hideComparisons={hideComparisons}
            />

            {/* E4 — Adults */}
            <AudienceBlock
              title="Adults"
              accent="bg-blue-500"
              section={data.adults}
              tracks={{ tracks_volunteers: church.tracks_volunteers, tracks_responses: church.tracks_responses }}
              hideComparisons={hideComparisons}
            />

            {/* E5 — Kids */}
            <AudienceBlock
              title="Kids"
              accent="bg-pink-500"
              section={data.kids}
              tracks={{ tracks_volunteers: church.tracks_volunteers, tracks_responses: church.tracks_responses }}
              hideComparisons={hideComparisons}
            />

            {/* E6 — Youth (attendance labeled "Students") */}
            <AudienceBlock
              title="Youth"
              accent="bg-orange-500"
              section={data.youth}
              tracks={{ tracks_volunteers: church.tracks_volunteers, tracks_responses: church.tracks_responses }}
              attendanceLabel="Students"
              hideComparisons={hideComparisons}
            />

            {/* E7 — Volunteer Breakout */}
            {church.tracks_volunteers && (
              <VolunteerBreakoutBlock breakout={data.volunteerBreakout} hideComparisons={hideComparisons} />
            )}

            {/* E8 — Other Stats */}
            {church.tracks_responses && (
              <OtherStatsBlock rows={data.otherStats} hideComparisons={hideComparisons} />
            )}

            {/* E10 — One Week footnote */}
            {hideComparisons && (
              <p className="text-center text-xs text-gray-400 italic py-2">
                Comparisons appear after two weeks of data.
              </p>
            )}

          </div>
        )}
      </div>
    </AppLayout>
  )
}
