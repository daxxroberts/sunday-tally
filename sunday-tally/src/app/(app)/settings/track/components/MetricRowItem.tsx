'use client'

// ─────────────────────────────────────────────────────────────────────────
// MetricRowItem — one count in a section (mirrored-metrics editor).
//
// Each row leads with a color-coded KIND pill (abbreviated; hover for the full
// word), then the name, an optional demographic (Attendance / Volunteers), and
// — for the owning ministry — Remove + (on a ministry count) a quiet "move
// between sections" link. Rows are indented under their section header. There
// is NO entry/roll-up toggle: the section a count lives in IS its kind.
//
//   • template      — a count every subgroup mirrors; the ministry shows the total.
//   • ministry_only — counted at the ministry as a whole; offers "move to every
//                      subgroup" (free move — its existing entries stay put and
//                      still count even after the move; server-side only blocks
//                      when the ministry already counts that kind the other way).
//   • group_only    — counted just for this subgroup.
//   • mirror        — the template as seen in a subgroup: GHOSTED + LOCKED.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import InlineEditField from '@/components/shared/InlineEditField'
import { Tooltip } from '@/components/shared/Tooltip'
import { Ico, roleLabel } from '@/app/(app)/entries/ui'
import type { TagRole } from '../actions'
import { ROLE_OPTIONS, type Metric } from '../types'

