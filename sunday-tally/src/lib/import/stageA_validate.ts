/**
 * Validator that runs AFTER Sonnet produces propose_mapping and BEFORE the user
 * sees the review page. Catches AI hallucinations and metric/ministry decisions
 * that contradict the actual data. (IR v2 — metric-centric, see IMPORT_IR_V2.md.)
 *
 * Two deterministic passes (no model):
 *   Pass 1 — Apply mapping to sample rows. Detect rows that don't route, orphan
 *            columns with data, columns mapped to no metric, metrics with no feed.
 *   Pass 2 — Verify metric/ministry claims (unknown metric refs, undeclared
 *            ministries, unknown reporting tags, multiple-canonical, tag_role
 *            suspicion, ministry hierarchy) against proposed_setup + the data.
 *
 * Returns a list of Violations. The pipeline decides whether to escalate to
 * Haiku for interpretation (Pass 3) or surface as user-facing clarifications.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import { runToolLoop } from '@/lib/ai/anthropic'
import type { NormalizedSource } from './sources'
import type {
  ConfirmedSourceMapping,
  TallFormatConfig,
  ColumnMapEntry,
} from './stageB'
import {
  routeTallRow,
  routeWideRow,
  metricCodeFromDest,
  CONTROL_DEST_FIELDS,
} from './routing'

// ─────────────────────────── Types ───────────────────────────

export type ViolationKind =
  // Pass 1 — column / data routing
  | 'unknown_column'          // mapping references a column that doesn't exist
  | 'orphan_column'           // column has data but isn't in mapping
  | 'column_no_metric'        // mapped data column points at neither control/ignore nor metric.<CODE>
  | 'unmapped_metric_value'   // tall: distinct metric_name value with no area_field_map entry
  | 'unmapped_group_context'  // tall: distinct group_context value never used in compound keys
  | 'zero_routed_rows'        // entire source's mapping routes nothing
  // Pass 2 — metric / ministry structural
  | 'unknown_metric_reference'   // a metric.<CODE> in routing not declared in proposed_setup.metrics
  | 'metric_undeclared_ministry' // metric.ministry_tag not in proposed_setup.ministry_tags
  | 'unknown_reporting_tag'      // metric.reporting_tag neither system nor declared
  | 'multiple_canonical'         // >1 canonical metric for one (ministry, reporting) pair (BLOCK)
  | 'metric_no_feeding_column'   // a declared metric no column/area_field_map feeds (WARN)
  | 'tag_role_unset_or_suspect'  // ministry_tag whose tag_role looks wrong vs its name (WARN)
  | 'tag_referenced_not_declared'    // ministry tag used (primary_tag / metric.ministry_tag / parent_code) but not declared
  | 'shared_tag_vocabulary_mismatch' // two templates share a ministry tag but have different vocab
  | 'ministry_never_independent'     // standalone ministry that always co-occurs with another
  | 'child_tag_invention_suspected'  // multiple primary_tags with same root + identical vocab

export interface Violation {
  kind:        ViolationKind
  severity:    'block' | 'warn'
  source?:     string
  details:     Record<string, unknown>
  /** Short human-readable summary for prompts/UI. */
  summary:     string
}

export interface ValidationResult {
  passed:      boolean
  violations:  Violation[]
  iteration:   number
}

// ─────────────────────────── Constants ───────────────────────────

const ORPHAN_NONZERO_THRESHOLD = 0.3
const JACCARD_CONFIRM = 0.7
const JACCARD_CONTRADICT = 0.3
const INDEPENDENT_FLOOR = 0.05  // < 5% independent occurrences → flag as nested

/** The 4 reporting tags pre-seeded at signup — referenced by code, never declared. */
const SYSTEM_REPORTING_TAGS = new Set(['ATTENDANCE', 'VOLUNTEERS', 'GIVING', 'RESPONSE_STAT'])

/** Valid tag_role values (D-068). */
const VALID_TAG_ROLES = new Set(['ADULT_SERVICE', 'KIDS_MINISTRY', 'YOUTH_MINISTRY', 'OTHER'])

// Name → expected tag_role heuristics for tag_role_unset_or_suspect (D-068).
const KIDS_NAME_RE  = /\b(kids?|children|child|nursery|lifekids|toddler|preschool|elementary)\b/i
const YOUTH_NAME_RE = /\b(youth|students?|switch|middle\s*school|high\s*school|teens?|junior\s*high)\b/i

// ─────────────────────────── Proposed setup shape (IR v2) ───────────────────────────

export interface ProposedMinistryTag {
  code:         string
  name?:        string
  tag_role?:    string
  parent_code?: string | null
}

export interface ProposedReportingTag {
  code:        string
  name?:       string
  unit_kind?:  string
  agg_default?: string
}

export interface ProposedServiceTemplate {
  service_code:           string
  display_name:           string
  primary_tag?:           string
  primary_tag_reasoning?: string
  location_name?:         string
  day_of_week?:           number
  start_time?:            string | null
}

export interface ProposedMetric {
  metric_code:   string
  name?:         string
  ministry_tag?: string
  reporting_tag?: string
  scope?:        'instance' | 'period'
  is_canonical?: boolean
}

export interface ProposedSetup {
  locations?:         Array<{ name: string; code?: string }>
  ministry_tags?:     ProposedMinistryTag[]
  reporting_tags?:    ProposedReportingTag[]
  service_templates?: ProposedServiceTemplate[]
  metrics?:           ProposedMetric[]
}

// ─────────────────────────── Helpers ───────────────────────────

function isNonTrivial(v: string | undefined): boolean {
  if (v == null) return false
  const t = String(v).trim()
  if (t === '' || t === '0' || t === '0.0' || t === '$0' || t === '-') return false
  return true
}

