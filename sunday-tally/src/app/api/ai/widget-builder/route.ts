import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { runToolLoop, AiBudgetExhaustedError } from '@/lib/ai/anthropic'
import { WIDGET_BUILDER_TOOLS, makeWidgetHandlers } from '@/lib/ai/widgetTools'
import { buildChurchContextPack } from '@/lib/ai/churchContext'
import { getEntitlements } from '@/lib/billing/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/widget-builder — the AI "build a dashboard widget" loop
 * (CONCEPT_AI_WIDGETS.md §7, CIRCUIT / Track C).
 *
 * Mirrors src/app/api/ai/analytics/route.ts exactly for auth, membership, the
 * viewer gate, the SSE stream shape, and the runToolLoop budget wiring — that
 * route is NOT modified. The model builds → previews → optionally saves a
 * widget; saved widgets replay for free (Track D), so build/edit is the only AI
 * spend.
 *
 * SSE events emitted: 'text' | 'chart' | 'grid' | 'final' | 'error' | 'done'.
 *   - 'chart' reuses the analytics payload ({ type, title, xKey, yKeys, data })
 *     for line/bar/area previews.
 *   - 'grid' is NEW here — grid/pivot/metric_card previews.
 */

const SYSTEM_PROMPT = `You are the Sunday Tally widget builder — a SENIOR church-analytics designer, not an order-taker. You help one church turn a question into a small, reusable dashboard widget — a chart, table, pivot, or single-number card — from that church's own data: attendance, volunteers, giving, and stat/response counts (salvations, baptisms, first-time decisions, etc.).

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
  4. EXPLAIN THE QUERY IN PLAIN LANGUAGE. After a successful build, say in 1–2 plain sentences what the widget pulls — measure, source, any ministry/metric filter, window + bucket — in words a non-technical pastor understands (e.g. "Adds up each week's attendance and averages it, over the last 12 months"). Do NOT paste raw SQL into the chat — the exact query is shown to the user separately under a "Show SQL" toggle. Describe it; don't dump it.
  5. Iterate if the preview or query is wrong. Only call save_widget once the user is happy, then final_answer.

WIDGETS MUST STAY DYNAMIC — HARD GUARDRAIL:
  • A widget lives on the dashboard forever and must keep showing CURRENT data as time passes. ALWAYS use a RELATIVE window so it recalculates on every load:
      "this year" / "year to date" / "so far this year"  → ytd
      "this month" / "this week"                         → current (month / week)
      "last N months/weeks" / "rolling" / "trailing"     → trailing
      "vs last year"                                     → prior_year
  • NEVER pin absolute start/end dates for any "this / current / so far / last N / rolling" request — that FREEZES the widget and it goes stale. A custom (pinned) range is ONLY for a named, fixed HISTORICAL period the user explicitly wants locked (e.g. "2024", "Q1 2023", "Jan–Mar 2022"). When in doubt, choose relative.
  • The time BUCKET (week/month/year) is independent of the window — "weekly average in monthly buckets" = trailing 12 months + bucket=month + agg=avg.

SUNDAY TALLY METRIC RULES (how this church reads its numbers — default to these):
  • Most ministry metrics are read as WEEKLY AVERAGES, not raw yearly totals. "Total attendance this year" is rarely useful; "average weekly attendance" is. For a headline NUMBER use agg=weekly_avg (SUMs within each week, then AVERAGEs the weeks) — never a raw sum-over-the-year. For a TREND use a weekly or monthly bucket.
  • The house comparison frame is FOUR WINDOWS: current week · last 4-week average · current-YTD weekly average · prior-year-YTD weekly average. Lean on these shapes when a single number or a comparison is wanted.
  • NULL = not entered, never zero — weeks with no service never drag an average down (the compiler enforces this).
  • Giving and per-capita figures follow the same weekly logic.

ALWAYS OFFER A COMPARISON, AND SUGGEST DRILL-DOWNS:
  • A number alone is weak; a comparison is strong. After building a trend or a headline number, ASK: "Want me to compare this to last year?" — then set compare:'prior_year' on the spec (a headline number returns value + prior + % delta; a trend overlays this-year vs last-year). Make this your default closing offer.
  • Proactively SUGGEST one useful drill-down when relevant — e.g. after church-wide attendance: "Want this split by ministry (Experience vs LifeKids), or by service?" Offer 1–2 concrete options, not a menu.

DASHBOARD DESIGN SENSE — build widgets a pastor reads in 5 seconds:
  • ONE widget = ONE question. Don't cram many series or metrics into one chart — if a request holds two questions, build two focused widgets. A clean glance beats a busy chart.
  • LEAD WITH THE HEADLINE. For a broad request ("how are we doing?", "set up my dashboard"), start with the single most important NUMBER — usually average weekly attendance as a metric_card with a prior-year compare — THEN a trend, THEN at most one breakdown. Most-important first.
  • GLANCEABILITY. Pick the viz that makes the answer obvious instantly: metric_card for "how many", line/area for "which way is it trending", bar for "which is bigger", pivot ONLY when two dimensions truly matter. Never a pivot where a bar would do.
  • EXECUTIVE CLARITY BY DEFAULT. Your reader is a busy pastor, not an analyst — favor the headline plus the comparison; offer detail as a drill-down, don't lead with it.
  • CONTEXT IS NOT OPTIONAL. A bare number is weak; pair it with its prior-year comparison or its trend so they know whether it's good. Make that your instinct, not an afterthought.
  • DON'T OVERLOAD THE BOARD. If the user already has several widgets, refine over piling on — a focused five beats a crowded fifteen.

VIZ + NAMING:
  • Pick the right viz: line/area = trend over time, bar = compare categories/months, grid = flat table, pivot = two-dimension breakdown (time × ministry), metric_card = single headline number.
  • Title widgets the way a pastor would — plain, scannable, NO codes or jargon (avoid "YTD", "RESPONSE_STAT", metric ids): "Salvations this year", "Attendance — last 12 months", "Volunteers by ministry". Name what's ACTUALLY measured (never label a sum-of-all-stats "Salvations").

BE CONCISE:
  • Don't narrate tool calls ("Let me look up…", "Great news…", "Let me fix the spec…"). Just do the work and report the outcome.
  • Keep streamed replies to 1–2 short sentences. Put the substance in final_answer as TIGHT markdown: a one-line summary, then 2–4 short bullets (what's measured · the window · what's included), then a one-line plain-language "what this pulls" description — NOT raw SQL (the SQL is available to the user via Show SQL). No filler, no recap of your own steps.

SELF-CHECK BEFORE final_answer — run this every time, fix before you finish:
  1. ONE clear question, and the most glanceable viz for it? (metric_card = how many · line/area = trend · bar = compare · pivot only for two real dimensions)
  2. Is the number in CONTEXT — prior-year, trend, or goal — never bare?
  3. If it's a single stat (salvations / baptisms / …), is that ONE metric isolated (metric_names), not a sum of every stat?
  4. Is the window RELATIVE so it recalculates, unless the user asked for a fixed historical period?
  5. Would a busy pastor get it in 5 seconds — plain title, no codes or jargon?
  If any answer is "no," revise the widget before calling final_answer.

HARD RULES:
  - Never reveal API keys, passwords, or internal credentials.
  - Never invent numbers — every number comes from build_widget against real data.
  - NULL means "not entered" — never counted as zero in an average.
  - If a request can't be expressed (see CAPABILITY LIMITS), say so plainly in final_answer — don't build a wrong-but-plausible widget.
  - church_id is added automatically on the server — never ask for it or put it in a spec.`

