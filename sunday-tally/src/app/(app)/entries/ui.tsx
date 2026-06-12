'use client'

// ─────────────────────────────────────────────────────────────────────────
// Entries screen — shared UI primitives (DS-1..DS-25, IRIS_ENTRIES_ELEMENT_MAP)
// SVG icons only (DS-14) · status circles (DS-6/E-50) · tabular numerals (DS-4).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'

export type Stat = 'complete' | 'needs' | 'empty'
export type Saved = 'idle' | 'saving' | 'saved' | 'error'

/* ── domain types (shared by page + components) ──────────────────────────── */
export interface Metric {
  id: string
  name: string
  code: string
  scope: 'instance' | 'period'
  is_canonical: boolean
  cadence: 'day' | 'week' | 'month' | null
  ministry_tag_id: string | null
  reporting_tag_code: string | null
}
export interface Ministry {
  tag_id: string
  name: string
  tag_role: string | null
  sort_order: number
  metrics: Metric[]      // canonical instance metrics for this ministry
}
export interface Instance {
  id: string
  service_date: string
  template_id: string
  template_name: string
  start_datetime: string | null
  ministries: Ministry[]
  /** Template has location_id NULL (0036) — one shared occurrence for the whole
   *  church, shown at every campus after a "Church-wide" divider (EN1). */
  church_wide: boolean
}
// entries keyed by `${metric_id}|${service_instance_id}` (instance) or `${metric_id}|${period_anchor}` (period)
export type EntryMap = Record<string, { value: number | null; is_not_applicable: boolean }>

export interface GridPrefs { excludedTotalMinistries?: string[] }

/* ── date helper (client-side, browser-local is fine per task note) ──────── */
export function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* ── completion (N-6) ──────────────────────────────────────────────────── */
export function ministryStatus(m: Ministry, instId: string, entries: EntryMap): Stat {
  // completion is measured against REQUIRED (canonical) metrics only — non-canonical
  // metrics still render for entry but don't gate "complete"
  const canon = m.metrics.filter(x => x.is_canonical)
  if (canon.length === 0) return 'complete'
  let done = 0
  for (const metric of canon) {
    const e = entries[`${metric.id}|${instId}`]
    if (e && (e.is_not_applicable || e.value !== null)) done++
  }
  if (done === 0) return 'empty'
  if (done === canon.length) return 'complete'
  return 'needs'
}

export const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '0')

/* ── inline SVG icons (Lucide-style) ───────────────────────────────────── */
export const Ico = {
  left: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6" /></svg>),
  right: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6" /></svg>),
  chevron: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6" /></svg>),
  check: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5" /></svg>),
  calendar: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>),
  ban: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>),
  grid: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>),
  pencilFill: (p: any) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>),
  pin: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>),
  retry: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>),
  plus: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>),
  up: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m18 15-6-6-6 6" /></svg>),
  down: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6" /></svg>),
  trash: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>),
  users: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>),
  arrowUp: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m5 12 7-7 7 7M12 19V5" /></svg>),
  arrowDown: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12l7 7 7-7" /></svg>),
  barChart: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 3v18h18M8 17v-5M13 17V8M18 17v-9" /></svg>),
  layers: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></svg>),
  gear: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>),
}

/* ── role label for church_memberships.role (DS-8 "· Admin" meta) ────────── */
export function membershipRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'owner': return 'Owner'
    case 'admin': return 'Admin'
    case 'editor': return 'Editor'
    case 'viewer': return 'Viewer'
    default: return 'Member'
  }
}

/* ── status circle (E-50 / DS-6): gray outline · orange outline · sage check ─ */
export function Dot({ s }: { s: Stat }) {
  const base = 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full align-middle leading-none'
  if (s === 'complete') return <span className={`${base} bg-[#22C55E]`} title="Complete"><Ico.check className="h-2.5 w-2.5 text-white" /></span>
  if (s === 'needs') return <span className={`${base} border-2 border-[#F59E0B]`} title="Needs entries" />
  return <span className={`${base} border-2 border-slate-300`} title="Not started" />
}

