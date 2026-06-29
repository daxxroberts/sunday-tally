import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { probeData, type ProbeInput } from '@/lib/ai/probe'
import {
  validateSpec,
  compileAndRun,
  describeSpec,
  resolveWindow,
  explainQuery,
  isRollingWindow,
} from '@/lib/widgets/compile'
import type { VizConfig, DateWindow } from '@/lib/widgets/spec'

/**
 * widgetTools — the AI tool surface for POST /api/ai/widget-builder (CIRCUIT,
 * Track C). The AI builds → previews → saves a dashboard widget; replay is
 * zero-AI and owned by Track D. See CONCEPT_AI_WIDGETS.md §7 / §9.1.
 *
 * Reuse map (do not reinvent):
 *   - probe_data / list_dimensions  → discovery, mirrors the analytics route
 *     (src/app/api/ai/analytics/route.ts) so the AI can find valid tag/metric/
 *     template/location codes before it composes a spec.
 *   - build_widget                  → validateSpec → compileAndRun against the
 *     EXISTING security_invoker views → stream a preview. No save.
 *   - save_widget                   → validateSpec → INSERT into `widgets`
 *     (+ optional `dashboard_widgets` placement) with a stored humanized
 *     `explainer`. The ONLY mutating tool. church_id / scope / owner come from
 *     the session — NEVER from the AI.
 *   - final_answer                  → ends with a short markdown summary.
 *
 * IMPORT CONTRACT (Track A owns src/lib/widgets/* — this file only consumes it):
 *   from '@/lib/widgets/compile': validateSpec, compileAndRun, describeSpec,
 *     WidgetSpec, VizConfig.
 *
 * The compiler bakes in the six critical DB rules (status='active', NULL≠0,
 * giving SUM per week, group by code not display_name) — this module does not
 * re-implement them; it trusts compileAndRun.
 */

// ─── SSE bridge ───────────────────────────────────────────────────────────────

/** Server-Sent-Events emitter the route hands in (`event: <name>\ndata: …`). */
export type SendEvent = (event: string, payload: unknown) => void

// ─── Tool definitions (shape mirrors the analytics route) ─────────────────────

export const PROBE_DATA_TOOL: Anthropic.Messages.Tool = {
  name: 'probe_data',
  description:
    `Check what data is actually logged before composing a widget. Returns the church's full ` +
    `service date range plus, when start/end are given, per-category counts of how many services ` +
    `have data logged in that window. Call this for time-bounded widgets so you can confirm the ` +
    `window will contain data before you build.`,
  input_schema: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'YYYY-MM-DD (optional)' },
      end_date:   { type: 'string', description: 'YYYY-MM-DD (optional)' },
      tag_code:   { type: 'string', description: 'Optional — scope to a specific service tag code.' },
    },
  },
}

export const LIST_DIMENSIONS_TOOL: Anthropic.Messages.Tool = {
  name: 'list_dimensions',
  description:
    `Lists the church's dimensions — service templates, locations, volunteer metric definitions, ` +
    `response/stat metric definitions, and ministry/service tags — with their STABLE codes. Use ` +
    `these codes (never display names) when you fill ministry_tag_codes / service_template_codes ` +
    `or a "by":"code" dimension in a widget spec. Note: per-source giving breakdown is not ` +
    `available; giving is church-wide weekly totals.`,
  input_schema: { type: 'object', properties: {} },
}

