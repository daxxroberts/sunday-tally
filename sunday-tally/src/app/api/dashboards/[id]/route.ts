// GET /api/dashboards/[id] — THE widget replay endpoint (zero AI).
//
// CONCEPT_AI_WIDGETS.md §8: load the dashboard's placements, and for EACH placed
// widget compile + execute its stored query_spec under the caller's RLS, then
// return tidy rows. There is NO Anthropic call anywhere on this path — replay is
// deterministic and free. Editing/building a widget (which DOES spend AI) lives in
// Track A / Track C, never here.
//
// Isolation is structural (CONCEPT §5): the security_invoker views + table RLS
// filter other churches' rows under the logged-in user's auth.uid(), and the
// compiler additionally injects the caller's church_id from the session (never
// from the client or the stored spec). We pass membership.church_id straight into
// compileAndRun — defense in depth.
//
// Schema-drift guard (CONCEPT §8, §11): a single widget whose spec references a
// deleted metric/tag (validateSpec throws) or whose query fails at runtime yields
// a graceful per-widget { error } object — it never turns the whole load into a
// 500. One bad widget cannot blank the dashboard.
//
// NOTE: the widgets / dashboards / dashboard_widgets tables are introduced by
// migration 0033 (NEEDS-APPROVAL, not yet applied). This handler type-checks
// against the '@/lib/widgets/*' contract; it is live-tested by the brain once
// 0033 is applied.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateSpec, compileAndRun, describeSpec } from '@/lib/widgets/compile'
import type { WidgetSpec, VizConfig, SpecExplainer } from '@/lib/widgets/spec'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Return type of compileAndRun is owned by Track A (compile.ts). We derive the
// rows/resolved shape from the function itself rather than redefining it, so this
// route tracks the contract and never drifts from it.
type CompileResult = Awaited<ReturnType<typeof compileAndRun>>
type ResolvedWindow = CompileResult['resolved']

type WidgetKind = VizConfig['kind']

// ─── DB row shapes (the 0033 contract) ────────────────────────────────────────

interface DashboardRow {
  id: string
  church_id: string
  owner_user_id: string | null
  name: string
  scope: 'church' | 'user'
  breakpoints: unknown
  created_at: string
  updated_at: string
}

interface PlacementRow {
  id: string
  dashboard_id: string
  widget_id: string
  layout: unknown
}

interface WidgetRow {
  id: string
  title: string
  kind: WidgetKind
  query_spec: unknown      // validated per-widget via validateSpec (schema-drift guard)
  viz_config: unknown
}

// ─── Per-widget replay result ─────────────────────────────────────────────────