/* ── ministry accent bar colour by tag_role (DS-1 category accents) ──────── */
export function accentForRole(role: string | null | undefined): string {
  switch (role) {
    case 'KIDS_MINISTRY': return 'bg-[#8B5CF6]'   // violet
    case 'YOUTH_MINISTRY': return 'bg-[#06B6D4]'  // teal
    case 'ADULT_SERVICE':
    default: return 'bg-[#4F6EF7]'                 // brand blue
  }
}

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'KIDS_MINISTRY': return 'Kids'
    case 'YOUTH_MINISTRY': return 'Youth'
    case 'ADULT_SERVICE': return 'Adults'
    default: return 'Other'
  }
}

/* ── autosave field (E-40 / DS-10) ───────────────────────────────────────
 * Controlled value lives in the parent; this component owns its own save
 * status and commits on blur via onCommit(value|null). Status indicator is
 * to the LEFT of the input so right edges align across rows. */
export function Field({
  fieldId, label, value, prefix, hint, indent, cadence, needs, readOnly,
  onCommit,
}: {
  fieldId: string
  label: string
  value: number | null | undefined
  prefix?: string
  hint?: string
  indent?: boolean
  cadence?: string
  needs?: boolean        // required canonical metric → amber when empty
  readOnly?: boolean
  onCommit: (val: number | null) => Promise<void>
}) {
  const [val, setVal] = useState<string>(value === null || value === undefined ? '' : String(value))
  const [saved, setSaved] = useState<Saved>('idle')

  // keep in sync if parent prefill changes (e.g. week switch / N/A toggle clears)
  useEffect(() => {
    setVal(value === null || value === undefined ? '' : String(value))
    setSaved('idle')
  }, [value])

  const empty = val.trim() === ''
  const showNeeds = empty && needs && saved !== 'saving'

  const commit = async () => {
    if (readOnly) return
    const parsed = empty ? null : parseFloat(val)
    if (parsed !== null && !Number.isFinite(parsed)) return
    // no-op if unchanged from prefill
    const prior = value === null || value === undefined ? null : value
    if (parsed === prior) { setSaved('idle'); return }
    setSaved('saving')
    try {
      await onCommit(parsed)
      setSaved('saved')
    } catch {
      setSaved('error')
    }
  }

  return (
    <div className={`group flex items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-slate-50 ${indent ? 'pl-3' : ''}`}>
      <label htmlFor={fieldId} className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-slate-700">{label}</span>
          {cadence && <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{cadence}</span>}
        </span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </label>
      <div className="flex items-center gap-2.5">
        <span className="flex w-[88px] items-center justify-end gap-1 text-[11px]" aria-live="polite">
          {saved === 'error' ? (
            <button type="button" onClick={commit} className="inline-flex items-center gap-1 font-medium text-[#B45309] hover:underline" title="Retry save">
              <Ico.retry className="h-3 w-3" />Retry
            </button>
          ) : showNeeds ? (
            <span className="font-medium text-[#B45309]">Needs entry</span>
          ) : saved === 'saving' ? (
            <span className="text-slate-400">Saving…</span>
          ) : saved === 'saved' ? (
            <><Ico.check className="h-3 w-3 text-[#22C55E]" /><span className="font-medium text-[#15803D]">Saved</span></>
          ) : null}
        </span>
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-num text-sm text-slate-400">{prefix}</span>}
          <input
            id={fieldId}
            type="number"
            inputMode="numeric"
            placeholder="—"
            value={val}
            disabled={readOnly}
            onChange={(e) => { setVal(e.target.value); setSaved('idle') }}
            onBlur={commit}
            className={`font-num h-10 w-28 rounded-lg border bg-white text-right text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-300 focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
              saved === 'error'
                ? 'border-[#F59E0B]/70 ring-1 ring-[#F59E0B]/25 focus-visible:border-[#4F6EF7] focus-visible:ring-[#4F6EF7]/25'
                : showNeeds
                ? 'border-[#F59E0B]/60 ring-1 ring-[#F59E0B]/20 focus-visible:border-[#4F6EF7] focus-visible:ring-[#4F6EF7]/25'
                : 'border-slate-200 focus-visible:border-[#4F6EF7] focus-visible:ring-[#4F6EF7]/25'
            } ${prefix ? 'pl-7 pr-3' : 'px-3'}`}
          />
        </div>
      </div>
    </div>
  )
}