// Small lock glyph (no `lock` in Ico) — matches the shared stroke style.
function LockIco(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

// Abbreviated + color-coded kind pill. Full word on hover.
const KIND_STYLE: Record<string, { abbr: string; cls: string }> = {
  ATTENDANCE:    { abbr: 'ATT',  cls: 'bg-indigo-50 text-indigo-700' },
  VOLUNTEERS:    { abbr: 'VOL',  cls: 'bg-amber-50 text-amber-700' },
  RESPONSE_STAT: { abbr: 'STAT', cls: 'bg-violet-50 text-violet-700' },
  GIVING:        { abbr: 'GIV',  cls: 'bg-emerald-50 text-emerald-700' },
}
function KindChip({ code, label }: { code?: string; label?: string }) {
  if (!code && !label) return null
  const s = (code && KIND_STYLE[code]) || { abbr: (label ?? '').slice(0, 4).toUpperCase(), cls: 'bg-slate-100 text-slate-600' }
  const full = label || code
  // tabIndex + aria-label make the full word reachable by keyboard/screen
  // reader, not just mouse hover — the Tooltip only opens on focus if its
  // child can actually receive focus (review finding #62).
  const chip = (
    <span
      tabIndex={full ? 0 : undefined}
      aria-label={full}
      className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold uppercase leading-none tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40 ${s.cls}`}
    >
      {s.abbr}
    </span>
  )
  return full ? <Tooltip className="inline-flex shrink-0 items-center" text={full}>{chip}</Tooltip> : chip
}

export function MetricRowItem({
  metric, write, kindCode, kindLabel, showDemographic, inheritedRole, ministryName,
  onRename, onRemove, onSetDemographic, onMoveSection,
}: {
  metric: Metric
  write: boolean
  /** Reporting kind code (ATTENDANCE / VOLUNTEERS / …) — drives the pill. */
  kindCode?: string
  /** Full kind word, shown on hover of the pill. */
  kindLabel?: string
  /** Attendance / Volunteers counts can carry a per-count demographic. */
  showDemographic: boolean
  /** The ministry's role — the default this count inherits when not overridden. */
  inheritedRole: TagRole
  /** Owning ministry name — used in the locked mirror's "from {ministry}" note. */
  ministryName?: string
  onRename: (name: string) => Promise<void>
  onRemove: () => void
  onSetDemographic: (demographic: TagRole | null) => void
  /** ministry-level counts only: move between "at the ministry" and "every
   *  subgroup". Omit to hide the link. Free move — existing entries stay and
   *  keep counting; the server only blocks when this ministry already counts
   *  that kind the other way (decision 8). */
  onMoveSection?: () => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const isMirror = metric.metric_role === 'mirror'
  // Period = weekly/monthly church-wide (e.g. Giving). Shown with a cadence badge.
  const isPeriod = metric.scope === 'period'

  // ── Locked mirror row: ghosted, no controls, a lock + "from {ministry}". ──
  if (isMirror) {
    return (
      <li className="flex items-center gap-2 py-3 pl-8 pr-5 opacity-60">
        <LockIco className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <KindChip code={kindCode} label={kindLabel} />
        <span className="text-[14px] font-medium text-slate-600">{metric.name}</span>
        {showDemographic && metric.counted_demographic && (
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Counts {roleLabel(metric.counted_demographic)}
          </span>
        )}
        <Tooltip className="ml-auto shrink-0" text="This count comes from the ministry. Edit it on the ministry and every subgroup updates together.">
          <span className="text-[11px] text-slate-400">from {ministryName ?? 'the ministry'}</span>
        </Tooltip>
      </li>
    )
  }

  return (
    <li className="group py-3 pl-8 pr-5 transition-colors duration-200 hover:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <KindChip code={kindCode} label={kindLabel} />
          {write ? (
            <InlineEditField value={metric.name} onSave={onRename} aria-label={metric.name} className="text-[14px] font-medium text-slate-800" />
          ) : (
            <span className="text-[14px] font-medium text-slate-800">{metric.name}</span>
          )}
          {isPeriod && (
            <Tooltip className="shrink-0" text="One number for the whole church, once a week. You set the schedule in Services and Occurrences.">
              <span className="rounded-md bg-[#4F6EF7]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3D5BD4]">
                {metric.cadence === 'month' ? 'Monthly' : 'Weekly'} · church-wide
              </span>
            </Tooltip>
          )}
          {/* View-only: show an explicit demographic when it differs from the ministry default. */}
          {!write && showDemographic && metric.counted_demographic && (
            <Tooltip className="shrink-0" text="Who this count counts.">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Counts {roleLabel(metric.counted_demographic)}
              </span>
            </Tooltip>
          )}
        </div>

        {write && (
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            {/* who-are-you-counting (Attendance / Volunteers only). Uniform neutral
                styling; the "· default" label carries whether it's inherited. A
                template's pick propagates to its mirrors (server-side). Sits right
                next to the trash can — both pinned to the row's right edge. */}
            {showDemographic && (
              <Tooltip className="inline-flex items-center" text="Who you're actually counting here. Defaults to this ministry — change it to count a different group (e.g. students serving in the adult ministry).">
                <select
                  value={metric.counted_demographic ?? ''}
                  onChange={e => onSetDemographic(e.target.value ? (e.target.value as TagRole) : null)}
                  aria-label="Who are you counting?"
                  className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-600 outline-none focus:border-[#4F6EF7]"
                >
                  <option value="">{roleLabel(inheritedRole)} · default</option>
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Tooltip>
            )}
            {confirmRemove ? (
              <span className="flex items-center gap-1">
                <button onClick={() => { onRemove(); setConfirmRemove(false) }} className="rounded-lg px-2 py-1 text-[12px] font-semibold text-[#B45309] transition-colors hover:bg-[#F59E0B]/10">Confirm</button>
                <button onClick={() => setConfirmRemove(false)} className="rounded-lg px-2 py-1 text-[12px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">Cancel</button>
              </span>
            ) : (
              <Tooltip text={`Remove ${metric.name}`}>
                <button onClick={() => setConfirmRemove(true)} aria-label={`Remove ${metric.name}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
                  <Ico.trash className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* second line — left-justified, quiet: ministry_only w/ move → the move
          link (light gray); period → schedule note. Templates have no second line. */}
      {(isPeriod || (write && onMoveSection)) && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
          {isPeriod ? (
            <span className="text-slate-400">
              How often this is counted is set on its schedule in Services and Occurrences.
            </span>
          ) : (write && onMoveSection) ? (
            metric.metric_role === 'template' ? (
              <Tooltip text="Count this once for the ministry as a whole instead. Numbers you've already recorded for the ministry stay put; each subgroup's mirrored copy of this count is removed.">
                <button
                  onClick={onMoveSection}
                  className="font-medium text-slate-400 transition-colors hover:text-slate-600 hover:underline"
                >
                  Move to Ministry Counts
                </button>
              </Tooltip>
            ) : (
              <Tooltip text="Count this in every subgroup instead. Numbers you've already recorded stay with the ministry total; from here you enter it per subgroup.">
                <button
                  onClick={onMoveSection}
                  className="font-medium text-slate-400 transition-colors hover:text-slate-600 hover:underline"
                >
                  Move to every subgroup
                </button>
              </Tooltip>
            )
          ) : null}
        </div>
      )}
    </li>
  )
}