function distinctValues(rows: Record<string, string>[], col: string): string[] {
  const s = new Set<string>()
  for (const r of rows) {
    const v = r[col]
    if (v != null && String(v).trim() !== '') s.add(v)
  }
  return [...s]
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1
  const inter = [...a].filter(x => b.has(x)).length
  const uni   = new Set([...a, ...b]).size
  return uni === 0 ? 0 : inter / uni
}

/** All metric.<CODE> dest_fields referenced anywhere in a source mapping. */
function metricRefsInMapping(mapping: ConfirmedSourceMapping): string[] {
  const codes: string[] = []
  for (const cm of (mapping.column_map ?? []) as ColumnMapEntry[]) {
    const code = metricCodeFromDest(cm.dest_field)
    if (code) codes.push(code)
  }
  const tf = mapping.tall_format
  if (tf?.area_field_map) {
    for (const dest of Object.values(tf.area_field_map)) {
      const code = metricCodeFromDest(dest)
      if (code) codes.push(code)
    }
  }
  return codes
}

// ─────────────────────────── Pass 1: Apply to data ───────────────────────────

function pass1Source(
  source:   NormalizedSource,
  mapping:  ConfirmedSourceMapping,
  allRows:  Record<string, string>[],
): Violation[] {
  const violations: Violation[] = []
  const sampleSize = Math.min(50, allRows.length)
  const sample = allRows.slice(0, sampleSize)
  const actualCols = new Set(source.columns)

  // ── 1a: column_map references unknown columns ──
  for (const cm of (mapping.column_map ?? []) as ColumnMapEntry[]) {
    if (!actualCols.has(cm.source_column)) {
      violations.push({
        kind: 'unknown_column',
        severity: 'block',
        source: source.name,
        details: {
          referenced_column: cm.source_column,
          dest_field: cm.dest_field,
          actual_columns: [...actualCols],
        },
        summary: `Mapping references column "${cm.source_column}" which doesn't exist in source "${source.name}".`,
      })
    }
  }

  // ── 1b: tall_format slots reference unknown columns ──
  const tf = mapping.tall_format
  if (tf) {
    const slots: { key: keyof TallFormatConfig; required: boolean }[] = [
      { key: 'metric_name_column',   required: true  },
      { key: 'value_column',         required: true  },
      { key: 'audience_column',      required: false },
      { key: 'group_type_column',    required: false },
      { key: 'group_context_column', required: false },
    ]
    for (const slot of slots) {
      const col = tf[slot.key] as string | undefined
      if (!col) continue
      if (!actualCols.has(col)) {
        violations.push({
          kind: 'unknown_column',
          severity: 'block',
          source: source.name,
          details: { referenced_column: col, slot: slot.key, actual_columns: [...actualCols] },
          summary: `tall_format.${slot.key} = "${col}" which doesn't exist in source "${source.name}".`,
        })
      }
    }
  }

  // ── 1c: orphan columns (real data, no mapping entry) ──
  const addressedCols = new Set<string>()
  for (const cm of (mapping.column_map ?? []) as ColumnMapEntry[]) {
    addressedCols.add(cm.source_column)
  }
  if (tf) {
    for (const k of ['metric_name_column','value_column','audience_column','group_type_column','group_context_column'] as const) {
      const v = tf[k] as string | undefined
      if (v) addressedCols.add(v)
    }
  }
  for (const col of actualCols) {
    if (addressedCols.has(col)) continue
    const nonTrivialCount = sample.filter(r => isNonTrivial(r[col])).length
    const rate = sample.length > 0 ? nonTrivialCount / sample.length : 0
    if (rate >= ORPHAN_NONZERO_THRESHOLD) {
      const sampleValues = [...new Set(sample.map(r => r[col]).filter(isNonTrivial))].slice(0, 5)
      violations.push({
        kind: 'orphan_column',
        severity: 'block',
        source: source.name,
        details: { column: col, nonzero_rate: rate, sample_values: sampleValues },
        summary: `Column "${col}" has data (${Math.round(rate*100)}% non-empty) but is not mapped or explicitly ignored.`,
      })
    }
  }

  // ── 1d: wide — data columns mapped to neither control/ignore nor metric.<CODE> ──
  if (!tf) {
    for (const cm of (mapping.column_map ?? []) as ColumnMapEntry[]) {
      if (!actualCols.has(cm.source_column)) continue // already flagged 1a
      if (CONTROL_DEST_FIELDS.has(cm.dest_field)) continue
      if (metricCodeFromDest(cm.dest_field)) continue
      violations.push({
        kind: 'column_no_metric',
        severity: 'block',
        source: source.name,
        details: { source_column: cm.source_column, dest_field: cm.dest_field },
        summary: `Column "${cm.source_column}" is mapped to "${cm.dest_field}", which is neither a control field, "ignore", nor a metric.<CODE> — it cannot be written.`,
      })
    }
  } else if (tf.area_field_map) {
    // tall — area_field_map values must be `ignore` or metric.<CODE>
    for (const [key, dest] of Object.entries(tf.area_field_map)) {
      if (dest === 'ignore') continue
      if (metricCodeFromDest(dest)) continue
      violations.push({
        kind: 'column_no_metric',
        severity: 'block',
        source: source.name,
        details: { area_key: key, dest_field: dest },
        summary: `area_field_map["${key}"] = "${dest}", which is neither "ignore" nor a metric.<CODE> — its rows cannot be written.`,
      })
    }
  }

  // ── 1e: apply routing to sample rows; zero-route detection ──
  let routedCount = 0
  const dropReasons: Record<string, number> = {}
  if (sample.length > 0) {
    if (tf) {
      for (const row of sample) {
        const res = routeTallRow(row, tf)
        if (res.metricCode) routedCount++
        else if (res.dropReason) dropReasons[res.dropReason] = (dropReasons[res.dropReason] ?? 0) + 1
      }
    } else {
      for (const row of sample) {
        const res = routeWideRow(row, (mapping.column_map ?? []) as ColumnMapEntry[])
        if (res.routed.length > 0) routedCount++
      }
    }
    if (routedCount === 0) {
      violations.push({
        kind: 'zero_routed_rows',
        severity: 'block',
        source: source.name,
        details: { rows_tested: sample.length, drop_reasons: dropReasons },
        summary: `Mapping for "${source.name}" routes ZERO of ${sample.length} sample rows to any metric. This source will import no data.`,
      })
    }
  }

  // ── 1f: tall — unmapped metric values, unmapped group_context values ──
  if (tf) {
    if (tf.metric_name_column) {
      const distinctMetrics = distinctValues(allRows, tf.metric_name_column)
      for (const m of distinctMetrics) {
        // does ANY compound key resolve for this metric value?
        const couldMatch = Object.keys(tf.area_field_map ?? {}).some(k =>
          k === m || k.endsWith(` / ${m}`))
        if (!couldMatch) {
          violations.push({
            kind: 'unmapped_metric_value',
            severity: 'block',
            source: source.name,
            details: { metric_value: m, area_field_map_keys: Object.keys(tf.area_field_map ?? {}) },
            summary: `Value "${m}" in "${tf.metric_name_column}" has no entry in area_field_map — its rows will be dropped.`,
          })
        }
      }
    }
    if (tf.group_context_column) {
      const distinctCtx = distinctValues(allRows, tf.group_context_column)
      for (const ctx of distinctCtx) {
        const usedInAnyKey = Object.keys(tf.area_field_map ?? {}).some(k => k.includes(` / ${ctx} / `))
        if (!usedInAnyKey) {
          violations.push({
            kind: 'unmapped_group_context',
            severity: 'warn',
            source: source.name,
            details: { group_context_value: ctx },
            summary: `group_context value "${ctx}" never appears in compound keys — rows under it may be misrouted.`,
          })
        }
      }
    }
  }

  return violations
}

