/**
 * Opus Pattern Reader — standalone test
 * Fetches the Google Sheet, sends ALL rows to Opus, prints the raw pattern report.
 * No DB. No confirm page. Just: "what do you see in this data?"
 *
 * Usage: node test-pattern-reader.mjs
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'

// ── Load .env.local ───────────────────────────────────────────────────────────
const env = {}
try {
  readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.split('=')
    if (k && rest.length) env[k.trim()] = rest.join('=').trim().replace(/^"|"$/g, '')
  })
} catch {}
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_KEY) { console.error('No ANTHROPIC_API_KEY found in .env.local'); process.exit(1) }

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?usp=sharing&gid=1378199377#gid=1378199377'

// ── Fetch + parse CSV ─────────────────────────────────────────────────────────
async function fetchSheet(url) {
  const idMatch  = url.match(/spreadsheets\/d\/([A-Za-z0-9_-]+)/)
  const gidMatch = url.match(/[?&#]gid=(\d+)/)
  if (!idMatch) throw new Error('Not a Google Sheets URL')
  const id  = idMatch[1]
  const gid = gidMatch ? gidMatch[1] : '0'
  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
  const res = await fetch(exportUrl, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Sheets fetch failed: ${res.status}`)
  return res.text()
}

function parseCsv(raw) {
  const lines = raw.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    // Handle quoted fields
    const values = []
    let cur = '', inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    values.push(cur.trim())
    const row = {}
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').replace(/^"|"$/g, '') })
    return row
  })
  return { headers, rows }
}

// ── Distinct values per column (sampled) ─────────────────────────────────────
function columnStats(headers, rows) {
  const stats = {}
  for (const h of headers) {
    const vals = [...new Set(rows.map(r => r[h]).filter(Boolean))].slice(0, 30)
    stats[h] = { distinct_count: new Set(rows.map(r => r[h]).filter(Boolean)).size, sample_values: vals }
  }
  return stats
}

// ── Opus prompt ───────────────────────────────────────────────────────────────
const OPUS_SYSTEM = `You are a data structure analyst for Sunday Tally, a church analytics platform.

Your job is to read raw tabular church data and produce a precise pattern report.
You do NOT propose mappings. You do NOT create any setup. You ONLY describe what you observe.

Sunday Tally stores:
- service_occurrences: one row per (service_template × location × date)
- attendance_entries: headcount per occurrence × audience (MAIN, KIDS, YOUTH)
- response_entries: stat counts per occurrence × category × optional audience
- volunteer_entries: counts per occurrence × volunteer_category × audience
- giving_entries: amounts per occurrence × giving_source

Audiences are exactly: MAIN, KIDS, YOUTH — nothing else.

TALL format: multiple rows per occurrence — one row per metric/audience combination.
WIDE format: one row per occurrence — each column is a different metric.

Report only what you can directly observe in the data. Never speculate about values you haven't seen.
Mark is_opaque: true for any column where the values give no hint of meaning (e.g. "1", "2", "3").

Call report_patterns exactly once.`

const REPORT_PATTERNS_TOOL = {
  name: 'report_patterns',
  description: 'Report all observed patterns in the source data. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      format: {
        type: 'string', enum: ['tall', 'wide', 'unknown'],
        description: 'tall = multiple rows per occurrence; wide = one row per occurrence',
      },
      format_confidence: { type: 'number', description: '0.0–1.0' },
      format_reasoning:  { type: 'string' },

      row_count:  { type: 'number' },
      date_range: {
        type: 'object',
        properties: { min: { type: 'string' }, max: { type: 'string' } },
        required: ['min', 'max'],
      },

      date_column: {
        type: 'object',
        properties: {
          name:             { type: 'string' },
          sample_values:    { type: 'array', items: { type: 'string' } },
          detected_format:  { type: 'string', description: 'e.g. "M/D/YYYY"' },
        },
        required: ['name'],
      },

      service_type_column: {
        type: 'object',
        description: 'Column that distinguishes which service this row belongs to',
        properties: {
          name:           { type: 'string' },
          distinct_values: { type: 'array', items: { type: 'string' } },
          is_opaque:      { type: 'boolean', description: 'true if values (e.g. "1","2","3") have no intrinsic meaning' },
          value_count:    { type: 'number' },
        },
        required: ['name', 'distinct_values', 'is_opaque'],
      },

      audience_column: {
        type: 'object',
        description: 'Column whose value identifies the audience group for a row',
        properties: {
          name:           { type: 'string' },
          distinct_values: { type: 'array', items: { type: 'string' } },
          proposed_map: {
            type: 'object',
            description: 'Best-guess mapping of each value to MAIN/KIDS/YOUTH/unknown',
            additionalProperties: { type: 'string', enum: ['MAIN', 'KIDS', 'YOUTH', 'unknown'] },
          },
          mapping_confidence: { type: 'number' },
        },
        required: ['name', 'distinct_values', 'proposed_map'],
      },

      metric_column: {
        type: 'object',
        description: 'For tall format: column whose value names the metric (e.g. "Area")',
        properties: {
          name:            { type: 'string' },
          distinct_values: { type: 'array', items: { type: 'string' } },
          description:     { type: 'string', description: 'What this column appears to represent' },
        },
        required: ['name', 'distinct_values'],
      },

      value_column: {
        type: 'object',
        description: 'For tall format: column that holds the numeric count/amount',
        properties: {
          name:         { type: 'string' },
          sample_values: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },

      grouping_columns: {
        type: 'array',
        description: 'Any columns that sub-group rows within the same occurrence (e.g. "Group Type", "Group")',
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
        description: 'Every distinct metric/area value actually observed in the data (NO speculation)',
        items: {
          type: 'object',
          properties: {
            value:          { type: 'string', description: 'Raw value as it appears in the column' },
            likely_type:    { type: 'string', enum: ['attendance', 'response', 'volunteer', 'giving', 'unknown'] },
            audience_scoped: { type: 'boolean', description: 'Does this metric appear with different audience values?' },
            confidence:     { type: 'number' },
            reasoning:      { type: 'string' },
          },
          required: ['value', 'likely_type', 'confidence'],
        },
      },

      location_signals: {
        type: 'array',
        description: 'Any evidence of multiple locations/campuses',
        items: { type: 'string' },
      },

      ignored_columns: {
        type: 'array',
        description: 'Columns that appear redundant or non-essential (e.g. Year, Month when Date exists)',
        items: { type: 'object', properties: { name: { type: 'string' }, reason: { type: 'string' } }, required: ['name', 'reason'] },
      },

      anomalies: {
        type: 'array',
        description: 'Anything unexpected or potentially problematic in the data',
        items: { type: 'string' },
      },

      open_questions: {
        type: 'array',
        description: 'Things that CANNOT be determined from the data alone — must ask the user',
        items: {
          type: 'object',
          properties: {
            dimension:   { type: 'string', description: 'What aspect is unclear (e.g. "service display names")' },
            blocker:     { type: 'string', description: 'What cannot proceed without this answer' },
            question:    { type: 'string', description: 'Exact question to ask the user' },
          },
          required: ['dimension', 'blocker', 'question'],
        },
      },
    },
    required: ['format', 'format_confidence', 'row_count', 'date_column', 'observed_metrics', 'open_questions'],
  },
}

// ── Main ──────────────────────────────────────────────────────────────────────
;(async () => {
  console.log('Fetching sheet...')
  const csv = await fetchSheet(SHEET_URL)
  const { headers, rows } = parseCsv(csv)
  const stats = columnStats(headers, rows)

  console.log(`Parsed: ${rows.length} rows, ${headers.length} columns`)
  console.log('Columns:', headers)
  console.log('')

  // Send ALL distinct values + 20 sample rows to Opus
  const sampleRows = rows.slice(0, 20)

  const userPrompt =
    `Source: "Church Attendance Data"\n` +
    `Total rows: ${rows.length}\n\n` +
    `Column statistics (distinct values observed across all ${rows.length} rows):\n` +
    JSON.stringify(stats, null, 2) + '\n\n' +
    `Sample rows (first 20):\n` +
    JSON.stringify(sampleRows, null, 2) + '\n\n' +
    `Call report_patterns exactly once with everything you observe.`

  console.log('Sending to Opus...')
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

  const response = await client.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 4096,
    system:     OPUS_SYSTEM,
    tools:      [REPORT_PATTERNS_TOOL],
    tool_choice: { type: 'any' },
    messages:   [{ role: 'user', content: userPrompt }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse) {
    console.error('Opus did not call report_patterns')
    console.log(JSON.stringify(response.content, null, 2))
    process.exit(1)
  }

  const report = toolUse.input
  const inputTokens  = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens

  console.log('\n══════════════════════════════════════════')
  console.log('           OPUS PATTERN REPORT')
  console.log('══════════════════════════════════════════\n')
  console.log(JSON.stringify(report, null, 2))
  console.log('\n──────────────────────────────────────────')
  console.log(`Tokens: ${inputTokens} in / ${outputTokens} out`)
  console.log(`Cost estimate: ~$${((inputTokens * 15 + outputTokens * 75) / 1e7).toFixed(4)}`)
  console.log('──────────────────────────────────────────\n')
})()
