import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runToolLoop } from '@/lib/ai/anthropic'
import type Anthropic from '@anthropic-ai/sdk'
import type { AiModel } from '@/lib/ai/pricing'
import { type NormalizedSource } from './sources'

const VALID_PATTERN_READER_MODELS: AiModel[] = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

export interface ObservedMetric {
  value:           string
  likely_type:     'attendance' | 'response' | 'volunteer' | 'giving' | 'unknown'
  audience_scoped: boolean
  confidence:      number
  reasoning:       string
}

export interface PatternReport {
  format:             'tall' | 'wide' | 'unknown'
  format_confidence:  number
  format_reasoning:   string
  row_count:          number
  date_range:         { min: string; max: string }
  date_column:        { name: string; sample_values: string[]; detected_format: string }
  service_type_column?: {
    name:            string
    distinct_values: string[]
    is_opaque:       boolean
    value_count:     number
  }
  audience_column?: {
    name:               string
    distinct_values:    string[]
    proposed_map:       Record<string, 'MAIN' | 'KIDS' | 'YOUTH' | 'unknown'>
    mapping_confidence: number
  }
  metric_column?: {
    name:            string
    distinct_values: string[]
    description:     string
  }
  value_column?: {
    name:          string
    sample_values: string[]
  }
  grouping_columns: Array<{
    name:            string
    distinct_values: string[]
    likely_purpose:  string
  }>
  observed_metrics: ObservedMetric[]
  location_signals: string[]
  ignored_columns:  Array<{ name: string; reason: string }>
  anomalies:        string[]
  open_questions:   Array<{
    dimension: string
    blocker:   string
    question:  string
  }>
}