// ─────────────────────────── Pass 2: Metric / ministry structural ───────────────────────────

function pass2Setup(
  setup:     ProposedSetup,
  sources:   NormalizedSource[],
  mappings:  ConfirmedSourceMapping[],
  rowsByName: Record<string, Record<string, string>[]>,
): Violation[] {
  const violations: Violation[] = []

  const ministryTags    = setup.ministry_tags ?? []
  const reportingTags   = setup.reporting_tags ?? []
  const metrics         = setup.metrics ?? []
  const templates       = setup.service_templates ?? []

  const ministryByCode  = new Map(ministryTags.map(t => [t.code, t]))
  const declaredMinistry = new Set(ministryTags.map(t => t.code))
  const declaredReporting = new Set(reportingTags.map(t => t.code))
  const metricByCode    = new Map(metrics.map(m => [m.metric_code, m]))

  const knownReporting = (code: string | undefined): boolean =>
    !!code && (SYSTEM_REPORTING_TAGS.has(code) || declaredReporting.has(code))

  // ── 2a: unknown_metric_reference — every metric.<CODE> in routing must be declared ──
  for (const mapping of mappings) {
    const refs = new Set(metricRefsInMapping(mapping))
    for (const code of refs) {
      if (!metricByCode.has(code)) {
        violations.push({
          kind: 'unknown_metric_reference',
          severity: 'block',
          source: mapping.source_name,
          details: { metric_code: code, declared_metric_codes: [...metricByCode.keys()] },
          summary: `dest_field "metric.${code}" (in "${mapping.source_name}") references a metric not declared in proposed_setup.metrics.`,
        })
      }
    }
  }

  // ── 2b: metric_undeclared_ministry + unknown_reporting_tag (per declared metric) ──
  for (const m of metrics) {
    if (m.ministry_tag && !declaredMinistry.has(m.ministry_tag)) {
      violations.push({
        kind: 'metric_undeclared_ministry',
        severity: 'block',
        details: { metric_code: m.metric_code, ministry_tag: m.ministry_tag, declared_ministry_codes: [...declaredMinistry] },
        summary: `Metric "${m.metric_code}" references ministry_tag "${m.ministry_tag}" which is not declared in proposed_setup.ministry_tags.`,
      })
    }
    if (m.reporting_tag && !knownReporting(m.reporting_tag)) {
      violations.push({
        kind: 'unknown_reporting_tag',
        severity: 'block',
        details: {
          metric_code: m.metric_code,
          reporting_tag: m.reporting_tag,
          system_reporting_tags: [...SYSTEM_REPORTING_TAGS],
          declared_reporting_tags: [...declaredReporting],
        },
        summary: `Metric "${m.metric_code}" uses reporting_tag "${m.reporting_tag}" which is neither a system tag (ATTENDANCE/VOLUNTEERS/GIVING/RESPONSE_STAT) nor declared in proposed_setup.reporting_tags.`,
      })
    }
  }

  // ── 2c: multiple_canonical — at most one canonical metric per (ministry, reporting) ──
  const canonByPair = new Map<string, ProposedMetric[]>()
  for (const m of metrics) {
    if (!m.is_canonical) continue
    if (!m.ministry_tag || !m.reporting_tag) continue
    const pair = `${m.ministry_tag}::${m.reporting_tag}`
    const list = canonByPair.get(pair) ?? []
    list.push(m)
    canonByPair.set(pair, list)
  }
  for (const [pair, list] of canonByPair) {
    if (list.length <= 1) continue
    const [ministry, reporting] = pair.split('::')
    violations.push({
      kind: 'multiple_canonical',
      severity: 'block',
      details: { ministry_tag: ministry, reporting_tag: reporting, metric_codes: list.map(m => m.metric_code) },
      summary: `Metrics ${list.map(m => `"${m.metric_code}"`).join(', ')} are all canonical for ministry "${ministry}" + reporting "${reporting}". At most one canonical metric is allowed per pair — pick the primary one.`,
    })
  }

  // ── 2d: tag_role_unset_or_suspect — role missing/invalid, or name vs role mismatch ──
  for (const t of ministryTags) {
    const role = t.tag_role
    const name = t.name ?? t.code
    const tree = `ministry: ${name}\n└─ tag_role: ${role ?? '(unset)'}`
    if (!role || !VALID_TAG_ROLES.has(role)) {
      violations.push({
        kind: 'tag_role_unset_or_suspect',
        severity: 'warn',
        details: { ministry_code: t.code, name, current_role: role ?? null, reason: 'unset_or_invalid' },
        summary: `Ministry "${name}" has tag_role "${role ?? '(unset)'}" which is missing or not one of ADULT_SERVICE/KIDS_MINISTRY/YOUTH_MINISTRY/OTHER.`,
      })
      continue
    }
    if (KIDS_NAME_RE.test(name) && role !== 'KIDS_MINISTRY') {
      violations.push({
        kind: 'tag_role_unset_or_suspect',
        severity: 'warn',
        details: { ministry_code: t.code, name, current_role: role, suspected_role: 'KIDS_MINISTRY', visual_tree: tree },
        summary: `Ministry "${name}" looks like a kids ministry but is classified ${role}. Should it be KIDS_MINISTRY?`,
      })
    } else if (YOUTH_NAME_RE.test(name) && role !== 'YOUTH_MINISTRY') {
      violations.push({
        kind: 'tag_role_unset_or_suspect',
        severity: 'warn',
        details: { ministry_code: t.code, name, current_role: role, suspected_role: 'YOUTH_MINISTRY', visual_tree: tree },
        summary: `Ministry "${name}" looks like a youth ministry but is classified ${role}. Should it be YOUTH_MINISTRY?`,
      })
    }
  }

  // ── 2e: tag_referenced_not_declared — primary_tag / parent_code must be declared ──
  for (const tpl of templates) {
    if (tpl.primary_tag && !declaredMinistry.has(tpl.primary_tag)) {
      violations.push({
        kind: 'tag_referenced_not_declared',
        severity: 'block',
        details: { tag: tpl.primary_tag, used_by: `service_template.${tpl.service_code}` },
        summary: `service_template "${tpl.display_name}" uses primary_tag "${tpl.primary_tag}" which is not declared in proposed_setup.ministry_tags.`,
      })
    }
  }
  for (const t of ministryTags) {
    if (t.parent_code && !declaredMinistry.has(t.parent_code)) {
      violations.push({
        kind: 'tag_referenced_not_declared',
        severity: 'block',
        details: { tag: t.parent_code, used_by: `ministry_tag.${t.code}.parent_code` },
        summary: `Ministry "${t.name ?? t.code}" declares parent_code "${t.parent_code}" which is not a declared ministry_tag.`,
      })
    }
  }

  // ── 2f: metric_no_feeding_column — a declared metric no column/area_field_map feeds ──
  const fedMetricCodes = new Set<string>()
  for (const mapping of mappings) {
    for (const code of metricRefsInMapping(mapping)) fedMetricCodes.add(code)
  }
  for (const m of metrics) {
    if (!fedMetricCodes.has(m.metric_code)) {
      violations.push({
        kind: 'metric_no_feeding_column',
        severity: 'warn',
        details: { metric_code: m.metric_code, name: m.name ?? null },
        summary: `Metric "${m.metric_code}" is declared but no column (or area_field_map entry) routes data to it — it will stay empty.`,
      })
    }
  }

  // ── 2g: child-tag invention detection (ministry tags + data vocabulary) ──
  // If multiple templates carry distinct primary_tags that share a name root AND have
  // identical metric vocabulary, they should likely share one ministry tag.
  const tagToTemplates = new Map<string, string[]>()
  for (const tpl of templates) {
    if (!tpl.primary_tag) continue
    const list = tagToTemplates.get(tpl.primary_tag) ?? []
    list.push(tpl.service_code)
    tagToTemplates.set(tpl.primary_tag, list)
  }
  const tagList = [...tagToTemplates.keys()]
  for (let i = 0; i < tagList.length; i++) {
    for (let j = i + 1; j < tagList.length; j++) {
      const a = tagList[i], b = tagList[j]
      const sharedRoot = (() => {
        let n = 0
        while (n < a.length && n < b.length && a[n] === b[n]) n++
        return n >= 3 ? a.slice(0, n) : null
      })()
      if (!sharedRoot) continue
      const vocabA = computeMetricVocabulary(sources, mappings, rowsByName, tagToTemplates.get(a) ?? [])
      const vocabB = computeMetricVocabulary(sources, mappings, rowsByName, tagToTemplates.get(b) ?? [])
      if (vocabA.size === 0 || vocabB.size === 0) continue
      const sim = jaccard(vocabA, vocabB)
      if (sim >= JACCARD_CONFIRM) {
        const nameA = ministryByCode.get(a)?.name ?? a
        const nameB = ministryByCode.get(b)?.name ?? b
        violations.push({
          kind: 'child_tag_invention_suspected',
          severity: 'block',
          details: { tags: [a, b], shared_root: sharedRoot, vocab_jaccard: sim, vocabA: [...vocabA], vocabB: [...vocabB] },
          summary: `Ministry tags "${nameA}" and "${nameB}" share a name root and have ${Math.round(sim*100)}% identical metric vocabulary. They should likely share one ministry tag (time variants are not separate ministries).`,
        })
      }
    }
  }

  // ── 2h: shared-tag vocab consistency ──
  for (const [tag, codes] of tagToTemplates) {
    if (codes.length < 2) continue
    const vocabs = codes.map(c => computeMetricVocabulary(sources, mappings, rowsByName, [c]))
    for (let i = 0; i < vocabs.length; i++) {
      for (let j = i + 1; j < vocabs.length; j++) {
        const sim = jaccard(vocabs[i], vocabs[j])
        if (vocabs[i].size > 0 && vocabs[j].size > 0 && sim < JACCARD_CONTRADICT) {
          const name = ministryByCode.get(tag)?.name ?? tag
          violations.push({
            kind: 'shared_tag_vocabulary_mismatch',
            severity: 'warn',
            details: { tag, codes: [codes[i], codes[j]], vocab_jaccard: sim },
            summary: `Service templates "${codes[i]}" and "${codes[j]}" share ministry tag "${name}" but have only ${Math.round(sim*100)}% vocabulary overlap. They may be different ministries that need distinct tags.`,
          })
        }
      }
    }
  }

  // ── 2i: ministry never independent ──
  for (const tag of tagToTemplates.keys()) {
    const independenceRate = computeIndependenceRate(mappings, setup, rowsByName, tag)
    if (independenceRate != null && independenceRate < INDEPENDENT_FLOOR) {
      const name = ministryByCode.get(tag)?.name ?? tag
      violations.push({
        kind: 'ministry_never_independent',
        severity: 'warn',
        details: { tag, independence_rate: independenceRate },
        summary: `Ministry "${name}" never appears independently (always alongside other ministries). Consider nesting it under a parent ministry tag, or confirm it's standalone.`,
      })
    }
  }

  return violations
}

