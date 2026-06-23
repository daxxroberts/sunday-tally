/**
 * POST /api/test/widget-scenarios — batch AI widget-builder stress-tester.
 *
 * Runs N prompts through the full widget-builder tool loop (probe_data +
 * list_dimensions + build_widget) WITHOUT saving. Captures what spec the AI
 * produced, whether it compiled, and how many rows came back.  Scores each
 * result automatically and returns a structured scorecard.
 *
 * PROTECTED: requires header X-Test-Secret matching TEST_HARNESS_SECRET env var.
 * Do NOT deploy to production without that env var set.
 */
import 'server-only'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { validateSpec, compileAndRun } from '@/lib/widgets/compile'
import { buildChurchContextPack } from '@/lib/ai/churchContext'
import { probeData } from '@/lib/ai/probe'
// Use the EXACT production tool definitions so the AI sees the same schema
import {
  PROBE_DATA_TOOL,
  LIST_DIMENSIONS_TOOL,
  BUILD_WIDGET_TOOL,
  SAVE_WIDGET_TOOL,
  FINAL_ANSWER_TOOL,
} from '@/lib/ai/widgetTools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Long timeout — 50 scenarios × ~20s each = up to 16 min
export const maxDuration = 300

// ─── Types ────────────────────────────────────────────────────────────────────

type Verdict =
  | 'PASS'          // built, >0 rows, no spec errors, no obvious issues
  | 'PASS_WARN'     // built + rows, but has warnings (e.g. missing metric isolation)
  | 'ZERO_ROWS'     // built, spec valid, but 0 rows returned
  | 'SPEC_ERROR'    // build_widget returned an error string
  | 'NO_BUILD'      // AI never called build_widget (went straight to final_answer)
  | 'CAPABILITY'    // AI correctly declined (said it can't do this)
  | 'AI_ERROR'      // Anthropic / runtime error

interface Issue {
  code: string
  detail: string
}

interface ScenarioResult {
  id: number
  category: string
  prompt: string
  verdict: Verdict
  viz_kind: string | null
  source: string | null
  agg: string | null
  window_type: string | null
  row_count: number | null
  title: string | null
  issues: Issue[]
  final_answer: string | null
  build_error: string | null
  turns: number
}

