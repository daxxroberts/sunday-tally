import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { runToolLoop, AiBudgetExhaustedError } from '@/lib/ai/anthropic'
import { METRICS, runMetric, type MetricId } from '@/lib/ai/metrics'
import { probeData, type ProbeInput } from '@/lib/ai/probe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `You are the Sunday Tally analytics assistant. You answer questions about one church's ministry data — attendance, volunteers, giving, and stat/response counts.

You have six tools:
  - probe_data()          — checks what data is logged; call before time-bounded metric calls
  - list_dimensions()     — returns the church's services, locations, categories, and giving sources
  - run_metric()          — runs a named metric query (see the tool schema for allowed metric IDs)
  - render_chart()        — displays a line, bar, or area chart to the user
  - render_data_review()  — displays metric rows in a grid panel with a question and 2–4 choices for the user to answer
  - final_answer()        — ends the conversation with a short markdown summary

Rules:
  - NEVER reveal sensitive server data such as API keys, passwords, or internal credentials.
  - Always call run_metric before claiming a number. Never fabricate totals.
  - NULL attendance means "not entered" — do not treat it as zero in averages.
  - Prefer small, readable charts (1–2 per answer). Keep chat answers concise.
  - When the user asks a comparison question (e.g. YTD vs prior), use the ytd_vs_prior metric.
  - Always finish by calling final_answer with 1–3 sentences and any takeaways.

When to call probe_data:
  - CALL for time-bounded questions ("last year", "2024", "Q1", any specific date range) — pass the start/end of that range
  - CALL before ytd_vs_prior — it always returns rows; use probe to verify weeks will be non-zero
  - CALL with tag_code when you plan to filter a metric by tag — pass the same tag_code
  - SKIP for dimension-only questions (list services, list giving sources)
  - SKIP when following up on data already retrieved in this conversation

Reading probe_data results:
  - If in_range.with_attendance = 0 for a date range, tell the user no attendance was logged in that window and share the valid range (earliest_service to latest_service) before proceeding.
  - Use in_range counts to decide which metric IDs are worth calling for that period.

