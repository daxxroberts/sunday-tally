/**
 * POST /api/history/save
 *
 * Save handler for the dynamic History grid (HistoryGrid component).
 * Decodes a flat list of (key, value) edits where the key follows
 * grid-builder.ts's row-id format:
 *
 *   ${rowType}-${anchor.toISOString()}-${metricId | serviceTemplateCode}-${columnId}
 *
 * Dispatches by rowType + columnId prefix to the same tables Stage B writes
 * to (attendance/volunteer/response/giving entries, church_period_giving,
 * church_period_entries) using the existing dest_field grammar conventions.
 *
 * Empty-string values DELETE the row (D-003: NULL ≠ 0).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'

interface ChangeEntry {
  key:   string
  value: unknown
}

interface DecodedKey {
  rowType:  'SV' | 'WK' | 'MO'
  anchorIso: string  // full ISO datetime
  third:    string   // metricId for WK/MO, serviceTemplateCode for SV
  columnId: string
}

/**
 * Parse "SV-2026-04-26T05:00:00.000Z-sunday_9am-attendance.main"
 * into { rowType, anchorIso, third, columnId } when possible.
 * Returns null when the row type isn't editable (headers) or format is wrong.
 */
function decodeKey(key: string): DecodedKey | null {
  const parts = key.split('-')
  if (parts.length !== 6) return null
  const rowType = parts[0]
  if (rowType !== 'SV' && rowType !== 'WK' && rowType !== 'MO') return null
  const anchorIso = `${parts[1]}-${parts[2]}-${parts[3]}`
  return {
    rowType,
    anchorIso,
    third:    parts[4],
    columnId: parts[5],
  }
}

function isoToDateOnly(iso: string): string {
  // "2026-04-26T05:00:00.000Z" → "2026-04-26"
  return new Date(iso).toISOString().slice(0, 10)
}

function sundayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

function firstOfMonth(isoDate: string): string {
  return isoDate.slice(0, 7) + '-01'
}

function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const cleaned = String(raw).replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function parseInteger(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const cleaned = String(raw).replace(/[,\s]/g, '')
  const n = Number(cleaned)
  return Number.isInteger(n) && n >= 0 ? n : null
}

interface CodeMaps {
  templateUuidByCode: Map<string, string>
  templateLocationId: Map<string, string>  // template_code → location_id (for occurrence creation)
  categoryByCode:     Map<string, { id: string; scope: string }>
  sourceUuidByCode:   Map<string, string>
  volCatUuidByCode:   Map<string, string>
}

async function loadCodeMaps(
  supabase: SupabaseClient,
  churchId: string,
): Promise<CodeMaps> {
  const [tmpl, resp, src, vol] = await Promise.all([
    supabase.from('service_templates')
      .select('id, service_code, location_id')
      .eq('church_id', churchId),
    supabase.from('response_categories')
      .select('id, category_code, stat_scope')
      .eq('church_id', churchId),
    supabase.from('giving_sources')
      .select('id, source_code')
      .eq('church_id', churchId),
    supabase.from('volunteer_categories')
      .select('id, category_code')
      .eq('church_id', churchId),
  ])

  const m: CodeMaps = {
    templateUuidByCode: new Map(),
    templateLocationId: new Map(),
    categoryByCode:     new Map(),
    sourceUuidByCode:   new Map(),
    volCatUuidByCode:   new Map(),
  }
  for (const r of tmpl.data ?? []) {
    m.templateUuidByCode.set(r.service_code, r.id)
    m.templateLocationId.set(r.service_code, r.location_id)
  }
  for (const r of resp.data ?? []) m.categoryByCode.set(r.category_code, { id: r.id, scope: r.stat_scope })
  for (const r of src.data  ?? []) m.sourceUuidByCode.set(r.source_code, r.id)
  for (const r of vol.data  ?? []) m.volCatUuidByCode.set(r.category_code, r.id)
  return m
}