const OPUS_SYSTEM = `You are a data structure analyst for Sunday Tally, a church analytics platform.

Your ONLY job: read raw tabular church data and produce a precise pattern report describing what you observe.
Do NOT propose mappings. Do NOT create setup. ONLY describe observations.

Sunday Tally stores:
- attendance_entries: headcount per occurrence × audience (MAIN, KIDS, YOUTH only)
- response_entries: stat counts per occurrence × category × optional audience
- volunteer_entries: volunteer counts per occurrence × category × audience
- giving_entries: dollar amounts per occurrence × giving_source

== FORMAT DETECTION ==

WIDE format (most common): one row per service occurrence, each metric in its own column.
  Signals: date column + optional service-type column + multiple numeric columns (Attendance, Kids Count,
  Baptisms, Offering, etc.). Column headers describe the metric.
  Example row: Date | Service | Main Attendance | Kids | Volunteers | Baptisms | Plate Offering

TALL format (unpivoted): multiple rows per occurrence, one per metric × optional audience.
  Signals: one "metric name" column (Area, Type, Category, Metric) + one "value" column + often an
  audience column. Distinct values in the metric column are the real metrics.
  Example row: Date | Service | Area | Audience | Count

  TALL FORMAT — MULTI-DIMENSION VARIANT:
  Some TALL sheets have additional context columns between the service-type and metric columns.
  Example: Date | Service Type | Group Type | Group | Area | Adult Student Kid | Count
    · "Service Type" (values: "1", "2") → service_type_column [splits into occurrences]
    · "Group Type"   (values: "Stats", "Volunteers") → grouping_column [row type classifier]
    · "Group"        (values: "Experience", "LifeKids") → grouping_column [ministry context]
    · "Area"         (values: "Baptism", "Hands", "Parking", ...) → metric_column [actual metrics]
    · "Adult Student Kid" (values: "Adult", "Kid", "Student") → audience_column
    · "Count" → value_column

  IDENTIFYING THE TRUE metric_column:
  The metric_column contains the actual metric NAMES — the vocabulary of what is being tracked.
  It has MANY distinct values (typically 5–50+), each a distinct measurable thing:
    ✓ "Baptism", "Hands Raised", "Parking", "Salvations", "Rooms Open" → metric_column
  Ministry/audience names are NOT metrics:
    ✗ "Experience", "LifeKids", "Switch" → grouping_column (ministry context)
    ✗ "Stats", "Volunteers", "Attenders" → grouping_column (row type)

When format is ambiguous or uncertain, choose the best fit and set format_confidence < 0.7 with
format_reasoning explaining what you observed and what made it uncertain.

== STRUCTURAL DIMENSION DETECTION ==

Do NOT pattern-match on column names. Identify each column's role from STRUCTURE:
how rows repeat per date, and whether each column-value carries the same metric vocabulary.

Work through every small-distinct-count column (2–20 values) and classify it using these
structural tests. The conditional column profile contains everything you need.

STEP 1 — Find columns where the SAME DATE appears with MULTIPLE values of that column.
  For each such column, the column is part of how the sheet partitions rows on a single date.
  If only one value per date → it is NOT a partitioning column for occurrences.

STEP 2 — For each partitioning column, ask: "Do different values of this column carry the
SAME metric vocabulary, or DIFFERENT metric vocabularies?"
  Read this from the conditional profile:
    · If present_rates for the metric set are SIMILAR across all values of the column
      (e.g. value "1" and value "2" both have Baptism≈0.9, Hands≈0.85, Parking≈0.7) →
      this column SPLITS THE SAME SET OF METRICS into multiple service occurrences.
      → ROLE: service_type_column
    · If present_rates DIFFER sharply (e.g. value "Experience" has Hands≈0.9 Parking≈0.7
      but value "LifeKids" has Hands≈0.0 Parking≈0.0 and instead has "LifeKids Rooms Open"≈0.9) →
      this column ROUTES METRICS TO DIFFERENT MINISTRIES on the same date.
      → ROLE: grouping_column with likely_purpose="ministry_context"
    · If values name the TYPE of row itself (Stats, Volunteers, Attenders) and each value
      gates an entirely separate metric vocabulary →
      → ROLE: grouping_column with likely_purpose="row_type_classifier"

STEP 3 — A sheet can have ALL THREE at once:
  Date | Service-Split | Row-Type | Ministry-Context | Metric-Name | Audience | Count
  Example: a date 2/11/2024 appears 40+ times — once for every combination of
  (service 1/2) × (Stats/Volunteers) × (Experience/LifeKids) × (each metric) × (Adult/Kid).
  All four dimensions must be reported. Missing any one collapses or duplicates data.

STEP 4 — metric_column is the column where each distinct VALUE is the NAME of a thing being
counted (Baptism, Hands, Parking, Salvations). It typically has the HIGHEST distinct count
(5–50+) among the non-date columns. It is the only column whose values become category names.

DO NOT assume any column's role from its header text. "Service Type" is not automatically a
service_type_column; "Group" is not automatically a grouping column. Derive the role from
the structural tests above. The header is at most a tiebreaker.

== IS_OPAQUE RULE ==

Set is_opaque=true on service_type_column when values convey no intrinsic meaning to a reader:
  Opaque examples:  "1", "2", "3" | "A", "B", "C" | "SVC1", "SVC2" | bare digits or single letters
  NOT opaque:       "Morning", "Evening", "AWANA", "Wednesday Night", "Kids Church", "Spanish Service"

Opaque values do NOT prevent you from reporting the service_type_column — you MUST still
report it with is_opaque=true. The Decision Maker will ask the user to name each code.
Never omit the service_type_column just because the values are digits or letters with no meaning.

== WEEKS OBSERVED ==

Compute from date_range: floor((days between date_range.max and date_range.min) / 7) + 1.
Include this in open_questions or anomalies if the count is below 12, so the Decision Maker can
apply the minimum sample rule. You do not output weeks_observed directly — note it in context.

== CLASSIFYING OBSERVED METRICS ==

For each distinct metric (TALL: distinct values in the metric_name column; WIDE: each numeric column header):
  - attendance: headcounts — Main Attendance, Adults, Kids Count, Total People, Youth, etc.
  - response:   ANY numeric stat tracked per service that is not attendance/volunteers/giving.
                This is a broad category — when in doubt, classify as response.
                Includes:
                  · Event outcomes: Baptisms, Salvations, Decisions, Prayer Requests, First Time Guests
                  · Physical/operational counts: Cars in Lot, Parking Count, Hands Raised,
                    Rooms Open, Kids Rooms, Open Lots, Room Capacity Used, Seats Filled
                  · Engagement: Commitments, Response Cards, Altar Calls, Connections
                  · Any "how many X were there" column a church tracks week to week
  - volunteer:  serving counts — Volunteers, Hosts, Greeters, Ushers, Tech Team, etc.
  - giving:     dollar amounts — Offering, Tithe, Plate, Online Giving, Cash, Check, etc.
  - unknown:    ONLY use this when the column contains non-numeric data or clearly has no
                church-tracking purpose (e.g. internal notes, row IDs, spreadsheet formulas).
                If the column is numeric and the church put it in their tracking sheet, it is
                almost certainly a response stat — classify it as response, not unknown.

== USING THE CONDITIONAL COLUMN PROFILE ==

When a conditional column profile is provided, use it as the PRIMARY signal for audience_scoped
classification. Name analysis is secondary — the data co-occurrence is ground truth.

Reading the profile:
  present_rate = 1.0  → metric is always recorded for this group
  present_rate = 0.0  → metric is never recorded for this group
  present_rate = 0.5  → metric is recorded about half the time for this group

Patterns to look for and what they mean:
  HIGH rate for group A, ~0 for group B → audience_scoped=true, owned by group A
    e.g. "LifeKids Rooms Open": {Experience: 0.95, Switch: 0.01} → scoped to LifeKids/Experience
  HIGH rate for ALL groups → audience_scoped=false, shared metric
    e.g. "Hands Raised": {Experience: 0.88, Switch: 0.91} → not scoped, but tracked per-service per group
  LOW rate for ALL groups → sparse or optional metric — note in anomalies
  HIGH rate for group A, MEDIUM for group B → likely scoped to A, note uncertainty

IMPORTANT: Even when a metric appears in all groups (like "Hands Raised"), the co-occurrence
profile tells the Decision Maker which service_template each instance came from. Include this
in your reasoning field so the Decision Maker can correctly assign primary_tag per source.

Set audience_scoped=true only when the metric is specific to ONE audience group (present_rate
near 1.0 for one group, near 0.0 for others). "Hands Raised" tracked separately per service
is NOT audience_scoped — it is a per-service metric for each respective service.

Include reasoning for each classification citing the conditional profile where available.

Audience values are exactly: MAIN, KIDS, YOUTH — nothing else is valid in Sunday Tally.

== COMPLETENESS RULE ==

Every column must appear in exactly one of: date_column, service_type_column, audience_column,
metric_column, value_column, grouping_columns, observed_metrics (for WIDE), or ignored_columns.
Nothing is silently omitted. If a column's purpose is unclear, put it in ignored_columns with a reason.

For grouping_columns, set likely_purpose to one of these precise values so the Decision Maker
knows how to route each column:
  "row_type_classifier"  — classifies type of row (Stats, Volunteers, Attendance, Giving)
  "ministry_context"     — identifies which ministry the metric belongs to (Experience, LifeKids)
  "service_split"        — splits occurrences (use service_type_column instead if clear enough)
  "location"             — identifies campus or location
  "other"                — anything else; include a description

Report ONLY what you directly observe. NEVER speculate about values not present in the data.

Call report_patterns exactly once.`