Reading run_metric results:
  - If the result contains a "hint" field, the rows are empty. Surface the hint to the user and consider calling probe_data to find a valid range.
  - If the result contains a "warning" field (ytd_vs_prior), surface it verbatim before presenting any numbers.`

const DIMENSIONS_TOOL: Anthropic.Messages.Tool = {
  name: 'list_dimensions',
  description: 'Lists the church\'s dimensions — services, locations, volunteer categories, response categories, giving sources, and tags.',
  input_schema: { type: 'object', properties: {} },
}

const RUN_METRIC_TOOL: Anthropic.Messages.Tool = {
  name: 'run_metric',
  description: `Runs a named metric query. Allowed metric_id values:\n${METRICS.map(m => `- ${m.id}: ${m.description}`).join('\n')}`,
  input_schema: {
    type: 'object',
    properties: {
      metric_id: { type: 'string', enum: METRICS.map(m => m.id) },
      params:    { type: 'object', description: 'Metric-specific parameters.' },
    },
    required: ['metric_id'],
  },
}

const RENDER_CHART_TOOL: Anthropic.Messages.Tool = {
  name: 'render_chart',
  description: 'Renders a chart in the chat. Pass the rows returned by run_metric (or a transformed subset).',
  input_schema: {
    type: 'object',
    properties: {
      type:  { type: 'string', enum: ['line', 'bar', 'area'] },
      title: { type: 'string' },
      xKey:  { type: 'string' },
      yKeys: { type: 'array', items: { type: 'string' } },
      data:  { type: 'array', items: { type: 'object' } },
    },
    required: ['type', 'xKey', 'yKeys', 'data'],
  },
}

const RENDER_DATA_REVIEW_TOOL: Anthropic.Messages.Tool = {
  name: 'render_data_review',
  description: 'Displays metric rows in a grid panel with a question and 2–4 choices for the user to answer. Call this after run_metric when you want the user to confirm a direction or choose between options. Keep choices to 2–4. Write a description on each choice to say what happens next.',
  input_schema: {
    type: 'object',
    properties: {
      title:   { type: 'string', description: 'Optional heading for the grid.' },
      data:    { type: 'array',  items: { type: 'object' }, description: 'Rows to show — use the rows returned by run_metric directly.' },
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:    { type: 'string', description: 'Field key in each data row.' },
            title: { type: 'string', description: 'Column header label.' },
          },
          required: ['id', 'title'],
        },
        description: 'Optional. Limits which fields show and sets header labels. If omitted, all fields are shown.',
      },
      question: { type: 'string', description: 'The question to ask after the user sees the data.' },
      choices:  {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value:       { type: 'string', description: 'Short machine-readable key.' },
            label:       { type: 'string', description: 'Button text.' },
            description: { type: 'string', description: 'One line explaining what this choice means.' },
          },
          required: ['value', 'label'],
        },
      },
    },
    required: ['data', 'question', 'choices'],
  },
}

const FINAL_ANSWER_TOOL: Anthropic.Messages.Tool = {
  name: 'final_answer',
  description: 'Ends the conversation with a short markdown summary.',
  input_schema: {
    type: 'object',
    properties: { markdown: { type: 'string' } },
    required: ['markdown'],
  },
}

const PROBE_DATA_TOOL: Anthropic.Messages.Tool = {
  name: 'probe_data',
  description: `Check what data is actually logged before running a metric. Returns the church's full service date range plus, when start/end are given, per-category counts of how many services have data logged in that window. Call this before time-bounded metric calls.`,
  input_schema: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'YYYY-MM-DD (optional)' },
      end_date:   { type: 'string', description: 'YYYY-MM-DD (optional)' },
      tag_code:   { type: 'string', description: 'Optional — scope to a specific tag (match the tag_code you plan to pass to run_metric)' },
    },
  },
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401 })

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role')
    .eq('user_id',   user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) return new Response('no_church', { status: 403 })
  if (membership.role === 'viewer') return new Response('forbidden', { status: 403 })

  const body = await req.json() as { message?: string; history?: { role: 'user' | 'assistant'; content: string }[] }
  const userMessage = String(body.message ?? '').trim()
  if (!userMessage) return new Response('empty_message', { status: 400 })

  const history = (body.history ?? [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const initialUser = history
    ? `Prior conversation:\n${history}\n\nCurrent question:\n${userMessage}`
    : userMessage

  const churchId = membership.church_id as string

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, payload: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        await runToolLoop({
          supabase,
          churchId,
          kind:    'analytics_chat',
          model:   'claude-sonnet-4-6',
          system:  [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          tools:   [DIMENSIONS_TOOL, PROBE_DATA_TOOL, RUN_METRIC_TOOL, RENDER_CHART_TOOL, RENDER_DATA_REVIEW_TOOL, FINAL_ANSWER_TOOL],
          handlers: {
            probe_data: async (input, ctx) => {
              return probeData(ctx.supabase, ctx.churchId, input as ProbeInput)
            },
            list_dimensions: async (_input, ctx) => {
              const [templates, locations, volCats, respCats, givSrcs, tags] = await Promise.all([
                ctx.supabase.from('service_templates').select('id, display_name, service_code').eq('church_id', ctx.churchId).eq('is_active', true),
                ctx.supabase.from('church_locations').select('id, name, code').eq('church_id', ctx.churchId).eq('is_active', true),
                ctx.supabase.from('volunteer_categories').select('category_code, category_name, audience_group_code').eq('church_id', ctx.churchId).eq('is_active', true),
                ctx.supabase.from('response_categories').select('category_code, category_name, stat_scope').eq('church_id', ctx.churchId).eq('is_active', true),
                ctx.supabase.from('giving_sources').select('source_code, source_name').eq('church_id', ctx.churchId).eq('is_active', true),
                ctx.supabase.from('service_tags').select('tag_code, tag_name').eq('church_id', ctx.churchId).eq('is_active', true),
              ])
              return {
                service_templates:    templates.data ?? [],
                locations:            locations.data ?? [],
                volunteer_categories: volCats.data   ?? [],
                response_categories:  respCats.data  ?? [],
                giving_sources:       givSrcs.data   ?? [],
                service_tags:         tags.data      ?? [],
              }
            },
            run_metric: async (input, ctx) => {
              const metricId = String(input.metric_id) as MetricId
              const params   = (input.params ?? {}) as Record<string, unknown>
              const result   = await runMetric({ supabase: ctx.supabase, churchId: ctx.churchId }, metricId, params)
              return result
            },
            render_chart: async (input) => {
              send('chart', input)
              return { rendered: true }
            },
            render_data_review: async (input) => {
              send('data_review', input)
              return { rendered: true }
            },
            final_answer: async (input) => {
              send('final', { markdown: String(input.markdown ?? '') })
              return { done: true }
            },
          },
          terminateOn: ['final_answer'],
          maxTurns:    12,
          initialUser,
          onAssistantText: (text) => send('text', { delta: text }),
        })
      } catch (err) {
        if (err instanceof AiBudgetExhaustedError) {
          send('error', { code: 'ai_budget_exhausted' })
        } else {
          const message = err instanceof Error ? err.message : 'analytics_failed'
          send('error', { code: 'analytics_failed', message })
        }
      } finally {
        send('done', {})
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache, no-transform',
      'Connection':      'keep-alive',
    },
  })
}