export const BUILD_WIDGET_TOOL: Anthropic.Messages.Tool = {
  name: 'build_widget',
  description:
    `Validate and run a widget spec ONCE against the church's data, then stream a live preview to ` +
    `the user. Use this to show the user what the widget will look like before saving. The window ` +
    `in query_spec.filters.date should be RELATIVE (trailing / current / ytd / prior_year) so the ` +
    `widget stays live on every future load — only pin a custom absolute range when the user names ` +
    `a fixed period (e.g. "2024"). Returns the resolved facts (what it's currently showing, what's ` +
    `summed, how it refreshes) AND query_sql — the equivalent SQL — so you can show the user the ` +
    `exact query the widget runs. If it returns an "error" field, the spec couldn't run as-is ` +
    `(e.g. a source can't group/filter that way) — read the message, fix the spec, and try again. ` +
    `Does NOT save.`,
  input_schema: {
    type: 'object',
    properties: {
      query_spec: {
        type: 'object',
        description:
          'The widget query spec (WidgetSpec JSON: version, source, measure, dimensions[0..2], ' +
          'optional filters, optional ratio, viz). filters supports: date (relative window), ' +
          'ministry_tag_codes (scope to ministries — source must be metric_entries_readable), ' +
          'metric_names (isolate ONE metric like ["Hands Raised"] from its reporting family — ' +
          'source must be metric_entries_readable). Without metric_names, a RESPONSE_STAT or ' +
          'VOLUNTEERS measure sums EVERY metric in that family. church_id is injected server-side ' +
          '— never include it.',
      },
      viz: {
        type: 'object',
        description:
          'Viz config: { kind: line|bar|area|grid|pivot|metric_card, xKey?, yKeys?, title }. ' +
          'Pick line/area for trends over time, bar for category comparisons, grid for a flat ' +
          'table, pivot for a two-dimension breakdown, metric_card for a single headline number. ' +
          'If omitted, query_spec.viz is used.',
      },
    },
    required: ['query_spec'],
  },
}

export const SAVE_WIDGET_TOOL: Anthropic.Messages.Tool = {
  name: 'save_widget',
  description:
    `Save the widget to the church's library so it replays for free on every future dashboard ` +
    `load. Call this only after the user has seen a preview and is happy. Optionally place it on a ` +
    `dashboard. A short, friendly, plain-language explainer is generated and stored with it. ` +
    `church_id, scope and owner come from the session — do not supply them.`,
  input_schema: {
    type: 'object',
    properties: {
      title:       { type: 'string', description: 'Short human title for the widget, e.g. "Attendance — last 12 months".' },
      query_spec:  { type: 'object', description: 'The same validated WidgetSpec JSON used in build_widget.' },
      viz_config:  { type: 'object', description: 'The viz config to store ({ kind, xKey?, yKeys?, title }).' },
      dashboard_id:{ type: 'string', description: 'Optional. Usually OMIT this — when a dashboard is open the server automatically places the saved widget on it. Only set it to a dashboard UUID if you need to target a DIFFERENT dashboard than the one the user has open.' },
    },
    required: ['title', 'query_spec'],
  },
}

export const FINAL_ANSWER_TOOL: Anthropic.Messages.Tool = {
  name: 'final_answer',
  description: 'Ends the conversation with a short markdown summary of what you built (and whether it was saved).',
  input_schema: {
    type: 'object',
    properties: { markdown: { type: 'string' } },
    required: ['markdown'],
  },
}

/** The full tool set, in the order the route registers them. */
export const WIDGET_BUILDER_TOOLS: Anthropic.Messages.Tool[] = [
  PROBE_DATA_TOOL,
  LIST_DIMENSIONS_TOOL,
  BUILD_WIDGET_TOOL,
  SAVE_WIDGET_TOOL,
  FINAL_ANSWER_TOOL,
]

// ─── list_dimensions (read-only; replicates the analytics handler) ────────────

/**
 * Read-only dimension listing — a faithful copy of the analytics route's
 * list_dimensions handler (NOT imported, to avoid editing that file). Unified
 * schema (0022+): volunteer/response categories live in `metrics` keyed by
 * reporting_tags.code; giving has no per-source breakdown.
 */