// ─────────────────────────── Helpers for Pass 2 ───────────────────────────

function computeMetricVocabulary(
  sources:    NormalizedSource[],
  mappings:   ConfirmedSourceMapping[],
  rowsByName: Record<string, Record<string, string>[]>,
  templateCodes: string[],
): Set<string> {
  const vocab = new Set<string>()
  for (const mapping of mappings) {
    if (!mapping.tall_format) continue
    const tf = mapping.tall_format
    const stCol = ((mapping.column_map ?? []) as ColumnMapEntry[]).find(c => c.dest_field === 'service_template_code')?.source_column
    if (!tf.metric_name_column) continue
    const rows = rowsByName[mapping.source_name] ?? []
    for (const row of rows) {
      const code = stCol ? row[stCol] : mapping.default_service_template_code
      if (!code || !templateCodes.includes(code)) continue
      const metric = row[tf.metric_name_column]
      const group  = tf.group_context_column ? row[tf.group_context_column] : ''
      const gtype  = tf.group_type_column    ? row[tf.group_type_column]    : ''
      if (metric) vocab.add(`${gtype}/${group}/${metric}`)
    }
  }
  return vocab
}

function computeIndependenceRate(
  mappings:   ConfirmedSourceMapping[],
  setup:      ProposedSetup,
  rowsByName: Record<string, Record<string, string>[]>,
  tag:        string,
): number | null {
  const templates = setup.service_templates ?? []
  const tagCodes = templates.filter(t => t.primary_tag === tag).map(t => t.service_code)
  if (tagCodes.length === 0) return null

  const datesByTag = new Map<string, Set<string>>()
  for (const t of templates) {
    if (!t.primary_tag) continue
    datesByTag.set(t.primary_tag, datesByTag.get(t.primary_tag) ?? new Set())
  }

  for (const mapping of mappings) {
    const dateCol = mapping.date_column
    const stCol = ((mapping.column_map ?? []) as ColumnMapEntry[]).find(c => c.dest_field === 'service_template_code')?.source_column
    if (!dateCol) continue
    const rows = rowsByName[mapping.source_name] ?? []
    for (const row of rows) {
      const d    = row[dateCol]
      const code = stCol ? row[stCol] : mapping.default_service_template_code
      if (!d || !code) continue
      const tpl = templates.find(t => t.service_code === code)
      if (!tpl?.primary_tag) continue
      datesByTag.get(tpl.primary_tag)?.add(d)
    }
  }

  const myDates = datesByTag.get(tag) ?? new Set()
  if (myDates.size === 0) return null
  let independent = 0
  for (const d of myDates) {
    let alone = true
    for (const [otherTag, otherDates] of datesByTag) {
      if (otherTag === tag) continue
      if (otherDates.has(d)) { alone = false; break }
    }
    if (alone) independent++
  }
  return independent / myDates.size
}

