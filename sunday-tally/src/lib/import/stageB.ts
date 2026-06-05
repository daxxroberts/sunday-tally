import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WRITER_HANDLERS } from './writers'
import { getAllRows, type SourceInput } from './sources'
import { deriveGridConfigFromSchema } from '@/lib/history/derive_grid_config'

/**
 * Normalize one segment of a compound area_field_map key for tolerant matching.
 * trim + lowercase + collapse internal whitespace + strip a single trailing "s".
 * Makes "Attender"↔"Attenders", case, and stray whitespace match symmetrically.
 * MUST stay byte-identical to the copy in routing.ts (the mirror contract).
 */
function normalizeKeySegment(seg: string): string {
  const s = seg.trim().toLowerCase().replace(/\s+/g, ' ')
  return s.endsWith('s') ? s.slice(0, -1) : s
}
function normalizeCompoundKey(key: string): string {
  return key.split(' / ').map(normalizeKeySegment).join(' / ')
}
/** normalizedKey → destField; first-seen wins on collision (collisions ignored). */
function buildNormalizedAreaIndex(
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

export interface ColumnMapEntry {
  source_column: string
  /**
   * dest_field grammar (IR v2 — IMPORT_IR_V2.md). Four control fields + ONE data field:
   *   "service_date"           — the column holding the row's date
   *   "service_template_code"  — the column naming which service (optional; else default_service_template_code)
   *   "location_code"          — optional
   *   "ignore"                 — skip this column
   *   "metric.<METRIC_CODE>"   — a data value for that metric (declared in proposed_setup.metrics)
   *
   * There are NO attendance./giving./volunteer./response. forms, no .AUDIENCE
   * suffix, and no period_ prefix. Instance-vs-period is read from the metric's
   * `scope`, NOT the column: the writer looks up the metric and, if scope='period',
   * snaps the row date to its Sunday (service_date − DOW, Sunday=0) and writes
   * period_anchor with service_instance_id=NULL; if scope='instance', it
   * resolves/creates the service_instance and writes service_instance_id with
   * period_anchor=NULL (XOR enforced by CHECK).
   */
  dest_field: string
}

export interface TallFormatConfig {
  /** Column whose distinct values identify the metric category (e.g. "Area") */
  metric_name_column: string
  /** Column with the numeric count (e.g. "Count") */
  value_column: string
  /** Optional column that discriminates audience (e.g. "Adult Student Kid") */
  audience_column?: string
  /** Maps raw audience column values to MAIN/KIDS/YOUTH */
  audience_map?: Record<string, 'MAIN' | 'KIDS' | 'YOUTH'>
  /**
   * Optional column used to build the first segment of compound lookup keys.
   * When set, adds a leading "${groupType} / " prefix to the key.
   * e.g. "Group Type" with value "Stats" → "Stats / MetricName"
   */
  group_type_column?: string
  /**
   * Optional column that provides ministry/audience context for metric routing.
   * When set together with group_type_column, builds 3-segment compound keys:
   *   "${groupType} / ${groupContext} / ${metricName}"
   * e.g. "Group" with value "LifeKids" → "Stats / LifeKids / Baptism"
   * Falls back through shorter key variants if the full key is not in area_field_map.
   */
  group_context_column?: string
  /** Maps each distinct metric name (or compound key) to a dest_field.
   *  In IR v2 the value is always "metric.<METRIC_CODE>" (or "ignore") — the old
   *  kind-prefixed dest_fields are gone. The compound key resolves a tall row to a
   *  metric (ministry from group_context/audience, reporting from group_type/metric_name).
   *  Key resolution order (longest match wins):
   *    1. "${groupType} / ${groupContext} / ${metricName}"  (3-segment)
   *    2. "${groupType} / ${metricName}"                    (2-segment)
   *    3. "${metricName}"                                   (bare)
   */
  area_field_map?: Record<string, string>
}

export interface ConfirmedSourceMapping {
  source_name:              string
  /** IR v2: routing is metric-driven; this field is decorative/back-compat only. */
  dest_table?:              string
  date_column?:             string
  /** Fallbacks if the source does not carry per-row values. */
  default_service_template_code?: string
  default_location_code?:         string
  column_map:               ColumnMapEntry[]
  /** Present for tall/unpivoted sheets — drives pivot extraction */
  tall_format?:             TallFormatConfig
}

export interface QaAnswer {
  /** Question id from clarification_questions (e.g. 'q_pattern_audience_structure', 'q_service_names'). */
  id?:                    string
  /** Human-readable question text — kept for Stage B's setup-writer prompt context. */
  question:               string
  /** User's free-text answer. For choice questions this is the option label. */
  answer:                 string
  accepted:               boolean
  /** For choice questions: which option index the user picked (0-based). */
  selected_option_index?: number
  /** For choice questions with machine-routing semantics (e.g. M1/M2/M3 from Q-PAT-1,
   *  YOUTH/MAIN from q_volunteer_audience_*). The deterministic reconciler reads this
   *  to mutate the mapping before Stage B's deterministic extraction. */
  meaning_code?:          string
}

export interface AnomalyDecision {
  kind:        string
  description: string
  decision:    'keep' | 'exclude' | 'flag'
}

export interface ConfirmedMapping {
  sources:           ConfirmedSourceMapping[]
  proposed_setup?:   Record<string, unknown>
  qa_answers?:       QaAnswer[]
  anomaly_decisions?: AnomalyDecision[]
}

export interface StageBResult {
  totalCents:    number
  setupSummary:  string
  /**
   * IR v2: all data lands in `metric_entries`. `occurrences` counts upserted
   * service_instances; `metric_entries` counts written metric values. The legacy
   * per-kind fields (attendance/volunteer/response/giving/period_*) are retained
   * for backward-compat with the confirm page's optional-chained reader/summer;
   * `attendance` mirrors `metric_entries` so the page's dataTotal stays non-zero,
   * the rest are 0.
   */
  rowsInserted:  {
    occurrences:    number
    metric_entries: number
    attendance:     number
    volunteer:      number
    response:       number
    giving:         number
    period_giving:  number
    period_response: number
  }
  errors:        string[]
}

export async function runStageB(args: {
  supabase:           SupabaseClient
  churchId:           string
  sources:            SourceInput[]
  confirmedMapping:   ConfirmedMapping
}): Promise<StageBResult> {
  // ---------- 1. Setup — DETERMINISTIC executor (no AI) ----------
  // Stage A (AI) already decided the full structure in `proposed_setup`. There is
  // nothing left to "decide" here, so we no longer hand it to a Haiku tool-loop that
  // just transcribed it into inserts. Instead we read `proposed_setup` and call the
  // existing WRITER_HANDLERS directly, in dependency order. AI stays ONLY in Stage A.
  const setupResult = await runSetupDeterministic(
    { churchId: args.churchId, supabase: args.supabase },
    args.confirmedMapping.proposed_setup,
  )
  const setupSummary = setupResult.setupSummary

  // ---------- 2. Resolve lookup maps (code → id) ----------
  const [
    locationsRes,
    templatesRes,
    reportingRes,
    metricsRes,
  ] = await Promise.all([
    args.supabase.from('church_locations')
      .select('id, code').eq('church_id', args.churchId),
    args.supabase.from('service_templates')
      .select('id, service_code, location_id').eq('church_id', args.churchId),
    args.supabase.from('reporting_tags')
      .select('id, unit_kind').eq('church_id', args.churchId),
    args.supabase.from('metrics')
      .select('id, code, scope, reporting_tag_id').eq('church_id', args.churchId),
  ])

  const locationByCode = new Map<string, string>()
  for (const r of locationsRes.data ?? []) locationByCode.set(r.code, r.id)

  const templateByCode = new Map<string, { id: string; locationId: string }>()
  for (const r of templatesRes.data ?? []) {
    templateByCode.set(r.service_code, { id: r.id, locationId: r.location_id })
  }

  // reporting_tag_id → unit_kind, used to pick the value parser per metric.
  const reportingUnitById = new Map<string, 'count' | 'currency'>()
  for (const r of reportingRes.data ?? []) {
    reportingUnitById.set(r.id, (r.unit_kind === 'currency' ? 'currency' : 'count'))
  }

  // metric_code → metric. `metrics` now carries a `code` column (UNIQUE per church),
  // so resolve metric_code DIRECTLY off the freshly-written rows — no natural-key
  // re-derivation from proposed_setup. unitKind (from the reporting tag) selects the
  // value parser: currency → money (decimals), count → integer.
  type MetricInfo = { id: string; scope: 'instance' | 'period'; unitKind: 'count' | 'currency' }
  const metricByCode = new Map<string, MetricInfo>()
  for (const r of metricsRes.data ?? []) {
    if (!r.code) continue
    metricByCode.set(r.code, {
      id: r.id,
      scope: r.scope,
      unitKind: reportingUnitById.get(r.reporting_tag_id) ?? 'count',
    })
  }

  // ---------- 3. Deterministic row extraction ----------
  // Seed with any setup-phase handler errors so they surface in the final result
  // (both the early-return path below and the normal return at the end read this array).
  const errors: string[] = [...setupResult.errors]
  const counts = { occurrences: 0, metric_entries: 0, attendance: 0, volunteer: 0, response: 0, giving: 0, period_giving: 0, period_response: 0 }

  // Unified metric_entries accumulator (IR v2). One row per
  // (metric, service_instance) for instance scope, or (metric, period_anchor) for
  // period scope. Shared across all sources so duplicates from different sheets sum
  // correctly. Exactly one of service_instance_id / period_anchor is set (XOR CHECK).
  // reporting_tag_code is DENORMALIZED BY TRIGGER — never set here.
  type MetricEntryRow = {
    church_id:           string
    metric_id:           string
    service_instance_id: string | null
    period_anchor:       string | null
    value:               number
    is_not_applicable:   boolean
  }
  // Instance-scope entries keyed by `${metric_id}:${service_instance_id}`.
  const instanceEntryMap = new Map<string, MetricEntryRow>()
  // Period-scope entries keyed by `${metric_id}:${period_anchor}`.
  const periodEntryMap = new Map<string, MetricEntryRow>()
  // Track per-(metric) warnings so the same note isn't repeated per row.
  const warnedTagFallbacks = new Set<string>()

  const addInstanceEntry = (metricId: string, instanceId: string, value: number) => {
    const key = `${metricId}:${instanceId}`
    const existing = instanceEntryMap.get(key)
    if (existing) {
      existing.value += value
    } else {
      instanceEntryMap.set(key, {
        church_id:           args.churchId,
        metric_id:           metricId,
        service_instance_id: instanceId,
        period_anchor:       null,
        value,
        is_not_applicable:   false,
      })
    }
  }

  const addPeriodEntry = (metricId: string, isoDate: string, value: number) => {
    const anchor = sundayOfWeek(isoDate) // Sunday-on-or-before the row date (Sunday=0)
    const key = `${metricId}:${anchor}`
    const existing = periodEntryMap.get(key)
    if (existing) {
      existing.value += value
    } else {
      periodEntryMap.set(key, {
        church_id:           args.churchId,
        metric_id:           metricId,
        service_instance_id: null,
        period_anchor:       anchor,
        value,
        is_not_applicable:   false,
      })
    }
  }

  // Hard guard: if no service templates exist, instance-scope metrics can't be
  // written. Stage B's AI is supposed to create at least one template — if it
  // didn't, surface a clear error. (Period-only imports still need this guard off,
  // but the AI always creates a template per the prompt.)
  if (templateByCode.size === 0) {
    errors.push(
      'Setup error: no service templates were created. Instance-scope metrics need a ' +
      'service instance, which requires a service template. Re-run the import and ensure ' +
      'the mapping includes at least one service type.',
    )
    return { totalCents: setupResult.totalCents, setupSummary, rowsInserted: counts, errors }
  }

  // Pre-load all existing occurrences for this church to avoid per-row SELECT round-trips
  const { data: existingOccs } = await args.supabase
    .from('service_instances')
    .select('id, service_template_id, location_id, service_date')
    .eq('church_id', args.churchId)
  const occurrenceCache = new Map<string, string>()
  for (const o of existingOccs ?? []) {
    occurrenceCache.set(`${o.service_template_id}:${o.location_id}:${o.service_date}`, o.id)
  }

  const sourcesByName = new Map(args.sources.map(s => [s.name, s]))

  // ---------- 3a. Batch occurrence pre-pass ----------
  // Walk every source row exactly as the extraction loops below do and collect the
  // DISTINCT set of occurrence keys (church, location, template, date). This lets us
  // bulk-upsert all missing service_instances in a handful of round-trips BEFORE the
  // row loops run, so the loops never issue a per-row SELECT+INSERT — they hit the
  // already-populated `occurrenceCache` only. The slow cachedUpsertOccurrence fallback
  // remains as a safety net but should effectively never fire after this pass.
  //
  // resolveOccurrenceKey is the SINGLE source of truth for row → occurrence-key
  // resolution, shared by this pre-pass and (implicitly, via the cache) the loops:
  // both reuse the same templateByCode / locationByCode / parseDateIso / slug logic.
  type OccKey = { churchId: string; locationId: string; templateId: string; serviceDate: string }
  const cacheKeyFor = (k: OccKey) => `${k.templateId}:${k.locationId}:${k.serviceDate}`

  // Pre-cache rows already loaded from getAllRows so the loops don't re-fetch. Sources
  // are parsed once here; the extraction loops below re-call getAllRows, which is cheap
  // (already-buffered) — but to be safe we cache per-source rows for reuse.
  const rowsBySource = new Map<string, Record<string, string>[]>()

  // Distinct occurrence keys discovered across all sources, deduped by cache key.
  const wantedOccKeys = new Map<string, OccKey>()

  for (const mapping of args.confirmedMapping.sources) {
    const src = sourcesByName.get(mapping.source_name)
    if (!src || src.kind === 'text') continue

    // Parse once. On failure, leave it UNCACHED so the extraction loop below re-runs
    // getAllRows and surfaces the parse error via its own catch (preserves error output).
    const rows = await getAllRows(src).catch(() => null)
    if (rows === null) continue
    rowsBySource.set(mapping.source_name, rows)

    const fieldsByColumn = new Map(mapping.column_map.map(c => [c.source_column, c.dest_field]))
    const dateColumn = mapping.date_column
      ?? [...fieldsByColumn.entries()].find(([, d]) => d === 'service_date')?.[0]
    const templateCol = [...fieldsByColumn.entries()].find(([, d]) => d === 'service_template_code' || d === 'service_code')?.[0]
    const locationCol  = [...fieldsByColumn.entries()].find(([, d]) => d === 'location_code')?.[0]

    // Mirror the loops' template-payload gate: a row only needs an occurrence when the
    // source carries at least one instance-scope metric column.
    const hasInstancePayload = mapping.column_map.some(c => {
      if (!c.dest_field.startsWith('metric.')) return false
      const code = slug(c.dest_field.slice('metric.'.length))
      return metricByCode.get(code)?.scope === 'instance'
    })
    // Tall sheets always extract per-group; instance-scope metrics there are resolved
    // lazily, but the occurrence key is identical, so collect for every resolvable
    // (date × template) group. We collect for tall regardless of hasInstancePayload
    // (the lazy getOccurrence in the loop only fires for instance metrics anyway, and
    // pre-seeding extra cache keys is harmless — those occurrences just won't be used).
    if (!mapping.tall_format && !hasInstancePayload) continue

    for (const row of rows) {
      const serviceDate = parseDateIso(dateColumn ? row[dateColumn] : undefined)
      if (!serviceDate) continue
      const templateCode = slug(
        (templateCol && row[templateCol]) || mapping.default_service_template_code || '',
      )
      if (!templateCode) continue
      const template = templateByCode.get(templateCode)
      if (!template) continue
      const locationId = locationCol && row[locationCol]
        ? (locationByCode.get(slug(row[locationCol])) ?? template.locationId)
        : template.locationId
      const occKey: OccKey = {
        churchId: args.churchId, locationId, templateId: template.id, serviceDate,
      }
      const ck = cacheKeyFor(occKey)
      if (!wantedOccKeys.has(ck)) wantedOccKeys.set(ck, occKey)
    }
  }

  // Diff against the preloaded cache → the keys that need creating.
  const missingKeys: OccKey[] = []
  for (const [ck, occKey] of wantedOccKeys) {
    if (!occurrenceCache.has(ck)) missingKeys.push(occKey)
  }

  if (missingKeys.length > 0) {
    const OCC_CHUNK = 500
    const OCC_CONFLICT = 'church_id,location_id,service_template_id,service_date'
    for (let i = 0; i < missingKeys.length; i += OCC_CHUNK) {
      const slice = missingKeys.slice(i, i + OCC_CHUNK)
      const insertRows = slice.map(k => ({
        church_id:           k.churchId,
        location_id:         k.locationId,
        service_template_id: k.templateId,
        service_date:        k.serviceDate,
        status:              'active',
      }))
      const { data, error } = await args.supabase
        .from('service_instances')
        .upsert(insertRows, { onConflict: OCC_CONFLICT })
        .select('id, service_template_id, location_id, service_date')
      if (error) {
        // Non-fatal: the per-row cachedUpsertOccurrence fallback will recover any
        // occurrence this batch failed to create.
        errors.push(`occurrence batch upsert: ${error.message}`)
        continue
      }
      for (const o of data ?? []) {
        occurrenceCache.set(`${o.service_template_id}:${o.location_id}:${o.service_date}`, o.id)
      }
    }

    // If upsert .select() didn't return rows for pre-existing conflicts (some
    // PostgREST/Postgres versions omit untouched conflict rows), fill any gaps with a
    // single SELECT of the still-missing keys.
    const stillMissing = missingKeys.filter(k => !occurrenceCache.has(cacheKeyFor(k)))
    if (stillMissing.length > 0) {
      // Re-read the full occurrence set once; cheaper than N targeted lookups and the
      // wanted set is bounded by the sheet's distinct (date × template) count.
      const { data: refetched } = await args.supabase
        .from('service_instances')
        .select('id, service_template_id, location_id, service_date')
        .eq('church_id', args.churchId)
      for (const o of refetched ?? []) {
        occurrenceCache.set(`${o.service_template_id}:${o.location_id}:${o.service_date}`, o.id)
      }
    }
  }

  for (const mapping of args.confirmedMapping.sources) {
    const src = sourcesByName.get(mapping.source_name)
    if (!src) {
      errors.push(`Source "${mapping.source_name}" not found in upload payload`)
      continue
    }
    if (src.kind === 'text') continue

    // Reuse rows parsed during the batch pre-pass (3a) to avoid re-fetching the sheet.
    // Fall back to a fresh fetch only if the pre-pass somehow didn't cache them.
    const rows = rowsBySource.get(mapping.source_name)
      ?? await getAllRows(src).catch(err => {
        errors.push(`getAllRows "${mapping.source_name}": ${err instanceof Error ? err.message : 'parse failed'}`)
        return [] as Record<string, string>[]
      })

    const fieldsByColumn = new Map(mapping.column_map.map(c => [c.source_column, c.dest_field]))
    const dateColumn = mapping.date_column
      ?? [...fieldsByColumn.entries()].find(([, d]) => d === 'service_date')?.[0]
    const templateCol = [...fieldsByColumn.entries()].find(([, d]) => d === 'service_template_code' || d === 'service_code')?.[0]
    const locationCol  = [...fieldsByColumn.entries()].find(([, d]) => d === 'location_code')?.[0]

    // Resolve a metric.<CODE> dest_field → { id, scope, unitKind }. Returns null
    // (with a one-time error) if the metric was never created in Phase 1.
    const resolveMetric = (destField: string, ctxLabel: string): MetricInfo | null => {
      const code = slug(destField.slice('metric.'.length))
      const info = metricByCode.get(code)
      if (!info) {
        const warnKey = `metric:${code}`
        if (!warnedTagFallbacks.has(warnKey)) {
          errors.push(`Unknown metric "${code}" (${ctxLabel}) — not declared in proposed_setup.metrics or not created in setup.`)
          warnedTagFallbacks.add(warnKey)
        }
        return null
      }
      return info
    }

    // Parse a raw cell into a non-negative number using the metric's unit kind.
    // Blank → null (skip, NOT zero — Rule 2). Negatives rejected.
    const parseMetricValue = (raw: string | undefined, unitKind: 'count' | 'currency'): number | null =>
      unitKind === 'currency' ? parseMoney(raw) : parseCount(raw)

    // ── TALL/UNPIVOTED FORMAT ─────────────────────────────────────────────────
    if (mapping.tall_format) {
      const tf = mapping.tall_format
      // Group rows by occurrence key (date × template). Only instance-scope metrics
      // need an occurrence; period-scope metrics are accumulated directly per row.
      type OccGroup = { date: string; templateCode: string; rows: Record<string, string>[] }
      const occGroups = new Map<string, OccGroup>()

      for (const row of rows) {
        const serviceDate = parseDateIso(dateColumn ? row[dateColumn] : undefined)
        if (!serviceDate) continue
        const rawTmpl = (templateCol && row[templateCol]) || mapping.default_service_template_code || ''
        const templateCode = slug(rawTmpl)
        // Even rows with no template can carry period-scope metrics — group them under
        // a synthetic key so we still iterate them, but skip occurrence upsert below.
        const key = `${serviceDate}:${templateCode}`
        if (!occGroups.has(key)) occGroups.set(key, { date: serviceDate, templateCode, rows: [] })
        occGroups.get(key)!.rows.push(row)
      }

      for (const grp of occGroups.values()) {
        const template = grp.templateCode ? templateByCode.get(grp.templateCode) : undefined
        // Resolve the occurrence lazily — only when an instance-scope metric needs it,
        // so period-only rows (no/unknown template) don't error.
        let occurrenceId: string | null | undefined
        const getOccurrence = async (): Promise<string | null> => {
          if (occurrenceId !== undefined) return occurrenceId
          if (!template) {
            errors.push(`"${mapping.source_name}": unknown template "${grp.templateCode}" on ${grp.date}`)
            occurrenceId = null
            return null
          }
          const locationId = locationCol && grp.rows[0]?.[locationCol]
            ? (locationByCode.get(slug(grp.rows[0][locationCol])) ?? template.locationId)
            : template.locationId
          const id = await cachedUpsertOccurrence(args.supabase, occurrenceCache, {
            churchId: args.churchId, locationId, templateId: template.id, serviceDate: grp.date,
          })
          if (!id) {
            errors.push(`"${mapping.source_name}" ${grp.date}/${grp.templateCode}: failed to upsert occurrence`)
            occurrenceId = null
            return null
          }
          counts.occurrences++
          occurrenceId = id
          return id
        }

        for (const row of grp.rows) {
          const metricName = tf.metric_name_column ? row[tf.metric_name_column] : null
          const rawValue   = tf.value_column ? row[tf.value_column] : null
          if (!metricName || rawValue == null || rawValue === '') continue

          const groupTypeVal    = tf.group_type_column    ? row[tf.group_type_column]    : undefined
          const groupContextVal = tf.group_context_column ? row[tf.group_context_column] : undefined
          // MUST mirror routeTallRow() in routing.ts (the validator's source of truth).
          // For audience-discriminated rows (e.g. attendance) the segment that selects
          // the metric lives in the audience column ("Adult"/"Student"/"Kid"), not the
          // metric_name column. area_field_map is keyed by that audience word exactly as
          // it is by the Area value for Volunteers/Stats. So we try the literal Area keys
          // FIRST (longest-first), then the audience-derived keys — the audience variants
          // only fire when Area alone didn't match, so Volunteers/Stats don't regress.
          const audienceRaw = tf.audience_column ? row[tf.audience_column] : undefined
          const segments: string[] = [metricName]
          if (audienceRaw) {
            segments.push(audienceRaw)
            const mapped = tf.audience_map?.[audienceRaw]
            if (mapped) segments.push(mapped)
          }
          // Build candidate compound keys (longest-first), mirroring routeTallRow().
          const candidateKeys: string[] = []
          for (const seg of segments) {
            if (groupTypeVal && groupContextVal) candidateKeys.push(`${groupTypeVal} / ${groupContextVal} / ${seg}`)
            if (groupTypeVal)                    candidateKeys.push(`${groupTypeVal} / ${seg}`)
            candidateKeys.push(seg)
          }
          let destField: string | undefined
          // Fast path: literal exact match. Volunteers/Stats resolve here, byte-identical
          // to before — the normalized fallback never runs for them.
          for (const k of candidateKeys) {
            const hit = tf.area_field_map?.[k]
            if (hit) { destField = hit; break }
          }
          // Fallback: symmetric normalized match ("Attender"↔"Attenders", case, whitespace).
          if (!destField) {
            const normIndex = buildNormalizedAreaIndex(tf.area_field_map)
            for (const k of candidateKeys) {
              const hit = normIndex.get(normalizeCompoundKey(k))
              if (hit) { destField = hit; break }
            }
          }
          if (!destField || destField === 'ignore') continue
          if (!destField.startsWith('metric.')) continue

          const metric = resolveMetric(destField, `metric "${metricName}"`)
          if (!metric) continue
          const value = parseMetricValue(rawValue, metric.unitKind)
          if (value == null) continue

          if (metric.scope === 'period') {
            addPeriodEntry(metric.id, grp.date, value)
          } else {
            const occId = await getOccurrence()
            if (!occId) continue
            addInstanceEntry(metric.id, occId, value)
          }
        }
      }

      continue  // done with tall format — skip wide extraction below
    }

    // ── WIDE FORMAT (one row per occurrence) ──────────────────────────────────
    const META_DESTS = new Set([
      'service_date', 'service_template_code', 'service_code', 'location_code', 'ignore',
    ])

    // Does this source carry any instance-scope metric column? If not, rows that
    // only feed period-scope metrics don't require an occurrence.
    const hasInstancePayload = mapping.column_map.some(c => {
      if (!c.dest_field.startsWith('metric.')) return false
      const code = slug(c.dest_field.slice('metric.'.length))
      return metricByCode.get(code)?.scope === 'instance'
    })

    for (const [rowIdx, row] of rows.entries()) {
      if (!dateColumn) {
        errors.push(`"${mapping.source_name}": no date column defined`)
        break
      }
      const rawDate = row[dateColumn]
      const serviceDate = parseDateIso(rawDate)
      if (!serviceDate) {
        errors.push(`"${mapping.source_name}" row ${rowIdx + 2}: unparseable date "${rawDate}"`)
        continue
      }

      // Period-scope metrics first — they need no occurrence.
      for (const entry of mapping.column_map) {
        if (!entry.dest_field.startsWith('metric.')) continue
        const metric = resolveMetric(entry.dest_field, `row ${rowIdx + 2}`)
        if (!metric || metric.scope !== 'period') continue
        const value = parseMetricValue(row[entry.source_column], metric.unitKind)
        if (value == null) continue
        addPeriodEntry(metric.id, serviceDate, value)
      }

      // If the row carries no instance-scope payload, skip occurrence creation.
      if (!hasInstancePayload) continue

      const templateCode = slug(
        (templateCol && row[templateCol])
          || mapping.default_service_template_code
          || '',
      )
      if (!templateCode) {
        errors.push(`"${mapping.source_name}" row ${rowIdx + 2}: no service_template_code`)
        continue
      }
      const template = templateByCode.get(templateCode)
      if (!template) {
        errors.push(`"${mapping.source_name}" row ${rowIdx + 2}: unknown template "${templateCode}"`)
        continue
      }
      const locationId = locationCol && row[locationCol]
        ? (locationByCode.get(slug(row[locationCol])) ?? template.locationId)
        : template.locationId

      // Upsert occurrence (UNIQUE church_id, location_id, template_id, service_date)
      const occurrenceId = await cachedUpsertOccurrence(args.supabase, occurrenceCache, {
        churchId:   args.churchId,
        locationId,
        templateId: template.id,
        serviceDate,
      })
      if (!occurrenceId) {
        errors.push(`"${mapping.source_name}" row ${rowIdx + 2}: failed to upsert occurrence`)
        continue
      }
      counts.occurrences++

      // Instance-scope metrics for this row.
      for (const entry of mapping.column_map) {
        const dest = entry.dest_field
        if (META_DESTS.has(dest)) continue
        if (!dest.startsWith('metric.')) continue
        const metric = resolveMetric(dest, `row ${rowIdx + 2}`)
        if (!metric || metric.scope !== 'instance') continue
        const value = parseMetricValue(row[entry.source_column], metric.unitKind)
        if (value == null) continue
        addInstanceEntry(metric.id, occurrenceId, value)
      }
    }
  }

  // ---------- 4. Flush metric_entries ----------
  // One write path for everything. Both instance- and period-scope rows
  // conflict on the single constraint uq_metric_entry
  // (metric_id, service_instance_id, period_anchor) NULLS NOT DISTINCT
  // (migration 0027). PostgREST onConflict can't target a partial index,
  // so this 3-col constraint is the upsert key for both scopes. The XOR
  // CHECK guarantees exactly one of instance/period is set per row.
  // reporting_tag_code is set by the BEFORE-INSERT trigger, never here.
  const CHUNK = 500
  const METRIC_ENTRY_CONFLICT = 'metric_id,service_instance_id,period_anchor'

  const instanceBatch = Array.from(instanceEntryMap.values())
  for (let i = 0; i < instanceBatch.length; i += CHUNK) {
    const chunk = instanceBatch.slice(i, i + CHUNK)
    const { error } = await args.supabase
      .from('metric_entries')
      .upsert(chunk, { onConflict: METRIC_ENTRY_CONFLICT })
    if (error) errors.push(`metric_entries (instance) upsert: ${error.message}`)
    else counts.metric_entries += chunk.length
  }

  const periodBatch = Array.from(periodEntryMap.values())
  for (let i = 0; i < periodBatch.length; i += CHUNK) {
    const chunk = periodBatch.slice(i, i + CHUNK)
    const { error } = await args.supabase
      .from('metric_entries')
      .upsert(chunk, { onConflict: METRIC_ENTRY_CONFLICT })
    if (error) errors.push(`metric_entries (period) upsert: ${error.message}`)
    else counts.metric_entries += chunk.length
  }

  // Mirror the unified count into the legacy `attendance` field so the confirm
  // page's optional-chained dataTotal sum stays non-zero (see StageBResult doc).
  counts.attendance = counts.metric_entries

  // V1.5: derive and persist GridConfig from the just-written church state.
  // Non-blocking — if this fails, the History page derives on next read instead.
  try {
    const gridConfig = await deriveGridConfigFromSchema(args.supabase, args.churchId)
    if (gridConfig) {
      await args.supabase
        .from('churches')
        .update({ grid_config: gridConfig })
        .eq('id', args.churchId)
    }
  } catch (err) {
    errors.push(`grid_config write skipped: ${err instanceof Error ? err.message : 'unknown'}`)
  }

  return { totalCents: setupResult.totalCents, setupSummary, rowsInserted: counts, errors }
}

// ---------- deterministic setup executor (replaces the old Haiku tool-loop) ----------

/** ctx passed to WRITER_HANDLERS — mirrors ToolHandlerContext (churchId + supabase). */
interface SetupCtx { churchId: string; supabase: SupabaseClient }

/** Result shape consumed by runStageB: same `setupSummary` + `totalCents` contract
 *  the old runToolLoop result exposed, plus the collected handler errors. */
interface SetupResult { setupSummary: string; totalCents: number; errors: string[] }

// ---- proposed_setup item shapes (IR v2 — IMPORT_IR_V2.md / stageA.ts schema) ----
interface PsLocation     { name?: unknown; code?: unknown }
interface PsMinistryTag  { code?: unknown; name?: unknown; tag_role?: unknown; parent_code?: unknown }
interface PsReportingTag { code?: unknown; name?: unknown; unit_kind?: unknown; agg_default?: unknown }
interface PsTemplate {
  display_name?: unknown; service_code?: unknown
  location_name?: unknown; location_code?: unknown
  primary_tag?: unknown; primary_tag_code?: unknown
  day_of_week?: unknown; start_time?: unknown
}
interface PsMetric {
  metric_code?: unknown; name?: unknown
  ministry_tag?: unknown; ministry_tag_code?: unknown
  reporting_tag?: unknown; reporting_tag_code?: unknown
  scope?: unknown; is_canonical?: unknown
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}
function str(v: unknown): string {
  return v == null ? '' : String(v)
}

/**
 * Deterministically materialize `proposed_setup` into DB entities by calling the
 * existing WRITER_HANDLERS directly — no AI. Replicates every rule the old
 * STAGE_B_SYSTEM prompt enforced:
 *   - dependency order: locations → ministry_tags (parents before children) →
 *     reporting_tags (custom) → service_templates → schedule_versions → metrics
 *   - one active schedule_version per template that has a day_of_week
 *   - ≤1 canonical metric per (ministry, reporting) pair (keep the first, demote rest)
 *   - "[BLOCKING]" display_name fallback → service_code
 *   - at-least-one-template safety net (location MAIN + ministry MORNING + template MORNING)
 * No metric_entries / service_instance writes happen here — Phase 2 owns those.
 */
async function runSetupDeterministic(
  ctx: SetupCtx,
  proposedSetupRaw: Record<string, unknown> | undefined,
): Promise<SetupResult> {
  const errors: string[] = []
  const ps = (proposedSetupRaw ?? {}) as Record<string, unknown>
  const H = WRITER_HANDLERS

  // ── 1. Locations ─────────────────────────────────────────────────────────
  // Track every code that successfully exists so templates can resolve their
  // location by NAME (stageA emits location_name) or by code.
  const locationCodeByName = new Map<string, string>() // slug(name) → code
  const knownLocationCodes  = new Set<string>()
  const locations = asArray<PsLocation>(ps.locations)
  let locCount = 0
  for (const loc of locations) {
    const name = str(loc.name)
    const code = str(loc.code) || name
    if (!name && !code) continue
    try {
      const res = (await H.upsert_location({ name: name || code, code }, ctx)) as { code: string }
      knownLocationCodes.add(res.code)
      if (name) locationCodeByName.set(setupSlug(name), res.code)
      locCount++
    } catch (err) {
      errors.push(`setup upsert_location "${name || code}": ${errMsg(err)}`)
    }
  }

  // ── 2. Ministry tags — parents before children (topological) ─────────────
  const ministryTags = asArray<PsMinistryTag>(ps.ministry_tags)
  const sortedTags = topoSortTags(ministryTags, errors)
  const knownTagCodes = new Set<string>()
  let tagCount = 0
  for (const tag of sortedTags) {
    const code = str(tag.code)
    const name = str(tag.name)
    if (!code) { errors.push(`setup ministry_tag with no code skipped (name="${name}")`); continue }
    const parentCode = tag.parent_code == null ? undefined : str(tag.parent_code)
    try {
      const res = (await H.upsert_ministry_tag(
        { code, name: name || code, tag_role: tag.tag_role, ...(parentCode ? { parent_code: parentCode } : {}) },
        ctx,
      )) as { code: string }
      knownTagCodes.add(res.code)
      tagCount++
    } catch (err) {
      errors.push(`setup upsert_ministry_tag "${code}": ${errMsg(err)}`)
    }
  }

  // ── 3. Reporting tags — CUSTOM only (the 4 system tags are pre-seeded) ────
  for (const rt of asArray<PsReportingTag>(ps.reporting_tags)) {
    const code = str(rt.code)
    if (!code) continue
    try {
      await H.upsert_reporting_tag(
        { code, name: str(rt.name) || code, unit_kind: rt.unit_kind, agg_default: rt.agg_default },
        ctx,
      )
    } catch (err) {
      errors.push(`setup upsert_reporting_tag "${code}": ${errMsg(err)}`)
    }
  }

  // ── 4. Service templates (+ remember schedule inputs for step 5) ──────────
  const templates = asArray<PsTemplate>(ps.service_templates)
  type SchedSeed = { service_code: string; location_code: string; day_of_week: number; start_time: string }
  const schedSeeds: SchedSeed[] = []
  let tmplCount = 0
  for (const t of templates) {
    const serviceCode = str(t.service_code)
    if (!serviceCode) { errors.push(`setup service_template with no service_code skipped`); continue }

    // display_name: reconcile already resolved "[BLOCKING]" names; if one still
    // literally contains "[BLOCKING]", fall back to the service_code and note it.
    let displayName = str(t.display_name) || serviceCode
    if (displayName.includes('[BLOCKING]')) {
      errors.push(`setup service_template "${serviceCode}": unresolved [BLOCKING] display_name, using service_code as name`)
      displayName = serviceCode
    }

    // location: stageA emits location_name; tolerate location_code too. Resolve to a
    // known location code; fall back to the sole/first location, else "MAIN".
    const locName = str(t.location_name)
    const locCodeRaw = str(t.location_code)
    let locationCode =
      (locCodeRaw && knownLocationCodes.has(setupSlug(locCodeRaw)) ? setupSlug(locCodeRaw) : '') ||
      (locName ? (locationCodeByName.get(setupSlug(locName)) ?? '') : '') ||
      (locCodeRaw ? setupSlug(locCodeRaw) : '') ||
      [...knownLocationCodes][0] ||
      'MAIN'
    // Safety net: ensure the resolved location exists (e.g. setup had no locations[]).
    if (!knownLocationCodes.has(locationCode)) {
      try {
        const res = (await H.upsert_location(
          { name: locName || 'Main Campus', code: locationCode },
          ctx,
        )) as { code: string }
        locationCode = res.code
        knownLocationCodes.add(res.code)
      } catch (err) {
        errors.push(`setup upsert_location (for template "${serviceCode}"): ${errMsg(err)}`)
      }
    }

    const primaryTag = str(t.primary_tag) || str(t.primary_tag_code)
    const dow = t.day_of_week
    const startTime = t.start_time == null ? undefined : str(t.start_time)
    try {
      await H.upsert_service_template(
        {
          service_code:     serviceCode,
          display_name:     displayName,
          location_code:    locationCode,
          primary_tag_code: primaryTag,
          ...(dow != null ? { day_of_week: dow } : {}),
          ...(startTime ? { start_time: startTime } : {}),
        },
        ctx,
      )
      tmplCount++
      // Collect schedule seed: replicate STAGE_B_SYSTEM — one active schedule version
      // per template, sourced from day_of_week/start_time, defaulting to Sunday 10:00.
      const dowNum = Number.isInteger(Number(dow)) ? Number(dow) : 0
      schedSeeds.push({
        service_code:  serviceCode,
        location_code: locationCode,
        day_of_week:   dowNum >= 0 && dowNum <= 6 ? dowNum : 0,
        start_time:    startTime && startTime.length > 0 ? startTime : '10:00:00',
      })
    } catch (err) {
      errors.push(`setup upsert_service_template "${serviceCode}": ${errMsg(err)}`)
    }
  }

  // ── 4b. At-least-one-template safety net ─────────────────────────────────
  // Instance-scope metrics need a service_instance → a template. If proposed_setup
  // produced none, create the same fallback trio the old prompt mandated.
  if (tmplCount === 0) {
    errors.push('setup: no service templates in proposed_setup — creating fallback MORNING template')
    try {
      await H.upsert_location({ name: 'Main Campus', code: 'MAIN' }, ctx)
      knownLocationCodes.add('MAIN')
      await H.upsert_ministry_tag({ code: 'MORNING', name: 'Sunday Service', tag_role: 'ADULT_SERVICE' }, ctx)
      knownTagCodes.add('MORNING')
      await H.upsert_service_template(
        { service_code: 'MORNING', display_name: 'Sunday Service', location_code: 'MAIN', primary_tag_code: 'MORNING' },
        ctx,
      )
      tmplCount++
      schedSeeds.push({ service_code: 'MORNING', location_code: 'MAIN', day_of_week: 0, start_time: '10:00:00' })
    } catch (err) {
      errors.push(`setup fallback template: ${errMsg(err)}`)
    }
  }

  // ── 5. Schedule versions — one per template (REQUIRED for T1 card) ────────
  for (const s of schedSeeds) {
    try {
      await H.upsert_service_schedule_version(
        { service_code: s.service_code, location_code: s.location_code, day_of_week: s.day_of_week, start_time: s.start_time },
        ctx,
      )
    } catch (err) {
      errors.push(`setup upsert_service_schedule_version "${s.service_code}": ${errMsg(err)}`)
    }
  }

  // ── 6. Metrics — guard ≤1 canonical per (ministry, reporting) pair ────────
  const metrics = asArray<PsMetric>(ps.metrics)
  const canonicalSeen = new Set<string>() // `${ministry}|${reporting}` that already has a canonical
  let metricCount = 0
  for (const m of metrics) {
    const metricCode = str(m.metric_code)
    if (!metricCode) { errors.push(`setup metric with no metric_code skipped`); continue }
    const ministry  = str(m.ministry_tag) || str(m.ministry_tag_code)
    const reporting = str(m.reporting_tag) || str(m.reporting_tag_code)
    let isCanonical = Boolean(m.is_canonical)
    if (isCanonical) {
      const pairKey = `${setupSlug(ministry)}|${setupSlug(reporting)}`
      if (canonicalSeen.has(pairKey)) {
        // Preserve the data: keep the first canonical, demote this one + note it.
        errors.push(`setup metric "${metricCode}": second canonical for (${ministry}, ${reporting}) demoted to non-canonical`)
        isCanonical = false
      } else {
        canonicalSeen.add(pairKey)
      }
    }
    try {
      await H.upsert_metric(
        {
          metric_code:        metricCode,
          name:               str(m.name) || metricCode,
          ministry_tag_code:  ministry,
          reporting_tag_code: reporting,
          scope:              m.scope,
          is_canonical:       isCanonical,
        },
        ctx,
      )
      metricCount++
    } catch (err) {
      errors.push(`setup upsert_metric "${metricCode}": ${errMsg(err)}`)
    }
  }

  const setupSummary =
    `Setup (deterministic): ${locCount} location(s), ${tagCount} ministry tag(s), ` +
    `${tmplCount} service template(s), ${metricCount} metric(s) created/updated.`

  // No AI was used, so there is no token cost for the setup phase.
  return { setupSummary, totalCents: 0, errors }
}

/**
 * Topologically order ministry tags so parents are created before children.
 * Tags with no parent_code (or whose parent isn't in this batch) come first; then
 * tags whose parent has already been emitted. Cycles / unresolvable parents are
 * appended last (and noted) so they still get attempted rather than silently dropped.
 */
function topoSortTags(tags: PsMinistryTag[], errors: string[]): PsMinistryTag[] {
  const byCode = new Map<string, PsMinistryTag>()
  for (const t of tags) {
    const code = str(t.code)
    if (code) byCode.set(setupSlug(code), t)
  }
  const emitted = new Set<string>()
  const ordered: PsMinistryTag[] = []

  const visit = (t: PsMinistryTag, stack: Set<string>) => {
    const code = setupSlug(str(t.code))
    if (!code || emitted.has(code)) return
    if (stack.has(code)) {
      errors.push(`setup ministry_tag cycle detected at "${str(t.code)}" — emitting anyway`)
      return
    }
    const parentCode = t.parent_code == null ? '' : setupSlug(str(t.parent_code))
    if (parentCode && byCode.has(parentCode) && !emitted.has(parentCode)) {
      stack.add(code)
      visit(byCode.get(parentCode)!, stack)
      stack.delete(code)
    }
    if (!emitted.has(code)) {
      emitted.add(code)
      ordered.push(t)
    }
  }

  for (const t of tags) visit(t, new Set())
  // Append any tag the visit missed (e.g. blank code) so nothing is dropped.
  for (const t of tags) {
    const code = setupSlug(str(t.code))
    if (!code || emitted.has(code)) {
      if (!ordered.includes(t)) ordered.push(t)
    }
  }
  return ordered
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'handler error'
}

/** UPPERCASE slug — byte-identical to the writers.ts slug (sans fallback) so code
 *  comparisons here line up with the codes the handlers persist. */
function setupSlug(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

// ---------- helpers ----------

/** Returns the ISO date string of the Sunday on or before the given date. */
function sundayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  const day = d.getUTCDay() // 0=Sun … 6=Sat
  d.setUTCDate(d.getUTCDate() - day)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function slug(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function parseMoney(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null
  const cleaned = String(raw).replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function parseCount(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null
  const cleaned = String(raw).replace(/[,\s]/g, '')
  const n = Number(cleaned)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Accepts YYYY-MM-DD, M/D/YYYY, M/D/YY, D-Mon-YYYY, etc. Returns YYYY-MM-DD or null. */
function parseDateIso(raw: string | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim()

  // ISO fast path
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // M/D/YYYY or M/D/YY
  const us = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s)
  if (us) {
    let [, m, d, y] = us
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Last resort — Date parser, UTC-normalised
  const dt = new Date(s)
  if (!Number.isFinite(dt.getTime())) return null
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Cached occurrence upsert — avoids per-row SELECT round-trips after initial pre-load. */
async function cachedUpsertOccurrence(
  supabase:  SupabaseClient,
  cache:     Map<string, string>,
  args: { churchId: string; locationId: string; templateId: string; serviceDate: string },
): Promise<string | null> {
  const cacheKey = `${args.templateId}:${args.locationId}:${args.serviceDate}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const id = await upsertOccurrence(supabase, args)
  if (id) cache.set(cacheKey, id)
  return id
}

async function upsertOccurrence(
  supabase: SupabaseClient,
  args: { churchId: string; locationId: string; templateId: string; serviceDate: string },
): Promise<string | null> {
  const existing = await supabase
    .from('service_instances')
    .select('id')
    .eq('church_id',           args.churchId)
    .eq('location_id',         args.locationId)
    .eq('service_template_id', args.templateId)
    .eq('service_date',        args.serviceDate)
    .maybeSingle()
  if (existing.data) return existing.data.id

  const { data, error } = await supabase
    .from('service_instances')
    .insert({
      church_id:           args.churchId,
      location_id:         args.locationId,
      service_template_id: args.templateId,
      service_date:        args.serviceDate,
      status:              'active',
    })
    .select('id')
    .single()
  if (error) return null
  return data.id
}