async function listDimensions(supabase: SupabaseClient, churchId: string) {
  const [templates, locations, volMetrics, respMetrics, tags, groups] = await Promise.all([
    supabase.from('service_templates').select('id, display_name, service_code').eq('church_id', churchId).eq('is_active', true),
    supabase.from('church_locations').select('id, name, code').eq('church_id', churchId).eq('is_active', true),
    supabase.from('metrics').select('id, code, name, ministry_tag_id, reporting_tags!inner(code)').eq('church_id', churchId).eq('is_active', true).eq('reporting_tags.code', 'VOLUNTEERS'),
    supabase.from('metrics').select('id, code, name, ministry_tag_id, reporting_tags!inner(code)').eq('church_id', churchId).eq('is_active', true).eq('reporting_tags.code', 'RESPONSE_STAT'),
    supabase.from('service_tags').select('id, code, name, tag_role').eq('church_id', churchId).eq('is_active', true).order('display_order', { ascending: true }),
    // Reporting groups (0037) — pre-apply the table doesn't exist; error → [].
    supabase.from('service_groups').select('id, code, name').eq('church_id', churchId).eq('is_active', true).order('sort_order', { ascending: true }),
  ])
  return {
    service_templates:    templates.data   ?? [],
    locations:            locations.data   ?? [],
    volunteer_categories: volMetrics.data  ?? [],
    response_categories:  respMetrics.data ?? [],
    giving_sources:       [],
    service_tags:         tags.data        ?? [],
    service_groups:       groups.error ? [] : (groups.data ?? []),
  }
}

// ─── Preview streaming (build_widget) ─────────────────────────────────────────

/** recharts kinds go out on the analytics 'chart' event; tabular kinds on 'grid'. */
const CHART_KINDS = new Set<VizConfig['kind']>(['line', 'bar', 'area'])

// ─── Humanized explainer (stored once at save time) ───────────────────────────

/**
 * Builds the one-paragraph, plain-language `explainer` narrative stored on the
 * widget at save time (CONCEPT §9.1 — "What this widget is"). Deterministic,
 * friendly, and short; folds in describeSpec's templated facts so the stored
 * narrative reads naturally without a second model call. The four templated
 * lines (summing / refresh / currentlyShowing / included) are stored alongside
 * so the flip panel needs zero AI on view.
 */
function buildExplainer(
  title: string,
  viz: VizConfig,
  facts: { summing?: string; refresh?: string; currentlyShowing?: string; included?: string },
) {
  const kindWord: Record<VizConfig['kind'], string> = {
    line: 'line chart',
    area: 'area chart',
    bar: 'bar chart',
    grid: 'table',
    pivot: 'pivot table',
    metric_card: 'single-number card',
  }
  const shape = kindWord[viz.kind] ?? 'widget'

  const sentences: string[] = []
  sentences.push(`“${title}” is a ${shape} built from your church's own numbers.`)
  if (facts.summing) sentences.push(facts.summing)
  if (facts.refresh) sentences.push(facts.refresh)
  else sentences.push('It refreshes itself every time you open the dashboard, so it always shows current data.')
  if (facts.included) sentences.push(facts.included)

  const narrative = sentences.join(' ')

  // Stored shape mirrors SpecExplainer's four lines plus the friendly narrative.
  return {
    narrative,
    summing:          facts.summing          ?? '',
    refresh:          facts.refresh          ?? '',
    currentlyShowing: facts.currentlyShowing ?? '',
    included:         facts.included         ?? '',
  }
}

// ─── Handler factory ──────────────────────────────────────────────────────────

export interface WidgetToolDeps {
  /** Session church — server-injected into every spec/insert. AI never sees it. */
  churchId:     string
  /** Session user — the created_by / owner for user-scope saves. */
  userId:       string
  /** 'church' for manager+ (shared library) or 'user' for a private widget. */
  defaultScope: 'church' | 'user'
  /** SSE emitter from the route. */
  send:         SendEvent
  /**
   * The dashboard currently OPEN in the UI, pinned by the route from the request
   * body (UUID-validated there). When save_widget runs and the model did NOT name
   * a dashboard_id itself, we fall back to this so the saved widget auto-lands on
   * the open board. null/undefined = no open dashboard → library-only save.
   */
  placementDashboardId?: string | null
  /**
   * When the user opened a widget's ✎ edit, the route pins that widget's id here
   * (UUID-validated + church-ownership-checked server-side). save_widget then
   * UPDATES this widget in place instead of INSERTing a clone — editing edits,
   * never clones. null/undefined = a fresh build → INSERT.
   */
  editWidgetId?: string | null
  /**
   * Max non-starter widgets the church library may hold under its plan
   * (src/lib/billing/entitlements.ts). A NEW church-scope save is refused once
   * the library is full; edits and user-scope saves are exempt. Infinity = pro
   * (unlimited). Defaults to Infinity if the route doesn't pass it.
   */
  widgetCap?: number
}

