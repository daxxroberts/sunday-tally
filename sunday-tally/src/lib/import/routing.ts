/**
 * Single source of truth for "given a row + a tall_format/column_map config, which
 * METRIC does each data cell land on?" (IR v2 — metric-centric, see IMPORT_IR_V2.md).
 *
 * The dest_field grammar collapsed to four control fields + ONE data field:
 *   service_date | service_template_code | location_code | ignore | metric.<METRIC_CODE>
 *
 * This logic mirrors the predicate stageB uses to write rows. The validator
 * (stageA_validate.ts) calls the same functions so that "predicted destination"
 * exactly matches "actual destination at write time." Drift between them = silent
 * data corruption, so any future change to stageB's routing must mirror here.
 *
 * stageB itself does not yet import from here (would require a larger refactor of
 * its row-aggregation loop). When stageB's routing changes, update both.
 */

import type { TallFormatConfig, ColumnMapEntry } from './stageB'

const METRIC_PREFIX = 'metric.'

/**
 * Normalize one segment of a compound area_field_map key for tolerant matching.
 * trim + lowercase + collapse internal whitespace + strip a single trailing "s".
 * This makes "Attender"↔"Attenders", case differences, and stray whitespace match
 * symmetrically — applied to BOTH the stored map keys and the row-derived candidates.
 *
 * MUST stay byte-identical to the copy in stageB.ts (the mirror contract).
 */
export function normalizeKeySegment(seg: string): string {
  const s = seg.trim().toLowerCase().replace(/\s+/g, ' ')
  return s.endsWith('s') ? s.slice(0, -1) : s
}

/** Normalize a full " / "-joined compound key by normalizing each segment. */
export function normalizeCompoundKey(key: string): string {
  return key.split(' / ').map(normalizeKeySegment).join(' / ')
}

/**
 * Build a normalized lookup index from an area_field_map: normalizedKey → destField.
 * On normalized-key collision, the first-seen mapping wins (collisions ignored, no log).
 */
export function buildNormalizedAreaIndex(
  areaFieldMap: Record<string, string> | undefined,
): Map<string, string> {
  const idx = new Map<string, string>()
  if (!areaFieldMap) return idx
  for (const [k, dest] of Object.entries(areaFieldMap)) {
    const nk = normalizeCompoundKey(k)
    if (!idx.has(nk)) idx.set(nk, dest)
  }
  return idx
}

/** Control dest_fields that are NOT metric data cells. */
export const CONTROL_DEST_FIELDS = new Set([
  'service_date',
  'service_template_code',
  'service_code', // back-compat alias seen in stageB
  'location_code',
  'ignore',
])

/** Extract the bare METRIC_CODE from a `metric.<CODE>` dest_field, or null. */
export function metricCodeFromDest(destField: string | undefined | null): string | null {
  if (!destField) return null
  if (!destField.startsWith(METRIC_PREFIX)) return null
  const code = destField.slice(METRIC_PREFIX.length).trim()
  return code === '' ? null : code
}

export interface TallRoutingResult {
  /** The full `metric.<CODE>` dest_field this row routed to, or null. */
  destField: string | null
  /** The bare METRIC_CODE (destField minus the `metric.` prefix), or null. */
  metricCode: string | null
  /** The raw cell value that would be written for this metric, or null. */
  value: string | null
  /**
   * Why the row didn't route (only set when metricCode is null).
   * Used by the validator to surface "drop reason" categories to the user.
   */
  dropReason?:
    | 'no_metric_name'
    | 'no_value'
    | 'empty_value'
    | 'compound_key_not_in_map'
    | 'explicit_ignore'
    | 'not_a_metric'
  /** The actual compound key that was looked up (longest variant) — for debugging. */
  attemptedKey?: string
}

/**
 * Resolve a single row in a tall-format source to the metric it feeds.
 * Longest-key-first resolution (3-segment → 2-segment → bare) is unchanged from v1;
 * only the dest_field shape changed (now always `metric.<CODE>` or `ignore`).
 */