interface ReplayWidget {
  id: string
  title: string
  kind: WidgetKind
  viz_config: unknown
  layout: unknown
  rows: unknown[]
  resolved: ResolvedWindow | null
  explainerFacts: SpecExplainer | null
  error?: string
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dashboardId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Membership (mirrors src/app/api/ai/analytics/route.ts). Replay is a READ path:
  // dashboards are visible to ALL active members (CONCEPT §6), including viewers,
  // so there is no role gate here — only an active-membership requirement, which
  // also pins the tenant (church_id) from the session.
  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id, role, default_location_id')
    .eq('user_id',   user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'no_church' }, { status: 403 })

  const churchId = membership.church_id as string

  // ── Campus scope (per-user, auto-applied). The dashboard defaults to the
  //    signed-in user's home campus (church_memberships.default_location_id,
  //    D-088). ?campus=<uuid> overrides it; ?campus=all shows every campus. A
  //    one-campus church (or a user with no default) → all campuses (undefined).
  //    Giving is church-wide and ignores this scope (handled in the compiler).
  const url = new URL(req.url)
  const campusParam = url.searchParams.get('campus')
  const defaultLoc = (membership as { default_location_id?: string | null }).default_location_id ?? null
  const locationIds: string[] | undefined =
    campusParam === 'all' ? undefined
    : campusParam ? [campusParam]
    : defaultLoc ? [defaultLoc]
    : undefined

  // Global date filter (dashboard-level): ?from=YYYY-MM-DD&to=YYYY-MM-DD overrides
  // every widget's own window so the whole board reports the same range.
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  const windowOverride =
    fromParam && toParam ? ({ window: 'custom' as const, start: fromParam, end: toParam }) : undefined

  // ── Load the dashboard (RLS-scoped; church_id pinned as defense in depth). RLS
  //    already filters to dashboards the caller may see — church-scope rows for any
  //    member, user-scope rows only where owner_user_id = auth.uid(). The extra
  //    church_id predicate keeps a user-scope row from another church unreachable
  //    even in the (impossible-under-RLS) event one were returned.
  const { data: dashboardData, error: dErr } = await supabase
    .from('dashboards')
    .select('id, church_id, owner_user_id, name, scope, breakpoints, created_at, updated_at')
    .eq('id', dashboardId)
    .eq('church_id', churchId)
    .maybeSingle()

  if (dErr) {
    return NextResponse.json({ error: 'dashboard_load_failed' }, { status: 500 })
  }
  const dashboard = dashboardData as DashboardRow | null
  if (!dashboard) {
    // Not found OR not visible to this caller (RLS filtered it) — same answer, no
    // existence oracle across churches/users.
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // ── Placements for this dashboard (which widget sits where). ──
  const { data: placementsData, error: pErr } = await supabase
    .from('dashboard_widgets')
    .select('id, dashboard_id, widget_id, layout')
    .eq('dashboard_id', dashboard.id)
    .eq('church_id', churchId)
  if (pErr) {
    return NextResponse.json({ error: 'placements_load_failed' }, { status: 500 })
  }
  const placements = (placementsData ?? []) as PlacementRow[]

  // ── The referenced widget definitions (the library entries). ──
  const widgetIds = Array.from(new Set(placements.map(p => p.widget_id)))
  const widgetById = new Map<string, WidgetRow>()
  if (widgetIds.length > 0) {
    const { data: widgetsData, error: wErr } = await supabase
      .from('widgets')
      .select('id, title, kind, query_spec, viz_config')
      .eq('church_id', churchId)
      .in('id', widgetIds)
    if (wErr) {
      return NextResponse.json({ error: 'widgets_load_failed' }, { status: 500 })
    }
    for (const w of (widgetsData ?? []) as WidgetRow[]) widgetById.set(w.id, w)
  }

  const now = new Date()

  // ── Compile + run each placement. Each widget is fully isolated so a single bad
  //    widget yields a graceful per-widget { error } object — never a 500
  //    (schema-drift guard, CONCEPT §8). There are three failure surfaces:
  //      1. validateSpec returns { ok:false, errors } for a malformed / stale spec
  //         (it reports, it does not throw) → join the errors into the message.
  //      2. compileAndRun returns an { error } field for an unsupported plan (e.g.
  //         a categorical dim a view can't serve) — surfaced as the widget error.
  //      3. an unexpected throw (defensive) → caught and reported.
  //    compileAndRun is awaited; the whole body is wrapped so nothing escapes. ──
  async function replayPlacement(placement: PlacementRow): Promise<ReplayWidget> {
    const widget = widgetById.get(placement.widget_id)

    // The placement points at a widget that no longer exists / isn't visible.
    if (!widget) {
      return {
        id: placement.widget_id,
        title: 'Unavailable widget',
        kind: 'metric_card',
        viz_config: null,
        layout: placement.layout,
        rows: [],
        resolved: null,
        explainerFacts: null,
        error: 'widget_not_found',
      }
    }

    const base = {
      id: widget.id,
      title: widget.title,
      kind: widget.kind,
      viz_config: widget.viz_config,
      layout: placement.layout,
    }

    try {
      const validation = validateSpec(widget.query_spec)
      if (!validation.ok) {
        return {
          ...base,
          rows: [],
          resolved: null,
          explainerFacts: null,
          error: validation.errors.join('; ') || 'widget_invalid_spec',
        }
      }
      const spec: WidgetSpec = validation.spec

      const result = await compileAndRun({ supabase, churchId, spec, now, locationIds, windowOverride })
      if (result.error) {
        // Unsupported plan / runtime guard tripped — still return the resolved
        // window + facts so the flip-to-explain panel works, but flag the error.
        return {
          ...base,
          rows: result.rows,
          resolved: result.resolved,
          explainerFacts: describeSpec(spec, result.resolved),
          error: result.error,
        }
      }

      return {
        ...base,
        rows: result.rows,
        resolved: result.resolved,
        explainerFacts: describeSpec(spec, result.resolved),
      }
    } catch (err) {
      return {
        ...base,
        rows: [],
        resolved: null,
        explainerFacts: null,
        error: err instanceof Error ? err.message : 'widget_replay_failed',
      }
    }
  }

  const widgets = await Promise.all(placements.map(replayPlacement))

  return NextResponse.json({ dashboard, widgets })
}