const REPORT_PATTERNS_TOOL: Anthropic.Messages.Tool = {
  name: 'report_patterns',
  description: 'Report all observed patterns in the source data. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      format:             { type: 'string', enum: ['tall', 'wide', 'unknown'] },
      format_confidence:  { type: 'number' },
      format_reasoning:   { type: 'string' },
      row_count:          { type: 'number' },
      date_range: {
        type: 'object',
        properties: { min: { type: 'string' }, max: { type: 'string' } },
        required: ['min', 'max'],
      },
      date_column: {
        type: 'object',
        properties: {
          name:            { type: 'string' },
          sample_values:   { type: 'array', items: { type: 'string' } },
          detected_format: { type: 'string' },
        },
        required: ['name', 'detected_format'],
      },
      service_type_column: {
        type: 'object',
        properties: {
          name:            { type: 'string' },
          distinct_values: { type: 'array', items: { type: 'string' } },
          is_opaque:       { type: 'boolean' },
          value_count:     { type: 'number' },
        },
        required: ['name', 'distinct_values', 'is_opaque'],
      },
      audience_column: {
        type: 'object',
        properties: {
          name:               { type: 'string' },
          distinct_values:    { type: 'array', items: { type: 'string' } },
          proposed_map:       { type: 'object', additionalProperties: { type: 'string' } },
          mapping_confidence: { type: 'number' },
        },
        required: ['name', 'distinct_values', 'proposed_map'],
      },
      metric_column: {
        type: 'object',
        properties: {
          name:            { type: 'string' },
          distinct_values: { type: 'array', items: { type: 'string' } },
          description:     { type: 'string' },
        },
        required: ['name', 'distinct_values'],
      },
      value_column: {
        type: 'object',
        properties: {
          name:          { type: 'string' },
          sample_values: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
      grouping_columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:            { type: 'string' },
            distinct_values: { type: 'array', items: { type: 'string' } },
            likely_purpose:  { type: 'string' },
          },
          required: ['name', 'distinct_values'],
        },
      },
      observed_metrics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value:           { type: 'string' },
            likely_type:     { type: 'string', enum: ['attendance', 'response', 'volunteer', 'giving', 'unknown'] },
            audience_scoped: { type: 'boolean' },
            confidence:      { type: 'number' },
            reasoning:       { type: 'string' },
          },
          required: ['value', 'likely_type', 'confidence'],
        },
      },
      location_signals: { type: 'array', items: { type: 'string' } },
      ignored_columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, reason: { type: 'string' } },
          required: ['name', 'reason'],
        },
      },
      anomalies: { type: 'array', items: { type: 'string' } },
      open_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            dimension: { type: 'string' },
            blocker:   { type: 'string' },
            question:  { type: 'string' },
          },
          required: ['dimension', 'blocker', 'question'],
        },
      },
    },
    required: ['format', 'format_confidence', 'row_count', 'date_column', 'observed_metrics', 'open_questions'],
  },
}

