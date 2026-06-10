/**
 * Widget query spec — the structured DSL the AI emits and the deterministic
 * compiler replays with zero AI spend (CONCEPT_AI_WIDGETS.md §3).
 *
 * A widget stores measure × dimension × time-bucket against one of the existing
 * security_invoker views / metric_entries_readable. The window is RELATIVE by
 * default (resolved against the server's "now" at every load, §4) so the widget
 * always shows live data — "tomorrow becomes the new today" — unless the user
 * pins a custom absolute range.
 *
 * This module is the SHARED INTERFACE CONTRACT. Tracks C (AI build loop) and D
 * (replay/grid) import these exact names. Do not rename or reshape.
 *
 * Critical-rule compliance (the six unified-schema rules) is enforced in
 * compile.ts, mirroring src/lib/ai/metrics.ts and src/lib/dashboard.ts:
 *   - status='active' only (the views enforce it)
 *   - NULL ≠ 0 (filtered, never coalesced into averages)
 *   - giving summed weekly via giving_per_week (no per-source breakdown)
 *   - group by stable codes, never display_name
 */

// ─── Source views (existing security_invoker views only) ──────────────────────

export type WidgetSource =
  | 'attendance_per_occurrence'
  | 'volunteers_per_occurrence'
  | 'giving_per_week'
  | 'metric_entries_readable'

// ─── Measure ──────────────────────────────────────────────────────────────────

/**
 * What is being counted. `reporting_tag_code` selects the metric family;
 * `agg` is how rows collapse within a bucket. Averages skip NULLs (rule 4) and
 * are computed per active week, matching dashboard.ts window math.
 */
export interface Measure {
  reporting_tag_code: 'ATTENDANCE' | 'VOLUNTEERS' | 'GIVING' | 'RESPONSE_STAT'
  /**
   * How rows collapse within a bucket.
   *   - sum         : add the values
   *   - avg         : average the values (NULLs skipped)
   *   - weekly_avg  : the SundayTally house metric — SUM within each ISO week,
   *                   then AVERAGE the weekly sums (weeks with no service don't
   *                   drag the average down). This is "average weekly attendance"
   *                   etc. Use it for headline numbers, not raw yearly totals.
   */
  agg: 'sum' | 'avg' | 'weekly_avg'
}

// ─── Dimensions (0..2 — 2 enables a pivot) ────────────────────────────────────

/**
 * A dimension is either the time axis (with a bucket independent of the window —
 * the "weekly avg in month buckets" case) or a categorical axis grouped by a
 * STABLE code (rule 2), never display_name.
 */
export type Dimension =
  | { field: 'time'; bucket: 'week' | 'month' | 'year' }
  | { field: 'ministry_tag' | 'service_template' | 'location' | 'metric' | 'service_group'; by: 'code' }

// ─── Date window ──────────────────────────────────────────────────────────────

/**
 * The relative-or-pinned window, resolved at replay against the server date.
 *   - trailing : the last `count` `unit`s ending today (e.g. trailing 12 months)
 *   - current  : the start of the current `unit` → today
 *   - ytd      : Jan 1 of the current year → today
 *   - prior_year : the mirrored same window one year back (standalone = prior-year YTD)
 *   - custom   : a pinned absolute range, verbatim, every load
 */
export type DateWindow =
  | { window: 'trailing'; count: number; unit: 'week' | 'month' | 'year'; anchor?: 'today' }
  | { window: 'current'; unit: 'week' | 'month' | 'year' }
  | { window: 'ytd' }
  | { window: 'prior_year' }
  | { window: 'custom'; start: string; end: string }

// ─── Viz config ───────────────────────────────────────────────────────────────

export interface VizConfig {
  kind: 'line' | 'bar' | 'area' | 'grid' | 'pivot' | 'metric_card'
  xKey?: string
  yKeys?: string[]
  title: string
}

// ─── The spec ─────────────────────────────────────────────────────────────────

export interface WidgetSpec {
  version: 1
  source: WidgetSource
  measure: Measure
  dimensions: Dimension[]
  filters?: {
    date?: DateWindow
    ministry_tag_codes?: string[]
    service_template_codes?: string[]
    /**
     * Restrict to specific metric definitions BY NAME (e.g. ["Hands Raised"]),
     * matched against metric_entries_readable.metric_name. This is how you isolate
     * ONE stat/volunteer area from the rest of its reporting family — without it,
     * a RESPONSE_STAT or VOLUNTEERS measure sums EVERY metric in that family.
     * Only supported on source 'metric_entries_readable'.
     */
    metric_names?: string[]
    /**
     * Restrict to services in specific REPORTING GROUPS by code (e.g.
     * ["MORNING"]) — the morning/evening cross-location grouping. Matched
     * against the views' service_group_code (0037/0038). Supported on the two
     * occurrence views + metric_entries_readable (not giving — church-wide).
     */
    service_group_codes?: string[]
  }
  ratio?: { numerator: Measure; denominator: Measure; scale?: number }
  /**
   * Overlay the same window one year earlier (the SundayTally comparison frame).
   * For a headline number → returns { value, prior, delta }; for a time series →
   * each row gains a `prior` key aligned by relative position (this year vs last).
   * Resolved by re-running the SAME relative window against `now − 1 year`.
   */
  compare?: 'prior_year'
  viz: VizConfig
}

// ─── Explainer (flip-to-explain panel, CONCEPT §9.1) ──────────────────────────

/**
 * Deterministic, humanized facts derived from a spec — the "back of the card".
 * The friendly one-paragraph narrative ("What this widget is") is the AI-written
 * `explainer` stored separately at save time; these four lines are templated from
 * the spec at view time with zero AI:
 *   - summing          : what the number is and how it's added up
 *   - refresh          : the rolling window in plain words
 *   - currentlyShowing : the live resolved range + bucket
 *   - included         : the ministries/services/locations scoped, or "all"
 */
export interface SpecExplainer {
  summing: string
  refresh: string
  currentlyShowing: string
  included: string
}
