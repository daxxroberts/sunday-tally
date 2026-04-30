import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runToolLoop } from '@/lib/ai/anthropic'
import type Anthropic from '@anthropic-ai/sdk'
import type { AiModel } from '@/lib/ai/pricing'
import { getAllRows, type SourceInput, type NormalizedSource } from './sources'

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

When format is ambiguous or uncertain, choose the best fit and set format_confidence < 0.7 with
format_reasoning explaining what you observed and what made it uncertain.

== IS_OPAQUE RULE ==

Set is_opaque=true on service_type_column when values convey no intrinsic meaning to a reader:
  Opaque examples:  "1", "2", "3" | "A", "B", "C" | "SVC1", "SVC2" | bare digits or single letters
  NOT opaque:       "Morning", "Evening", "AWANA", "Wednesday Night", "Kids Church", "Spanish Service"

== WEEKS OBSERVED ==

Compute from date_range: floor((days between date_range.max and date_range.min) / 7) + 1.
Include this in open_questions or anomalies if the count is below 12, so the Decision Maker can
apply the minimum sample rule. You do not output weeks_observed directly — note it in context.

== CLASSIFYING OBSERVED METRICS ==

For each distinct metric (TALL: distinct values in the metric_name column; WIDE: each numeric column header):
  - attendance: headcounts — Main Attendance, Adults, Kids Count, Total People, Youth, etc.
  - response:   event stats — Baptisms, Salvations, Decisions, First Time Guests, Prayer Requests, etc.
  - volunteer:  serving counts — Volunteers, Hosts, Greeters, Ushers, Tech Team, etc.
  - giving:     dollar amounts — Offering, Tithe, Plate, Online Giving, Cash, Check, etc.
  - unknown:    anything that doesn't clearly fit the above
  Set audience_scoped=true when the metric explicitly tracks one audience (Kids Baptisms, Adult Decisions).
  Include reasoning for each classification so the Decision Maker can review your logic.

Audience values are exactly: MAIN, KIDS, YOUTH — nothing else is valid in Sunday Tally.

== COMPLETENESS RULE ==

Every column must appear in exactly one of: date_column, service_type_column, audience_column,
metric_column, value_column, grouping_columns, observed_metrics (for WIDE), or ignored_columns.
Nothing is silently omitted. If a column's purpose is unclear, put it in ignored_columns with a reason.

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

export async function runPatternReader(args: {
  supabase:    SupabaseClient
  churchId:    string
  source:      NormalizedSource
  sourceInput: SourceInput
}): Promise<{ report: PatternReport | null; totalCents: number }> {
  const allRows = await getAllRows(args.sourceInput)
  const headers = args.source.columns
  const stats   = columnStats(headers, allRows)

  const today = new Date().toISOString().slice(0, 10)
  const userPrompt =
    `Today's date: ${today}. Do NOT flag dates on or before today as future-date anomalies.\n\n` +
    `Source: "${args.source.name}"\n` +
    `Total rows: ${allRows.length}\n\n` +
    `Column statistics (distinct values across ALL ${allRows.length} rows):\n` +
    JSON.stringify(stats, null, 2) + '\n\n' +
    `Sample rows (first 20):\n` +
    JSON.stringify(allRows.slice(0, 20), null, 2) + '\n\n' +
    `Call report_patterns exactly once.`

  // Pattern Reader model is Opus by default. Override for accuracy/cost
  // experiments via the IMPORT_PATTERN_READER_MODEL env var (e.g.
  // 'claude-sonnet-4-6' to compare a Sonnet-only pipeline against the default).
  // Validated against AiModel union; falls back to Opus if invalid.
  const envModel = process.env.IMPORT_PATTERN_READER_MODEL
  const patternReaderModel: AiModel =
    envModel && VALID_PATTERN_READER_MODELS.includes(envModel as AiModel)
      ? (envModel as AiModel)
      : 'claude-opus-4-7'

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