function columnStats(
  headers: string[],
  rows: Record<string, string>[],
): Record<string, { distinct_count: number; sample_values: string[] }> {
  const stats: Record<string, { distinct_count: number; sample_values: string[] }> = {}
  for (const h of headers) {
    const allVals = rows.map(r => r[h]).filter(Boolean)
    const distinct = [...new Set(allVals)]
    // 300 values: enough to capture all metric names in any real church sheet
    stats[h] = { distinct_count: distinct.length, sample_values: distinct.slice(0, 300) }
  }
  return stats
}

/**
 * Conditional column profiling — cross-tabulate every metric column against
 * each candidate grouping column (columns with 2–20 distinct values that are
 * not likely date columns).
 *
 * For each grouping-column value × metric column pair we compute:
 *   present_count — rows where the metric cell is non-empty and non-zero
 *   total         — total rows with that grouping value
 *   present_rate  — present_count / total  (0.00–1.00)
 *   sample_values — up to 5 distinct non-empty values observed
 *
 * A metric with present_rate ≈ 1.0 for Service A and ≈ 0.0 for Service B is
 * definitively scoped to Service A. This is ground truth — no name heuristics needed.
 *
 * Returns one entry per candidate grouping column. The AI picks which one is
 * the service-type column and reads the co-occurrence table directly.
 */
/**
 * Per-date partition profile — for every candidate column, compute how rows on a single
 * date split across that column's values. This is the structural signal the AI uses to
 * decide what role each column plays.
 *
 * For each candidate column we report:
 *   distinct_values_per_date — average number of distinct column-values on a single date
 *   rows_per_date_value      — average rows that share (date, column-value)
 *   sample_date_breakdown    — one example date showing its full breakdown
 *
 * Interpretation guide for the AI:
 *   distinct_values_per_date ≈ 1   → column does NOT partition the date; same value on all rows
 *                                    that day (likely a date-derived column or a global setting)
 *   distinct_values_per_date = 2–5 → column partitions the date into a small fixed set —
 *                                    candidate for service_type_column OR ministry_context
 *                                    OR row_type_classifier. Use the conditional column profile
 *                                    to disambiguate (do values share metric vocabulary or not).
 *   distinct_values_per_date = many → column likely IS the metric_name_column (each row on a
 *                                    date is a different metric).
 *   rows_per_date_value ≈ 1        → adding (date, value) already uniquely identifies a row;
 *                                    the column is highly partitioning.
 *   rows_per_date_value > 1        → multiple rows share (date, value); other dimensions still
 *                                    distinguish them.
 */
