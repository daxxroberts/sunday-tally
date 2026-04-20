import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import { runToolLoop } from '@/lib/ai/anthropic'
import type { NormalizedSource } from './sources'

const STAGE_A_SYSTEM = `You are the Sunday Tally import setup agent.

Sunday Tally is a weekly church-analytics SaaS. Churches log, per service occurrence:
- attendance by audience (MAIN, KIDS, YOUTH) — fixed audience codes; NULL means not entered (not zero)
- volunteer counts by church-defined category, audience-linked
- response / stat counts by church-defined category, scope is either "audience" or "service"
- giving amounts by church-defined giving source

Core entities:
- churches (tenant)
- church_locations (campuses — minimum one per church)
- service_templates (recurring services — Morning, Evening, Midweek — have a primary tag_id)
- service_tags (reporting identity — MORNING, EVENING, MIDWEEK, custom)
- service_occurrences (one per template per date; all entries hang off this)
- attendance_entries (main/kids/youth counts per occurrence)
- volunteer_entries (one row per occurrence × volunteer_category)
- response_entries (one row per occurrence × response_category × audience if scoped)
- giving_entries (one row per occurrence × giving_source)

Your job: given one or more uploaded sources, PROPOSE a mapping of source columns to Sunday Tally entities. You do not write to the database. You do not execute the import. You do not invent audiences — MAIN/KIDS/YOUTH are the only attendance audiences.

Rules you must follow:
1. Prefer service-identity continuity. Do not fragment one logical service into many because a column label or time drifted.
2. Treat NULL as "not entered", not zero.
3. Do not silently invent kids/youth splits when only a total is available — mark them unknown.
4. Ask clarifying questions only when the answer materially changes mapping (service identity, category mapping, audience split).
5. Never promise to save a rule. Rules are church-scoped and require user approval.

You must call the tool "propose_mapping" once with a structured proposal. If something is ambiguous, include it under clarification_questions.`

export const PROPOSE_MAPPING_TOOL: Anthropic.Messages.Tool = {
  name: 'propose_mapping',
  description:
    'Propose how each uploaded source maps into Sunday Tally. Call exactly once. Include clarification questions for anything ambiguous.',
  input_schema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        description: 'One entry per uploaded source (CSV file, sheet URL, or free-text block).',
        items: {
          type: 'object',
          properties: {
            source_name: { type: 'string' },
            dest_table: {
              type: 'string',
              enum: [
                'attendance_entries',
                'giving_entries',
                'volunteer_entries',
                'response_entries',
                'service_schedule',
                'mixed',
                'ignore',
              ],
              description: 'Primary destination table (or "mixed" for multi-metric sheets).',
            },
            date_column: { type: 'string' },
            date_format: {
              type: 'string',
              description: 'Human-readable example like "YYYY-MM-DD" or "M/D/YYYY".',
            },
            column_map: {
              type: 'array',
              description: 'One entry per source column.',
              items: {
                type: 'object',
                properties: {
                  source_column: { type: 'string' },
                  dest_field: {
                    type: 'string',
                    description:
                      'e.g. "attendance.main", "attendance.kids", "volunteer_count", "response.<category>", "giving.<source>", "service_template_code", "ignore".',
                  },
                  notes: { type: 'string' },
                },
                required: ['source_column', 'dest_field'],
              },
            },
            notes: { type: 'string' },
          },
          required: ['source_name', 'dest_table', 'column_map'],
        },
      },
      proposed_setup: {
        type: 'object',
        description: 'Inferred Sunday Tally setup (locations, services, categories, tags) the user should create.',
        properties: {
          locations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                code: { type: 'string' },
              },
              required: ['name'],
            },
          },
          service_templates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                display_name: { type: 'string' },
                service_code: { type: 'string' },
                location_name: { type: 'string' },
                primary_tag: { type: 'string', description: 'MORNING, EVENING, MIDWEEK, or custom tag code.' },
                audience_type: { type: 'string', enum: ['MAIN', 'KIDS', 'YOUTH'] },
              },
              required: ['display_name', 'service_code', 'primary_tag'],
            },
          },
          response_categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                stat_scope: { type: 'string', enum: ['audience', 'service', 'day', 'week', 'month'] },
              },
              required: ['name', 'stat_scope'],
            },
          },
          giving_sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          },
          volunteer_categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                audience_type: { type: 'string', enum: ['MAIN', 'KIDS', 'YOUTH'] },
              },
              required: ['name'],
            },
          },
        },
      },
      anomalies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['kind', 'description'],
        },
      },
      clarification_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            why: { type: 'string' },
            recommended_answer: { type: 'string' },
          },
          required: ['question'],
        },
      },
      dashboard_warnings: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['sources'],
  },
}

export interface StageAResult {
  proposedMapping: Record<string, unknown> | null
  totalCents:      number
}

export async function runStageA(args: {
  supabase:  SupabaseClient
  churchId:  string
  sources:   NormalizedSource[]
  freeText?: string
}): Promise<StageAResult> {
  const sourcesForPrompt = args.sources.map(s => ({
    name:         s.name,
    kind:         s.kind,
    columns:      s.columns,
    sample_rows:  s.sampleRows,
    row_count:    s.rowCount,
    raw_text:     s.rawText,
    error:        s.error,
  }))

  const userPrompt =
    `Sources uploaded:\n${JSON.stringify(sourcesForPrompt, null, 2)}\n\n` +
    (args.freeText ? `Additional church description from user:\n${args.freeText}\n\n` : '') +
    `Call propose_mapping exactly once with your proposal.`

  const result = await runToolLoop({
    supabase:    args.supabase,
    churchId:    args.churchId,
    kind:        'import_stage_a',
    model:       'claude-sonnet-4-6',
    system:      [{ type: 'text', text: STAGE_A_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools:       [PROPOSE_MAPPING_TOOL],
    handlers:    {
      propose_mapping: async (input) => input,
    },
    terminateOn: ['propose_mapping'],
    maxTurns:    3,
    initialUser: userPrompt,
  })

  return {
    proposedMapping: result.finalToolCall?.input ?? null,
    totalCents:      result.totalCents,
  }
}
