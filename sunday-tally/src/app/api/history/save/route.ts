/**
 * POST /api/history/save
 *
 * Save handler for the dynamic History grid (HistoryGrid component).
 * Decodes a flat list of (key, value) edits where the key follows
 * HistoryGrid's cell-key format:
 *
 *   ${rowType}-${anchor.toISOString()}-${third}-${columnId}
 *
 * where:
 *   rowType  = SV | WK | MO
 *   anchor   = full ISO datetime (contains its own hyphens)
 *   third    = serviceTemplateCode (SV) | weeklyMetric.id e.g. "wk_giving" (WK/MO)
 *   columnId = the grid_config leaf column id, `metric.<CODE>` (or "occurrence_tags")
 *
 * IR v2: ALL numeric data lands in `metric_entries`. We resolve the metric by
 * its `code` (the `<CODE>` in `metric.<CODE>`) for the church, then:
 *   - scope 'instance' → resolve/create the service_instance for (template, date)
 *     and upsert with service_instance_id set, period_anchor NULL.
 *   - scope 'period'   → snap the row date to its Sunday and upsert with
 *     period_anchor set, service_instance_id NULL.
 * Upsert conflict target is the single constraint
 *   uq_metric_entry (metric_id, service_instance_id, period_anchor) NULLS NOT DISTINCT.
 * reporting_tag_code is denormalized by a BEFORE-INSERT trigger — never set here.
 *
 * Empty-string / non-numeric values DELETE the entry row (D-003: NULL ≠ 0).
 *
 * Tag assignments (the `occurrence_tags` column) are NOT persisted: the unified
 * tag schema (migrations 0022/0023) dropped the per-instance tag junction table
 * and has no replacement yet. Those edits are skipped with a note rather than
 * written to a non-existent table. (Out of scope for the metric_entries cutover.)
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
  third:    string   // serviceTemplateCode for SV, weeklyMetric id for WK/MO
  columnId: string   // grid_config leaf column id (metric.<CODE> | occurrence_tags)
}

/**
 * Parse "SV-2026-04-26T05:00:00.000Z-MORNING-metric.ADULT__ATTENDANCE".
 * Anchored on the ISO timestamp so hyphens inside the third/columnId segments
 * (service codes, metric codes) don't break the split. The ISO token has a
 * fixed shape: YYYY-MM-DDTHH:MM:SS.sssZ.
 */
function decodeKey(key: string): DecodedKey | null {
  const m = key.match(
    /^(SV|WK|MO)-(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)-(.+)$/,
  )
  if (!m) return null
  const rowType = m[1] as 'SV' | 'WK' | 'MO'
  const anchorIso = m[2]
  const rest = m[3] // "<third>-<columnId>"

  // The columnId is the trailing `metric.<CODE>` or `occurrence_tags` token. Split
  // on the LAST "-metric." / "-occurrence_tags" boundary so `third` keeps any
  // hyphens it may contain.
  const idx = rest.lastIndexOf('-metric.')
  if (idx >= 0) {
    return { rowType, anchorIso, third: rest.slice(0, idx), columnId: rest.slice(idx + 1) }
  }
  const tagIdx = rest.lastIndexOf('-occurrence_tags')
  if (tagIdx >= 0) {
    return { rowType, anchorIso, third: rest.slice(0, tagIdx), columnId: 'occurrence_tags' }
  }
  return null
}

function isoToDateOnly(iso: string): string {
  // "2026-04-26T05:00:00.000Z" → "2026-04-26"
  return new Date(iso).toISOString().slice(0, 10)
}

/** Returns the ISO date string (YYYY-MM-DD) of the Sunday on or before the date. */
function sundayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const cleaned = String(raw).replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ── Code maps ──────────────────────────────────────────────────────────────────

interface MetricInfo {
  id:    string
  scope: 'instance' | 'period'
}

interface CodeMaps {
  templateUuidByCode: Map<string, string>   // service_code → service_template UUID
  templateLocationId: Map<string, string>   // service_code → location_id (for instance creation)
  metricByCode:       Map<string, MetricInfo> // metric code → { id, scope }
}