function perDatePartitionProfile(
  headers:  string[],
  rows:     Record<string, string>[],
  dateCol:  string | null,
): Record<string, { distinct_values_per_date: number; rows_per_date_value: number; sample_date: string | null; sample_date_breakdown: Record<string, number> }> {
  if (!dateCol) return {}

  const isLikelyDate = (h: string) => /date|day|week|month|period/i.test(h)

  const candidates = headers.filter(h => {
    if (h === dateCol) return false
    const distinct = new Set(rows.map(r => r[h]).filter(Boolean))
    return distinct.size >= 2 && distinct.size <= 50
  })

  if (candidates.length === 0) return {}

  // Group rows by date once
  const rowsByDate = new Map<string, Record<string, string>[]>()
  for (const r of rows) {
    const d = r[dateCol]
    if (!d) continue
    if (!rowsByDate.has(d)) rowsByDate.set(d, [])
    rowsByDate.get(d)!.push(r)
  }
  const allDates = [...rowsByDate.keys()]
  if (allDates.length === 0) return {}

  // Pick a representative date: the one with the most rows (richest breakdown)
  const sampleDate = allDates.reduce((best, d) =>
    (rowsByDate.get(d)!.length > rowsByDate.get(best)!.length) ? d : best, allDates[0])

  const result: Record<string, { distinct_values_per_date: number; rows_per_date_value: number; sample_date: string | null; sample_date_breakdown: Record<string, number> }> = {}

  for (const col of candidates) {
    let totalDistinctValues = 0
    let totalRows           = 0
    let totalGroups         = 0

    for (const [, dRows] of rowsByDate) {
      const distinctVals = new Set(dRows.map(r => r[col]).filter(Boolean))
      totalDistinctValues += distinctVals.size
      // count rows-per-(date,value)
      for (const v of distinctVals) {
        const n = dRows.filter(r => r[col] === v).length
        totalRows  += n
        totalGroups += 1
      }
    }

    const dateCount = rowsByDate.size
    const distinct_values_per_date = dateCount > 0
      ? Math.round((totalDistinctValues / dateCount) * 100) / 100
      : 0
    const rows_per_date_value = totalGroups > 0
      ? Math.round((totalRows / totalGroups) * 100) / 100
      : 0

    // Sample breakdown: for the sample date, how many rows under each value of this column
    const sampleRows = rowsByDate.get(sampleDate) ?? []
    const breakdown: Record<string, number> = {}
    for (const r of sampleRows) {
      const v = r[col] ?? ''
      breakdown[v] = (breakdown[v] ?? 0) + 1
    }

    result[col] = {
      distinct_values_per_date,
      rows_per_date_value,
      sample_date: sampleDate,
      sample_date_breakdown: breakdown,
    }
  }

  return result
}

function conditionalColumnStats(
  headers: string[],
  rows:    Record<string, string>[],
): Record<string, Record<string, Record<string, { present_count: number; total: number; present_rate: number; sample_values: string[] }>>> {
  // "Present" = non-empty, non-whitespace, and not a bare zero
  const isPresent = (v: string | undefined) => {
    if (!v) return false
    const t = v.trim()
    return t !== '' && t !== '0' && t !== '0.0' && t !== '$0' && t !== '-'
  }

  // Candidate grouping columns: 2–20 distinct values, probably not a date column
  const isLikelyDate = (h: string) =>
    /date|day|week|month|period/i.test(h)
  const candidates = headers.filter(h => {
    if (isLikelyDate(h)) return false
    const distinct = new Set(rows.map(r => r[h]).filter(Boolean))
    return distinct.size >= 2 && distinct.size <= 20
  })

  if (candidates.length === 0) return {}

  const result: Record<string, Record<string, Record<string, { present_count: number; total: number; present_rate: number; sample_values: string[] }>>> = {}

  for (const groupCol of candidates) {
    const distinctGroupVals = [...new Set(rows.map(r => r[groupCol]).filter(Boolean))]
    const byGroup: Record<string, Record<string, { present_count: number; total: number; present_rate: number; sample_values: string[] }>> = {}

    for (const gVal of distinctGroupVals) {
      const gRows = rows.filter(r => r[groupCol] === gVal)
      const metricProfile: Record<string, { present_count: number; total: number; present_rate: number; sample_values: string[] }> = {}

      for (const metricCol of headers) {
        if (metricCol === groupCol) continue
        if (isLikelyDate(metricCol)) continue
        const presentVals = gRows.map(r => r[metricCol]).filter(isPresent)
        const sampleVals  = [...new Set(presentVals)].slice(0, 5)
        metricProfile[metricCol] = {
          present_count: presentVals.length,
          total:         gRows.length,
          present_rate:  gRows.length > 0
            ? Math.round((presentVals.length / gRows.length) * 100) / 100
            : 0,
          sample_values: sampleVals,
        }
      }

      byGroup[gVal] = metricProfile
    }

    result[groupCol] = byGroup
  }

  return result
}

