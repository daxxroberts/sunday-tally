// ─────────────────────────────────────────────────────────────────────────
// KEY METRICS — catalog + config resolution (task #70, Phase 1: church-wide).
//
// Plan: KEY_METRICS_PLAN.md. The Key Metrics lane becomes a CURATED, TARGET-ABLE
// set: an owner/admin may promote ANY metric already shown on the dashboard into
// the lane and set an all-time target on each promoted card.
//
// This module is pure: it builds the metric CATALOG from a DashboardData object
// (every value the dashboard already computed — no new fetch, numbers reconcile
// with the cards verbatim) and resolves the saved config (ordered keys + targets)
// out of churches.grid_config.
//
// Phase 1 stores everything church-wide (grid_config.keyMetrics.churchWide /
// .keyMetricTargets.churchWide). Per-location overrides (byLocation) are typed
// here so Phase 2 drops in cleanly, but resolution only reads churchWide until
// dashboard.ts can scope its fetch by location (hard dependency — see plan §2/§8).
//
// Six DB Rules untouched: this layer only reshapes already-derived FourWin values;
// it never queries or mutates the database.
// ─────────────────────────────────────────────────────────────────────────

import type { DashboardData, FourWin } from '@/lib/dashboard'

export type KeyMetricGroup = 'Totals' | 'Per-Ministry' | 'Ratios' | 'Other'

export interface KeyMetricCatalogEntry {
  key: string                 // stable id (see KEY_METRICS_PLAN §4)
  label: string               // human label (audience labels are church-dynamic)
  group: KeyMetricGroup
  values: FourWin
  prefix?: string             // '$' for currency
  suffix?: string             // '%' for ratios
}

// ── grid_config shapes (jsonb on churches; no migration — plan §6) ────────────
export interface KeyMetricsConfig {
  churchWide?: string[]                              // ordered metric keys
  byLocation?: Record<string, string[]>             // Phase 2
}
export interface KeyMetricTargetsConfig {
  churchWide?: Record<string, number>
  byLocation?: Record<string, Record<string, number>>   // Phase 2
}

// Default featured set when nothing is saved: the three reporting ratios that
// shipped as the original hardcoded Key Metrics. Keys absent from the catalog
// (e.g. a ratio whose tracking is off) are silently dropped by the resolver, so
// this list is safe regardless of which tracks a church enables.
export const DEFAULT_KEY_METRIC_KEYS: string[] = [
  'reporting:weeklyAvgAttendance',
  'reporting:volToAttendancePct',
  'reporting:perCapitaGiving',
]

// ── audience label (church-dynamic) ──────────────────────────────────────────
// When exactly one ministry tag carries an audience role, show its real name
// ("Experience Total") instead of the generic "Adults". Mirrors SummaryCard's
// attendanceLabel so the catalog entry and the Totals row never disagree (E-50).
type AudienceKey = 'adults' | 'kids' | 'youth'
const ROLE_OF: Record<AudienceKey, string> = {
  adults: 'ADULT_SERVICE',
  kids:   'KIDS_MINISTRY',
  youth:  'YOUTH_MINISTRY',
}
const GENERIC_AUDIENCE_LABEL: Record<AudienceKey, string> = {
  adults: 'Adults', kids: 'Kids', youth: 'Youth',
}

export function audienceTotalLabel(
  key: AudienceKey,
  tagSections: DashboardData['tagSections'],
  roleByTag: Map<string, string | null>,
): string {
  const named = tagSections.filter(
    s => s.tag_id !== 'UNASSIGNED' && roleByTag.get(s.tag_id) === ROLE_OF[key],
  )
  if (named.length === 1) return `${named[0].tag_name} Total`
  return GENERIC_AUDIENCE_LABEL[key]
}

