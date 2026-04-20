import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { runToolLoop, AiBudgetExhaustedError } from '@/lib/ai/anthropic'
import { METRICS, runMetric, type MetricId } from '@/lib/ai/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `You are the Sunday Tally analytics assistant. You answer questions about one church's ministry data — attendance, volunteers, giving, and stat/response counts.

You have three tools:
  - list_dimensions()     — returns the church's services, locations, categories, and giving sources
  - run_metric()          — runs a named metric query (see the tool schema for the allowed metric IDs)
  - render_chart()        — displays a line, bar, or area chart to the user
  - final_answer()        — ends the conversation with a short markdown summary

Rules:
  - Always call run_metric before claiming a number. Never fabricate totals.
  - NULL attendance means "not entered" — do not treat it as zero in averages.
  - Prefer small, readable charts (1–2 per answer). Dashboards already exist; keep chat answers concise.
  - When the user asks a comparison question (e.g. YTD vs prior), use the ytd_vs_prior metric.
  - Always finish by calling final_answer with 1–3 sentences and any takeaways.`

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

const FINAL_ANSWER_TOOL: Anthropic.Messages.Tool = {
  name: 'final_answer',
  description: 'Ends the conversation with a short markdown summary.',
  input_schema: {
    type: 'object',
    properties: { markdown: { type: 'string' } },
    required: ['markdown'],
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
          tools:   [DIMENSIONS_TOOL, RUN_METRIC_TOOL, RENDER_CHART_TOOL, FINAL_ANSWER_TOOL],
          handlers: {
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
            final_answer: async (input) => {
              send('final', { markdown: String(input.markdown ?? '') })
              return { done: true }
            },
          },
          terminateOn: ['final_answer'],
          maxTurns:    8,
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