async function loadCodeMaps(
  supabase: SupabaseClient,
  churchId: string,
): Promise<CodeMaps> {
  const [tmpl, met] = await Promise.all([
    supabase.from('service_templates')
      .select('id, service_code, location_id')
      .eq('church_id', churchId),
    supabase.from('metrics')
      .select('id, code, scope, is_active')
      .eq('church_id', churchId)
      .eq('is_active', true),
  ])

  const m: CodeMaps = {
    templateUuidByCode: new Map(),
    templateLocationId: new Map(),
    metricByCode:       new Map(),
  }
  for (const r of tmpl.data ?? []) {
    m.templateUuidByCode.set(r.service_code, r.id)
    m.templateLocationId.set(r.service_code, r.location_id)
  }
  for (const r of met.data ?? []) {
    m.metricByCode.set(r.code, { id: r.id, scope: r.scope as 'instance' | 'period' })
  }
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
    .from('service_instances')
    .select('id')
    .eq('church_id',           churchId)
    .eq('service_template_id', templateUuid)
    .eq('location_id',         locationId)
    .eq('service_date',        serviceDate)
    .maybeSingle()
  if (existing.data) return existing.data.id

  const { data, error } = await supabase
    .from('service_instances')
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

/**
 * Upsert (or delete) one metric_entries row for an instance-scope metric.
 * value === null → delete the row (D-003 NULL ≠ 0).
 */
async function upsertInstanceEntry(
  supabase:  SupabaseClient,
  churchId:  string,
  metricId:  string,
  occId:     string,
  value:     number | null,
  userId:    string,
): Promise<string | null> {
  if (value === null) {
    const { error } = await supabase.from('metric_entries')
      .delete()
      .eq('metric_id', metricId)
      .eq('service_instance_id', occId)
    return error ? error.message : null
  }
  const { error } = await supabase.from('metric_entries')
    .upsert(
      {
        church_id:           churchId,
        metric_id:           metricId,
        service_instance_id: occId,
        period_anchor:       null,
        value,
        is_not_applicable:   false,
        created_by:          userId,
      },
      { onConflict: 'metric_id,service_instance_id,period_anchor' },
    )
  return error ? error.message : null
}

/**
 * Upsert (or delete) one metric_entries row for a period-scope metric.
 * value === null → delete the row (D-003 NULL ≠ 0).
 */
async function upsertPeriodEntry(
  supabase:  SupabaseClient,
  churchId:  string,
  metricId:  string,
  anchor:    string,   // Sunday YYYY-MM-DD
  value:     number | null,
  userId:    string,
): Promise<string | null> {
  if (value === null) {
    const { error } = await supabase.from('metric_entries')
      .delete()
      .eq('metric_id', metricId)
      .eq('period_anchor', anchor)
    return error ? error.message : null
  }
  const { error } = await supabase.from('metric_entries')
    .upsert(
      {
        church_id:           churchId,
        metric_id:           metricId,
        service_instance_id: null,
        period_anchor:       anchor,
        value,
        is_not_applicable:   false,
        created_by:          userId,
      },
      { onConflict: 'metric_id,service_instance_id,period_anchor' },
    )
  return error ? error.message : null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json() as { church_id?: string; changes?: ChangeEntry[] }
  if (!body.church_id || !Array.isArray(body.changes)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const churchId = body.church_id

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('role')
    .eq('user_id',   user.id)
    .eq('church_id', churchId)
    .eq('is_active', true)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!['owner', 'admin', 'editor'].includes(membership.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const codeMaps = await loadCodeMaps(supabase, churchId)
  const errors:  string[] = []
  const counts = { instance: 0, period: 0, tags: 0 }

  // Resolve a `metric.<CODE>` columnId to its metric. Returns null for the
  // non-metric tags column or unknown codes.
  const resolveMetric = (columnId: string): MetricInfo | null => {
    if (!columnId.startsWith('metric.')) return null
    const code = columnId.slice('metric.'.length)
    return codeMaps.metricByCode.get(code) ?? null
  }

  for (const entry of body.changes) {
    const decoded = decodeKey(entry.key)
    if (!decoded) {
      errors.push(`Bad key: ${entry.key}`)
      continue
    }

    const { anchorIso, third, columnId } = decoded
    const dateOnly = isoToDateOnly(anchorIso)

    // ── Tags (mass assignment) — no backing table in the unified schema ──────
    // The per-instance tag junction was dropped (0022/0023) with no replacement.
    // Skip silently-with-a-note rather than write to a non-existent table.
    if (columnId === 'occurrence_tags') {
      counts.tags++ // counted as "handled (skipped)" — no DB write
      continue
    }

    // ── Metric cells (metric.<CODE>) ─────────────────────────────────────────
    const metric = resolveMetric(columnId)
    if (!metric) { errors.push(`Unknown metric column "${columnId}"`); continue }
    const value = parseNumber(entry.value)

    if (metric.scope === 'instance') {
      // Instance-scope metrics live on SV rows. `third` is the service template code.
      const templateUuid = codeMaps.templateUuidByCode.get(third)
      const locationId   = codeMaps.templateLocationId.get(third)
      if (!templateUuid || !locationId) { errors.push(`Unknown service template "${third}"`); continue }
      const occId = await findOrCreateOccurrence(supabase, churchId, templateUuid, locationId, dateOnly)
      if (!occId) { errors.push(`Failed to find/create occurrence for ${third} ${dateOnly}`); continue }

      const err = await upsertInstanceEntry(supabase, churchId, metric.id, occId, value, user.id)
      if (err) errors.push(`metric ${columnId} (instance): ${err}`)
      else counts.instance++
      continue
    }

    // Period-scope metrics live on WK/MO rows — snap the anchor to its Sunday.
    const anchor = sundayOfWeek(dateOnly)
    const err = await upsertPeriodEntry(supabase, churchId, metric.id, anchor, value, user.id)
    if (err) errors.push(`metric ${columnId} (period): ${err}`)
    else counts.period++
  }

  return NextResponse.json({ counts, errors })
}