// Use the exact production tool definitions (imported above)
const TOOLS = [PROBE_DATA_TOOL, LIST_DIMENSIONS_TOOL, BUILD_WIDGET_TOOL, SAVE_WIDGET_TOOL, FINAL_ANSWER_TOOL]

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleListDimensions(supabase: ReturnType<typeof createServiceClient>, churchId: string) {
  const [templates, locations, volMetrics, respMetrics, tags, groups] = await Promise.all([
    supabase.from('service_templates').select('id, display_name, service_code').eq('church_id', churchId).eq('is_active', true),
    supabase.from('church_locations').select('id, name, code').eq('church_id', churchId).eq('is_active', true),
    supabase.from('metrics').select('id, code, name, ministry_tag_id, reporting_tags!inner(code)').eq('church_id', churchId).eq('is_active', true).eq('reporting_tags.code', 'VOLUNTEERS'),
    supabase.from('metrics').select('id, code, name, ministry_tag_id, reporting_tags!inner(code)').eq('church_id', churchId).eq('is_active', true).eq('reporting_tags.code', 'RESPONSE_STAT'),
    supabase.from('service_tags').select('id, code, name, tag_role').eq('church_id', churchId).eq('is_active', true).order('display_order', { ascending: true }),
    supabase.from('service_groups').select('id, code, name').eq('church_id', churchId).eq('is_active', true).order('sort_order', { ascending: true }),
  ])
  return {
    service_templates:    templates.data   ?? [],
    locations:            locations.data   ?? [],
    volunteer_categories: volMetrics.data  ?? [],
    response_categories:  respMetrics.data ?? [],
    service_tags:         tags.data        ?? [],
    service_groups:       groups.error ? [] : (groups.data ?? []),
  }
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function scoreResult(
  spec: Record<string, unknown> | null,
  vizInput: Record<string, unknown> | null,
  rowCount: number | null,
  buildError: string | null,
  sawFinalAnswer: boolean,
  finalText: string | null,
  prompt: string,
  now: Date,
): { verdict: Verdict; issues: Issue[] } {
  const issues: Issue[] = []

  if (spec === null) {
    // AI went to final_answer without building
    const lower = (finalText ?? '').toLowerCase()
    const declined = /can't|cannot|not supported|not available|don't have|no data|unable/.test(lower)
    return { verdict: declined ? 'CAPABILITY' : 'NO_BUILD', issues }
  }

  if (buildError) {
    issues.push({ code: 'BUILD_ERROR', detail: buildError })
    return { verdict: 'SPEC_ERROR', issues }
  }

  if (rowCount === 0) {
    return { verdict: 'ZERO_ROWS', issues }
  }

  // Check for common spec problems
  const filters = (spec.filters ?? {}) as Record<string, unknown>
  const measure = (spec.measure ?? {}) as Record<string, unknown>
  const dateFilter = (filters.date ?? {}) as Record<string, unknown>
  const promptLower = prompt.toLowerCase()

  // RESPONSE_STAT without metric_names isolation — only a problem when the user
  // named ONE specific stat. "all stats" / "every stat" SHOULD sum the family.
  const wantsAllStats = /\ball\b|\bevery\b|\beach (stat|response)|response stats|all stats/.test(promptLower)
  if (
    measure.reporting_tag_code === 'RESPONSE_STAT' &&
    (!filters.metric_names || (filters.metric_names as unknown[]).length === 0) &&
    !wantsAllStats
  ) {
    issues.push({
      code: 'STAT_NOT_ISOLATED',
      detail: 'RESPONSE_STAT measure without metric_names — sums ALL stats instead of one specific metric',
    })
  }

  // Pinned window — only a problem when it FREEZES an ongoing period (would go
  // stale). A fully-elapsed range (end date in the past) is a legitimate fixed
  // historical period. The end >= today case is the real bug.
  if (dateFilter.window === 'custom') {
    const endStr = typeof dateFilter.end === 'string' ? dateFilter.end : null
    const todayStr = now.toISOString().slice(0, 10)
    const ongoing = !endStr || endStr >= todayStr
    if (ongoing) {
      issues.push({
        code: 'WINDOW_PINNED',
        detail: `Pinned an ongoing period (would go stale): ${dateFilter.start} → ${dateFilter.end}`,
      })
    }
    // else: fully-elapsed fixed period — acceptable, no warning
  }

  const verdict: Verdict = issues.length === 0 ? 'PASS' : 'PASS_WARN'
  return { verdict, issues }
}

// ─── Single scenario runner ───────────────────────────────────────────────────

async function runScenario(
  anthropic: Anthropic,
  supabase: ReturnType<typeof createServiceClient>,
  churchId: string,
  systemPrompt: string,
  scenario: { id: number; category: string; prompt: string },
  now: Date,
): Promise<ScenarioResult> {
  let builtSpec: Record<string, unknown> | null = null
  let builtViz:  Record<string, unknown> | null = null
  let rowCount:  number | null = null
  let buildError: string | null = null
  let finalAnswer: string | null = null
  let lastPlainText: string | null = null  // capture text output even if final_answer never called
  let turns = 0

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: scenario.prompt },
  ]

  const MAX_TURNS = 12

  while (turns < MAX_TURNS) {
    turns++
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system:     systemPrompt,
      tools:      TOOLS,
      messages,
    })

    // Append assistant turn
    messages.push({ role: 'assistant', content: response.content })

    // Capture plain text output in case the AI never calls final_answer
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        lastPlainText = block.text.trim()
      }
    }

    let toolResultContent: Anthropic.ToolResultBlockParam[] = []
    let hitFinalAnswer = false

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      const input = (block.input ?? {}) as Record<string, unknown>
      let result: unknown

      switch (block.name) {
        case 'list_dimensions':
          result = await handleListDimensions(supabase, churchId)
          break

        case 'probe_data': {
          // Use the service-role client — the test route has no user session,
          // so the RLS-gated server client returns empty data and the AI gives up.
          try {
            result = await probeData(
              supabase as Parameters<typeof probeData>[0],
              churchId,
              input as Parameters<typeof probeData>[2],
            )
          } catch {
            result = { error: 'probe_data unavailable in test mode' }
          }
          break
        }

        case 'build_widget': {
          const rawSpec = (input.query_spec ?? {}) as Record<string, unknown>
          builtViz = (input.viz ?? null) as Record<string, unknown> | null
          const validation = validateSpec(rawSpec)
          if (!validation.ok) {
            buildError = validation.errors.join('; ')
            builtSpec = rawSpec
            // Return the EXACT production format so the AI knows how to fix the spec
            result = { previewed: false, errors: validation.errors }
          } else {
            builtSpec = rawSpec
            try {
              const compiled = await compileAndRun({
                supabase: supabase as Parameters<typeof compileAndRun>[0]['supabase'],
                churchId,
                spec:       validation.spec,
                now,
                locationIds: undefined,
              })
              rowCount   = compiled.rows.length
              buildError = compiled.error ?? null
              result = {
                previewed:         !compiled.error,
                row_count:         rowCount,
                error:             compiled.error,
                currently_showing: compiled.resolved ? `${compiled.resolved.start} → ${compiled.resolved.end}` : null,
              }
            } catch (e) {
              buildError = e instanceof Error ? e.message : 'compile_failed'
              rowCount   = 0
              result = { error: buildError, previewed: false, row_count: 0 }
            }
          }
          break
        }

        case 'save_widget':
          // Don't save in test mode; acknowledge so the loop can continue to final_answer.
          result = { saved: true, widget_id: 'test-mode-no-save', placed: false, scope: 'church', title: String(input.title ?? '') }
          break

        case 'final_answer':
          finalAnswer = String((input as { markdown?: string }).markdown ?? '')
          hitFinalAnswer = true
          result = { done: true }
          break

        default:
          result = { error: `unknown tool: ${block.name}` }
      }

      toolResultContent.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     JSON.stringify(result),
      })
    }

    if (toolResultContent.length > 0) {
      messages.push({ role: 'user', content: toolResultContent })
    }

    if (hitFinalAnswer) break

    // If the AI stopped without calling any tools and without final_answer, it's
    // waiting for a user reply that will never come. Send an auto-continue nudge
    // so it proceeds to build_widget → final_answer. Only do this once.
    if (response.stop_reason === 'end_turn' && toolResultContent.length === 0) {
      if (turns > 1) break  // already nudged once and still no tools — give up
      messages.push({
        role: 'user',
        content: 'Please proceed and build the widget now. Call build_widget with your chosen spec, then final_answer.',
      })
    }
  }

  const spec    = builtSpec
  const vizKind = (builtViz?.kind ?? (spec?.viz as Record<string,unknown> | undefined)?.kind ?? null) as string | null
  const source  = spec ? String(spec.source ?? '') : null
  const agg     = spec ? String((spec.measure as Record<string,unknown> | undefined)?.agg ?? '') : null
  const winSpec = spec
    ? ((spec.filters as Record<string,unknown> | undefined)?.date as Record<string,unknown> | undefined) ?? null
    : null
  const windowType = winSpec ? String(winSpec.window ?? '') : null
  const savedTitle = builtViz
    ? String((builtViz as { title?: string }).title ?? '')
    : spec
      ? String(((spec.viz as Record<string,unknown> | undefined)?.title) ?? '')
      : null

  // Fall back to captured plain text if final_answer tool was never called
  const effectiveFinalAnswer = finalAnswer ?? lastPlainText
  const { verdict, issues } = scoreResult(spec, builtViz, rowCount, buildError, effectiveFinalAnswer !== null, effectiveFinalAnswer, scenario.prompt, now)

  return {
    id:           scenario.id,
    category:     scenario.category,
    prompt:       scenario.prompt,
    verdict,
    viz_kind:     vizKind,
    source,
    agg,
    window_type:  windowType,
    row_count:    rowCount,
    title:        savedTitle,
    issues,
    final_answer: effectiveFinalAnswer,
    build_error:  buildError,
    turns,
  }
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS: { id: number; category: string; prompt: string }[] = [
  // Attendance — basic
  { id:  1, category: 'attendance',  prompt: 'Show me weekly attendance for the last 6 months' },
  { id:  2, category: 'attendance',  prompt: "What's our average Sunday attendance this year?" },
  { id:  3, category: 'attendance',  prompt: 'How has attendance trended over the past 12 months? Show as a line chart' },
  { id:  4, category: 'attendance',  prompt: 'Compare attendance by month for the past year — bar chart' },
  { id:  5, category: 'attendance',  prompt: 'Show attendance year by year for the last 3 years' },
  { id:  6, category: 'attendance',  prompt: "Show me last year's full attendance numbers month by month" },
  { id:  7, category: 'attendance',  prompt: 'What is our attendance growth year over year?' },
  { id:  8, category: 'attendance',  prompt: 'How does attendance look year to date vs the same period last year?' },
  // Attendance — ministry breakdown
  { id:  9, category: 'attendance',  prompt: 'Break down our attendance by ministry this year' },
  { id: 10, category: 'attendance',  prompt: "Show kids attendance vs adult attendance each month for the last year" },
  { id: 11, category: 'attendance',  prompt: 'Show me Experience 1 and Experience 2 attendance side by side' },
  { id: 12, category: 'attendance',  prompt: 'What is our LifeKids attendance trend over the last 12 months?' },
  // Giving
  { id: 13, category: 'giving',      prompt: 'Show giving by month this year' },
  { id: 14, category: 'giving',      prompt: "What's our total giving so far this year?" },
  { id: 15, category: 'giving',      prompt: 'Show giving trends over the last 2 years' },
  { id: 16, category: 'giving',      prompt: "What's our average weekly giving this year?" },
  { id: 17, category: 'giving',      prompt: 'Show giving by month for all of 2024' },
  { id: 18, category: 'giving',      prompt: 'Compare giving this year to last year' },
  { id: 19, category: 'giving',      prompt: 'How has our giving grown over the past 3 years? Show as a bar chart' },
  { id: 20, category: 'giving',      prompt: 'Show me total giving each week for the last 6 months' },
  // Volunteers
  { id: 21, category: 'volunteers',  prompt: 'How many volunteers do we have across our ministries?' },
  { id: 22, category: 'volunteers',  prompt: 'Show volunteer trends over the last 12 months' },
  { id: 23, category: 'volunteers',  prompt: "What's our average weekly volunteer count this year?" },
  { id: 24, category: 'volunteers',  prompt: 'Break down volunteers by ministry this year' },
  { id: 25, category: 'volunteers',  prompt: 'Show me volunteers for LifeKids over the last year' },
  { id: 26, category: 'volunteers',  prompt: 'How have volunteers changed year over year?' },
  { id: 27, category: 'volunteers',  prompt: 'Compare volunteer count this year vs last year' },
  // Response / stats
  { id: 28, category: 'stats',       prompt: 'How many salvations have we had this year?' },
  { id: 29, category: 'stats',       prompt: 'Show me baptisms over the last 12 months' },
  { id: 30, category: 'stats',       prompt: 'What are our total first-time decisions this year?' },
  { id: 31, category: 'stats',       prompt: 'Show hands raised by month for the last year' },
  { id: 32, category: 'stats',       prompt: 'Show all response stats this year in a table' },
  { id: 33, category: 'stats',       prompt: 'Compare salvations this year vs last year' },
  { id: 34, category: 'stats',       prompt: 'Show me water baptisms month by month this year' },
  // Ratios / derived
  { id: 35, category: 'ratio',       prompt: 'What percentage of our attendees volunteer?' },
  { id: 36, category: 'ratio',       prompt: 'Show the volunteer to attendance ratio by month over the last year' },
  { id: 37, category: 'ratio',       prompt: "What's our giving per attender this year?" },
  { id: 38, category: 'ratio',       prompt: 'Show kids attendance as a percentage of total attendance by month' },
  // Multi-series / complex (testing limits)
  { id: 39, category: 'complex',     prompt: 'Show me both attendance and volunteers on the same chart' },
  { id: 40, category: 'complex',     prompt: "Give me a full dashboard overview — set me up with our key metrics" },
  { id: 41, category: 'complex',     prompt: 'Show giving and attendance together on one chart' },
  { id: 42, category: 'complex',     prompt: "What's our Switch youth ministry attendance trend this year?" },
  { id: 43, category: 'complex',     prompt: 'Show me all attendance broken down by ministry AND by month — two dimensions' },
  // Ambiguous / conversational
  { id: 44, category: 'ambiguous',   prompt: 'How are we doing?' },
  { id: 45, category: 'ambiguous',   prompt: 'Is giving up or down this year?' },
  { id: 46, category: 'ambiguous',   prompt: 'Are we growing?' },
  { id: 47, category: 'ambiguous',   prompt: "What happened in Q1 this year?" },
  { id: 48, category: 'ambiguous',   prompt: "How's LifeKids doing lately?" },
  // Explicit viz type
  { id: 49, category: 'viz',         prompt: 'Give me a bar chart of monthly attendance for the last year' },
  { id: 50, category: 'viz',         prompt: 'I want a pivot table showing volunteers by ministry and by month this year' },
]

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Guard: only run in non-production or with the test secret
  const secret = process.env.TEST_HARNESS_SECRET
  const header = req.headers.get('x-test-secret')
  if (!secret || header !== secret) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    scenario_ids?: number[]
    concurrency?: number
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Use the demo church
  const CHURCH_ID = '4037051e-52f5-4c22-a0f1-32e7b45aaff4'

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').replace(/^﻿/, '').trim()
  const anthropic = new Anthropic({ apiKey })

  // Build context pack once (re-used across all scenarios)
  const serverSupa = await createServerClient()
  const churchContext = await buildChurchContextPack(serverSupa, CHURCH_ID)

  const now = new Date()

  // Mirror the production TODAY_NOTE (date injection) so the harness validates the
  // same prompt the real route sends. Keep in sync with widget-builder/route.ts.
  const today = now
  const TODAY_NOTE =
    `TODAY'S DATE IS ${today.toISOString().slice(0, 10)} (${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}). ` +
    `Use this for ALL date math: "this year" = ${today.getFullYear()}, "last year" = ${today.getFullYear() - 1}. ` +
    `Prefer a RELATIVE window so the widget stays live; only pin an absolute range for a fully-elapsed named period (e.g. a past calendar year), and when you do, compute the year from TODAY'S DATE above — never from memory.`

  // TEST_MODE: append an autonomous-run instruction so the AI doesn't pause for user
  // replies between tool calls. In production the user can respond; here it's a batch.
  const TEST_MODE_SUFFIX = `\n\nTEST MODE — AUTONOMOUS RUN: Complete the full workflow without asking the user any questions or waiting for confirmation. Call list_dimensions first if needed, probe_data if the window is time-bounded, build_widget to preview, then final_answer. If a request is ambiguous, make the single most sensible assumption and proceed. Never output a question directed at the user — just decide and build.`

  const systemPrompt =
    WIDGET_BUILDER_SYSTEM_PROMPT +
    '\n\n' + TODAY_NOTE +
    (churchContext ? '\n\n' + churchContext : '') +
    TEST_MODE_SUFFIX

  const scenarios = body.scenario_ids
    ? SCENARIOS.filter(s => body.scenario_ids!.includes(s.id))
    : SCENARIOS

  const results: ScenarioResult[] = []

  // Run sequentially (rate-limit safety)
  for (const scenario of scenarios) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await runScenario(anthropic, supabase as any, CHURCH_ID, systemPrompt, scenario, now)
      results.push(result)
    } catch (e) {
      results.push({
        id:           scenario.id,
        category:     scenario.category,
        prompt:       scenario.prompt,
        verdict:      'AI_ERROR',
        viz_kind:     null,
        source:       null,
        agg:          null,
        window_type:  null,
        row_count:    null,
        title:        null,
        issues:       [{ code: 'AI_ERROR', detail: e instanceof Error ? e.message : String(e) }],
        final_answer: null,
        build_error:  null,
        turns:        0,
      })
    }
  }

  // Summary
  const counts = results.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const allIssues = results.flatMap(r => r.issues.map(i => ({ ...i, scenario_id: r.id, prompt: r.prompt })))

  return Response.json({
    total:   results.length,
    summary: counts,
    results,
    issues:  allIssues,
  })
}

