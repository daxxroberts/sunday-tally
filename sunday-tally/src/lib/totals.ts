// ─────────────────────────────────────────────────────────────────────────
// totals — the church's GRAND-TOTAL rules (TOTALS_RULES_PLAN.md, Phase 1).
//
// A church defines named totals ONCE in Setup; each rule says which reporting
// types it sums (attendance only, or attendance + volunteers = "everyone in the
// building"), which ministries are in it, and the default roll-up. This single
// definition drives the main dashboard total line, the AI builder's context
// pack, and the widget info-tab copy — so all three agree.
//
// PURE module: types + validation + resolution (saved rules, else the derived
// default). No DB, no React. Stored at churches.dashboard_prefs.totals
// (CHURCH_PREF_KEYS in churchPrefs.ts) — no migration.
// ─────────────────────────────────────────────────────────────────────────

export type ReportingType = 'ATTENDANCE' | 'VOLUNTEERS' | 'RESPONSE_STAT' | 'GIVING'
export type Rollup = 'weekly_avg' | 'sum'

export interface TotalRule {
  /** Stable slug, e.g. 'total_attendance' | 'total_present'. */
  id: string
  /** Pastor-facing name, e.g. "Total Attendance" | "Total Present". */
  name: string
  /** Reporting types summed into this total. ['ATTENDANCE'] = attendees only;
   *  ['ATTENDANCE','VOLUNTEERS'] = everyone in the building. */
  reportingTypes: ReportingType[]
  /** 'all' = every ministry NOT in excludedTotalMinistries; or specific tag ids. */
  ministries: 'all' | string[]
  /** Default headline math: weekly average (the house default) or running total. */
  rollup: Rollup
  /** The single headline grand total. Exactly one rule is primary (resolveTotals enforces). */
  isPrimary?: boolean
}

export const REPORTING_TYPES: ReportingType[] = ['ATTENDANCE', 'VOLUNTEERS', 'RESPONSE_STAT', 'GIVING']
export const ROLLUPS: Rollup[] = ['weekly_avg', 'sum']

/** Plain-language label for a reporting type (UI + AI context copy). */
export const REPORTING_TYPE_LABEL: Record<ReportingType, string> = {
  ATTENDANCE: 'Attendance',
  VOLUNTEERS: 'Volunteers',
  RESPONSE_STAT: 'Stats',
  GIVING: 'Giving',
}

/** The seeded default when a church has saved nothing — mirrors today's behavior
 *  (attendance-only primary) and adds the "everyone present" total the church asked for. */
export const DEFAULT_TOTALS: TotalRule[] = [
  {
    id: 'total_attendance',
    name: 'Total Attendance',
    reportingTypes: ['ATTENDANCE'],
    ministries: 'all',
    rollup: 'weekly_avg',
    isPrimary: true,
  },
  {
    id: 'total_present',
    name: 'Total Present',
    reportingTypes: ['ATTENDANCE', 'VOLUNTEERS'],
    ministries: 'all',
    rollup: 'weekly_avg',
  },
]

const REPORTING_SET = new Set<string>(REPORTING_TYPES)
const ROLLUP_SET = new Set<string>(ROLLUPS)

function isValidRule(x: unknown): x is TotalRule {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return false
  if (typeof r.name !== 'string' || !r.name) return false
  if (
    !Array.isArray(r.reportingTypes) ||
    r.reportingTypes.length === 0 ||
    !r.reportingTypes.every((t) => typeof t === 'string' && REPORTING_SET.has(t))
  ) return false
  if (
    r.ministries !== 'all' &&
    !(Array.isArray(r.ministries) && r.ministries.every((m) => typeof m === 'string'))
  ) return false
  if (typeof r.rollup !== 'string' || !ROLLUP_SET.has(r.rollup)) return false
  return true
}

/** Guarantee exactly one primary rule (first one wins if zero or many are flagged). */
function ensureSinglePrimary(rules: TotalRule[]): TotalRule[] {
  if (rules.length === 0) return rules
  const primaryIdx = rules.findIndex((r) => r.isPrimary)
  const chosen = primaryIdx === -1 ? 0 : primaryIdx
  return rules.map((r, i) => ({ ...r, isPrimary: i === chosen }))
}

/** Resolve the church's totals: the saved + validated rules, else the seeded default.
 *  Always returns at least the default set so consumers never have to special-case empty. */
export function resolveTotals(prefs: Record<string, unknown> | null | undefined): TotalRule[] {
  const raw = prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>).totals : undefined
  if (Array.isArray(raw)) {
    const valid = raw.filter(isValidRule)
    if (valid.length > 0) return ensureSinglePrimary(valid)
  }
  return ensureSinglePrimary(DEFAULT_TOTALS)
}

/** The single primary grand total (or the first rule). */
export function primaryTotal(rules: TotalRule[]): TotalRule | null {
  if (rules.length === 0) return null
  return rules.find((r) => r.isPrimary) ?? rules[0]
}

/** A concise one-line description of a rule for the AI context pack / info-tab copy,
 *  e.g. "Total Present = Attendance + Volunteers, all ministries, weekly average". */
export function describeTotalRule(rule: TotalRule): string {
  const types = rule.reportingTypes.map((t) => REPORTING_TYPE_LABEL[t]).join(' + ')
  const scope = rule.ministries === 'all' ? 'all included ministries' : `${rule.ministries.length} ministries`
  const roll = rule.rollup === 'weekly_avg' ? 'weekly average' : 'running total'
  return `${rule.name} = ${types}, ${scope}, ${roll}`
}