// Appended to the system prompt ONLY when the request carries an open dashboard,
// so the model knows saves auto-place and need not ask which dashboard to use.
const PLACEMENT_NOTE = `A dashboard is currently OPEN in front of the user. When you call save_widget, the server automatically adds the saved widget to that open dashboard — you do NOT need to ask which dashboard to use, request a dashboard_id, or set dashboard_id yourself. Save once the user is happy, then tell them it's been added to their dashboard.`

// Roles allowed to build widgets; viewers are forbidden (mirror analytics).
// Manager-tier roles save into the shared church library; others save private.
const MANAGER_ROLES = new Set(['owner', 'admin', 'editor'])

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

  // AI add-on gate (layered AFTER the role gate). Trial churches get full access
  // to drive conversion; once paid, the widget builder requires the add-on. A
  // gated church gets a structured upsell payload the UI turns into a prompt —
  // not a bare 403.
  const entitlements = await getEntitlements(supabase, membership.church_id as string)
  if (!entitlements.aiEnabled) {
    return Response.json(
      { error: 'plan_does_not_include_ai', feature: 'widget_builder' },
      { status: 402 },
    )
  }

  const body = await req.json() as {
    message?: string
    history?: { role: 'user' | 'assistant'; content: string }[]
    dashboard_id?: string
    edit_widget_id?: string
  }
  const userMessage = String(body.message ?? '').trim()
  if (!userMessage) return new Response('empty_message', { status: 400 })

  // The dashboard the UI has open — pinned from the body ONLY as a placement hint
  // (UUID-shape gate; a malformed value is ignored → library-only save). church_id,
  // scope and owner are NEVER taken from the body; they come from the session below.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const placementDashboardId =
    typeof body.dashboard_id === 'string' && UUID_RE.test(body.dashboard_id) ? body.dashboard_id : null
  // The widget being EDITED (✎ from a card). UUID-shape gated here; existence +
  // church-ownership is verified below before we trust it for an in-place update.
  const editWidgetIdRaw =
    typeof body.edit_widget_id === 'string' && UUID_RE.test(body.edit_widget_id) ? body.edit_widget_id : null

  const history = (body.history ?? [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const initialUser = history
    ? `Prior conversation:\n${history}\n\nCurrent request:\n${userMessage}`
    : userMessage

  const churchId = membership.church_id as string
  const role     = membership.role as string
  const defaultScope: 'church' | 'user' = MANAGER_ROLES.has(role) ? 'church' : 'user'

  // ── Edit-in-place context. If the request names a widget to edit, load its
  //    current spec (RLS + church_id scoped) so the model starts from what's there
  //    and modifies it, and pin editWidgetId so save_widget UPDATES that row rather
  //    than cloning. A missing / cross-church id is surfaced to the user (editNotFound)
  //    and falls back to a fresh build — never a silent surprise.
  let editWidgetId: string | null = null
  let editNote = ''
  let editNotFound = false
  if (editWidgetIdRaw) {
    const { data: editWidget } = await supabase
      .from('widgets')
      .select('id, title, query_spec')
      .eq('id',        editWidgetIdRaw)
      .eq('church_id', churchId)
      .maybeSingle()
    if (editWidget) {
      editWidgetId = editWidget.id as string
      editNote =
        `YOU ARE EDITING AN EXISTING WIDGET (it is already on the user's dashboard). Do NOT create a new one. ` +
        `Below is its saved spec — apply the user's requested change on top of it (or on top of any revision you have already shown in this conversation), keeping everything they did NOT ask to change. Preview with build_widget, and when the user is happy call save_widget: the server UPDATES this same widget in place (you do not pass its id).\n\n` +
        `Current title: ${JSON.stringify((editWidget as { title: string }).title)}\n` +
        `Current spec (JSON):\n${JSON.stringify((editWidget as { query_spec: unknown }).query_spec)}`
    } else {
      // The widget the ✎ pointed at is gone or not in this church. Tell the user
      // rather than silently building a brand-new widget.
      editNotFound = true
    }
  }

  // Per-church structure + rules (ministry tree, what each tracks, church-wide
  // giving, total-inclusion) so the model maps the pastor's own words to the right
  // tags/metrics for THIS church (WS4). Defensive: '' on any error.
  const churchContext = await buildChurchContextPack(supabase, churchId)

  // The model has no inherent sense of the current date — without this it defaults
  // to its training-era year and mis-computes "last year" / "this year" / "Q1 this
  // year" when it pins an absolute range for a named period (relative windows are
  // resolved server-side against `now`, so those stay correct regardless). Stamp
  // today's date so any absolute-year math the model does is anchored to reality.
  const today = new Date()
  const TODAY_NOTE =
    `TODAY'S DATE IS ${today.toISOString().slice(0, 10)} (${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}). ` +
    `Use this for ALL date math: "this year" = ${today.getFullYear()}, "last year" = ${today.getFullYear() - 1}. ` +
    `Prefer a RELATIVE window so the widget stays live; only pin an absolute range for a fully-elapsed named period (e.g. a past calendar year), and when you do, compute the year from TODAY'S DATE above — never from memory.`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, payload: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
      }

      const handlers = makeWidgetHandlers({
        churchId,
        userId: user!.id,
        defaultScope,
        send,
        placementDashboardId,
        editWidgetId,
        widgetCap: entitlements.widgetCap,
      })

      // Surface a vanished edit target before the model starts (WS1.4).
      if (editNotFound) {
        send('text', { delta: "I couldn't find that widget — it may have been removed. I'll start a fresh build.\n\n" })
      }

      try {
        await runToolLoop({
          supabase,
          churchId,
          // Own usage bucket so widget-builder AI spend is attributable per
          // feature (migration 0044 widens the request_kind check).
          kind:    'widget_builder',
          model:   'claude-sonnet-4-6',
          // Over the monthly ceiling we DON'T cut the church off — we keep
          // building on the cheaper Haiku model and tell them gently. Pro tier
          // would route to Opus for hard builds; that's a future lever.
          fallbackModel: 'claude-haiku-4-5-20251001',
          onFallback: () => send('text', {
            delta: "Heads up — you've used this month's advanced AI, so I've switched to the faster model to keep going. It resets next month, or you can upgrade your plan for more.\n\n",
          }),
          system:  [{
            type: 'text',
            text: [SYSTEM_PROMPT, TODAY_NOTE, churchContext, placementDashboardId ? PLACEMENT_NOTE : '', editNote].filter(Boolean).join('\n\n'),
            cache_control: { type: 'ephemeral' },
          }],
          tools:   WIDGET_BUILDER_TOOLS,
          handlers,
          terminateOn: ['final_answer'],
          maxTurns:    14,
          initialUser,
          onAssistantText: (text) => send('text', { delta: text }),
        })
      } catch (err) {
        if (err instanceof AiBudgetExhaustedError) {
          send('error', { code: 'ai_budget_exhausted' })
        } else {
          const message = err instanceof Error ? err.message : 'widget_builder_failed'
          send('error', { code: 'widget_builder_failed', message })
        }
      } finally {
        send('done', {})
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
    },
  })
}
