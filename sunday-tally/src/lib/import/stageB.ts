import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import { runToolLoop } from '@/lib/ai/anthropic'
import { WRITER_TOOLS, WRITER_HANDLERS } from './writers'
import { getAllRows, type SourceInput } from './sources'

const STAGE_B_SYSTEM = `You are the Sunday Tally setup-writer agent.

You will be given a proposed/confirmed setup and a short summary of each uploaded source. Your only job is to CALL THE WRITER TOOLS to make sure every required setup entity exists in the database:

- upsert_location
- upsert_service_tag
- upsert_service_template (references a location_code and a primary_tag_code)
- upsert_service_schedule_version (REQUIRED after every upsert_service_template — sets day_of_week + start_time)
- upsert_volunteer_category
- upsert_response_category
- upsert_giving_source

Call tools in dependency order (locations + tags → templates → schedule_versions; categories + sources before row extraction). Use stable, UPPERCASE codes when one isn't provided (e.g. MAIN, MORNING, PLATE, HOSTS, FIRST_TIME_DECISION).

CRITICAL — Schedule versions: After EVERY upsert_service_template, you MUST call upsert_service_schedule_version with that template's day_of_week and start_time. Source these values from:
  1. proposed_setup.service_templates[].day_of_week / start_time when present
  2. qa_answers when the user supplied a start_time clarification (e.g. id="q_time_<service_code>")
  3. Inference from data dates: if every observed service_date for a template is a Sunday → day_of_week=0; all Wednesdays → day_of_week=3; etc.
  4. Sensible defaults if absolutely nothing is known: day_of_week=0 (Sunday), start_time="10:00:00"
Without a schedule_version the service won't appear as a scheduled card on T1 — never skip this step.

CRITICAL — Service template codes: The service_code you use in upsert_service_template MUST exactly match (after slugifying to UPPERCASE) the values that appear in the source sheet's service_template_code column. For example:
- If the sheet has Service Type values "1", "2", "3" → use service_code "1", "2", "3"
- If the sheet has Service Type values "Morning", "Evening" → use service_code "MORNING", "EVENING"
Check the confirmed mapping column_map entry for service_template_code and its notes to find the raw values. Use those values as codes (the display_name can still be descriptive like "Sunday 9am").

CRITICAL — AT LEAST ONE SERVICE TEMPLATE MUST EXIST:
Service occurrences cannot exist without a service template. Without occurrences, NO data rows
(attendance, giving, volunteer, response) can ever be imported. If proposed_setup has no service_templates,
or if none of the proposed templates were created yet, you MUST still call:
  upsert_location(code: "MAIN", name: "Main Campus")
  upsert_service_template(service_code: "MORNING", display_name: "Sunday Service", location_code: "MAIN", primary_tag: "MORNING")
This ensures at least one template exists so the row extractor can attach occurrences.

When all setup is in place, call the "done" tool with a short summary. Do NOT attempt to insert attendance, giving, volunteer, response, or service_occurrence rows — those are handled deterministically by the server after you finish.`

export interface ColumnMapEntry {
  source_column: string
  /**
   * dest_field grammar:
   *   "service_date"
   *   "service_template_code"
   *   "location_code"
   *   "attendance.main" | "attendance.kids" | "attendance.youth"
   *   "giving.<SOURCE_CODE>"           — service-tied giving (giving_entries)
   *   "period_giving.<SOURCE_CODE>"    — church-wide weekly giving (church_period_giving, D-056)
   *                                      Date is snapped to the Sunday on or before the row's date.
   *                                      No service_occurrence required.
   *   "volunteer.<CATEGORY_CODE>"
   *   "response.<CATEGORY_CODE>"             (service-scope)
   *   "response.<CATEGORY_CODE>.<AUDIENCE>"  (audience-scope — MAIN|KIDS|YOUTH)
   *   "ignore"
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
   * Optional column used to build compound lookup keys.
   * When set, the area_field_map is keyed as "${groupType} / ${metricName}".
   * Falls back to plain metricName if compound key is not found.
   */
  group_type_column?: string
  /** Maps each distinct metric name (or "GroupType / MetricName") to a dest_field */
  area_field_map?: Record<string, string>
}