// ─────────────────────────── Public entry ───────────────────────────

export function validateMapping(args: {
  sources:  NormalizedSource[]
  /** Full row data keyed by source name. Validator uses these for sampling
   *  and distinct-value collection. */
  rowsByName: Record<string, Record<string, string>[]>
  mapping:  {
    sources:        ConfirmedSourceMapping[]
    proposed_setup?: ProposedSetup
  }
  iteration: number
}): ValidationResult {
  const violations: Violation[] = []

  // Pass 1 — per source
  for (const mapping of args.mapping.sources ?? []) {
    const src = args.sources.find(s => s.name === mapping.source_name)
    if (!src) {
      violations.push({
        kind: 'unknown_column',
        severity: 'block',
        details: { source_name: mapping.source_name },
        summary: `Mapping references source "${mapping.source_name}" which was not uploaded.`,
      })
      continue
    }
    const rows = args.rowsByName[mapping.source_name] ?? []
    violations.push(...pass1Source(src, mapping, rows))
  }

  // Pass 2 — setup-level structural
  if (args.mapping.proposed_setup) {
    violations.push(...pass2Setup(args.mapping.proposed_setup, args.sources, args.mapping.sources ?? [], args.rowsByName))
  }

  const blocking = violations.filter(v => v.severity === 'block')
  return {
    passed:     blocking.length === 0,
    violations,
    iteration:  args.iteration,
  }
}

