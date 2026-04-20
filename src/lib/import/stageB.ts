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
- upsert_volunteer_category
- upsert_response_category
- upsert_giving_source

Call tools in dependency order (locations + tags → templates; categories + sources before row extraction). Use stable, UPPERCASE codes when one isn't provided (e.g. MAIN, MORNING, PLATE, HOSTS, FIRST_TIME_DECISION).

When all setup is in place, call the "done" tool with a short summary. Do NOT attempt to insert attendance, giving, volunteer, response, or service_occurrence rows — those are handled deterministically by the server after you finish.`

export interface ColumnMapEntry {
  source_column: string
  /**
   * dest_field grammar:
   *   "service_date"
   *   "service_template_code"
   *   "location_code"
   *   "attendance.main" | "attendance.kids" | "attendance.youth"
   *   "giving.<SOURCE_CODE>"
   *   "volunteer.<CATEGORY_CODE>"
   *   "response.<CATEGORY_CODE>"             (service-scope)
   *   "response.<CATEGORY_CODE>.<AUDIENCE>"  (audience-scope — MAIN|KIDS|YOUTH)
   *   "ignore"
   */
  dest_field: string
}

export interface ConfirmedSourceMapping {
  source_name:              string
  dest_table:               string
  date_column?:             string
  /** Fallbacks if the source does not carry per-row values. */
  default_service_template_code?: string
  default_location_code?:         string
  column_map:               ColumnMapEntry[]
}

export interface QaAnswer {
  question: string
  answer:   string
  accepted: boolean
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
  const setupUserPrompt = [
    `Confirmed setup the user accepted:`,
    JSON.stringify(args.confirmedMapping.proposed_setup ?? {}, null, 2),
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
  ])

  const locationByCode = new Map<string, string>()
  for (const r of locationsRes.data ?? []) locationByCode.set(r.code, r.id)

  const templateByCode = new Map<string, { id: string; locationId: string }>()
  for (const r of templatesRes.data ?? []) {
    templateByCode.set(r.service_code, { id: r.id, locationId: r.location_id })
  }

  const volunteerByCode = new Map<string, string>()
  for (const r of volRes.data ?? []) volunteerByCode.set(r.category_code, r.id)

  const responseByCode = new Map<string, { id: string; scope: 'audience' | 'service' }>()
  for (const r of respRes.data ?? []) {
    responseByCode.set(r.category_code, { id: r.id, scope: r.stat_scope })
  }

  const givingByCode = new Map<string, string>()
  for (const r of giveRes.data ?? []) givingByCode.set(r.source_code, r.id)

  // ---------- 3. Deterministic row extraction ----------
  const errors: string[] = []
  const counts = { occurrences: 0, attendance: 0, volunteer: 0, response: 0, giving: 0 }

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

      // Resolve per-row template + location
      const templateCol = [...fieldsByColumn.entries()].find(([, d]) => d === 'service_template_code')?.[0]
      const locationCol = [...fieldsByColumn.entries()].find(([, d]) => d === 'location_code')?.[0]

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
          const { error } = await args.supabase
            .from('giving_entries')
            .upsert({
              service_occurrence_id: occurrenceId,
              giving_source_id:      sourceId,
              giving_amount:         amount,
              giving_type:           'total',
            }, { onConflict: 'service_occurrence_id,giving_source_id' })
          if (error) errors.push(`giving ${code} row ${rowIdx + 2}: ${error.message}`)
          else counts.giving++
          continue
        }

        if (dest.startsWith('volunteer.')) {
          const code = slug(dest.slice('volunteer.'.length))
          const categoryId = volunteerByCode.get(code)
          if (!categoryId) { errors.push(`Unknown volunteer category "${code}"`); continue }
          const count = parseCount(raw)
          if (count == null) continue
          const { error } = await args.supabase
            .from('volunteer_entries')
            .upsert({
              service_occurrence_id: occurrenceId,
              volunteer_category_id: categoryId,
              volunteer_count:       count,
              is_not_applicable:     false,
            }, { onConflict: 'service_occurrence_id,volunteer_category_id' })
          if (error) errors.push(`volunteer ${code} row ${rowIdx + 2}: ${error.message}`)
          else counts.volunteer++
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

          const audience =
            category.scope === 'audience'
              ? (audRaw && ['MAIN', 'KIDS', 'YOUTH'].includes(audRaw.toUpperCase())
                  ? audRaw.toUpperCase()
                  : 'MAIN')
              : null

          const conflict = audience
            ? 'service_occurrence_id,response_category_id,audience_group_code'
            : 'service_occurrence_id,response_category_id'

          const { error } = await args.supabase
            .from('response_entries')
            .upsert({
              service_occurrence_id: occurrenceId,
              response_category_id:  category.id,
              audience_group_code:   audience,
              stat_value:            statValue,
              is_not_applicable:     false,
            }, { onConflict: conflict })
          if (error) errors.push(`response ${code} row ${rowIdx + 2}: ${error.message}`)
          else counts.response++
          continue
        }
      }

      if (hasAttendance) {
        const { error } = await args.supabase
          .from('attendance_entries')
          .upsert({
            service_occurrence_id: occurrenceId,
            main_attendance:       attendance.main,
            kids_attendance:       attendance.kids,
            youth_attendance:      attendance.youth,
          }, { onConflict: 'service_occurrence_id' })
        if (error) errors.push(`attendance row ${rowIdx + 2}: ${error.message}`)
        else counts.attendance++
      }
    }
  }

  return {
    totalCents:   setupResult.totalCents,
    setupSummary,
    rowsInserted: counts,
    errors,
  }
}

// ---------- helpers ----------

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
  const us = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/.exec(s)
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