/** Canonical JSON (recursively sorted keys) so two specs with identical content
 *  but different key order compare equal — used by the build-before-save gate. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const obj = v as Record<string, unknown>
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/**
 * Builds the runToolLoop handler map. Handlers receive (input, ctx) from
 * runToolLoop; ctx.churchId / ctx.supabase are the server-injected session
 * values (identical to deps.churchId). We thread the SSE emitter + owner/scope
 * via the closure since runToolLoop's ctx carries only churchId + supabase.
 */
export function makeWidgetHandlers(deps: WidgetToolDeps) {
  const { userId, defaultScope, send, placementDashboardId, editWidgetId } = deps
  const widgetCap = deps.widgetCap ?? Number.POSITIVE_INFINITY

  // Build-before-save gate (WS1.3): the last spec that successfully PREVIEWED in
  // this builder session, plus its row count, so save_widget can refuse to persist
  // an un-previewed or empty widget. Per-request closure state.
  let lastBuiltSpec: string | null = null
  let lastBuiltRowCount = 0

  return {
    probe_data: async (input: Record<string, unknown>, ctx: { supabase: SupabaseClient; churchId: string }) => {
      return probeData(ctx.supabase, ctx.churchId, input as ProbeInput)
    },

    list_dimensions: async (_input: Record<string, unknown>, ctx: { supabase: SupabaseClient; churchId: string }) => {
      return listDimensions(ctx.supabase, ctx.churchId)
    },

    build_widget: async (input: Record<string, unknown>, ctx: { supabase: SupabaseClient; churchId: string }) => {
      const rawSpec = (input.query_spec ?? {}) as Record<string, unknown>
      const vizOverride = input.viz as VizConfig | undefined

      // 1. Validate (Track A's validateSpec — discriminated union, never throws).
      //    On failure, hand the precise errors back to the model so it can fix
      //    the spec rather than guessing.
      const parsed = validateSpec(rawSpec)
      if (!parsed.ok) {
        return { previewed: false, errors: parsed.errors }
      }
      const spec = parsed.spec
      const viz: VizConfig = vizOverride ?? spec.viz

      // 2. Compile + run ONCE against the existing views. church_id injected here,
      //    never from the AI. compileAndRun returns tidy rows + the resolved range
      //    and surfaces data problems via `error` (it does not throw on empty data).
      const runResult = await compileAndRun({
        supabase: ctx.supabase,
        churchId: ctx.churchId,
        spec,
        now: new Date(),
      })
      if (runResult.error) {
        return { previewed: false, error: runResult.error }
      }
      const rows = runResult.rows

      // 3. Stream the preview. recharts kinds → 'chart'; tabular kinds → 'grid'.
      //    Include the spec, the equivalent SQL (raw proof), AND the plain-language
      //    `explain` facts so the UI shows a HUMANIZED description by default and
      //    keeps the SQL behind a "Show SQL" toggle (CONCEPT §8/§9.1).
      const sql = explainQuery(spec, runResult.resolved)
      const facts = describeSpec(spec, runResult.resolved)
      const previewPayload = {
        title:   viz.title,
        xKey:    viz.xKey,
        yKeys:   viz.yKeys,
        data:    rows,
        spec,
        sql,
        explain: {
          summing:          facts.summing,
          refresh:          facts.refresh,
          currentlyShowing: facts.currentlyShowing,
          included:         facts.included,
        },
        rolling: isRollingWindow(spec),
      }
      if (CHART_KINDS.has(viz.kind)) {
        // Mirror the analytics 'chart' contract + spec/sql/explain for proof.
        send('chart', { type: viz.kind, ...previewPayload })
      } else {
        // 'grid' event for grid / pivot / metric_card previews.
        send('grid', { kind: viz.kind, ...previewPayload })
      }

      // Record this successful preview so save_widget can verify the user saw it.
      lastBuiltSpec     = stableStringify(spec)
      lastBuiltRowCount = rows.length

      // 4. Return the templated facts + the SQL so the model can explain EXACTLY
      //    what it queried (facts computed once above).
      return {
        previewed:        true,
        kind:             viz.kind,
        row_count:        rows.length,
        currently_showing: facts.currentlyShowing,
        summing:          facts.summing,
        refresh:          facts.refresh,
        included:         facts.included,
        query_sql:        sql,
      }
    },

    save_widget: async (input: Record<string, unknown>, ctx: { supabase: SupabaseClient; churchId: string }) => {
      const title       = String(input.title ?? '').trim()
      const rawSpec     = (input.query_spec ?? {}) as Record<string, unknown>
      // The model MAY name a dashboard_id; if it doesn't, fall back to the open
      // dashboard the route pinned from the request body so the widget still
      // auto-places on the board the user is looking at. church_id/scope/owner
      // stay server-injected below — only the placement target is hinted.
      const aiDashboardId = input.dashboard_id ? String(input.dashboard_id) : null
      const dashboardId   = aiDashboardId ?? placementDashboardId ?? null

      // Re-validate before persisting — never store an unvalidated spec.
      const parsed = validateSpec(rawSpec)
      if (!parsed.ok) {
        return { saved: false, errors: parsed.errors }
      }
      const spec = parsed.spec
      const viz: VizConfig = (input.viz_config as VizConfig | undefined) ?? spec.viz

      // Humanized explainer (CONCEPT §9.1) — generated once, stored, zero-AI on view.
      // describeSpec needs the resolved window; resolve it the same way the
      // compiler does (default = trailing 12 months) so "currently showing" is right.
      const window: DateWindow = spec.filters?.date ?? { window: 'trailing', count: 12, unit: 'month' }
      const resolved = resolveWindow(window, new Date())
      const facts = describeSpec(spec, resolved)
      const explainer = buildExplainer(title || viz.title, viz, facts)

      // EDIT-IN-PLACE: when the route pinned an editWidgetId (the user opened ✎ on
      // an existing card), UPDATE that widget instead of INSERTing a clone — so
      // editing edits, never duplicates. It stays on whatever dashboard(s) already
      // hold it (no new placement). church_id pins the tenant; RLS is the guard
      // (a cross-church / not-owned id updates 0 rows → reported as a failed save).
      if (editWidgetId) {
        const { data: updated, error: updErr } = await ctx.supabase
          .from('widgets')
          .update({
            title:      title || viz.title,
            kind:       viz.kind,
            query_kind: 'spec',
            query_spec: spec,
            viz_config: viz,
            explainer,
            updated_at: new Date().toISOString(),
          })
          .eq('id',        editWidgetId)
          .eq('church_id', ctx.churchId)
          .select('id')
          .maybeSingle()
        if (updErr || !updated) {
          return { saved: false, error: updErr?.message ?? 'widget_update_failed' }
        }
        return {
          saved:     true,
          widget_id: editWidgetId,
          updated:   true,
          placed:    true, // already placed; editing never moves or clones it
          explainer: explainer.narrative,
        }
      }

      // WS1.3 build-before-save gate: never persist a spec the user hasn't seen
      // previewed, and never persist a widget that returned zero rows. Edits are
      // exempt (they return above). The AI must build_widget the exact spec first.
      if (lastBuiltSpec === null || lastBuiltSpec !== stableStringify(spec)) {
        return {
          saved: false,
          error: 'Preview this widget with build_widget before saving, so the numbers are verified. Build the exact spec you intend to save, then save it.',
        }
      }
      if (lastBuiltRowCount === 0) {
        return {
          saved: false,
          error: 'The preview returned no rows — nothing to save yet. Adjust the window or filters, rebuild, and confirm it shows data before saving.',
        }
      }

      // Plan widget-library cap: a NEW church-scope widget is refused once the
      // library is full (edits return above; user-scope private widgets are
      // exempt; pro = Infinity skips this). Counts non-starter church widgets —
      // seeded starters don't eat the allowance.
      if (Number.isFinite(widgetCap) && defaultScope === 'church') {
        const { count } = await ctx.supabase
          .from('widgets')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', ctx.churchId)
          .eq('scope', 'church')
          .eq('is_starter', false)
        if ((count ?? 0) >= widgetCap) {
          return {
            saved: false,
            error:
              `This church's widget library is full (${widgetCap} widgets on the current plan). ` +
              `Tell the user warmly: they've reached the saved-widget limit for their plan, so to save this new view they can remove a widget they no longer use, or upgrade their plan for a bigger library. Then stop; do not save.`,
            library_full: true,
            widget_cap: widgetCap,
          }
        }
      }

      // Title dedup: if a widget with the same title already exists in this church's
      // library, append " (2)", " (3)" etc. so the library stays distinguishable.
      // Case-insensitive; only affects fresh INSERT — edits return above.
      const baseTitle = title || viz.title
      const { data: existingTitles } = await ctx.supabase
        .from('widgets')
        .select('title')
        .eq('church_id', ctx.churchId)
      const taken = new Set(
        ((existingTitles ?? []) as { title: string }[]).map((w) => w.title.toLowerCase()),
      )
      let finalTitle = baseTitle
      if (taken.has(baseTitle.toLowerCase())) {
        let n = 2
        while (taken.has(`${baseTitle} (${n})`.toLowerCase())) n++
        finalTitle = `${baseTitle} (${n})`
      }
      // Rebuild the explainer with the deduplicated title so the stored narrative matches.
      const finalExplainer = finalTitle !== baseTitle ? buildExplainer(finalTitle, viz, facts) : explainer

      // INSERT into `widgets`. church_id / scope / owner / created_by are all
      // server-injected from the session — NEVER from the AI. The `widgets` and
      // `dashboard_widgets` tables are live (migrations 0033 + 0035) and RLS-scoped
      // to the session church, so this insert runs for real.
      const ownerUserId = defaultScope === 'user' ? userId : null
      const { data: widget, error: widgetErr } = await ctx.supabase
        .from('widgets')
        .insert({
          church_id:     ctx.churchId,
          scope:         defaultScope,
          owner_user_id: ownerUserId,
          title:         finalTitle,
          kind:          viz.kind,
          query_kind:    'spec',
          query_spec:    spec,
          viz_config:    viz,
          explainer:     finalExplainer,
          is_starter:    false,
          created_by:    userId,
        })
        .select('id')
        .single()

      if (widgetErr || !widget) {
        return {
          saved: false,
          error: widgetErr?.message ?? 'widget_insert_failed',
        }
      }

      const widgetId = (widget as { id: string }).id

      // Optional placement on a dashboard (junction row).
      let placement: { id: string } | null = null
      if (dashboardId) {
        const { data: place, error: placeErr } = await ctx.supabase
          .from('dashboard_widgets')
          .insert({
            church_id:    ctx.churchId,
            dashboard_id: dashboardId,
            widget_id:    widgetId,
            layout:       {},   // default cell; the grid (Track D) sizes/positions it
          })
          .select('id')
          .single()
        if (placeErr) {
          return {
            saved:        true,
            widget_id:    widgetId,
            placed:       false,
            placement_error: placeErr.message,
            title:        finalTitle,
            explainer:    finalExplainer.narrative,
          }
        }
        placement = place as { id: string }
      }

      return {
        saved:      true,
        widget_id:  widgetId,
        placed:     !!placement,
        scope:      defaultScope,
        title:      finalTitle,
        explainer:  finalExplainer.narrative,
      }
    },

    final_answer: async (input: Record<string, unknown>) => {
      send('final', { markdown: String(input.markdown ?? '') })
      return { done: true }
    },
  }
}