// ─────────────────────────── Pass 3: Haiku interpreter ───────────────────────────

export interface ColumnMapPatch {
  source_name:  string
  /** dest_field for a column. Use 'ignore' to mark a hallucinated entry as drop. */
  source_column: string
  dest_field:    string
  notes?:        string
}

/**
 * Discriminated union describing what mutation an answer applies to the mapping.
 * The frontend (and Chunk 4 — reconcile_answers + chat route) uses this to update
 * the mapping locally — no AI roundtrip per answer. If patch_op is undefined for a
 * question, the answer is recorded but not applied (handled at the halfway AI
 * checkpoint or at final confirm).
 *
 * IR v2 (metric-centric): the audience/category/giving-routing ops are retired.
 * Their intent folds into the metric-centric ops (set_metric_*).
 */
export type PatchOp =
  // ── metric-centric ops (IR v2) ──
  /** option value = the chosen tag_role (ADULT_SERVICE | KIDS_MINISTRY | YOUTH_MINISTRY | OTHER). */
  | { kind: 'set_ministry_tag_role'; ministry_code: string }
  /** Mark this metric canonical for its (ministry, reporting) pair; clears the sibling. */
  | { kind: 'set_metric_canonical'; metric_code: string }
  /** Toggle this metric's scope (instance ↔ period). */
  | { kind: 'set_metric_scope'; metric_code: string }
  /** option value = the chosen reporting tag code (system or declared custom). */
  | { kind: 'set_metric_reporting_tag'; metric_code: string }
  // ── generic ops still meaningful in IR v2 ──
  | { kind: 'set_template_display_name'; service_code: string }
  | { kind: 'set_template_start_time';   service_code: string }
  | { kind: 'record_answer_only' }       // structured note, no mapping mutation

export interface ClarificationProposal {
  id:        string
  /** The narrative question text — short, no embedded tree. The UI renders this as a sentence. */
  question:  string
  /**
   * Optional ASCII / box-drawing hierarchy that visualises the relationship the
   * question is about (e.g. a ministry → tag_role tree). UI renders this in a
   * monospace block adjacent to the question text. Use ─├└ box-drawing characters.
   * Leave undefined for scalar questions (names, times) where no hierarchy is involved.
   */
  visual_tree?: string
  blocking:  boolean
  options?:  Array<{ label: string; value: string }>
  /**
   * What this answer should mutate in the mapping. Used by the frontend to apply
   * patches locally without an AI roundtrip. Omit when the answer is informational
   * and applied later at confirm.
   */
  patch_op?: PatchOp
}

export interface HaikuInterpretation {
  /** Mechanical patches the validator should apply automatically. */
  auto_patches:    ColumnMapPatch[]
  /** Columns the patches add or replace entirely (orphans → new column_map entries). */
  added_entries:   ColumnMapPatch[]
  /** Entries to remove from column_map entirely (hallucinations). */
  removed_columns: { source_name: string; source_column: string }[]
  /** User-facing questions Haiku could not safely auto-resolve. */
  clarifications:  ClarificationProposal[]
  /** Notes about any violations Haiku judged to be false positives. */
  ignored:         Array<{ kind: string; reason: string }>
}

const HAIKU_SYSTEM = `You are a narrow-lane validator interpreter for SundayTally's import pipeline (IR v2 — metric-centric model).

The Sonnet Decision Maker has already produced a propose_mapping. A deterministic
validator has found specific violations by applying the mapping to actual data and
checking metric/ministry claims against the proposed_setup.

THE MODEL: one concept — a METRIC = (ministry_tag × reporting_tag × scope).
  - ministry_tag = WHO the number is about (tag_role: ADULT_SERVICE | KIDS_MINISTRY | YOUTH_MINISTRY | OTHER).
  - reporting_tag = WHAT dimension it is (ATTENDANCE / VOLUNTEERS / GIVING / RESPONSE_STAT — the 4 system tags — or a custom one).
  - scope = "instance" (per service occurrence) | "period" (per church-week).
The dest_field grammar is ONLY: service_date | service_template_code | location_code | ignore | metric.<METRIC_CODE>.
There are NO attendance./giving./volunteer./response. forms, no .AUDIENCE suffix, no period_ prefix.

Your ONLY job is to interpret these specific violations and decide for each one:

  1. AUTO_PATCH — only when the fix is mechanical and obvious:
       · unknown_column (column doesn't exist) → if it's clearly a hallucination from the
         description text and has no clear real-column counterpart, REMOVE the entry.
       · unknown_metric_reference (a metric.<CODE> dest_field whose CODE is a near-typo of a
         declared metric_code) → AUTO_PATCH the dest_field to the correct metric.<CODE>.
       · orphan_column / column_no_metric (real data column, no valid metric) → only if the
         column name + sample values map UNAMBIGUOUSLY to exactly one declared metric, ADD
         a column_map entry with dest_field "metric.<THAT_CODE>". If ambiguous, CLARIFY.

  2. CLARIFICATION — for SEMANTIC decisions you cannot safely auto-decide:
       · tag_role_unset_or_suspect — confirm the ministry's tag_role. patch_op = set_ministry_tag_role
         (ministry_code), options = the 4 roles (value = the role string). Include a visual_tree.
       · multiple_canonical — ask which metric is canonical. patch_op = set_metric_canonical
         (metric_code), options = the competing metric_codes.
       · metric_no_feeding_column — confirm whether the metric should be kept or dropped, OR
         which column feeds it. Usually record_answer_only or set_metric_reporting_tag.
       · child_tag_invention_suspected / shared_tag_vocabulary_mismatch / ministry_never_independent
         — ALWAYS clarification (user must confirm the ministry structure).
       · unknown_reporting_tag — ask which dimension this metric measures. patch_op =
         set_metric_reporting_tag (metric_code), options = the 4 system codes (+ any declared custom).
       · ambiguous orphan/column → clarification.
     Clarifications MUST set two fields separately:
       · "question" = a short narrative sentence (1-2 lines, no tree, no code blocks)
       · "visual_tree" = a separate field with the ASCII hierarchy using box-drawing characters ─├└.
         Do NOT embed the tree inside the question string.
     Always include 2-3 concrete "options" so the user can click an answer rather than typing.

     ALSO include "patch_op" — the structured patch the frontend applies locally when answered.
     Available patch_op kinds (IR v2):
       · set_ministry_tag_role (with ministry_code) — option value = chosen tag_role
       · set_metric_canonical (with metric_code) — mark this metric canonical, clear the sibling
       · set_metric_scope (with metric_code) — flip instance ↔ period
       · set_metric_reporting_tag (with metric_code) — option value = chosen reporting tag code
       · set_template_display_name (with service_code) — naming a [BLOCKING] template
       · set_template_start_time (with service_code) — setting a service start_time
       · record_answer_only — informational; no immediate mutation
     If unsure which patch_op fits, choose record_answer_only. A single AI checkpoint at the
     walkthrough's halfway mark resolves anything that needs an AI decision.

  3. IGNORE — only for rare validator false positives. Justify in 1 sentence.

HARD RULES:
  · Metric/ministry-structure violations (child_tag_invention_suspected, shared_tag_vocabulary_mismatch,
    ministry_never_independent, multiple_canonical) CANNOT be AUTO_PATCH.
  · If you're uncertain whether to AUTO_PATCH or CLARIFICATION, choose CLARIFICATION.
  · NEVER generate AUTO_PATCH entries that reference columns absent from the source, or
    metric.<CODE> dest_fields whose CODE is not a declared metric_code.
  · The user's description is HINTS only. Real column names + declared metric_codes are authoritative.

Call propose_resolution exactly once.`

