import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { ToolHandler } from '@/lib/ai/anthropic'

// Setup-only writer tools for Stage B (IR v2 — IMPORT_IR_V2.md).
// Claude creates locations, ministry tags, custom reporting tags, templates,
// schedule versions, and metrics. Per-row service_instance + metric_entry writes
// are executed deterministically in stageB.ts from the user-confirmed mapping —
// Claude does not author writes at row granularity. Keeps Stage B cheap and safe.
//
// metric_code → metric.id association: the `metrics` table carries a `code` column
// with UNIQUE (church_id, code) (constraint uq_metric_code). upsert_metric writes
// metric_code into that column and upserts on (church_id, code), so a re-import is
// idempotent (no duplicate metrics). Stage B Phase 2 then resolves metric_code →
// metric_id with a DIRECT lookup against `metrics.code` — no natural-key re-derivation.

type ToolMap = Record<string, ToolHandler>

const slug = (s: string, fallback = 'IMPORT') =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || fallback

export const WRITER_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'upsert_location',
    description: 'Create a church location or return the existing one (match by code).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        code: { type: 'string', description: 'Short stable identifier, e.g. MAIN' },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'upsert_ministry_tag',
    description:
      'Ensure a ministry tag exists (the WHO a tracked number is about). tag_role classifies it: ADULT_SERVICE | KIDS_MINISTRY | YOUTH_MINISTRY | OTHER. Use OTHER for church-wide/misc tags (e.g. code "CHURCH_WIDE"). parent_code links this tag under a parent ministry tag (adjacency) — omit for a root. Call parents before children.',
    input_schema: {
      type: 'object',
      properties: {
        code:        { type: 'string', description: 'Stable identifier, e.g. ADULT_9AM, LIFEKIDS, SWITCH, CHURCH_WIDE.' },
        name:        { type: 'string' },
        tag_role:    { type: 'string', enum: ['ADULT_SERVICE', 'KIDS_MINISTRY', 'YOUTH_MINISTRY', 'OTHER'] },
        parent_code: { type: 'string', description: 'Code of an existing parent ministry tag, or omit for a root tag.' },
      },
      required: ['code', 'name', 'tag_role'],
    },
  },
  {
    name: 'upsert_reporting_tag',
    description:
      'Ensure a CUSTOM reporting dimension exists. NEVER call this for the 4 system tags (ATTENDANCE, VOLUNTEERS, GIVING, RESPONSE_STAT) — they are pre-seeded; reference them by code in upsert_metric. Only use this for a custom dimension the church tracks that none of the 4 cover.',
    input_schema: {
      type: 'object',
      properties: {
        code:        { type: 'string', description: 'Stable identifier; must NOT be a system code.' },
        name:        { type: 'string' },
        unit_kind:   { type: 'string', enum: ['count', 'currency'] },
        agg_default: { type: 'string', enum: ['sum', 'avg'] },
      },
      required: ['code', 'name', 'unit_kind', 'agg_default'],
    },
  },
  {
    name: 'upsert_service_template',
    description: 'Ensure a service template exists. Links to an existing location (by location_code) and primary ministry tag (by primary_tag_code).',
    input_schema: {
      type: 'object',
      properties: {
        service_code:     { type: 'string', description: 'Stable identifier, unique within (church, location).' },
        display_name:     { type: 'string' },
        location_code:    { type: 'string' },
        primary_tag_code: { type: 'string', description: 'A ministry tag code created via upsert_ministry_tag.' },
        day_of_week:      { type: 'integer', minimum: 0, maximum: 6, description: '0=Sunday … 6=Saturday' },
        start_time:       { type: 'string', description: '24-hour HH:MM or null.' },
      },
      required: ['service_code', 'display_name', 'location_code', 'primary_tag_code'],
    },
  },
  {
    name: 'upsert_service_schedule_version',
    description:
      'Set the meeting day and start time for an existing service template. Required after upsert_service_template — without a schedule version, the service will not appear as a "scheduled" card on T1 or be projectable on the dashboard. Call this once per template.',
    input_schema: {
      type: 'object',
      properties: {
        service_code:         { type: 'string', description: 'Code of the existing template (must already exist).' },
        location_code:        { type: 'string', description: 'Location_code of the existing template.' },
        day_of_week:          { type: 'integer', minimum: 0, maximum: 6, description: '0=Sunday, 1=Monday, ..., 6=Saturday' },
        start_time:           { type: 'string', description: '24-hour HH:MM or HH:MM:SS, e.g. "09:00", "18:30", or "19:00:00".' },
        effective_start_date: { type: 'string', description: 'ISO date YYYY-MM-DD when this schedule begins. Defaults to today.' },
      },
      required: ['service_code', 'location_code', 'day_of_week', 'start_time'],
    },
  },
  {
    name: 'upsert_metric',
    description:
      'Ensure a metric exists. A metric = (ministry_tag × reporting_tag × scope) and defines ONE tracked number. ministry_tag_code must be a ministry tag created via upsert_ministry_tag. reporting_tag_code is one of the 4 system codes (ATTENDANCE, VOLUNTEERS, GIVING, RESPONSE_STAT) or a custom code from upsert_reporting_tag. scope: "instance" (per service occurrence) | "period" (per church-week). At most ONE metric per (ministry_tag, reporting_tag) pair may be is_canonical.',
    input_schema: {
      type: 'object',
      properties: {
        metric_code:       { type: 'string', description: 'Stable identifier, unique per church. Convention: <MINISTRY>__<REPORTING>[__<SUFFIX>].' },
        name:              { type: 'string' },
        ministry_tag_code: { type: 'string' },
        reporting_tag_code: { type: 'string' },
        scope:             { type: 'string', enum: ['instance', 'period'] },
        is_canonical:      { type: 'boolean' },
      },
      required: ['metric_code', 'name', 'ministry_tag_code', 'reporting_tag_code', 'scope', 'is_canonical'],
    },
  },
  {
    name: 'done',
    description: 'Call once all required setup entities exist. Include a short summary of what was created.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
]