async function findOrCreateOccurrence(
  supabase:    SupabaseClient,
  churchId:    string,
  templateUuid:string,
  locationId:  string,
  serviceDate: string,
): Promise<string | null> {
  const existing = await supabase
    .from('service_occurrences')
    .select('id')
    .eq('church_id',           churchId)
    .eq('service_template_id', templateUuid)
    .eq('location_id',         locationId)
    .eq('service_date',        serviceDate)
    .maybeSingle()
  if (existing.data) return existing.data.id

  const { data, error } = await supabase
    .from('service_occurrences')
    .insert({
      church_id:           churchId,
      service_template_id: templateUuid,
      location_id:         locationId,
      service_date:        serviceDate,
      status:              'active',
    })
    .select('id')
    .single()
  if (error) return null
  return data?.id ?? null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json() as { church_id?: string; changes?: ChangeEntry[] }
  if (!body.church_id || !Array.isArray(body.changes)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('role')
    .eq('user_id',   user.id)
    .eq('church_id', body.church_id)
    .eq('is_active', true)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!['owner', 'admin', 'editor'].includes(membership.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const codeMaps = await loadCodeMaps(supabase, body.church_id)
  const errors:  string[] = []
  const counts = { attendance: 0, response: 0, giving: 0, volunteer: 0, period_giving: 0, period_response: 0 }

  for (const entry of body.changes) {
    const decoded = decodeKey(entry.key)
    if (!decoded) {
      errors.push(`Bad key: ${entry.key}`)
      continue
    }

    const { rowType, anchorIso, third, columnId } = decoded
    const dateOnly = isoToDateOnly(anchorIso)

    // ── SV row dispatch ────────────────────────────────────────────────────
    if (rowType === 'SV') {
      // Skip computed columns (read-only)
      if (columnId === 'giving.total' || columnId === 'volunteer.total') continue

      const templateCode = third
      const templateUuid = codeMaps.templateUuidByCode.get(templateCode)
      const locationId   = codeMaps.templateLocationId.get(templateCode)
      if (!templateUuid || !locationId) {
        errors.push(`Unknown service template "${templateCode}"`)
        continue
      }

      const occId = await findOrCreateOccurrence(
        supabase, body.church_id, templateUuid, locationId, dateOnly,
      )
      if (!occId) {
        errors.push(`Failed to find/create occurrence for ${templateCode} ${dateOnly}`)
        continue
      }

      // attendance.main / .kids / .youth
      if (columnId.startsWith('attendance.')) {
        const field = columnId.slice('attendance.'.length) as 'main' | 'kids' | 'youth'
        const colName = `${field}_attendance`
        const numVal = parseInteger(entry.value)
        // Upsert with the specified column set; preserves other audience values
        const { error } = await supabase
          .from('attendance_entries')
          .upsert(
            {
              service_occurrence_id: occId,
              [colName]:             numVal,
              last_updated_by:       user.id,
            },
            { onConflict: 'service_occurrence_id' },
          )
        if (error) errors.push(`attendance ${field}: ${error.message}`)
        else counts.attendance++
        continue
      }

      // giving.<source_code>
      if (columnId.startsWith('giving.')) {
        const code = columnId.slice('giving.'.length)
        const sourceUuid = codeMaps.sourceUuidByCode.get(code)
        if (!sourceUuid) { errors.push(`Unknown giving source "${code}"`); continue }
        const amount = parseNumber(entry.value)
        if (amount === null) {
          // Empty value → delete the row
          await supabase.from('giving_entries')
            .delete()
            .eq('service_occurrence_id', occId)
            .eq('giving_source_id',      sourceUuid)
        } else {
          const { error } = await supabase.from('giving_entries')
            .upsert(
              {
                service_occurrence_id: occId,
                giving_source_id:      sourceUuid,
                giving_amount:         amount,
                submitted_by:          user.id,
              },
              { onConflict: 'service_occurrence_id,giving_source_id' },
            )
          if (error) errors.push(`giving ${code}: ${error.message}`)
        }
        counts.giving++
        continue
      }

      // volunteer.<category_code>
      if (columnId.startsWith('volunteer.')) {
        const code = columnId.slice('volunteer.'.length)
        const catUuid = codeMaps.volCatUuidByCode.get(code)
        if (!catUuid) { errors.push(`Unknown volunteer category "${code}"`); continue }
        const count = parseInteger(entry.value)
        if (count === null) {
          await supabase.from('volunteer_entries')
            .delete()
            .eq('service_occurrence_id', occId)
            .eq('volunteer_category_id', catUuid)
        } else {
          const { error } = await supabase.from('volunteer_entries')
            .upsert(
              {
                service_occurrence_id: occId,
                volunteer_category_id: catUuid,
                volunteer_count:       count,
                is_not_applicable:     false,
                created_by:            user.id,
              },
              { onConflict: 'service_occurrence_id,volunteer_category_id' },
            )
          if (error) errors.push(`volunteer ${code}: ${error.message}`)
        }
        counts.volunteer++
        continue
      }

      // response.<category_code> or response.<category_code>.<MAIN|KIDS|YOUTH>
      if (columnId.startsWith('response.')) {
        const tail   = columnId.slice('response.'.length).split('.')
        const code   = tail[0]
        const audRaw = tail[1]
        const audience = audRaw && ['MAIN', 'KIDS', 'YOUTH'].includes(audRaw) ? audRaw : null
        const cat = codeMaps.categoryByCode.get(code)
        if (!cat) { errors.push(`Unknown response category "${code}"`); continue }
        const value = parseInteger(entry.value)
        if (value === null) {
          // Empty → delete (DELETE+INSERT pattern from IRIS map)
          let q = supabase.from('response_entries')
            .delete()
            .eq('service_occurrence_id', occId)
            .eq('response_category_id', cat.id)
          q = audience === null ? q.is('audience_group_code', null) : q.eq('audience_group_code', audience)
          await q
        } else {
          // Use DELETE+INSERT semantics for service-scope (audience NULL) per IRIS map
          // Audience-scope can use UPSERT.
          if (audience === null) {
            await supabase.from('response_entries')
              .delete()
              .eq('service_occurrence_id', occId)
              .eq('response_category_id', cat.id)
              .is('audience_group_code', null)
            const { error } = await supabase.from('response_entries')
              .insert({
                service_occurrence_id: occId,
                response_category_id:  cat.id,
                stat_value:            value,
                audience_group_code:   null,
                is_not_applicable:     false,
                created_by:            user.id,
              })
            if (error) errors.push(`response ${code}: ${error.message}`)
          } else {
            const { error } = await supabase.from('response_entries')
              .upsert(
                {
                  service_occurrence_id: occId,
                  response_category_id:  cat.id,
                  stat_value:            value,
                  audience_group_code:   audience,
                  is_not_applicable:     false,
                  created_by:            user.id,
                },
                { onConflict: 'service_occurrence_id,response_category_id,audience_group_code' },
              )
            if (error) errors.push(`response ${code}.${audience}: ${error.message}`)
          }
        }
        counts.response++
        continue
      }

      errors.push(`Unhandled SV columnId "${columnId}"`)
      continue
    }

    // ── WK row dispatch ────────────────────────────────────────────────────
    if (rowType === 'WK') {
      const sundayDate = sundayOfWeek(dateOnly)
      const metricId = third  // wk_giving_<source_code> | wk_<category_code>

      if (metricId.startsWith('wk_giving_')) {
        const code = metricId.slice('wk_giving_'.length)
        const sourceUuid = codeMaps.sourceUuidByCode.get(code)
        if (!sourceUuid) { errors.push(`Unknown giving source "${code}"`); continue }
        const amount = parseNumber(entry.value)
        if (amount === null) {
          await supabase.from('church_period_giving').delete()
            .eq('church_id',         body.church_id)
            .eq('giving_source_id',  sourceUuid)
            .eq('entry_period_type', 'week')
            .eq('period_date',       sundayDate)
        } else {
          const { error } = await supabase.from('church_period_giving')
            .upsert(
              {
                church_id:         body.church_id,
                giving_source_id:  sourceUuid,
                entry_period_type: 'week',
                period_date:       sundayDate,
                giving_amount:     amount,
                submitted_by:      user.id,
              },
              { onConflict: 'church_id,giving_source_id,entry_period_type,period_date' },
            )
          if (error) errors.push(`period_giving ${code}: ${error.message}`)
        }
        counts.period_giving++
        continue
      }

      if (metricId.startsWith('wk_')) {
        const code = metricId.slice('wk_'.length)
        const cat  = codeMaps.categoryByCode.get(code)
        if (!cat) { errors.push(`Unknown response category "${code}"`); continue }
        const value = parseInteger(entry.value)
        // service_tag_id IS NULL → can't UPSERT via PostgREST (NULL ≠ NULL on conflict);
        // pattern: SELECT then UPDATE/INSERT (matches T_WEEKLY_STATS P16d).
        const { data: ex } = await supabase.from('church_period_entries')
          .select('id')
          .eq('church_id',            body.church_id)
          .eq('response_category_id', cat.id)
          .eq('entry_period_type',    'week')
          .eq('period_date',          sundayDate)
          .is('service_tag_id', null)
          .maybeSingle()
        if (value === null) {
          if (ex) await supabase.from('church_period_entries').delete().eq('id', ex.id)
        } else if (ex) {
          await supabase.from('church_period_entries')
            .update({ stat_value: value, is_not_applicable: false })
            .eq('id', ex.id)
        } else {
          const { error } = await supabase.from('church_period_entries')
            .insert({
              church_id:            body.church_id,
              service_tag_id:       null,
              response_category_id: cat.id,
              entry_period_type:    'week',
              period_date:          sundayDate,
              stat_value:           value,
              is_not_applicable:    false,
            })
          if (error) errors.push(`period_response ${code}: ${error.message}`)
        }
        counts.period_response++
        continue
      }

      errors.push(`Unhandled WK metricId "${metricId}"`)
      continue
    }

    // ── MO row dispatch ────────────────────────────────────────────────────
    if (rowType === 'MO') {
      const monthStart = firstOfMonth(dateOnly)
      const metricId = third  // mo_<category_code>
      if (metricId.startsWith('mo_')) {
        const code = metricId.slice('mo_'.length)
        const cat  = codeMaps.categoryByCode.get(code)
        if (!cat) { errors.push(`Unknown response category "${code}"`); continue }
        const value = parseInteger(entry.value)
        const { data: ex } = await supabase.from('church_period_entries')
          .select('id')
          .eq('church_id',            body.church_id)
          .eq('response_category_id', cat.id)
          .eq('entry_period_type',    'month')
          .eq('period_date',          monthStart)
          .is('service_tag_id', null)
          .maybeSingle()
        if (value === null) {
          if (ex) await supabase.from('church_period_entries').delete().eq('id', ex.id)
        } else if (ex) {
          await supabase.from('church_period_entries')
            .update({ stat_value: value, is_not_applicable: false })
            .eq('id', ex.id)
        } else {
          const { error } = await supabase.from('church_period_entries')
            .insert({
              church_id:            body.church_id,
              service_tag_id:       null,
              response_category_id: cat.id,
              entry_period_type:    'month',
              period_date:          monthStart,
              stat_value:           value,
              is_not_applicable:    false,
            })
          if (error) errors.push(`period_response (month) ${code}: ${error.message}`)
        }
        counts.period_response++
        continue
      }

      errors.push(`Unhandled MO metricId "${metricId}"`)
      continue
    }
  }

  return NextResponse.json({ counts, errors })
}