const PROPOSE_RESOLUTION_TOOL: Anthropic.Messages.Tool = {
  name: 'propose_resolution',
  description: 'Propose resolution for each violation. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      auto_patches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source_name:   { type: 'string' },
            source_column: { type: 'string' },
            dest_field:    { type: 'string' },
            notes:         { type: 'string' },
          },
          required: ['source_name', 'source_column', 'dest_field'],
        },
      },
      added_entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source_name:   { type: 'string' },
            source_column: { type: 'string' },
            dest_field:    { type: 'string' },
            notes:         { type: 'string' },
          },
          required: ['source_name', 'source_column', 'dest_field'],
        },
      },
      removed_columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source_name:   { type: 'string' },
            source_column: { type: 'string' },
          },
          required: ['source_name', 'source_column'],
        },
      },
      clarifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:          { type: 'string' },
            question:    { type: 'string', description: 'Short narrative sentence. Do NOT include ASCII trees here.' },
            visual_tree: { type: 'string', description: 'Optional ASCII tree using ─├└ characters, separate from question.' },
            blocking:    { type: 'boolean' },
            options:     {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: { type: 'string' },
                },
                required: ['label', 'value'],
              },
            },
            patch_op: {
              type: 'object',
              description: 'Structured patch the frontend applies locally when answered. See PatchOp kinds in the system prompt (IR v2 metric-centric).',
              properties: {
                kind:          { type: 'string', description: 'One of: set_ministry_tag_role | set_metric_canonical | set_metric_scope | set_metric_reporting_tag | set_template_display_name | set_template_start_time | record_answer_only' },
                ministry_code: { type: 'string' },
                metric_code:   { type: 'string' },
                service_code:  { type: 'string' },
              },
              required: ['kind'],
            },
          },
          required: ['id', 'question', 'blocking'],
        },
      },
      ignored: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind:   { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['kind', 'reason'],
        },
      },
    },
    required: ['auto_patches', 'added_entries', 'removed_columns', 'clarifications', 'ignored'],
  },
}

export async function interpretViolations(args: {
  supabase:    SupabaseClient
  churchId:    string
  violations:  Violation[]
  description: string
  /**
   * A compact snapshot of the proposed mapping for Haiku's reference. Shape is
   * loose/optional on purpose — interpretViolations does not depend on any
   * particular key, it just forwards the digest verbatim to the model. See the
   * cross-seam note in the chunk report for the preferred IR-v2 digest shape.
   */
  mappingDigest?: Record<string, unknown>
  /** Questions Sonnet already asked. Haiku must NOT duplicate any of these —
   *  even if a violation seems to call for the same kind of clarification. */
  existingQuestions?: Array<{ id: string; question: string }>
}): Promise<{ interpretation: HaikuInterpretation | null; totalCents: number }> {
  if (args.violations.length === 0) {
    return {
      interpretation: { auto_patches: [], added_entries: [], removed_columns: [], clarifications: [], ignored: [] },
      totalCents: 0,
    }
  }

  const existing = args.existingQuestions ?? []
  const existingBlock = existing.length === 0
    ? ''
    : `\n\nQUESTIONS ALREADY BEING ASKED BY THE DECISION MAKER (do NOT propose anything that overlaps with these — the user will already see them in the walkthrough):\n${existing.map(q => `  - [${q.id}] ${q.question}`).join('\n')}\n\n` +
      `Before emitting a clarification, ask yourself: is this asking the user about something already covered above? If yes — drop it. If a violation overlaps semantically with an existing question, emit IGNORE with a brief reason instead.`

  const userPrompt =
    `User description: ${args.description || '(none provided)'}\n\n` +
    `Proposed mapping digest:\n${JSON.stringify(args.mappingDigest ?? {}, null, 2)}\n\n` +
    `Violations from deterministic validator:\n${JSON.stringify(args.violations, null, 2)}\n` +
    existingBlock + '\n' +
    `Call propose_resolution exactly once.`

  const result = await runToolLoop({
    supabase:    args.supabase,
    churchId:    args.churchId,
    kind:        'import_stage_a',
    model:       'claude-haiku-4-5-20251001',
    system:      HAIKU_SYSTEM,
    tools:       [PROPOSE_RESOLUTION_TOOL],
    handlers:    { propose_resolution: async (input) => input },
    terminateOn: ['propose_resolution'],
    maxTurns:    2,
    initialUser: userPrompt,
  })

  return {
    interpretation: (result.finalToolCall?.input ?? null) as HaikuInterpretation | null,
    totalCents:     result.totalCents,
  }
}

