import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { ToolHandler } from '@/lib/ai/anthropic'

// Setup-only writer tools for Stage B.
// Claude creates locations, tags, templates, categories, and giving sources.
// Per-row occurrence + entry writes are executed deterministically in
// stageB.ts from the user-confirmed mapping — Claude does not author writes
// at row granularity. Keeps Stage B cheap and safe.

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
    name: 'upsert_service_tag',
    description: 'Ensure a service tag exists (MORNING, EVENING, MIDWEEK, or custom). tag_code is the stable identifier.',
    input_schema: {
      type: 'object',
      properties: {
        tag_code: { type: 'string' },
        tag_name: { type: 'string' },
      },
      required: ['tag_code', 'tag_name'],
    },
  },
  {
    name: 'upsert_service_template',
    description: 'Ensure a service template exists. Links to an existing location (by location_code) and primary tag (by tag_code).',
    input_schema: {
      type: 'object',
      properties: {
        service_code:     { type: 'string', description: 'Stable identifier, unique within (church, location).' },
        display_name:     { type: 'string' },
        location_code:    { type: 'string' },
        primary_tag_code: { type: 'string' },
        audience_type:    { type: 'string', enum: ['MAIN', 'KIDS', 'YOUTH'] },
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
    name: 'upsert_volunteer_category',
    description: 'Ensure a volunteer category exists. Requires audience_group_code (MAIN/KIDS/YOUTH) and an immutable category_code.',
    input_schema: {
      type: 'object',
      properties: {
        category_code:       { type: 'string' },
        category_name:       { type: 'string' },
        audience_group_code: { type: 'string', enum: ['MAIN', 'KIDS', 'YOUTH'] },
      },
      required: ['category_code', 'category_name', 'audience_group_code'],
    },
  },
  {
    name: 'upsert_response_category',
    description: "Ensure a response / stat category exists. stat_scope: 'audience' (per MAIN/KIDS/YOUTH per occurrence), 'service' (one per occurrence), 'week'/'month'/'day' (periodic — stored in church_period_entries, not response_entries).",
    input_schema: {
      type: 'object',
      properties: {
        category_code: { type: 'string' },
        category_name: { type: 'string' },
        stat_scope:    { type: 'string', enum: ['audience', 'service', 'week', 'month', 'day'] },
      },
      required: ['category_code', 'category_name', 'stat_scope'],
    },
  },
  {
    name: 'upsert_giving_source',
    description: 'Ensure a giving source exists (e.g. Plate, Online, custom).',
    input_schema: {
      type: 'object',
      properties: {
        source_code: { type: 'string' },
        source_name: { type: 'string' },
      },
      required: ['source_code', 'source_name'],
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

  upsert_service_tag: async (input, ctx) => {
    const tagCode = slug(String(input.tag_code), 'TAG')
    const tagName = String(input.tag_name)

    const existing = await ctx.supabase
      .from('service_tags')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('tag_code', tagCode)
      .maybeSingle()
    if (existing.data) return { id: existing.data.id, tag_code: tagCode, created: false }

    const { data, error } = await ctx.supabase
      .from('service_tags')
      .insert({
        church_id:     ctx.churchId,
        tag_code:      tagCode,
        tag_name:      tagName,
        is_custom:     true,
        is_active:     true,
      })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_service_tag failed: ${error.message}`)
    return { id: data!.id, tag_code: tagCode, created: true }
  },

  upsert_service_template: async (input, ctx) => {
    const serviceCode    = slug(String(input.service_code), 'SVC')
    const displayName    = String(input.display_name)
    const locationCode   = slug(String(input.location_code), 'LOC')
    const primaryTagCode = slug(String(input.primary_tag_code), 'TAG')
    const audienceType   = input.audience_type ? String(input.audience_type) : null

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
      .eq('tag_code', primaryTagCode)
      .maybeSingle()
    if (!tag) throw new Error(`Unknown primary_tag_code "${primaryTagCode}". Call upsert_service_tag first.`)

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
          audience_type:  audienceType,
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
        audience_type:  audienceType,
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

  upsert_volunteer_category: async (input, ctx) => {
    const categoryCode      = slug(String(input.category_code), 'VOL')
    const categoryName      = String(input.category_name)
    const audienceGroupCode = String(input.audience_group_code)

    const existing = await ctx.supabase
      .from('volunteer_categories')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('audience_group_code', audienceGroupCode)
      .eq('category_code', categoryCode)
      .maybeSingle()
    if (existing.data) return { id: existing.data.id, created: false }

    const { data, error } = await ctx.supabase
      .from('volunteer_categories')
      .insert({
        church_id:           ctx.churchId,
        audience_group_code: audienceGroupCode,
        category_code:       categoryCode,
        category_name:       categoryName,
        is_active:           true,
      })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_volunteer_category failed: ${error.message}`)
    return { id: data!.id, created: true }
  },

  upsert_response_category: async (input, ctx) => {
    const categoryCode = slug(String(input.category_code), 'STAT')
    const categoryName = String(input.category_name)
    const statScope    = String(input.stat_scope)

    const existing = await ctx.supabase
      .from('response_categories')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('category_code', categoryCode)
      .maybeSingle()
    if (existing.data) return { id: existing.data.id, created: false }

    const { data, error } = await ctx.supabase
      .from('response_categories')
      .insert({
        church_id:     ctx.churchId,
        category_code: categoryCode,
        category_name: categoryName,
        stat_scope:    statScope,
        is_custom:     true,
        is_active:     true,
      })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_response_category failed: ${error.message}`)
    return { id: data!.id, created: true }
  },

  upsert_giving_source: async (input, ctx) => {
    const sourceCode = slug(String(input.source_code), 'GIV')
    const sourceName = String(input.source_name)

    const existing = await ctx.supabase
      .from('giving_sources')
      .select('id')
      .eq('church_id', ctx.churchId)
      .eq('source_code', sourceCode)
      .maybeSingle()
    if (existing.data) return { id: existing.data.id, created: false }

    const { data, error } = await ctx.supabase
      .from('giving_sources')
      .insert({
        church_id:   ctx.churchId,
        source_code: sourceCode,
        source_name: sourceName,
        is_custom:   true,
        is_active:   true,
      })
      .select('id')
      .single()
    if (error) throw new Error(`upsert_giving_source failed: ${error.message}`)
    return { id: data!.id, created: true }
  },

  done: async (input) => ({ summary: String(input.summary ?? '') }),
}