// ── catalog builder ───────────────────────────────────────────────────────────
// Maps every value the dashboard already shows to a promotable catalog entry.
// Only includes metrics that exist for this church + enabled tracks, so the
// picker never offers a card that would render empty.
export function buildKeyMetricCatalog(
  data: DashboardData,
  roleByTag: Map<string, string | null>,
  tracks: { tracks_volunteers: boolean; tracks_responses: boolean; tracks_giving: boolean },
  // Exclusion-adjusted grand total (E-54). The page computes grandTotalOverride at
  // the role level honouring excludedTotalMinistries; pass it so the featured
  // "Grand Total" Key Metric matches the Totals card verbatim. Defaults to the
  // raw summary total when no exclusions are in play. (FELIX #70 Finding 1.)
  grandTotalOverride?: FourWin,
): KeyMetricCatalogEntry[] {
  const out: KeyMetricCatalogEntry[] = []
  const s = data.summary

  // ── Totals (summary) ──
  out.push({ key: 'summary:grandTotal', label: 'Grand Total', group: 'Totals', values: grandTotalOverride ?? s.grandTotal })
  ;(['adults', 'kids', 'youth'] as AudienceKey[]).forEach(k => {
    out.push({
      key: `summary:${k}`,
      label: audienceTotalLabel(k, data.tagSections, roleByTag),
      group: 'Totals',
      values: s[k],
    })
  })
  if (tracks.tracks_volunteers) out.push({ key: 'summary:volunteers', label: 'Total Volunteers', group: 'Totals', values: s.volunteers })
  if (tracks.tracks_responses)  out.push({ key: 'summary:firstTimeDecisions', label: 'First-Time Decisions', group: 'Totals', values: s.firstTimeDecisions })
  if (tracks.tracks_giving)     out.push({ key: 'summary:giving', label: 'Giving', group: 'Totals', values: s.giving, prefix: '$' })

  // ── Per-Ministry ──
  for (const sec of data.tagSections) {
    if (sec.tag_id === 'UNASSIGNED') continue
    out.push({
      key: `ministry:${sec.tag_id}:attendance`,
      label: `${sec.tag_name} · Attendance`,
      group: 'Per-Ministry',
      values: sec.attendance,
    })
    if (tracks.tracks_volunteers) {
      out.push({
        key: `ministry:${sec.tag_id}:volunteers`,
        label: `${sec.tag_name} · Volunteers`,
        group: 'Per-Ministry',
        values: sec.volunteers,
      })
    }
    if (tracks.tracks_responses) {
      for (const stat of sec.stats) {
        out.push({
          key: `ministry:${sec.tag_id}:stat:${stat.category_id}`,
          label: `${sec.tag_name} · ${stat.category_name}`,
          group: 'Per-Ministry',
          values: stat.values,
        })
      }
    }
  }

  // ── Other stats (church-wide remainder) ──
  if (tracks.tracks_responses) {
    for (const r of data.otherStats) {
      out.push({ key: `other:${r.key}`, label: r.category_name, group: 'Other', values: r.values })
    }
  }

  // ── Ratios (reporting metrics) ──
  out.push({ key: 'reporting:weeklyAvgAttendance', label: 'Avg Weekly Attendance', group: 'Ratios', values: data.reportingMetrics.weeklyAvgAttendance })
  if (tracks.tracks_volunteers) out.push({ key: 'reporting:volToAttendancePct', label: 'Volunteers / Attendance', group: 'Ratios', values: data.reportingMetrics.volToAttendancePct, suffix: '%' })
  if (tracks.tracks_giving)     out.push({ key: 'reporting:perCapitaGiving', label: 'Per-Capita Giving', group: 'Ratios', values: data.reportingMetrics.perCapitaGiving, prefix: '$' })

  return out
}

// ── config resolution ─────────────────────────────────────────────────────────
// Phase 1: church-wide only. byLocation is honored first so Phase 2 needs no
// resolver change — until then callers pass locationId === undefined and we read
// churchWide. Keys that no longer exist in the catalog are dropped at render.
export function resolveKeyMetricKeys(
  cfg: KeyMetricsConfig | undefined,
  locationId?: string,
): string[] {
  if (cfg?.byLocation && locationId && cfg.byLocation[locationId]) return cfg.byLocation[locationId]
  if (cfg?.churchWide && cfg.churchWide.length > 0) return cfg.churchWide
  return DEFAULT_KEY_METRIC_KEYS
}

export function resolveKeyMetricTargets(
  cfg: KeyMetricTargetsConfig | undefined,
  locationId?: string,
): Record<string, number> {
  if (cfg?.byLocation && locationId && cfg.byLocation[locationId]) return cfg.byLocation[locationId]
  return cfg?.churchWide ?? {}
}

// Resolve an ordered key list to live catalog entries, dropping any stale key
// (a metric that was promoted then later removed from the church's setup).
export function featuredEntries(
  keys: string[],
  catalog: KeyMetricCatalogEntry[],
): KeyMetricCatalogEntry[] {
  const byKey = new Map(catalog.map(e => [e.key, e]))
  return keys.map(k => byKey.get(k)).filter((e): e is KeyMetricCatalogEntry => !!e)
}