export interface ConfirmedSourceMapping {
  source_name:              string
  dest_table:               string
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
  rowsInserted:  {
    occurrences:   number
    attendance:    number
    volunteer:     number
    response:      number
    giving:        number
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
  // ---------- 1. Setup via Claude writer tools ----------
  const qaSection = (args.confirmedMapping.qa_answers ?? []).length > 0
    ? [
        ``,
        `User's answers to clarifying questions (apply these when creating entities):`,
        JSON.stringify(args.confirmedMapping.qa_answers, null, 2),
        `IMPORTANT: If proposed_setup has display_name values containing "[BLOCKING]", replace them`,
        `with the real names from the user's answers above before calling upsert_service_template.`,
      ].join('\n')
    : ''

  const today = new Date().toISOString().slice(0, 10)
  const setupUserPrompt = [
    `Today's date: ${today}. Data up to and including this date is historical, not future.`,
    ``,
    `Confirmed setup the user accepted:`,
    JSON.stringify(args.confirmedMapping.proposed_setup ?? {}, null, 2),
    qaSection,
    ``,
    `Confirmed source mappings (for context only — do not extract rows):`,
    JSON.stringify(args.confirmedMapping.sources, null, 2),
    ``,
    `Call the writer tools to create every entity the mapping references, then call "done".`,
  ].join('\n')

  const setupResult = await runToolLoop({
    supabase:    args.supabase,
    churchId:    args.churchId,
    kind:        'import_stage_b',
    model:       'claude-haiku-4-5-20251001',
    system:      [
      { type: 'text', text: STAGE_B_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools:       WRITER_TOOLS as Anthropic.Messages.Tool[],
    handlers:    WRITER_HANDLERS,
    terminateOn: ['done'],
    maxTurns:    24,
    initialUser: setupUserPrompt,
  })

  const setupSummary = String(
    (setupResult.finalToolCall?.input as { summary?: string } | undefined)?.summary ?? '',
  )

  // ---------- 2. Resolve lookup maps (code → id) ----------
  const [
    locationsRes,
    templatesRes,
    volRes,
    respRes,
    giveRes,
    tagsRes,
  ] = await Promise.all([
    args.supabase.from('church_locations')
      .select('id, code').eq('church_id', args.churchId),
    args.supabase.from('service_templates')
      .select('id, service_code, location_id').eq('church_id', args.churchId),
    args.supabase.from('volunteer_categories')
      .select('id, category_code, audience_group_code').eq('church_id', args.churchId),
    args.supabase.from('response_categories')
      .select('id, category_code, stat_scope').eq('church_id', args.churchId),
    args.supabase.from('giving_sources')
      .select('id, source_code').eq('church_id', args.churchId),
    args.supabase.from('service_tags')
      .select('id, tag_code').eq('church_id', args.churchId),
  ])

  const locationByCode = new Map<string, string>()
  for (const r of locationsRes.data ?? []) locationByCode.set(r.code, r.id)

  const templateByCode = new Map<string, { id: string; locationId: string }>()
  for (const r of templatesRes.data ?? []) {
    templateByCode.set(r.service_code, { id: r.id, locationId: r.location_id })
  }

  const volunteerByCode = new Map<string, string>()
  for (const r of volRes.data ?? []) volunteerByCode.set(r.category_code, r.id)

  const responseByCode = new Map<string, { id: string; scope: 'audience' | 'service' | 'week' | 'month' | 'day' }>()
  for (const r of respRes.data ?? []) {
    responseByCode.set(r.category_code, { id: r.id, scope: r.stat_scope })
  }

  const givingByCode = new Map<string, string>()
  for (const r of giveRes.data ?? []) givingByCode.set(r.source_code, r.id)

  const tagByCode = new Map<string, string>()
  for (const r of tagsRes.data ?? []) tagByCode.set(r.tag_code, r.id)

  // ---------- 3. Deterministic row extraction ----------
  const errors: string[] = []
  const counts = { occurrences: 0, attendance: 0, volunteer: 0, response: 0, giving: 0, period_giving: 0, period_response: 0 }

  // Period-giving accumulator (D-056). Shared across all sources so duplicate
  // (source, week) entries from different sheets sum correctly.
  type PgRow = {
    church_id:         string
    giving_source_id:  string
    entry_period_type: 'week'
    period_date:       string
    giving_amount:     number
  }
  const pgMap = new Map<string, PgRow>()
  const addPeriodGiving = (sourceId: string, isoDate: string, amount: number) => {
    const sunday = sundayOfWeek(isoDate)
    const key    = `${sourceId}:${sunday}`
    const existing = pgMap.get(key)
    if (existing) {
      existing.giving_amount += amount
    } else {
      pgMap.set(key, {
        church_id:         args.churchId,
        giving_source_id:  sourceId,
        entry_period_type: 'week',
        period_date:       sunday,
        giving_amount:     amount,
      })
    }
  }

  // Period-stats accumulator. Shared across sources; mirrors pgMap for church_period_entries.
  // service_tag_id may be null for church-wide (untagged) stats.
  type PsRow = {
    church_id:            string
    response_category_id: string
    service_tag_id:       string | null
    entry_period_type:    'week' | 'month' | 'day'
    period_date:          string
    stat_value:           number
    is_not_applicable:    boolean
  }
  const psMap = new Map<string, PsRow>()
  // Track tag-suffix fallbacks so the same warning isn't repeated per row.
  const warnedTagFallbacks = new Set<string>()
  const addPeriodStat = (
    categoryId:       string,
    tagId:            string | null,
    periodType:       'week' | 'month' | 'day',
    isoDate:          string,
    value:            number,
  ) => {
    const anchor = periodType === 'month'
      ? isoDate.slice(0, 7) + '-01'   // snap to 1st of month
      : sundayOfWeek(isoDate)          // snap to Sunday of week (day also anchors to Sunday)
    const key = `${categoryId}:${tagId ?? ''}:${anchor}`
    const existing = psMap.get(key)
    if (existing) {
      existing.stat_value += value
    } else {
      psMap.set(key, {
        church_id:            args.churchId,
        response_category_id: categoryId,
        service_tag_id:       tagId,
        entry_period_type:    periodType,
        period_date:          anchor,
        stat_value:           value,
        is_not_applicable:    false,
      })
    }
  }

  // Hard guard: if no service templates exist, nothing can be imported.
  // Stage B's AI is supposed to create at least one template — if it didn't, surface a clear error.
  if (templateByCode.size === 0) {
    errors.push(
      'Setup error: no service templates were created. Every data row needs a service occurrence, ' +
      'which requires a service template. Re-run the import and ensure the mapping includes at least one service type.',
    )
    return { totalCents: setupResult.totalCents, setupSummary, rowsInserted: counts, errors }
  }

  // Pre-load all existing occurrences for this church to avoid per-row SELECT round-trips
  const { data: existingOccs } = await args.supabase
    .from('service_occurrences')
    .select('id, service_template_id, location_id, service_date')
    .eq('church_id', args.churchId)
  const occurrenceCache = new Map<string, string>()
  for (const o of existingOccs ?? []) {
    occurrenceCache.set(`${o.service_template_id}:${o.location_id}:${o.service_date}`, o.id)
  }

  const sourcesByName = new Map(args.sources.map(s => [s.name, s]))

  for (const mapping of args.confirmedMapping.sources) {
    const src = sourcesByName.get(mapping.source_name)
    if (!src) {
      errors.push(`Source "${mapping.source_name}" not found in upload payload`)
      continue
    }
    if (src.kind === 'text') continue
    if (mapping.dest_table === 'ignore') continue

    const rows = await getAllRows(src).catch(err => {
      errors.push(`getAllRows "${mapping.source_name}": ${err instanceof Error ? err.message : 'parse failed'}`)
      return [] as Record<string, string>[]
    })

    const fieldsByColumn = new Map(mapping.column_map.map(c => [c.source_column, c.dest_field]))
    const dateColumn = mapping.date_column
      ?? [...fieldsByColumn.entries()].find(([, d]) => d === 'service_date')?.[0]
    const templateCol = [...fieldsByColumn.entries()].find(([, d]) => d === 'service_template_code' || d === 'service_code')?.[0]
    const locationCol  = [...fieldsByColumn.entries()].find(([, d]) => d === 'location_code')?.[0]

    // ── TALL/UNPIVOTED FORMAT ─────────────────────────────────────────────────
    if (mapping.tall_format) {
      const tf = mapping.tall_format
      // Group rows by occurrence key (date × template)
      type OccGroup = { date: string; templateCode: string; rows: Record<string, string>[] }
      const occGroups = new Map<string, OccGroup>()

      for (const row of rows) {
        const serviceDate = parseDateIso(dateColumn ? row[dateColumn] : undefined)
        if (!serviceDate) continue
        const rawTmpl = (templateCol && row[templateCol]) || mapping.default_service_template_code || ''
        const templateCode = slug(rawTmpl)
        if (!templateCode) continue
        const key = `${serviceDate}:${templateCode}`
        if (!occGroups.has(key)) occGroups.set(key, { date: serviceDate, templateCode, rows: [] })
        occGroups.get(key)!.rows.push(row)
      }

      // Use maps to deduplicate rows that share the same conflict key
      type RespRow = {
        service_occurrence_id: string
        response_category_id: string
        audience_group_code: string | null
        stat_value: number
        is_not_applicable: boolean
      }
      type AttRow = {
        service_occurrence_id: string
        main_attendance: number | null
        kids_attendance: number | null
        youth_attendance: number | null
      }
      type GivRow = {
        service_occurrence_id: string
        giving_source_id: string
        giving_amount: number
        giving_type: string
      }
      type VolRow = {
        service_occurrence_id: string
        volunteer_category_id: string
        volunteer_count: number
        is_not_applicable: boolean
      }
      // Map key = conflict columns concatenated; SUM when duplicate
      const respMap  = new Map<string, RespRow>()
      const attMap   = new Map<string, AttRow>()
      const givMap   = new Map<string, GivRow>()
      const volMap   = new Map<string, VolRow>()

      for (const grp of occGroups.values()) {
        const template = templateByCode.get(grp.templateCode)
        if (!template) {
          errors.push(`"${mapping.source_name}": unknown template "${grp.templateCode}" on ${grp.date}`)
          continue
        }
        const locationId = locationCol && grp.rows[0]?.[locationCol]
          ? (locationByCode.get(slug(grp.rows[0][locationCol])) ?? template.locationId)
          : template.locationId

        const occurrenceId = await cachedUpsertOccurrence(args.supabase, occurrenceCache, {
          churchId: args.churchId, locationId, templateId: template.id, serviceDate: grp.date,
        })
        if (!occurrenceId) {
          errors.push(`"${mapping.source_name}" ${grp.date}/${grp.templateCode}: failed to upsert occurrence`)
          continue
        }
        counts.occurrences++

        for (const row of grp.rows) {
          const metricName = tf.metric_name_column ? row[tf.metric_name_column] : null
          const rawValue   = tf.value_column ? row[tf.value_column] : null
          if (!metricName || rawValue == null || rawValue === '') continue

          const groupTypeVal = tf.group_type_column ? row[tf.group_type_column] : undefined
          const compoundKey  = groupTypeVal ? `${groupTypeVal} / ${metricName}` : null
          const destField    = (compoundKey && tf.area_field_map?.[compoundKey])
            ?? tf.area_field_map?.[metricName]
          if (!destField || destField === 'ignore') continue

          const rawAud = tf.audience_column ? row[tf.audience_column] : undefined
          const mappedAud = (rawAud && tf.audience_map?.[rawAud]) ? tf.audience_map[rawAud] : undefined

          if (destField === 'attendance' || destField.startsWith('attendance.')) {
            const count = parseCount(rawValue)
            if (count == null) continue
            const bucket: 'main' | 'kids' | 'youth' =
              mappedAud === 'MAIN'  ? 'main'  :
              mappedAud === 'KIDS'  ? 'kids'  :
              mappedAud === 'YOUTH' ? 'youth' :
              destField === 'attendance.kids'  ? 'kids'  :
              destField === 'attendance.youth' ? 'youth' : 'main'
            const attKey = occurrenceId
            const existing = attMap.get(attKey) ?? {
              service_occurrence_id: occurrenceId,
              main_attendance: null, kids_attendance: null, youth_attendance: null,
            }
            existing[`${bucket}_attendance` as 'main_attendance' | 'kids_attendance' | 'youth_attendance'] =
              (existing[`${bucket}_attendance` as 'main_attendance' | 'kids_attendance' | 'youth_attendance'] ?? 0) + count
            attMap.set(attKey, existing)
            continue
          }

          if (destField.startsWith('giving.')) {
            const code = slug(destField.slice('giving.'.length))
            const sourceId = givingByCode.get(code)
            if (!sourceId) { errors.push(`Unknown giving source "${code}" (metric "${metricName}")`); continue }
            const amount = parseMoney(rawValue)
            if (amount == null) continue
            const givKey = `${occurrenceId}:${sourceId}`
            const existing = givMap.get(givKey)
            if (existing) {
              existing.giving_amount += amount  // sum contributions
            } else {
              givMap.set(givKey, {
                service_occurrence_id: occurrenceId,
                giving_source_id:      sourceId,
                giving_amount:         amount,
                giving_type:           'total',
              })
            }
            continue
          }

          if (destField.startsWith('period_giving.')) {
            // Church-wide weekly giving (D-056) — no occurrence dependency.
            // Sum across the week, anchor to Sunday-on-or-before the row's date.
            const code = slug(destField.slice('period_giving.'.length))
            const sourceId = givingByCode.get(code)
            if (!sourceId) { errors.push(`Unknown giving source "${code}" (metric "${metricName}")`); continue }
            const amount = parseMoney(rawValue)
            if (amount == null) continue
            addPeriodGiving(sourceId, grp.date, amount)
            continue
          }

          if (destField.startsWith('period_response.')) {
            // Periodic stat — church_period_entries, no occurrence dependency.
            const tail    = destField.slice('period_response.'.length).split('.')
            const catCode = slug(tail[0])
            const tagCode = tail[1] ? tail[1].toUpperCase() : null
            const category = responseByCode.get(catCode)
            if (!category) { errors.push(`Unknown response category "${catCode}" (metric "${metricName}")`); continue }
            const periodType: 'week' | 'month' | 'day' =
              category.scope === 'month' ? 'month' :
              category.scope === 'day'   ? 'day'   : 'week'
            let tagId = tagCode ? (tagByCode.get(tagCode) ?? null) : null
            if (tagCode && !tagId) {
              // Fallback: Stage A may have used an audience-style suffix (.KIDS/.MAIN/.YOUTH)
              // when no service_tag with that code exists. Write untagged (NULL service_tag_id)
              // and log a one-time note so the user knows the row landed but unscoped.
              const warnKey = `${catCode}.${tagCode}`
              if (!warnedTagFallbacks.has(warnKey)) {
                errors.push(`Note: period_response.${catCode}.${tagCode} → no "${tagCode}" service tag exists; row(s) stored church-wide (no tag).`)
                warnedTagFallbacks.add(warnKey)
              }
              tagId = null
            }
            const value = parseCount(rawValue)
            if (value == null) continue
            addPeriodStat(category.id, tagId, periodType, grp.date, value)
            continue
          }

          if (destField.startsWith('response.')) {
            const code = slug(destField.slice('response.'.length))
            const category = responseByCode.get(code)
            if (!category) { errors.push(`Unknown response category "${code}" (metric "${metricName}")`); continue }
            const statValue = parseCount(rawValue)
            if (statValue == null) continue

            // V1-Δ2: bidirectional stat_scope ↔ dest_field coercion.
            // If Stage A produced response.<CODE> but the category is period-scoped
            // (week/month/day), the data belongs in church_period_entries, not
            // response_entries. Coerce silently and log one note per (cat, scope) pair.
            if (category.scope === 'week' || category.scope === 'month' || category.scope === 'day') {
              const coerceKey = `coerce:${code}:${category.scope}`
              if (!warnedTagFallbacks.has(coerceKey)) {
                errors.push(`Note: response.${code} (stat_scope=${category.scope}) coerced to period_response.${code}; row(s) stored as church-wide periodic.`)
                warnedTagFallbacks.add(coerceKey)
              }
              addPeriodStat(category.id, null, category.scope, grp.date, statValue)
              continue
            }

            const audience = mappedAud && ['MAIN', 'KIDS', 'YOUTH'].includes(mappedAud)
              ? mappedAud : null
            const respKey = `${occurrenceId}:${category.id}:${audience ?? ''}`
            const existing = respMap.get(respKey)
            if (existing) {
              existing.stat_value += statValue  // sum duplicates from multiple Groups
            } else {
              respMap.set(respKey, {
                service_occurrence_id: occurrenceId,
                response_category_id:  category.id,
                audience_group_code:   audience,
                stat_value:            statValue,
                is_not_applicable:     false,
              })
            }
            continue
          }

          if (destField.startsWith('volunteer.')) {
            const code = slug(destField.slice('volunteer.'.length))
            const categoryId = volunteerByCode.get(code)
            if (!categoryId) { errors.push(`Unknown volunteer category "${code}" (metric "${metricName}")`); continue }
            const count = parseCount(rawValue)
            if (count == null) continue
            const volKey = `${occurrenceId}:${categoryId}`
            const existing = volMap.get(volKey)
            if (existing) {
              existing.volunteer_count += count
            } else {
              volMap.set(volKey, {
                service_occurrence_id: occurrenceId,
                volunteer_category_id: categoryId,
                volunteer_count:       count,
                is_not_applicable:     false,
              })
            }
            continue
          }
        }
      }

      const respBatch = Array.from(respMap.values())
      const attBatch  = Array.from(attMap.values())
      const givBatch  = Array.from(givMap.values())
      const volBatch  = Array.from(volMap.values())

      // Flush response_entries in chunks of 500
      const CHUNK = 500
      for (let i = 0; i < respBatch.length; i += CHUNK) {
        const chunk = respBatch.slice(i, i + CHUNK)
        const withAudience    = chunk.filter(r => r.audience_group_code !== null)
        const withoutAudience = chunk.filter(r => r.audience_group_code === null)
        if (withAudience.length > 0) {
          const { error } = await args.supabase.from('response_entries')
            .upsert(withAudience, { onConflict: 'service_occurrence_id,response_category_id,audience_group_code' })
          if (error) errors.push(`response batch upsert (audience): ${error.message}`)
          else counts.response += withAudience.length
        }
        if (withoutAudience.length > 0) {
          const { error } = await args.supabase.from('response_entries')
            .upsert(withoutAudience, { onConflict: 'service_occurrence_id,response_category_id' })
          if (error) errors.push(`response batch upsert (service): ${error.message}`)
          else counts.response += withoutAudience.length
        }
      }

      // Flush attendance_entries in chunks of 500
      for (let i = 0; i < attBatch.length; i += CHUNK) {
        const chunk = attBatch.slice(i, i + CHUNK)
        const { error } = await args.supabase.from('attendance_entries')
          .upsert(chunk, { onConflict: 'service_occurrence_id' })
        if (error) errors.push(`attendance batch upsert: ${error.message}`)
        else counts.attendance += chunk.length
      }

      // Flush giving_entries in chunks of 500
      for (let i = 0; i < givBatch.length; i += CHUNK) {
        const chunk = givBatch.slice(i, i + CHUNK)
        const { error } = await args.supabase.from('giving_entries')
          .upsert(chunk, { onConflict: 'service_occurrence_id,giving_source_id' })
        if (error) errors.push(`giving batch upsert: ${error.message}`)
        else counts.giving += chunk.length
      }

      // Flush volunteer_entries in chunks of 500
      for (let i = 0; i < volBatch.length; i += CHUNK) {
        const chunk = volBatch.slice(i, i + CHUNK)
        const { error } = await args.supabase.from('volunteer_entries')
          .upsert(chunk, { onConflict: 'service_occurrence_id,volunteer_category_id' })
        if (error) errors.push(`volunteer batch upsert: ${error.message}`)
        else counts.volunteer += chunk.length
      }

      continue  // done with tall format — skip wide extraction below
    }

    // ── WIDE FORMAT (one row per occurrence) ──────────────────────────────────

    // Detect rows that only carry period_giving destinations — these don't need
    // an occurrence (D-056). We process them up front and skip the occurrence path
    // for rows where every non-meta column is period_giving or ignore.
    const META_DESTS = new Set([
      'service_date', 'service_template_code', 'location_code', 'ignore',
    ])
    const isPeriodOnly = (dest: string) =>
      dest.startsWith('period_giving.') || dest.startsWith('period_response.')
    const hasNonPeriodGivingPayload = mapping.column_map.some(c =>
      !META_DESTS.has(c.dest_field) && !isPeriodOnly(c.dest_field)
    )
    const hasPeriodGivingPayload = mapping.column_map.some(c =>
      c.dest_field.startsWith('period_giving.')
    )
    const hasPeriodStatPayload = mapping.column_map.some(c =>
      c.dest_field.startsWith('period_response.')
    )

    // Codex Finding 3 fix: wide format previously did direct upserts row-by-row.
    // If two rows hit the same conflict key, the later upsert OVERWROTE the first
    // (data loss). Now we accumulate by conflict key in maps, then flush in a single
    // pass per table — matches the tall-format aggregation pattern.
    type WideAttRow = {
      service_occurrence_id: string
      main_attendance:  number | null
      kids_attendance:  number | null
      youth_attendance: number | null
    }
    type WideGivRow = {
      service_occurrence_id: string
      giving_source_id:      string
      giving_amount:         number
      giving_type:           string
    }
    type WideVolRow = {
      service_occurrence_id: string
      volunteer_category_id: string
      volunteer_count:       number
      is_not_applicable:     boolean
    }
    type WideRespRow = {
      service_occurrence_id: string
      response_category_id:  string
      audience_group_code:   string | null
      stat_value:            number
      is_not_applicable:     boolean
    }
    const wideAttMap  = new Map<string, WideAttRow>()
    const wideGivMap  = new Map<string, WideGivRow>()
    const wideVolMap  = new Map<string, WideVolRow>()
    const wideRespMap = new Map<string, WideRespRow>()

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

      // Period-giving extraction (runs regardless of occurrence requirements).
      if (hasPeriodGivingPayload) {
        for (const entry of mapping.column_map) {
          if (!entry.dest_field.startsWith('period_giving.')) continue
          const code = slug(entry.dest_field.slice('period_giving.'.length))
          const sourceId = givingByCode.get(code)
          if (!sourceId) { errors.push(`Unknown giving source "${code}" (row ${rowIdx + 2})`); continue }
          const amount = parseMoney(row[entry.source_column])
          if (amount == null) continue
          addPeriodGiving(sourceId, serviceDate, amount)
        }
      }

      // Period-stat extraction (church_period_entries — runs regardless of occurrence requirements).
      if (hasPeriodStatPayload) {
        for (const entry of mapping.column_map) {
          if (!entry.dest_field.startsWith('period_response.')) continue
          // dest_field: "period_response.<CODE>" or "period_response.<CODE>.<TAG_CODE>"
          const tail     = entry.dest_field.slice('period_response.'.length).split('.')
          const catCode  = slug(tail[0])
          const tagCode  = tail[1] ? tail[1].toUpperCase() : null
          const category = responseByCode.get(catCode)
          if (!category) { errors.push(`Unknown response category "${catCode}" (row ${rowIdx + 2})`); continue }
          const periodType: 'week' | 'month' | 'day' =
            category.scope === 'month' ? 'month' :
            category.scope === 'day'   ? 'day'   : 'week'
          let tagId = tagCode ? (tagByCode.get(tagCode) ?? null) : null
          if (tagCode && !tagId) {
            const warnKey = `${catCode}.${tagCode}`
            if (!warnedTagFallbacks.has(warnKey)) {
              errors.push(`Note: period_response.${catCode}.${tagCode} → no "${tagCode}" service tag exists; row(s) stored church-wide (no tag).`)
              warnedTagFallbacks.add(warnKey)
            }
            tagId = null
          }
          const value = parseCount(row[entry.source_column])
          if (value == null) continue
          addPeriodStat(category.id, tagId, periodType, serviceDate, value)
        }
      }

      // If the row carries no service-tied payload, skip occurrence creation.
      if (!hasNonPeriodGivingPayload) continue

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
      const occurrenceId = await upsertOccurrence(args.supabase, {
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

      // Build attendance from row
      const attendance: { main: number | null; kids: number | null; youth: number | null } = {
        main: null, kids: null, youth: null,
      }
      let hasAttendance = false

      for (const entry of mapping.column_map) {
        const raw = row[entry.source_column]
        const dest = entry.dest_field

        if (dest === 'ignore' || dest === 'service_date'
            || dest === 'service_template_code' || dest === 'location_code') continue

        // period_giving and period_response were already handled before the occurrence path; skip here
        if (dest.startsWith('period_giving.') || dest.startsWith('period_response.')) continue

        if (dest.startsWith('attendance.')) {
          const bucket = dest.slice('attendance.'.length) as 'main' | 'kids' | 'youth'
          const n = parseCount(raw)
          if (n != null) { attendance[bucket] = n; hasAttendance = true }
          continue
        }

        if (dest.startsWith('giving.')) {
          const code = slug(dest.slice('giving.'.length))
          const sourceId = givingByCode.get(code)
          if (!sourceId) { errors.push(`Unknown giving source "${code}"`); continue }
          const amount = parseMoney(raw)
          if (amount == null) continue
          const givKey = `${occurrenceId}:${sourceId}`
          const existing = wideGivMap.get(givKey)
          if (existing) {
            existing.giving_amount += amount  // sum duplicates per (occurrence, source)
          } else {
            wideGivMap.set(givKey, {
              service_occurrence_id: occurrenceId,
              giving_source_id:      sourceId,
              giving_amount:         amount,
              giving_type:           'total',
            })
          }
          continue
        }

        if (dest.startsWith('volunteer.')) {
          const code = slug(dest.slice('volunteer.'.length))
          const categoryId = volunteerByCode.get(code)
          if (!categoryId) { errors.push(`Unknown volunteer category "${code}"`); continue }
          const count = parseCount(raw)
          if (count == null) continue
          const volKey = `${occurrenceId}:${categoryId}`
          const existing = wideVolMap.get(volKey)
          if (existing) {
            existing.volunteer_count += count  // sum duplicates per (occurrence, category)
          } else {
            wideVolMap.set(volKey, {
              service_occurrence_id: occurrenceId,
              volunteer_category_id: categoryId,
              volunteer_count:       count,
              is_not_applicable:     false,
            })
          }
          continue
        }

        if (dest.startsWith('response.')) {
          const tail   = dest.slice('response.'.length).split('.')
          const code   = slug(tail[0])
          const audRaw = tail[1]
          const category = responseByCode.get(code)
          if (!category) { errors.push(`Unknown response category "${code}"`); continue }
          const statValue = parseCount(raw)
          if (statValue == null) continue

          // V1-Δ2: stat_scope coercion (wide-format path).
          // If category is period-scoped, route to church_period_entries instead.
          if (category.scope === 'week' || category.scope === 'month' || category.scope === 'day') {
            const coerceKey = `coerce:${code}:${category.scope}`
            if (!warnedTagFallbacks.has(coerceKey)) {
              errors.push(`Note: response.${code} (stat_scope=${category.scope}) coerced to period_response.${code}; row(s) stored as church-wide periodic.`)
              warnedTagFallbacks.add(coerceKey)
            }
            addPeriodStat(category.id, null, category.scope, serviceDate, statValue)
            continue
          }

          const audience: string | null =
            category.scope === 'audience'
              ? (audRaw && ['MAIN', 'KIDS', 'YOUTH'].includes(audRaw.toUpperCase())
                  ? audRaw.toUpperCase()
                  : 'MAIN')
              : null

          const respKey = `${occurrenceId}:${category.id}:${audience ?? ''}`
          const existing = wideRespMap.get(respKey)
          if (existing) {
            existing.stat_value += statValue  // sum duplicates per (occurrence, category, audience)
          } else {
            wideRespMap.set(respKey, {
              service_occurrence_id: occurrenceId,
              response_category_id:  category.id,
              audience_group_code:   audience,
              stat_value:            statValue,
              is_not_applicable:     false,
            })
          }
          continue
        }
      }

      if (hasAttendance) {
        const attKey = occurrenceId
        const existingAtt = wideAttMap.get(attKey)
        if (existingAtt) {
          // Sum partial attendance rows (rare: multiple wide rows for same occurrence)
          existingAtt.main_attendance  = sumNullable(existingAtt.main_attendance,  attendance.main)
          existingAtt.kids_attendance  = sumNullable(existingAtt.kids_attendance,  attendance.kids)
          existingAtt.youth_attendance = sumNullable(existingAtt.youth_attendance, attendance.youth)
        } else {
          wideAttMap.set(attKey, {
            service_occurrence_id: occurrenceId,
            main_attendance:       attendance.main,
            kids_attendance:       attendance.kids,
            youth_attendance:      attendance.youth,
          })
        }
      }
    }

    // Flush wide-format accumulators in chunks (Codex Finding 3 fix).
    const CHUNK = 500
    for (let i = 0; i < wideAttMap.size; i += CHUNK) {
      const chunk = Array.from(wideAttMap.values()).slice(i, i + CHUNK)
      if (chunk.length === 0) break
      const { error } = await args.supabase
        .from('attendance_entries')
        .upsert(chunk, { onConflict: 'service_occurrence_id' })
      if (error) errors.push(`wide attendance flush: ${error.message}`)
      else counts.attendance += chunk.length
    }
    for (let i = 0; i < wideGivMap.size; i += CHUNK) {
      const chunk = Array.from(wideGivMap.values()).slice(i, i + CHUNK)
      if (chunk.length === 0) break
      const { error } = await args.supabase
        .from('giving_entries')
        .upsert(chunk, { onConflict: 'service_occurrence_id,giving_source_id' })
      if (error) errors.push(`wide giving flush: ${error.message}`)
      else counts.giving += chunk.length
    }
    for (let i = 0; i < wideVolMap.size; i += CHUNK) {
      const chunk = Array.from(wideVolMap.values()).slice(i, i + CHUNK)
      if (chunk.length === 0) break
      const { error } = await args.supabase
        .from('volunteer_entries')
        .upsert(chunk, { onConflict: 'service_occurrence_id,volunteer_category_id' })
      if (error) errors.push(`wide volunteer flush: ${error.message}`)
      else counts.volunteer += chunk.length
    }
    // Response: split by audience-tagged vs untagged for the conflict target
    const wideRespRows = Array.from(wideRespMap.values())
    const wideRespAudienced = wideRespRows.filter(r => r.audience_group_code !== null)
    const wideRespPlain = wideRespRows.filter(r => r.audience_group_code === null)
    for (let i = 0; i < wideRespAudienced.length; i += CHUNK) {
      const chunk = wideRespAudienced.slice(i, i + CHUNK)
      const { error } = await args.supabase
        .from('response_entries')
        .upsert(chunk, { onConflict: 'service_occurrence_id,response_category_id,audience_group_code' })
      if (error) errors.push(`wide response (audienced) flush: ${error.message}`)
      else counts.response += chunk.length
    }
    for (let i = 0; i < wideRespPlain.length; i += CHUNK) {
      const chunk = wideRespPlain.slice(i, i + CHUNK)
      const { error } = await args.supabase
        .from('response_entries')
        .upsert(chunk, { onConflict: 'service_occurrence_id,response_category_id' })
      if (error) errors.push(`wide response (plain) flush: ${error.message}`)
      else counts.response += chunk.length
    }
  }

  // ---------- 4. Flush church_period_giving (D-056) ----------
  if (pgMap.size > 0) {
    const pgBatch = Array.from(pgMap.values())
    const CHUNK = 500
    for (let i = 0; i < pgBatch.length; i += CHUNK) {
      const chunk = pgBatch.slice(i, i + CHUNK)
      const { error } = await args.supabase.from('church_period_giving')
        .upsert(chunk, { onConflict: 'church_id,giving_source_id,entry_period_type,period_date' })
      if (error) errors.push(`period giving batch upsert: ${error.message}`)
      else counts.period_giving += chunk.length
    }
  }

  // ---------- 5. Flush church_period_entries ----------
  // Codex Finding 5: count successful period_response inserts so the import summary
  // accurately reflects what landed (was previously silent).
  if (psMap.size > 0) {
    const CHUNK = 500
    const psBatch  = Array.from(psMap.values())
    // Partial indexes require tagged and untagged rows to use different conflict columns
    const tagged   = psBatch.filter(r => r.service_tag_id !== null)
    const untagged = psBatch.filter(r => r.service_tag_id === null)
    for (let i = 0; i < tagged.length; i += CHUNK) {
      const chunk = tagged.slice(i, i + CHUNK)
      const { error } = await args.supabase.from('church_period_entries')
        .upsert(chunk, { onConflict: 'church_id,service_tag_id,response_category_id,entry_period_type,period_date' })
      if (error) errors.push(`period stat (tagged) batch upsert: ${error.message}`)
      else counts.period_response += chunk.length
    }
    for (let i = 0; i < untagged.length; i += CHUNK) {
      const chunk = untagged.slice(i, i + CHUNK)
      const { error } = await args.supabase.from('church_period_entries')
        .upsert(chunk, { onConflict: 'church_id,response_category_id,entry_period_type,period_date' })
      if (error) errors.push(`period stat (untagged) batch upsert: ${error.message}`)
      else counts.period_response += chunk.length
    }
  }

  return { totalCents: setupResult.totalCents, setupSummary, rowsInserted: counts, errors }
}

// ---------- helpers ----------

/** Sum two nullable numbers; null + null = null; null + n = n. */
function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

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
    .from('service_occurrences')
    .select('id')
    .eq('church_id',           args.churchId)
    .eq('location_id',         args.locationId)
    .eq('service_template_id', args.templateId)
    .eq('service_date',        args.serviceDate)
    .maybeSingle()
  if (existing.data) return existing.data.id

  const { data, error } = await supabase
    .from('service_occurrences')
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