export async function runPatternReader(args: {
  supabase: SupabaseClient
  churchId: string
  source:   NormalizedSource
  /** All rows already fetched by the caller — do NOT re-fetch inside here. */
  allRows:  Record<string, string>[]
}): Promise<{ report: PatternReport | null; totalCents: number }> {
  const headers   = args.source.columns
  const allRows   = args.allRows
  const stats     = columnStats(headers, allRows)
  const condStats = conditionalColumnStats(headers, allRows)

  // Best-guess date column for partition profiling: first header that looks date-like
  const dateColGuess = headers.find(h => /date/i.test(h))
    ?? headers.find(h => /day|week|month/i.test(h))
    ?? null
  const partitionStats = perDatePartitionProfile(headers, allRows, dateColGuess)

  const today = new Date().toISOString().slice(0, 10)

  // Build the partition stats section
  const partitionSection = Object.keys(partitionStats).length > 0
    ? `\nPer-date partition profile (using date column "${dateColGuess}"):\n` +
      `HOW TO READ:\n` +
      `  distinct_values_per_date ≈ 1   → column does NOT split a single date\n` +
      `  distinct_values_per_date = 2-5 → column splits each date into a small set (candidate for\n` +
      `                                   service_type_column OR ministry_context OR row_type)\n` +
      `  distinct_values_per_date large → column likely IS the metric_name_column\n` +
      `  rows_per_date_value ≈ 1        → adding (date, value) uniquely identifies a row\n` +
      `  sample_date_breakdown          → how rows on the sample date split across this column's values\n` +
      `CROSS-REFERENCE with the conditional column profile to decide WHICH partition role\n` +
      `(service split vs ministry context vs row type) each column plays.\n` +
      JSON.stringify(partitionStats, null, 2) + '\n'
    : ''

  // Build the conditional stats section only when meaningful
  const condSection = Object.keys(condStats).length > 0
    ? `\nConditional column profile (metric presence rate per grouping-column value):\n` +
      `HOW TO READ: present_rate=1.0 means that metric ALWAYS has a value for this group.\n` +
      `present_rate=0.0 means the metric NEVER has a value for this group.\n` +
      `Values that SHARE the same metric vocabulary at similar rates → service split.\n` +
      `Values with DIFFERENT metric vocabularies (some metrics ~1.0 for one value, ~0.0 for another)\n` +
      `→ ministry_context or row_type_classifier (use sample_values to disambiguate).\n` +
      JSON.stringify(condStats, null, 2) + '\n'
    : ''

  const userPrompt =
    `Today's date: ${today}. Do NOT flag dates on or before today as future-date anomalies.\n\n` +
    `Source: "${args.source.name}"\n` +
    `Total rows: ${allRows.length}\n\n` +
    `Column statistics (distinct values across ALL ${allRows.length} rows):\n` +
    JSON.stringify(stats, null, 2) +
    partitionSection +
    condSection + '\n' +
    `Sample rows (first 20):\n` +
    JSON.stringify(allRows.slice(0, 20), null, 2) + '\n\n' +
    `Call report_patterns exactly once.`

  // Pattern Reader model is Sonnet by default — Opus was ~60% of pipeline cost and
  // the apply-to-data validator catches downstream mistakes regardless. Override
  // via IMPORT_PATTERN_READER_MODEL env var if a specific source consistently
  // produces validator violations Sonnet can't avoid.
  // Validated against AiModel union; falls back to Sonnet if invalid.
  const envModel = process.env.IMPORT_PATTERN_READER_MODEL
  const patternReaderModel: AiModel =
    envModel && VALID_PATTERN_READER_MODELS.includes(envModel as AiModel)
      ? (envModel as AiModel)
      : 'claude-sonnet-4-6'

  const result = await runToolLoop({
    supabase:    args.supabase,
    churchId:    args.churchId,
    kind:        'import_stage_a',
    model:       patternReaderModel,
    system:      OPUS_SYSTEM,
    tools:       [REPORT_PATTERNS_TOOL],
    handlers:    { report_patterns: async (input) => input },
    terminateOn: ['report_patterns'],
    maxTurns:    2,
    initialUser: userPrompt,
  })

  return {
    report:     (result.finalToolCall?.input ?? null) as PatternReport | null,
    totalCents: result.totalCents,
  }
}