export const WRITER_HANDLERS: ToolMap = {
  upsert_location: async (input, ctx) => {
    const name = String(input.name)
    const code = slug(String(input.code ?? input.name), 'LOC')

    const existing = await ctx.supabase
      .from('church_locations')
      .select('id, code')
      .eq('church_id', ctx.churchId)
      .eq('code', code)
      .maybeSingle()
    if (existing.data) return { id: existing.data.id, code, created: false }

    const { data, error } = await ctx.supabase
      .from('church_locations')
      .insert({ church_id: ctx.churchId, name, code })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_location failed: ${error.message}`)
    return { id: data!.id, code, created: true }
  },

  // REPLACES upsert_service_tag + upsert_tag_relationship.
  // One tool: creates the ministry tag, sets tag_role, and (if parent_code given)
  // resolves the parent → parent_tag_id (adjacency, no closure table).
  upsert_ministry_tag: async (input, ctx) => {
    const code     = slug(String(input.code), 'TAG')
    const name     = String(input.name)
    const tagRole  = String(input.tag_role)
    const VALID_ROLES = new Set(['ADULT_SERVICE', 'KIDS_MINISTRY', 'YOUTH_MINISTRY', 'OTHER'])
    if (!VALID_ROLES.has(tagRole)) {
      throw new Error(`upsert_ministry_tag: tag_role must be ADULT_SERVICE|KIDS_MINISTRY|YOUTH_MINISTRY|OTHER, got "${input.tag_role}"`)
    }

    let parentTagId: string | null = null
    if (input.parent_code) {
      const parentCode = slug(String(input.parent_code), 'TAG')
      const { data: parent } = await ctx.supabase
        .from('service_tags')
        .select('id')
        .eq('church_id', ctx.churchId)
        .eq('code', parentCode)
        .maybeSingle()
      if (!parent) throw new Error(`Unknown parent_code "${parentCode}". Call upsert_ministry_tag for the parent first.`)
      parentTagId = parent.id
    }

    const existing = await ctx.supabase
      .from('service_tags')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('code', code)
      .maybeSingle()

    if (existing.data) {
      await ctx.supabase
        .from('service_tags')
        .update({ name, tag_role: tagRole, parent_tag_id: parentTagId, is_active: true })
        .eq('id', existing.data.id)
      return { id: existing.data.id, code, created: false }
    }

    const { data, error } = await ctx.supabase
      .from('service_tags')
      .insert({
        church_id:     ctx.churchId,
        code,
        name,
        tag_role:      tagRole,
        parent_tag_id: parentTagId,
        is_custom:     true,
        is_active:     true,
      })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_ministry_tag failed: ${error.message}`)
    return { id: data!.id, code, created: true }
  },

  // CUSTOM reporting tags only. System rows (is_system=true) are pre-seeded and
  // must never be touched; idempotent on (church_id, code).
  upsert_reporting_tag: async (input, ctx) => {
    const code       = slug(String(input.code), 'RPT')
    const name       = String(input.name)
    const unitKind   = String(input.unit_kind)
    const aggDefault = String(input.agg_default)
    if (!['count', 'currency'].includes(unitKind)) {
      throw new Error(`upsert_reporting_tag: unit_kind must be count|currency, got "${input.unit_kind}"`)
    }
    if (!['sum', 'avg'].includes(aggDefault)) {
      throw new Error(`upsert_reporting_tag: agg_default must be sum|avg, got "${input.agg_default}"`)
    }

    const existing = await ctx.supabase
      .from('reporting_tags')
      .select('id, is_system')
      .eq('church_id', ctx.churchId)
      .eq('code', code)
      .maybeSingle()
    if (existing.data) {
      // Never modify a system row; treat an existing custom row as idempotent.
      return { id: existing.data.id, code, created: false, is_system: existing.data.is_system }
    }

    const { data, error } = await ctx.supabase
      .from('reporting_tags')
      .insert({
        church_id:   ctx.churchId,
        code,
        name,
        unit_kind:   unitKind,
        agg_default: aggDefault,
        is_system:   false,
      })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_reporting_tag failed: ${error.message}`)
    return { id: data!.id, code, created: true }
  },

  upsert_service_template: async (input, ctx) => {
    const serviceCode    = slug(String(input.service_code), 'SVC')
    const displayName    = String(input.display_name)
    const locationCode   = slug(String(input.location_code), 'LOC')
    const primaryTagCode = slug(String(input.primary_tag_code), 'TAG')

    const { data: loc } = await ctx.supabase
      .from('church_locations')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('code', locationCode)
      .maybeSingle()
    if (!loc) throw new Error(`Unknown location_code "${locationCode}". Call upsert_location first.`)

    const { data: tag } = await ctx.supabase
      .from('service_tags')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('code', primaryTagCode)
      .maybeSingle()
    if (!tag) throw new Error(`Unknown primary_tag_code "${primaryTagCode}". Call upsert_ministry_tag first.`)

    const existing = await ctx.supabase
      .from('service_templates')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('location_id', loc.id)
      .eq('service_code', serviceCode)
      .maybeSingle()

    if (existing.data) {
      await ctx.supabase
        .from('service_templates')
        .update({
          display_name:   displayName,
          primary_tag_id: tag.id,
          is_active:      true,
        })
        .eq('id', existing.data.id)
      return { id: existing.data.id, created: false }
    }

    const { data, error } = await ctx.supabase
      .from('service_templates')
      .insert({
        church_id:      ctx.churchId,
        location_id:    loc.id,
        service_code:   serviceCode,
        display_name:   displayName,
        primary_tag_id: tag.id,
        is_active:      true,
      })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_service_template failed: ${error.message}`)
    return { id: data!.id, created: true }
  },

  upsert_service_schedule_version: async (input, ctx) => {
    const serviceCode  = slug(String(input.service_code), 'SVC')
    const locationCode = slug(String(input.location_code), 'LOC')
    const dayOfWeek    = Number(input.day_of_week)
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw new Error(`upsert_service_schedule_version: day_of_week must be 0-6, got ${input.day_of_week}`)
    }
    // Normalize "HH:MM" → "HH:MM:00"; pass "HH:MM:SS" through.
    const rawTime = String(input.start_time).trim()
    const startTime = /^\d{1,2}:\d{2}$/.test(rawTime)
      ? rawTime.padStart(5, '0') + ':00'
      : rawTime
    if (!/^\d{2}:\d{2}:\d{2}$/.test(startTime)) {
      throw new Error(`upsert_service_schedule_version: start_time must be HH:MM or HH:MM:SS, got "${input.start_time}"`)
    }
    const effStart = String(
      input.effective_start_date ?? new Date().toISOString().slice(0, 10),
    )

    const { data: loc } = await ctx.supabase
      .from('church_locations')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('code', locationCode)
      .maybeSingle()
    if (!loc) throw new Error(`Unknown location_code "${locationCode}". Call upsert_location first.`)

    const { data: tmpl } = await ctx.supabase
      .from('service_templates')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('location_id', loc.id)
      .eq('service_code', serviceCode)
      .maybeSingle()
    if (!tmpl) throw new Error(`Unknown service_code "${serviceCode}". Call upsert_service_template first.`)

    // N29: deactivate any prior active schedule version for this template
    // before activating the new one. Skip rows where effective_start_date == effStart
    // so the upsert below can re-activate that exact row instead of conflicting.
    await ctx.supabase
      .from('service_schedule_versions')
      .update({ is_active: false, effective_end_date: effStart })
      .eq('service_template_id', tmpl.id)
      .eq('is_active', true)
      .neq('effective_start_date', effStart)

    const { data, error } = await ctx.supabase
      .from('service_schedule_versions')
      .upsert({
        service_template_id:  tmpl.id,
        day_of_week:          dayOfWeek,
        start_time:           startTime,
        effective_start_date: effStart,
        effective_end_date:   null,
        is_active:            true,
      }, { onConflict: 'service_template_id,effective_start_date' })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_service_schedule_version failed: ${error.message}`)
    return { id: data!.id, day_of_week: dayOfWeek, start_time: startTime, created: true }
  },

  // REPLACES upsert_volunteer_category + upsert_response_category + upsert_giving_source.
  // Resolves ministry_tag_code → service_tags.id and reporting_tag_code →
  // reporting_tags.id (system or custom). Writes the metric with its `code` and
  // upserts on (church_id, code); Stage B Phase 2 maps metric_code → metric.id with
  // a direct lookup against metrics.code.
  upsert_metric: async (input, ctx) => {
    const metricCode       = slug(String(input.metric_code), 'METRIC')
    const name             = String(input.name)
    const ministryTagCode  = slug(String(input.ministry_tag_code), 'TAG')
    const reportingTagCode = slug(String(input.reporting_tag_code), 'RPT')
    const scope            = String(input.scope)
    const isCanonical      = Boolean(input.is_canonical)
    if (!['instance', 'period'].includes(scope)) {
      throw new Error(`upsert_metric: scope must be instance|period, got "${input.scope}"`)
    }

    const { data: ministry } = await ctx.supabase
      .from('service_tags')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('code', ministryTagCode)
      .maybeSingle()
    if (!ministry) throw new Error(`Unknown ministry_tag_code "${ministryTagCode}". Call upsert_ministry_tag first.`)

    const { data: reporting } = await ctx.supabase
      .from('reporting_tags')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('code', reportingTagCode)
      .maybeSingle()
    if (!reporting) throw new Error(`Unknown reporting_tag_code "${reportingTagCode}". Use a system code (ATTENDANCE/VOLUNTEERS/GIVING/RESPONSE_STAT) or call upsert_reporting_tag first.`)

    // Idempotency: `metrics` now carries a `code` column with UNIQUE (church_id, code)
    // (constraint uq_metric_code). Upsert on that target so a re-import updates the
    // existing row instead of creating a duplicate. The separate partial unique index
    // on (church_id, ministry_tag_id, reporting_tag_id) WHERE is_canonical still guards
    // the one-canonical-per-pair rule.
    const { data, error } = await ctx.supabase
      .from('metrics')
      .upsert(
        {
          church_id:        ctx.churchId,
          code:             metricCode,
          name,
          ministry_tag_id:  ministry.id,
          reporting_tag_id: reporting.id,
          scope,
          is_canonical:     isCanonical,
          is_active:        true,
        },
        { onConflict: 'church_id,code' },
      )
      .select('id')
      .single()
    if (error) throw new Error(`upsert_metric failed: ${error.message}`)

    return { id: data!.id, metric_code: metricCode, created: true }
  },

  done: async (input) => ({ summary: String(input.summary ?? '') }),
}