export function routeTallRow(
  row: Record<string, string>,
  tf: TallFormatConfig,
): TallRoutingResult {
  const metricName = tf.metric_name_column ? row[tf.metric_name_column] : null
  const rawValue   = tf.value_column       ? row[tf.value_column]       : null

  if (!metricName) return { destField: null, metricCode: null, value: null, dropReason: 'no_metric_name' }
  if (rawValue == null) return { destField: null, metricCode: null, value: null, dropReason: 'no_value' }
  if (rawValue === '')  return { destField: null, metricCode: null, value: null, dropReason: 'empty_value' }

  const groupTypeVal    = tf.group_type_column    ? row[tf.group_type_column]    : undefined
  const groupContextVal = tf.group_context_column ? row[tf.group_context_column] : undefined

  // For audience-discriminated rows (e.g. attendance), the segment that selects the
  // metric is NOT in the metric_name column — it lives in the audience column
  // ("Adult"/"Student"/"Kid"). area_field_map is keyed by that audience word, exactly
  // as it is keyed by the Area value for Volunteers/Stats (whose discriminator IS in
  // the metric_name column). So we also try key variants whose final segment is the
  // audience value (raw and, if mapped, the audience_map code). Literal-Area keys are
  // still tried FIRST, so Volunteers/Stats — which already resolve via Area — are
  // unaffected; the audience variants only ever fire when Area alone didn't match.
  const audienceRaw = tf.audience_column ? row[tf.audience_column] : undefined
  const segments: string[] = [metricName]
  if (audienceRaw) {
    segments.push(audienceRaw)
    const mapped = tf.audience_map?.[audienceRaw]
    if (mapped) segments.push(mapped)
  }

  const candidateKeys: string[] = []
  for (const seg of segments) {
    if (groupTypeVal && groupContextVal) candidateKeys.push(`${groupTypeVal} / ${groupContextVal} / ${seg}`)
    if (groupTypeVal)                    candidateKeys.push(`${groupTypeVal} / ${seg}`)
    candidateKeys.push(seg)
  }

  let destField: string | undefined
  let attemptedKey = candidateKeys[0] ?? metricName
  // Fast path: literal exact match (longest-first). Volunteers/Stats resolve here and
  // are byte-identical to before — the normalized fallback below never runs for them.
  for (const k of candidateKeys) {
    const hit = tf.area_field_map?.[k]
    if (hit) { destField = hit; attemptedKey = k; break }
  }

  // Fallback: symmetric normalized match (handles "Attender"↔"Attenders", case, whitespace).
  if (!destField) {
    const normIndex = buildNormalizedAreaIndex(tf.area_field_map)
    for (const k of candidateKeys) {
      const hit = normIndex.get(normalizeCompoundKey(k))
      if (hit) { destField = hit; attemptedKey = k; break }
    }
  }

  if (!destField) {
    return { destField: null, metricCode: null, value: null, dropReason: 'compound_key_not_in_map', attemptedKey }
  }
  if (destField === 'ignore') {
    return { destField: null, metricCode: null, value: null, dropReason: 'explicit_ignore', attemptedKey }
  }

  const metricCode = metricCodeFromDest(destField)
  if (!metricCode) {
    // area_field_map value is neither `ignore` nor a `metric.<CODE>` — not routable in v2.
    return { destField, metricCode: null, value: rawValue, dropReason: 'not_a_metric', attemptedKey }
  }

  return { destField, metricCode, value: rawValue, attemptedKey }
}

/**
 * For wide format: given a row and a column_map, return the metrics each non-empty
 * mapped `metric.<CODE>` column contributes to (one routed entry per such column).
 */
export function routeWideRow(
  row: Record<string, string>,
  columnMap: ColumnMapEntry[],
): {
  routed:   { source_column: string; dest_field: string; metric_code: string; value: string }[]
  ignored:  string[]
  /** Mapped columns whose dest_field is neither a control field nor a metric.<CODE>. */
  nonMetric: { source_column: string; dest_field: string }[]
  unknownColumns: string[]
} {
  const routed:    { source_column: string; dest_field: string; metric_code: string; value: string }[] = []
  const ignored:   string[] = []
  const nonMetric: { source_column: string; dest_field: string }[] = []
  const unknownColumns: string[] = []

  for (const cm of columnMap) {
    // Column referenced by mapping but absent on the row entirely
    if (!(cm.source_column in row)) {
      unknownColumns.push(cm.source_column)
      continue
    }
    if (cm.dest_field === 'ignore') {
      ignored.push(cm.source_column)
      continue
    }
    // Control fields are not data cells — they steer date/template/location resolution.
    if (CONTROL_DEST_FIELDS.has(cm.dest_field)) continue

    const metricCode = metricCodeFromDest(cm.dest_field)
    if (!metricCode) {
      nonMetric.push({ source_column: cm.source_column, dest_field: cm.dest_field })
      continue
    }

    const v = row[cm.source_column]
    if (v == null || v === '') continue
    routed.push({ source_column: cm.source_column, dest_field: cm.dest_field, metric_code: metricCode, value: v })
  }

  return { routed, ignored, nonMetric, unknownColumns }
}
