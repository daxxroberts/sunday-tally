/**
 * test-full-pipeline.mjs
 *
 * Full Stage A pipeline test — no Next.js server required.
 * Replicates the exact two-step pipeline from stageA.ts:
 *   Step 1: Pattern Reader (Opus) → PatternReport
 *   Step 2: Decision Maker (Sonnet) → propose_mapping
 *
 * Uses the actual OPUS_SYSTEM and STAGE_A_SYSTEM prompts.
 * Uses the actual report_patterns and propose_mapping tool schemas.
 *
 * Test shapes:
 *   A — Harbor Community Church (wide format, AM/PM, KidZone branding)
 *   B — Riverside Church (tall format, one row per metric)
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const ANTHROPIC_KEY = env['ANTHROPIC_API_KEY']
if (!ANTHROPIC_KEY) { console.error('No ANTHROPIC_API_KEY in .env.local'); process.exit(1) }

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsv(raw) {
  const lines = raw.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',')
    const row = {}
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim() })
    return row
  })
  return { headers, rows }
}

function columnStats(headers, rows) {
  const stats = {}
  for (const h of headers) {
    const allVals = rows.map(r => r[h]).filter(Boolean)
    const distinct = [...new Set(allVals)]
    stats[h] = { distinct_count: distinct.length, sample_values: distinct.slice(0, 50) }
  }
  return stats
}

// ── Anthropic API call ────────────────────────────────────────────────────────

async function callAnthropic({ model, system, messages, tools, max_tokens = 4000 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({ model, max_tokens, system, messages, tools }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err}`)
  }
  return res.json()
}

function extractToolCall(response) {
  for (const block of response.content ?? []) {
    if (block.type === 'tool_use') return { name: block.name, input: block.input }
  }
  return null
}

// ── System prompts (copied from the actual source files) ─────────────────────

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

const STAGE_A_SYSTEM = `You are the Decision Maker stage of SundayTally's AI onboarding pipeline.

You receive a PatternReport from the Pattern Reader (Opus) and produce ONE propose_mapping call covering:
- setup entities (locations, service templates, volunteer categories, response categories, giving sources)
- column routing (how each metric maps to a SundayTally destination)
- clarification questions for the user

You do NOT read the raw data. The PatternReport contains everything you need.

Sunday Tally stores weekly church data per service occurrence:
- attendance_entries: headcount by audience (MAIN, KIDS, YOUTH only)
- response_entries: stat counts per category × optional audience
- volunteer_entries: volunteer counts per category × audience
- giving_entries: dollar amounts per giving source

== THE 9 FRAMEWORK RULES ==

RULE 1 — CONFIDENCE THRESHOLDS BY WEEKS_OBSERVED
Compute weeks_observed yourself: floor((days between date_range.max and date_range.min) / 7) + 1.
This field does NOT exist in the PatternReport — you calculate it from date_range.min and date_range.max.

Apply these thresholds STRICTLY:
  - weeks_observed >= 26              → confidence = "HIGH"
  - 12 <= weeks_observed < 26         → confidence = "MEDIUM"
  - weeks_observed < 12               → confidence = "LOW_CONFIDENCE" + include low_confidence_note

RULE 2 — PATTERN COLLAPSE AT 2 IDENTICAL QUESTIONS
Scan your question list before finalising. When 2+ questions share the same option set AND same decision
type: keep the FIRST as a normal question, replace ALL remaining with ONE policy_collapse question.

RULE 3 — NO NUDGING
Never write: "Many churches prefer...", "We recommend...", "The standard approach is...".

RULE 4 — TAGS ARE FIRST-CLASS
Every service template must have: primary_tag AND primary_tag_reasoning.

RULE 5 — TAGS MUST BE EARNED
Only propose a distinct primary_tag when it applies to a recurring set of occurrences.

RULE 6 — TAG RELATIONSHIPS (HIERARCHY)
You can propose tag relationships for hierarchy.

RULE 7 — DATE-DERIVABLE PATTERNS ARE NOT TAGS
Never propose: JANUARY, FEBRUARY, SUMMER, WINTER, FIRST_SUNDAY, LAST_SUNDAY, 2024, 2025.

RULE 8 — CONSISTENT QUESTION FORMAT
Every question uses the same structured format.

RULE 9 — DAY_OF_WEEK FROM DATA
Every service_template you propose MUST include day_of_week (0=Sun..6=Sat).
start_time is NEVER in the data — set start_time: null on every template.

== MAPPING RULES ==

1. Map observed_metrics → area_field_map (ALL metrics, not just sample):

   ATTENDANCE ROUTING:
   Wide format: main/adult headcount → "attendance.main", kids → "attendance.kids", youth → "attendance.youth"
   Tall format: any attendance metric row → "attendance" (bare)

   - likely_type="response"   → "response.UPPERCASE_SLUG"
   - likely_type="volunteer"  → "volunteer.UPPERCASE_SLUG"
   - likely_type="giving"     → "giving.UPPERCASE_SLUG" (service-tied)
   - likely_type="unknown"    → blocking question + map to "ignore"

   GIVING ROUTING:
   • "giving.<CODE>"        — per-service giving (rows tied to specific services)
   • "period_giving.<CODE>" — church-wide weekly total (no service link)

   PERIOD RESPONSE ROUTING:
   • "period_response.<CODE>" — church-wide periodic stat

1a. NEVER silently ignore a metric. Every metric in observed_metrics MUST appear in area_field_map.

2. Use service_type_column.distinct_values EXACTLY for service_code values.

3. If service_type_column.is_opaque=true → ALWAYS add a BLOCKING question asking the user to name each code.
   CRITICAL: If you set display_name="[BLOCKING]", you MUST include q_service_names blocking question.

4. Use tall_format.audience_map if grouping is needed.

5. Convert open_questions from PatternReport into clarification_questions.

6. For TALL format: include tall_format object with metric_name_column, value_column, audience_column.
   Column map dest_field values — use EXACTLY these strings:
     "service_date", "service_template_code", "location_code", "ignore"
   For TALL format, column_map only needs service_date + service_template_code.
   All metric routing goes through tall_format.area_field_map.

CRITICAL RULE — EVERY SOURCE NEEDS A SERVICE TEMPLATE:
(A) proposed_setup.service_templates MUST be non-empty.
(B) For every source without a service_template_code column, set default_service_template_code.
    EXCEPTION: pure period sources need no template.

7. NULL = "not entered", not zero.
8. BLOCKING questions: NEVER set recommended_answer.
9. Same metric in multiple groups → blocking question about combining vs separating.

DATE COLUMN — always explicitly set date_column on the source.

DEST TABLE — set dest_table accurately: 'mixed' for most real-world sheets.

SERVICE TEMPLATES — define services by tags. NEVER create templates for giving categories.

MULTI-SOURCE TEMPLATE RECONCILIATION — propose ONE template per distinct service.`

// ── Tool schemas ──────────────────────────────────────────────────────────────

const REPORT_PATTERNS_TOOL = {
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
        properties: { name: { type: 'string' }, sample_values: { type: 'array', items: { type: 'string' } }, detected_format: { type: 'string' } },
        required: ['name', 'detected_format'],
      },
      service_type_column: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          distinct_values: { type: 'array', items: { type: 'string' } },
          is_opaque: { type: 'boolean' },
          value_count: { type: 'number' },
        },
        required: ['name', 'distinct_values', 'is_opaque'],
      },
      metric_column: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          distinct_values: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
        },
        required: ['name', 'distinct_values'],
      },
      value_column: {
        type: 'object',
        properties: { name: { type: 'string' }, sample_values: { type: 'array', items: { type: 'string' } } },
        required: ['name'],
      },
      grouping_columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            distinct_values: { type: 'array', items: { type: 'string' } },
            likely_purpose: { type: 'string' },
          },
          required: ['name', 'distinct_values'],
        },
      },
      observed_metrics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            likely_type: { type: 'string', enum: ['attendance', 'response', 'volunteer', 'giving', 'unknown'] },
            audience_scoped: { type: 'boolean' },
            confidence: { type: 'number' },
            reasoning: { type: 'string' },
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
            blocker: { type: 'string' },
            question: { type: 'string' },
          },
          required: ['dimension', 'blocker', 'question'],
        },
      },
    },
    required: ['format', 'format_confidence', 'row_count', 'date_column', 'observed_metrics', 'open_questions'],
  },
}

const PROPOSE_MAPPING_TOOL = {
  name: 'propose_mapping',
  description: 'Propose how each uploaded source maps into Sunday Tally. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW_CONFIDENCE'] },
      weeks_observed: { type: 'number' },
      low_confidence_note: { type: 'string' },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source_name: { type: 'string' },
            dest_table: { type: 'string', enum: ['attendance_entries', 'giving_entries', 'volunteer_entries', 'response_entries', 'service_schedule', 'mixed', 'ignore'] },
            date_column: { type: 'string' },
            date_format: { type: 'string' },
            default_service_template_code: { type: 'string' },
            column_map: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source_column: { type: 'string' },
                  dest_field:    { type: 'string' },
                  notes:         { type: 'string' },
                },
                required: ['source_column', 'dest_field'],
              },
            },
            notes: { type: 'string' },
            tall_format: {
              type: 'object',
              properties: {
                metric_name_column: { type: 'string' },
                value_column:       { type: 'string' },
                audience_column:    { type: 'string' },
                group_type_column:  { type: 'string' },
                audience_map:       { type: 'object' },
                area_field_map: {
                  type: 'object',
                  description: 'Maps metric (or "GroupType / Metric") to dest_field. Must cover every observed metric.',
                },
              },
              required: ['metric_name_column', 'value_column'],
            },
          },
          required: ['source_name', 'dest_table', 'column_map'],
        },
      },
      proposed_setup: {
        type: 'object',
        properties: {
          locations: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string' } }, required: ['name'] },
          },
          service_tags: {
            type: 'array',
            items: { type: 'object', properties: { tag_name: { type: 'string' }, tag_code: { type: 'string' } }, required: ['tag_name', 'tag_code'] },
          },
          tag_relationships: {
            type: 'array',
            items: { type: 'object', properties: { parent_tag_code: { type: 'string' }, child_tag_code: { type: 'string' } }, required: ['parent_tag_code', 'child_tag_code'] },
          },
          service_templates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                display_name: { type: 'string' },
                service_code: { type: 'string' },
                location_name: { type: 'string' },
                primary_tag: { type: 'string' },
                primary_tag_reasoning: { type: 'string' },
                day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
                start_time: { type: 'string' },
              },
              required: ['display_name', 'service_code', 'primary_tag', 'primary_tag_reasoning', 'day_of_week'],
            },
          },
          response_categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                stat_scope: { type: 'string', enum: ['service', 'week', 'month', 'day'] },
                primary_tag: { type: 'string' },
              },
              required: ['name', 'stat_scope'],
            },
          },
          giving_sources: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
          },
          volunteer_categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                primary_tag: { type: 'string' },
              },
              required: ['name'],
            },
          },
        },
      },
      anomalies: {
        type: 'array',
        items: { type: 'object', properties: { kind: { type: 'string' }, description: { type: 'string' } }, required: ['kind', 'description'] },
      },
      clarification_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            blocking: { type: 'boolean' },
            type: { type: 'string', enum: ['text', 'choice', 'policy_collapse'] },
            title: { type: 'string' },
            context: { type: 'string' },
            question: { type: 'string' },
            options: {
              type: 'array',
              items: { type: 'object', properties: { label: { type: 'string' }, explanation: { type: 'string' } }, required: ['label', 'explanation'] },
            },
          },
          required: ['id', 'blocking', 'type', 'title', 'question'],
        },
      },
    },
    required: ['sources'],
  },
}

// ── QW-1 validation ───────────────────────────────────────────────────────────

function validateMapping(mapping) {
  const violations = []
  const sources = mapping.sources ?? []

  for (const src of sources) {
    const name = src.source_name ?? 'unknown'
    const destFields = (src.column_map ?? []).map(c => c.dest_field ?? '')

    // For tall format: check tall_format block has required fields
    if (src.tall_format) {
      if (!src.tall_format.metric_name_column) violations.push(`[${name}] tall_format.metric_name_column is missing`)
      if (!src.tall_format.value_column) violations.push(`[${name}] tall_format.value_column is missing`)
      if (!src.tall_format.area_field_map || Object.keys(src.tall_format.area_field_map).length === 0) {
        violations.push(`[${name}] tall_format.area_field_map is empty — no metrics will be imported`)
      }
    }

    // Check date column presence
    const hasDate = !!src.date_column || destFields.includes('service_date')
    if (!hasDate) violations.push(`[${name}] No date_column — every row will fail`)

    // Check service template anchor
    const hasTemplateCol = destFields.includes('service_template_code')
    const hasDefault = !!src.default_service_template_code
    const isPeriodOnly = destFields.every(f =>
      f === 'ignore' || f === 'service_date' || f.startsWith('period_giving.') || f.startsWith('period_response.')
    )
    if (!hasTemplateCol && !hasDefault && !isPeriodOnly) {
      violations.push(`[${name}] No service template anchor — every data row will fail`)
    }
  }

  // Check [BLOCKING] without question
  const templates = mapping.proposed_setup?.service_templates ?? []
  const questions = mapping.clarification_questions ?? []
  const hasBlockingQ = questions.some(q => q.id === 'q_service_names' && q.blocking === true)
  const hasBlockingTemplate = templates.some(t => String(t.display_name ?? '').includes('[BLOCKING]'))
  if (hasBlockingTemplate && !hasBlockingQ) {
    violations.push(`[BLOCKING] display_name present but no q_service_names blocking question`)
  }

  return violations
}

// ── Run a full two-step pipeline test ─────────────────────────────────────────

async function runFullTest(testName, sourceName, csvRaw, freeText) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`TEST: ${testName}`)
  console.log('═'.repeat(70))

  const today = new Date().toISOString().slice(0, 10)
  const { headers, rows } = parseCsv(csvRaw)
  const stats = columnStats(headers, rows)

  // ── Step 1: Pattern Reader (Opus) ─────────────────────────────────────────

  console.log('\n[Step 1] Pattern Reader (Opus)...')
  const patternUserPrompt =
    `Today's date: ${today}. Do NOT flag dates on or before today as future-date anomalies.\n\n` +
    `Source: "${sourceName}"\n` +
    `Total rows: ${rows.length}\n\n` +
    `Column statistics (distinct values across ALL ${rows.length} rows):\n` +
    JSON.stringify(stats, null, 2) + '\n\n' +
    `Sample rows (first 20):\n` +
    JSON.stringify(rows.slice(0, 20), null, 2) + '\n\n' +
    `Call report_patterns exactly once.`

  const patternRes = await callAnthropic({
    model:    'claude-opus-4-7',
    system:   OPUS_SYSTEM,
    messages: [{ role: 'user', content: patternUserPrompt }],
    tools:    [REPORT_PATTERNS_TOOL],
    max_tokens: 4000,
  })

  const patternCall = extractToolCall(patternRes)
  if (!patternCall || patternCall.name !== 'report_patterns') {
    console.error('Pattern Reader did not produce report_patterns tool call')
    console.log('Response:', JSON.stringify(patternRes.content, null, 2))
    return
  }
  const patternReport = patternCall.input

  console.log(`  Format: ${patternReport.format} (confidence: ${patternReport.format_confidence})`)
  console.log(`  Rows: ${patternReport.row_count}  Date range: ${patternReport.date_range?.min} → ${patternReport.date_range?.max}`)
  if (patternReport.service_type_column) {
    console.log(`  Service col: "${patternReport.service_type_column.name}" values: [${patternReport.service_type_column.distinct_values.join(', ')}] opaque=${patternReport.service_type_column.is_opaque}`)
  }
  if (patternReport.metric_column) {
    console.log(`  Metric col: "${patternReport.metric_column.name}" → [${patternReport.metric_column.distinct_values.join(', ')}]`)
  }
  if (patternReport.value_column) {
    console.log(`  Value col: "${patternReport.value_column.name}"`)
  }
  console.log(`  Observed metrics: ${patternReport.observed_metrics.map(m => `${m.value}(${m.likely_type})`).join(', ')}`)
  if (patternReport.open_questions?.length > 0) {
    console.log(`  Open questions: ${patternReport.open_questions.length}`)
    for (const q of patternReport.open_questions) {
      console.log(`    [${q.blocker}] ${q.question}`)
    }
  }
  console.log(`  Tokens: ${patternRes.usage?.input_tokens} in / ${patternRes.usage?.output_tokens} out`)

  // ── Step 2: Decision Maker (Sonnet) ──────────────────────────────────────

  console.log('\n[Step 2] Decision Maker (Sonnet)...')
  const patternReports = [{ sourceName, report: patternReport }]
  const decisionUserPrompt =
    `Today's date: ${today}. Data up to and including this date is historical, not future.\n\n` +
    `Pattern reports from Opus (one per source):\n` +
    JSON.stringify(patternReports, null, 2) + '\n\n' +
    (freeText ? `Additional church description from user:\n${freeText}\n\n` : '') +
    `Call propose_mapping exactly once. ` +
    `Use ONLY the service codes, metric values, and audience values that appear in the pattern reports. ` +
    `Do not invent data that was not observed. ` +
    `For preview_data, compute REAL monthly aggregates from the date_range and observed patterns — do NOT emit zeros.`

  const decisionRes = await callAnthropic({
    model:    'claude-sonnet-4-6',
    system:   STAGE_A_SYSTEM,
    messages: [{ role: 'user', content: decisionUserPrompt }],
    tools:    [PROPOSE_MAPPING_TOOL],
    max_tokens: 6000,
  })

  const decisionCall = extractToolCall(decisionRes)
  if (!decisionCall || decisionCall.name !== 'propose_mapping') {
    console.error('Decision Maker did not produce propose_mapping tool call')
    console.log('Response:', JSON.stringify(decisionRes.content, null, 2))
    return
  }
  const mapping = decisionCall.input
  console.log(`  Tokens: ${decisionRes.usage?.input_tokens} in / ${decisionRes.usage?.output_tokens} out`)

  // ── QW-1 validation ───────────────────────────────────────────────────────

  const violations = validateMapping(mapping)

  // ── Print structured results ──────────────────────────────────────────────

  console.log('\n── RESULTS ──────────────────────────────────────────────────────────')

  console.log(`\nConfidence: ${mapping.confidence}  weeks_observed: ${mapping.weeks_observed}`)

  const templates = mapping.proposed_setup?.service_templates ?? []
  console.log(`\nService templates (${templates.length}):`)
  for (const t of templates) {
    const blocking = String(t.display_name ?? '').includes('[BLOCKING]') ? ' ⚠ BLOCKING' : ''
    console.log(`  [${t.service_code}] ${t.display_name}  tag=${t.primary_tag}  day=${t.day_of_week}${blocking}`)
  }

  const volCats = mapping.proposed_setup?.volunteer_categories ?? []
  console.log(`\nVolunteer categories (${volCats.length}):`)
  for (const v of volCats) {
    console.log(`  ${v.name}  tag=${v.primary_tag ?? 'none'}`)
  }

  const givingSources = mapping.proposed_setup?.giving_sources ?? []
  console.log(`\nGiving sources (${givingSources.length}):`)
  for (const g of givingSources) console.log(`  ${g.name}`)

  const respCats = mapping.proposed_setup?.response_categories ?? []
  if (respCats.length > 0) {
    console.log(`\nResponse categories (${respCats.length}):`)
    for (const r of respCats) console.log(`  ${r.name}  scope=${r.stat_scope}`)
  }

  const sources = mapping.sources ?? []
  console.log(`\nSources (${sources.length}):`)
  for (const src of sources) {
    console.log(`  ${src.source_name}  dest=${src.dest_table}  date_col=${src.date_column ?? '(from column_map)'}`)
    if (src.default_service_template_code) {
      console.log(`    default_template: ${src.default_service_template_code}`)
    }
    console.log(`  column_map:`)
    for (const c of src.column_map ?? []) {
      console.log(`    ${String(c.source_column).padEnd(25)} → ${c.dest_field}`)
    }
    if (src.tall_format) {
      console.log(`  tall_format:`)
      console.log(`    metric_name_column: ${src.tall_format.metric_name_column}`)
      console.log(`    value_column: ${src.tall_format.value_column}`)
      if (src.tall_format.audience_column) console.log(`    audience_column: ${src.tall_format.audience_column}`)
      if (src.tall_format.group_type_column) console.log(`    group_type_column: ${src.tall_format.group_type_column}`)
      console.log(`    area_field_map:`)
      for (const [metric, dest] of Object.entries(src.tall_format.area_field_map ?? {})) {
        console.log(`      "${metric}" → ${dest}`)
      }
      if (src.tall_format.audience_map) {
        console.log(`    audience_map: ${JSON.stringify(src.tall_format.audience_map)}`)
      }
    }
  }

  const qs = mapping.clarification_questions ?? []
  const blocking = qs.filter(q => q.blocking)
  console.log(`\nClarification questions: ${qs.length} (${blocking.length} blocking)`)
  for (const q of qs) {
    console.log(`  [${q.blocking ? 'BLOCK' : 'opt  '}] ${q.id} — ${q.title}`)
  }

  // ── QW-1 violations ───────────────────────────────────────────────────────

  if (violations.length > 0) {
    console.log(`\n⚠ QW-1 VIOLATIONS (${violations.length}):`)
    for (const v of violations) console.log(`  ✗ ${v}`)
  } else {
    console.log(`\n✓ QW-1 PASS — no critical violations`)
  }
}

// ── Test data ─────────────────────────────────────────────────────────────────

const HARBOR_CSV = `Date,Service,Adult Attenders,KidZone Attenders,Greeters,Parking Crew,Worship Team,KidZone Helpers,Plate,eGiving
2024-11-03,AM,312,87,8,6,14,9,2840.00,4210.50
2024-11-03,PM,198,54,5,4,14,6,1620.00,2890.75
2024-11-10,AM,298,91,7,6,14,10,3100.00,3980.25
2024-11-10,PM,201,60,5,4,14,7,1540.00,2760.00
2024-11-17,AM,325,95,8,7,15,11,2950.00,4320.00
2024-11-17,PM,210,58,5,4,15,7,1710.00,3010.50
2024-11-24,AM,289,82,7,5,14,9,2680.00,3870.25
2024-11-24,PM,187,51,4,4,14,6,1480.00,2640.00
2024-12-01,AM,318,89,8,6,14,10,3050.00,4180.75
2024-12-01,PM,205,56,5,4,14,7,1590.00,2920.00
2024-12-08,AM,330,93,9,7,15,11,3200.00,4450.00
2024-12-08,PM,215,62,6,5,15,8,1680.00,3100.25
2024-12-15,AM,341,98,9,7,15,12,3380.00,4620.50
2024-12-15,PM,222,67,6,5,15,8,1790.00,3240.00
2024-12-22,AM,298,84,8,6,14,10,2910.00,4050.75
2024-12-22,PM,196,55,5,4,14,7,1530.00,2800.00
2024-12-29,AM,275,78,7,5,13,9,2640.00,3780.25
2024-12-29,PM,182,49,4,3,13,6,1420.00,2560.00
2025-01-05,AM,308,86,8,6,14,10,2990.00,4150.50
2025-01-05,PM,199,57,5,4,14,7,1560.00,2840.75
2025-01-12,AM,321,90,8,7,14,10,3080.00,4290.00
2025-01-12,PM,207,61,5,4,14,7,1640.00,2980.25
2025-01-19,AM,315,88,8,6,15,10,3010.00,4200.00
2025-01-19,PM,203,59,5,4,15,7,1600.00,2910.50
2025-01-26,AM,329,94,9,7,15,11,3150.00,4380.75
2025-01-26,PM,211,63,5,5,15,8,1670.00,3050.00
2025-02-02,AM,317,89,8,6,14,10,3030.00,4230.25
2025-02-02,PM,204,58,5,4,14,7,1610.00,2940.00
2025-02-09,AM,322,92,8,7,14,11,3090.00,4310.50
2025-02-09,PM,208,60,5,4,14,7,1650.00,2990.75
2025-02-16,AM,310,87,8,6,14,10,2970.00,4160.00
2025-02-16,PM,200,56,5,4,14,7,1570.00,2850.25
2025-02-23,AM,327,93,9,7,15,11,3130.00,4360.00
2025-02-23,PM,212,64,6,5,15,8,1680.00,3080.50
2025-03-02,AM,319,88,8,6,14,10,3050.00,4220.75
2025-03-02,PM,206,59,5,4,14,7,1620.00,2950.00
2025-03-09,AM,324,91,8,7,15,11,3100.00,4290.25
2025-03-09,PM,210,62,5,5,15,7,1660.00,3020.00
2025-03-16,AM,335,96,9,7,15,12,3260.00,4510.50
2025-03-16,PM,218,65,6,5,15,8,1740.00,3160.75
2025-03-23,AM,311,87,8,6,14,10,3000.00,4180.00
2025-03-23,PM,202,58,5,4,14,7,1590.00,2900.25
2025-03-30,AM,298,83,7,5,13,9,2870.00,4020.00
2025-03-30,PM,194,53,4,4,13,6,1510.00,2760.50
2025-04-06,AM,389,112,10,9,16,14,4120.00,5840.75
2025-04-06,PM,274,84,7,6,16,11,2980.00,4210.00
2025-04-13,AM,326,92,8,7,15,11,3140.00,4380.25
2025-04-13,PM,213,63,6,5,15,8,1700.00,3110.00
2025-04-20,AM,318,89,8,6,14,10,3060.00,4250.50
2025-04-20,PM,207,61,5,4,14,7,1640.00,2980.75
2025-04-27,AM,322,91,8,7,14,11,3090.00,4300.00
2025-04-27,PM,209,62,5,5,14,7,1660.00,3010.25`

const HARBOR_FREETEXT = `Harbor Community Church has two Sunday services called AM (9am) and PM (11am).
Kids ministry is branded KidZone — it runs during both services.
No youth ministry. Plate and eGiving are giving sources.
KidZone Helpers are the volunteers who serve in the kids ministry.`

const RIVERSIDE_CSV = `Week Date,Service,Category,Value
2025-01-05,Main Service,Adults,412
2025-01-05,Main Service,Children,134
2025-01-05,Main Service,First Time Guests,18
2025-01-05,Main Service,Greeters,11
2025-01-05,Main Service,Parking Volunteers,7
2025-01-05,Main Service,Tithe,8240.00
2025-01-05,Main Service,Offering,1820.50
2025-01-05,Kids Church,Children,134
2025-01-05,Kids Church,Volunteers,22
2025-01-12,Main Service,Adults,398
2025-01-12,Main Service,Children,121
2025-01-12,Main Service,First Time Guests,14
2025-01-12,Main Service,Greeters,10
2025-01-12,Main Service,Parking Volunteers,6
2025-01-12,Main Service,Tithe,7980.00
2025-01-12,Main Service,Offering,1640.25
2025-01-12,Kids Church,Children,121
2025-01-12,Kids Church,Volunteers,19
2025-01-19,Main Service,Adults,421
2025-01-19,Main Service,Children,138
2025-01-19,Main Service,First Time Guests,21
2025-01-19,Main Service,Greeters,12
2025-01-19,Main Service,Parking Volunteers,8
2025-01-19,Main Service,Tithe,8450.00
2025-01-19,Main Service,Offering,1890.75
2025-01-19,Kids Church,Children,138
2025-01-19,Kids Church,Volunteers,24
2025-02-02,Main Service,Adults,405
2025-02-02,Main Service,Children,129
2025-02-02,Main Service,First Time Guests,16
2025-02-02,Main Service,Greeters,11
2025-02-02,Main Service,Parking Volunteers,7
2025-02-02,Main Service,Tithe,8100.00
2025-02-02,Main Service,Offering,1710.50
2025-02-02,Kids Church,Children,129
2025-02-02,Kids Church,Volunteers,21
2025-02-09,Main Service,Adults,418
2025-02-09,Main Service,Children,142
2025-02-09,Main Service,First Time Guests,19
2025-02-09,Main Service,Greeters,11
2025-02-09,Main Service,Parking Volunteers,7
2025-02-09,Main Service,Tithe,8320.00
2025-02-09,Main Service,Offering,1780.00
2025-02-09,Kids Church,Children,142
2025-02-09,Kids Church,Volunteers,23
2025-03-09,Main Service,Adults,425
2025-03-09,Main Service,Children,136
2025-03-09,Main Service,First Time Guests,20
2025-03-09,Main Service,Greeters,12
2025-03-09,Main Service,Parking Volunteers,8
2025-03-09,Main Service,Tithe,8500.00
2025-03-09,Main Service,Offering,1850.25
2025-03-09,Kids Church,Children,136
2025-03-09,Kids Church,Volunteers,22`

const RIVERSIDE_FREETEXT = `Riverside Church has one main Sunday service and a concurrent kids church called "Kids Church".
Data is recorded per metric per service. "Children" appears in both Main Service and Kids Church rows for the same date.
In the main service row it's kids attending the main auditorium; in the Kids Church row it's kids in the dedicated kids space.
Tithe and Offering are per-service giving. First Time Guests is tracked per main service only.`

// ── Run tests ─────────────────────────────────────────────────────────────────

console.log('\n SundayTally — Full Stage A Pipeline Tests')
console.log(' Pattern Reader (Opus) → PatternReport → Decision Maker (Sonnet) → propose_mapping\n')

await runFullTest('Harbor Community — Wide Format (AM/PM, KidZone)', 'Harbor Weekly Services', HARBOR_CSV, HARBOR_FREETEXT)
await runFullTest('Riverside Church — Tall Format (one row per metric)', 'Riverside Weekly Data', RIVERSIDE_CSV, RIVERSIDE_FREETEXT)

console.log('\n\nDone.')