// ─────────────────────────── Clarification dedup ───────────────────────────

/**
 * Deduplicates clarification questions that ask the user the same thing twice.
 * Two questions duplicate each other if either:
 *   - their normalized text overlaps heavily (Jaccard ≥ 0.5 on word sets), OR
 *   - they target the same well-known concept (service template naming, tag_role
 *     decision, metric canonical/scope) detected from intent keywords.
 *
 * When duplicates are found, the FIRST occurrence wins (Sonnet's clarifications
 * come before Haiku's, so the Decision Maker's framing is preferred).
 */
export function dedupeClarifications<T extends { id?: string; question?: string }>(qs: T[]): T[] {
  if (qs.length < 2) return qs.slice()

  const normalize = (s: string): string =>
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\b(the|a|an|of|for|in|on|to|and|or|is|are|do|does|what|which|how|that|this|these|those|with)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const wordSets = qs.map(q => new Set(normalize(q.question ?? '').split(' ').filter(w => w.length > 2)))

  const intentBuckets = (text: string): string[] => {
    const t = text.toLowerCase()
    const buckets: string[] = []
    // Service template naming — multiple distinct phrasings can target the same need
    if (/(display\s*name|service\s*type|service\s*code|name\s+for|call\s+them|what\s+do\s+you\s+call)/i.test(t)) {
      buckets.push('name_service_templates')
    }
    // Ministry tag_role classification (kids/youth/adult/misc)
    if (/(tag\s*role|kids?\s*ministry|youth\s*ministry|classif|what\s+kind\s+of\s+ministry|is\s+this\s+(a\s+)?(kids?|youth|adult))/i.test(t)) {
      buckets.push('ministry_tag_role')
    }
    // Canonical / scope of a metric
    if (/(canonical|primary\s+metric|main\s+metric|instance\s+or\s+period|per\s+service\s+or\s+per\s+week|metric\s+scope)/i.test(t)) {
      buckets.push('metric_canonical_scope')
    }
    return buckets
  }

  const keep: T[] = []
  const seenIntents = new Set<string>()
  const keptWordSets: Set<string>[] = []

  for (let i = 0; i < qs.length; i++) {
    const q = qs[i]
    const text = q.question ?? ''
    const buckets = intentBuckets(text)
    const intentDup = buckets.some(b => seenIntents.has(b))
    let textDup = false
    for (const seen of keptWordSets) {
      const inter = [...wordSets[i]].filter(w => seen.has(w)).length
      const uni = new Set([...wordSets[i], ...seen]).size
      const jc = uni === 0 ? 0 : inter / uni
      if (jc >= 0.5 && wordSets[i].size >= 3) { textDup = true; break }
    }
    if (intentDup || textDup) continue
    keep.push(q)
    keptWordSets.push(wordSets[i])
    for (const b of buckets) seenIntents.add(b)
  }
  return keep
}

// ─────────────────────────── Patch application ───────────────────────────

export function applyPatches(
  mapping: { sources: ConfirmedSourceMapping[]; proposed_setup?: ProposedSetup; clarification_questions?: ClarificationProposal[] },
  interp:  HaikuInterpretation,
): { sources: ConfirmedSourceMapping[]; proposed_setup?: ProposedSetup; clarification_questions: ClarificationProposal[] } {
  const sources = mapping.sources.map(src => ({ ...src, column_map: [...(src.column_map ?? [])] }))

  // Defensive: Haiku may omit optional array fields entirely on some responses
  const removed_columns = interp.removed_columns ?? []
  const added_entries   = interp.added_entries   ?? []
  const auto_patches    = interp.auto_patches    ?? []
  const clarifications  = interp.clarifications  ?? []

  // Remove hallucinated entries
  for (const rem of removed_columns) {
    const src = sources.find(s => s.source_name === rem.source_name)
    if (!src) continue
    src.column_map = (src.column_map ?? []).filter(c => c.source_column !== rem.source_column)
  }

  // Add orphan entries
  for (const add of added_entries) {
    const src = sources.find(s => s.source_name === add.source_name)
    if (!src) continue
    const existing = (src.column_map ?? []).find(c => c.source_column === add.source_column)
    if (existing) {
      existing.dest_field = add.dest_field
    } else {
      ;(src.column_map as ColumnMapEntry[]).push({
        source_column: add.source_column,
        dest_field:    add.dest_field,
      })
    }
  }

  // Apply explicit auto patches (overwrite dest_field where matched)
  for (const patch of auto_patches) {
    const src = sources.find(s => s.source_name === patch.source_name)
    if (!src) continue
    const existing = (src.column_map ?? []).find(c => c.source_column === patch.source_column)
    if (existing) existing.dest_field = patch.dest_field
    else (src.column_map as ColumnMapEntry[]).push({
      source_column: patch.source_column,
      dest_field:    patch.dest_field,
    })
  }

  return {
    sources,
    proposed_setup: mapping.proposed_setup,
    clarification_questions: [
      ...(mapping.clarification_questions ?? []),
      ...clarifications,
    ],
  }
}