// ─── System prompt (copied from widget-builder route) ─────────────────────────

const WIDGET_BUILDER_SYSTEM_PROMPT = `You are the Sunday Tally widget builder — a SENIOR church-analytics designer, not an order-taker. You help one church turn a question into a small, reusable dashboard widget — a chart, table, pivot, or single-number card — from that church's own data: attendance, volunteers, giving, and stat/response counts (salvations, baptisms, first-time decisions, etc.).

HOW A SENIOR ANALYST THINKS (bring this to every build):
  • Start from the DECISION, not the chart. Ask yourself "what would a pastor DO differently after seeing this?" Build the widget that informs that decision.
  • A number without a baseline is noise. Always anchor it — vs last year, vs a trend, or vs a goal — so the reader instantly knows whether it's good. This is a default, not an upsell.
  • Lead with the signal, offer the detail. Headline first; breakdowns as a drill-down.
  • Name the real measure. Never dress up a sum-of-everything as a specific stat.

TOOLS:
  - probe_data()      — what data is logged in a date window; call before time-bounded builds
  - list_dimensions() — the church's service templates, locations, ministries, and the EXACT metric names/codes
  - build_widget()    — validates + runs a spec once, streams a live PREVIEW, and returns query_sql (the exact query). No save.
  - save_widget()     — saves to the library so it replays for free forever (the only writing tool)
  - final_answer()    — ends with a short markdown summary

THE FOUR DATA SOURCES — pick the right one:
  • attendance_per_occurrence — per active service: service_date, service_template_id, total_attendance, service_group_code. Group by time, service_template, or service_group. NO ministry column.
  • volunteers_per_occurrence — per active service: service_date, service_template_id, total_volunteers, service_group_code. Group by time, service_template, or service_group. NO ministry column.
  • giving_per_week — church-wide weekly giving: week_start, total_giving. Time only — no categorical breakdown, no service-group filter.
  • metric_entries_readable — THE FIREHOSE: one row per entry, with metric_name, ministry_tag_code, reporting_tag_code, service_group_code, service_date, value. This is the ONLY source that can group by ministry or metric, and the ONLY source you can FILTER by ministry_tag_codes or metric_names. Use it for anything about a specific ministry, a specific stat, or a per-metric breakdown.

SERVICE GROUPS (reporting groups — e.g. "Morning" vs "Evening", across campuses):
  • Churches may label services with a reporting group. Dimension { field:'service_group', by:'code' } groups by it; filters.service_group_codes restricts to specific groups. Get the EXACT codes from list_dimensions. Ungrouped services bucket as "—". "Compare our morning services to our evening services" → service_group. If the church has no groups yet, say so and suggest setting them on Settings → Services.

CHOOSING source + measure:
  • attendance overall / by service / over time → attendance_per_occurrence, measure ATTENDANCE.
  • attendance by ministry (Experience vs LifeKids) → metric_entries_readable, ATTENDANCE, dimension ministry_tag.
  • volunteers overall → volunteers_per_occurrence, VOLUNTEERS. volunteers by ministry/area → metric_entries_readable, VOLUNTEERS.
  • giving → giving_per_week, GIVING (church-wide weekly; no per-source split).
  • a SINGLE stat — salvations / baptisms / first-time decisions / hands raised / etc. → metric_entries_readable, measure RESPONSE_STAT, AND filters.metric_names = [that metric's exact name from list_dimensions]. ⚠ WITHOUT metric_names you sum EVERY stat (Hands Raised + Parking + Rooms + …) — that is WRONG. Always isolate the metric the user named.

CAPABILITY LIMITS — decline gracefully (don't fake it):
  • Grouping or filtering by ministry / metric works ONLY on metric_entries_readable.
  • Filtering by service_template CODE is not supported yet (views key service by UUID); location grouping is not supported yet; giving has no categorical axis.
  • You cannot isolate one metric on the pre-pivoted views — use metric_entries_readable + metric_names.
  • ONE widget measures ONE thing. You CANNOT put two different measures (e.g. attendance AND volunteers, or giving AND attendance) as two series on the same chart — there is no multi-measure axis. When a request asks to combine different measures on one chart, do NOT silently drop one (that fakes it). Instead build the single most useful one, then say plainly: "I can only chart one measure per widget — here's <X>; want <Y> as a second widget right beside it?" Two legitimate multi-series shapes DO exist and you SHOULD use them: (1) a breakdown of ONE measure by ministry/metric/service (dimension on metric_entries_readable → several bars/lines), and (2) this-year-vs-last-year via compare:'prior_year'. Multi-measure overlay is the only combination that isn't supported.

WORKFLOW:
  1. Call list_dimensions FIRST whenever the request names a specific ministry, service, or stat, to get the EXACT name (e.g. the real metric_name for "salvations"). Never guess a name — use what list_dimensions returns.
  2. Call probe_data for time-bounded requests to confirm the window has data.
  3. Call build_widget to preview. It returns query_sql — the exact query.
  4. EXPLAIN THE QUERY IN PLAIN LANGUAGE. After a successful build, say in 1–2 plain sentences what the widget pulls — measure, source, any ministry/metric filter, window + bucket — in words a non-technical pastor understands. Do NOT paste raw SQL.
  5. Iterate if the preview or query is wrong. Only call save_widget once the user is happy, then final_answer.

WIDGETS MUST STAY DYNAMIC — HARD GUARDRAIL:
  • ALWAYS use a RELATIVE window so it recalculates on every load.
  • NEVER pin absolute start/end dates for any "this / current / so far / last N / rolling" request.
  • A custom (pinned) range is ONLY for a named, fixed HISTORICAL period the user explicitly wants locked (e.g. "2024", "Q1 2023").

SUNDAY TALLY METRIC RULES:
  • Most ministry metrics are read as WEEKLY AVERAGES, not raw yearly totals. For a headline NUMBER use agg=weekly_avg. For a TREND use a weekly or monthly bucket.
  • NULL = not entered, never zero — weeks with no service never drag an average down.
  • Giving and per-capita figures follow the same weekly logic.

ALWAYS OFFER A COMPARISON, AND SUGGEST DRILL-DOWNS:
  • After building a trend or headline number, ASK: "Want me to compare this to last year?"

DASHBOARD DESIGN SENSE:
  • ONE widget = ONE question. Don't cram many series.
  • LEAD WITH THE HEADLINE. Most-important first.
  • GLANCEABILITY. metric_card for "how many", line/area for "which way is it trending", bar for "which is bigger", pivot ONLY when two dimensions truly matter.

VIZ + NAMING:
  • Title widgets the way a pastor would — plain, scannable, NO codes or jargon: "Salvations this year", "Attendance — last 12 months".

BE CONCISE:
  • Don't narrate tool calls. Keep streamed replies to 1–2 short sentences.

SELF-CHECK BEFORE final_answer:
  1. ONE clear question, most glanceable viz?
  2. Number in context — prior-year, trend, or goal?
  3. Single stat isolated with metric_names?
  4. Window RELATIVE?
  5. Plain title, no codes?

HARD RULES:
  - Never invent numbers — every number comes from build_widget.
  - If a request can't be expressed, say so plainly — don't build a wrong widget.
  - church_id is added automatically — never include it.`
