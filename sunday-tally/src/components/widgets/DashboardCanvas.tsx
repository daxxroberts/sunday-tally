'use client'

/**
 * DashboardCanvas — the real, draggable, in-chat Dashboard surface (Track D).
 *
 * Promoted from src/app/mockup/widgets/interactive.tsx (the grid half) and wired
 * to the live, zero-AI endpoints:
 *   • GET  /api/dashboards                  — the church's canvases
 *   • POST /api/dashboards                  — create a default canvas if none
 *   • GET  /api/dashboards/[id]?campus&from&to — REPLAY each placed widget (no AI)
 *   • GET  /api/widgets                     — the library palette
 *   • POST /api/dashboards/[id]/widgets     — place a library widget (✚ from palette)
 *   • DELETE …/widgets?widget_id=           — remove a placement (✕ on a card)
 *
 * On mount it loads dashboards (creating a private "My Dashboard" when the church
 * has none yet), then replays the active one. A global filters bar (date range +
 * campus) re-runs the replay with ?from/&to/&campus. The ✦ drawer is the AI
 * builder (WidgetChat); after a build the canvas refreshes the replay + library.
 *
 * Grid: react-grid-layout v2 (useContainerWidth + dragConfig/resizeConfig). The
 * "Edit layout" toggle enables drag/resize; drag is cancelled on `.no-drag`
 * (the card's header buttons) so clicking ✎/✕/ⓘ never starts a drag.
 *
 * DESIGN_SYSTEM: brand #4F6EF7, rounded-2xl, SVG icons, amber (not red) for
 * destructive/attention, Fira numerals via tabular-nums on values.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Responsive as ResponsiveGridLayout,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { createClient } from '@/lib/supabase/client'
import { WidgetCard, type ReplayWidget, type WidgetKind } from './ui'
import { WidgetChat } from './WidgetChat'

// ─── API shapes ───────────────────────────────────────────────────────────────

interface DashboardRow {
  id: string
  name: string
  scope: 'church' | 'user'
}

interface LibraryWidget {
  id: string
  title: string
  kind: WidgetKind
  is_starter: boolean
  scope: 'church' | 'user'
}

interface Campus {
  id: string
  name: string
}

// A stored placement layout cell ({ x, y, w, h } or {} when unset).
type Cell = { x?: number; y?: number; w?: number; h?: number }

// ─── grid sizing ──────────────────────────────────────────────────────────────

const COLS = 12
const ROW_H = 70

/** Default cell for a freshly-placed widget when it has no stored layout. */
function defaultCell(kind: WidgetKind, yBase: number): Omit<LayoutItem, 'i'> {
  const isCard = kind === 'metric_card'
  const isWide = kind === 'pivot' || kind === 'grid'
  return { x: 0, y: yBase, w: isCard ? 4 : isWide ? 8 : 6, h: isCard ? 3 : isWide ? 5 : 4 }
}

/** Build the lg layout from replayed widgets, honoring any stored cell. */
function layoutFromWidgets(widgets: ReplayWidget[]): LayoutItem[] {
  let yCursor = 0
  return widgets.map((w) => {
    const stored = (w.layout ?? {}) as Cell
    const hasStored =
      typeof stored.x === 'number' && typeof stored.y === 'number' && typeof stored.w === 'number' && typeof stored.h === 'number'
    if (hasStored) {
      yCursor = Math.max(yCursor, (stored.y as number) + (stored.h as number))
      return { i: w.id, x: stored.x as number, y: stored.y as number, w: stored.w as number, h: stored.h as number }
    }
    const cell = defaultCell(w.kind, yCursor)
    yCursor += cell.h
    return { i: w.id, ...cell }
  })
}

// ─── component ────────────────────────────────────────────────────────────────

export function DashboardCanvas() {
  const [dashboards, setDashboards] = useState<DashboardRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [widgets, setWidgets] = useState<ReplayWidget[]>([])
  const [layout, setLayout] = useState<LayoutItem[]>([])
  const [library, setLibrary] = useState<LibraryWidget[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])

  const [loading, setLoading] = useState(true)
  const [replayError, setReplayError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [libOpen, setLibOpen] = useState(false)
  const [chatSeed, setChatSeed] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<{ id: string; title: string } | null>(null)
  const [busyWidget, setBusyWidget] = useState<string | null>(null)

  // Global filters.
  const [campus, setCampus] = useState<string>('') // '' = home (server default), 'all', or a campus id
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // Width measure that survives the grid container mounting AFTER data loads (it's
  // conditional on widgets.length). A callback ref measures on attach; a resize
  // listener keeps it responsive. (react-grid-layout v2's useContainerWidth does
  // not re-attach to a container that appears post-mount → blank grid on first load.)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const mounted = width > 0
  const setContainer = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node
    if (node) setWidth(node.offsetWidth)
  }, [])
  useEffect(() => {
    const onResize = () => nodeRef.current && setWidth(nodeRef.current.offsetWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── boot: dashboards (+ default), library, campuses ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Campuses (RLS-scoped) — same client pattern the dashboard/entries pages use.
      // Widget DATA never comes from here; this is only the campus picker's options.
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: locs } = await supabase
            .from('church_locations')
            .select('id, name')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
          if (!cancelled && locs) setCampuses(locs as Campus[])
        }
      } catch {
        /* campus picker is optional — ignore */
      }

      // Dashboards — create a private default if the church has none yet.
      let list: DashboardRow[] = []
      try {
        const res = await fetch('/api/dashboards')
        if (res.ok) list = ((await res.json()).dashboards ?? []) as DashboardRow[]
      } catch {
        /* fall through to empty */
      }
      if (list.length === 0) {
        try {
          const res = await fetch('/api/dashboards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'My Dashboard', scope: 'user' }),
          })
          if (res.ok) {
            const created = (await res.json()).dashboard as DashboardRow
            list = [created]
          }
        } catch {
          /* ignore — surfaced as empty state */
        }
      }
      if (cancelled) return
      setDashboards(list)
      setActiveId((prev) => prev ?? list[0]?.id ?? null)

      // Library palette.
      try {
        const res = await fetch('/api/widgets')
        if (res.ok && !cancelled) setLibrary(((await res.json()).widgets ?? []) as LibraryWidget[])
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── replay the active dashboard whenever it / the filters change ──
  const replay = useCallback(async () => {
    if (!activeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setReplayError(null)
    const qs = new URLSearchParams()
    if (campus) qs.set('campus', campus)
    if (from && to) {
      qs.set('from', from)
      qs.set('to', to)
    }
    try {
      const res = await fetch(`/api/dashboards/${activeId}${qs.toString() ? `?${qs}` : ''}`)
      if (!res.ok) {
        setReplayError(`Couldn't load this dashboard (HTTP ${res.status}).`)
        setWidgets([])
        setLayout([])
        return
      }
      const json = (await res.json()) as { widgets: ReplayWidget[] }
      const ws = json.widgets ?? []
      setWidgets(ws)
      setLayout(layoutFromWidgets(ws))
    } catch (e) {
      setReplayError(e instanceof Error ? e.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [activeId, campus, from, to])

  useEffect(() => {
    void replay()
  }, [replay])

  // ── library refresh (after an AI build adds a widget) ──
  const refreshLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/widgets')
      if (res.ok) setLibrary(((await res.json()).widgets ?? []) as LibraryWidget[])
    } catch {
      /* ignore */
    }
  }, [])

  // ── place a library widget on the active dashboard ──
  const placeWidget = useCallback(
    async (widgetId: string) => {
      if (!activeId || busyWidget) return
      setBusyWidget(widgetId)
      try {
        const res = await fetch(`/api/dashboards/${activeId}/widgets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widget_id: widgetId }),
        })
        if (res.ok) await replay()
        else setReplayError(res.status === 403 ? 'You need an editor+ role to add widgets here.' : 'Could not add that widget.')
      } finally {
        setBusyWidget(null)
      }
    },
    [activeId, busyWidget, replay],
  )

  // ── remove a placement ──
  const removeWidget = useCallback(
    async (widgetId: string) => {
      if (!activeId) return
      // optimistic
      setWidgets((ws) => ws.filter((w) => w.id !== widgetId))
      setLayout((l) => l.filter((it) => it.i !== widgetId))
      try {
        const res = await fetch(`/api/dashboards/${activeId}/widgets?widget_id=${encodeURIComponent(widgetId)}`, {
          method: 'DELETE',
        })
        if (!res.ok) await replay() // roll back to server truth
      } catch {
        await replay()
      }
    },
    [activeId, replay],
  )

  // ── persist the grid arrangement (drag/resize) back to dashboard_widgets.layout
  //    so it survives a reload. Fires on drag/resize STOP only — never on mount or
  //    mid-drag. Best-effort: the grid already shows the new positions locally. ──
  const persistLayout = useCallback(
    (items: LayoutItem[]) => {
      if (!activeId) return
      void Promise.allSettled(
        items.map((it) =>
          fetch(`/api/dashboards/${activeId}/widgets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ widget_id: it.i, layout: { x: it.x, y: it.y, w: it.w, h: it.h } }),
          }),
        ),
      )
    },
    [activeId],
  )

  // ── ✎ edit a widget → open the chat in EDIT mode. The server loads the widget's
  //    current spec from edit_widget_id and UPDATES it in place (never clones). ──
  const editWidget = useCallback((w: ReplayWidget) => {
    setChatOpen(true)
    setChatSeed(null)
    setEditTarget({ id: w.id, title: w.title })
  }, [])

  // Which library widgets are already on this board (the Library shows them "Added").
  const placed = useMemo(() => new Set(widgets.map((w) => w.id)), [widgets])

  const activeName = dashboards.find((d) => d.id === activeId)?.name ?? 'Dashboard'

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      {/* Toolbar: dashboard name · filters · actions */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="mr-auto flex items-center gap-2">
          <span className="h-4 w-1.5 rounded-full bg-[#4F6EF7]" />
          <h2 className="text-sm font-bold text-slate-900">{activeName}</h2>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 text-xs">
          <label className="sr-only" htmlFor="dash-from">
            From date
          </label>
          <input
            id="dash-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="font-num rounded-lg border border-slate-200 px-2 py-1 text-slate-700 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
          />
          <span className="text-slate-400">→</span>
          <label className="sr-only" htmlFor="dash-to">
            To date
          </label>
          <input
            id="dash-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="font-num rounded-lg border border-slate-200 px-2 py-1 text-slate-700 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
          />
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('')
                setTo('')
              }}
              className="rounded-lg px-1.5 py-1 text-slate-400 hover:text-slate-600"
              title="Clear date range (back to each widget's live window)"
            >
              clear
            </button>
          )}
        </div>

        {/* Campus */}
        {campuses.length > 0 && (
          <>
            <label className="sr-only" htmlFor="dash-campus">
              Campus
            </label>
            <select
              id="dash-campus"
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
            >
              <option value="">My campus</option>
              <option value="all">All campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Actions */}
        <button
          type="button"
          onClick={() => setLibOpen((v) => !v)}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            libOpen ? 'border-[#4F6EF7] bg-[#4F6EF7]/5 text-[#4F6EF7]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          Library
        </button>
        <button
          type="button"
          onClick={() => setEditMode((e) => !e)}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            editMode ? 'border-[#4F6EF7] bg-[#4F6EF7] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          {editMode ? 'Done arranging' : 'Edit layout'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!chatOpen) setEditTarget(null) // opening fresh → build a NEW widget, not edit
            setChatOpen((c) => !c)
          }}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300"
        >
          {chatOpen ? 'Hide AI' : '✦ Build with AI'}
        </button>
      </header>

      {/* Library (collapsible) — your whole saved collection; placed ones show "Added". */}
      {libOpen && (
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Library</span>
            <span className="text-[11px] text-slate-400">
              {library.length === 0
                ? 'empty'
                : `${library.length} widget${library.length === 1 ? '' : 's'} · click one to add it to this dashboard`}
            </span>
          </div>
          {library.length === 0 ? (
            <p className="text-xs text-slate-400">No saved widgets yet — build one with AI to start your library.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {library.map((l) => {
                const isPlaced = placed.has(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={!!busyWidget || isPlaced}
                    onClick={() => void placeWidget(l.id)}
                    className={`group inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors disabled:cursor-default ${
                      isPlaced
                        ? 'border-slate-200 bg-slate-50 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-[#4F6EF7] hover:bg-[#4F6EF7]/5 disabled:opacity-50'
                    }`}
                    title={isPlaced ? `"${l.title}" is already on this dashboard` : `Add "${l.title}" to this dashboard`}
                  >
                    <KindIcon kind={l.kind} />
                    <span className="font-medium">{l.title}</span>
                    {l.is_starter && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        Starter
                      </span>
                    )}
                    {isPlaced ? (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
                        Added
                      </span>
                    ) : (
                      <span className="text-[#4F6EF7] opacity-0 transition-opacity group-hover:opacity-100">+</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Body: grid (+ chat drawer). `relative` anchors the small-screen chat overlay. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
          {editMode && (
            <p className="mb-2 px-2 text-xs text-slate-500">
              Drag any card to move it; drag its bottom-right corner to resize. Put two side by side.
            </p>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : replayError ? (
            <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-700">
              {replayError}
            </div>
          ) : widgets.length === 0 ? (
            <EmptyBoard onAdd={() => setLibOpen(true)} onBuild={() => setChatOpen(true)} hasLibrary={library.length > 0} />
          ) : (
            <div ref={setContainer}>
              {mounted && (
                <ResponsiveGridLayout
                  width={width}
                  className="layout"
                  layouts={{ lg: layout }}
                  breakpoints={{ lg: 1024, md: 768, sm: 480, xs: 0 }}
                  cols={{ lg: COLS, md: 8, sm: 4, xs: 2 }}
                  rowHeight={ROW_H}
                  margin={[14, 14]}
                  dragConfig={{ enabled: editMode, cancel: '.no-drag' }}
                  resizeConfig={{ enabled: editMode }}
                  onLayoutChange={(l: Layout) => setLayout([...l])}
                  onDragStop={(l: Layout) => { const next = [...l]; setLayout(next); persistLayout(next) }}
                  onResizeStop={(l: Layout) => { const next = [...l]; setLayout(next); persistLayout(next) }}
                >
                  {widgets.map((w) => (
                    <div key={w.id} className={editMode ? 'cursor-move rounded-2xl ring-2 ring-[#4F6EF7]/30' : ''}>
                      <WidgetCard w={w} onEdit={() => editWidget(w)} onRemove={() => void removeWidget(w.id)} />
                    </div>
                  ))}
                </ResponsiveGridLayout>
              )}
            </div>
          )}
        </main>

        {/* Chat drawer — in-flow on lg+, overlay on small screens */}
        {chatOpen && (
          <div className="absolute inset-y-0 right-0 z-30 w-[min(100vw,22rem)] shadow-2xl lg:relative lg:z-auto lg:w-80 lg:shadow-none xl:w-96">
            <WidgetChat
              dashboardId={activeId}
              editWidgetId={editTarget?.id ?? null}
              editTitle={editTarget?.title ?? null}
              onExitEdit={() => setEditTarget(null)}
              seed={chatSeed}
              onSeedConsumed={() => setChatSeed(null)}
              onSaved={() => {
                void replay()
                void refreshLibrary()
              }}
              onClose={() => setChatOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── empty state ──────────────────────────────────────────────────────────────

function EmptyBoard({ onAdd, onBuild, hasLibrary }: { onAdd: () => void; onBuild: () => void; hasLibrary: boolean }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#4F6EF7]/10 text-[#4F6EF7]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      </span>
      <h3 className="text-base font-bold text-slate-900">Your dashboard is empty</h3>
      <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
        Add a saved widget from your library, or ask the AI to build a new one from your church&apos;s data.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {hasLibrary && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
          >
            Add from library
          </button>
        )}
        <button type="button" onClick={onBuild} className="rounded-lg bg-[#4F6EF7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3D5BD4]">
          ✦ Build with AI
        </button>
      </div>
    </div>
  )
}

// ─── tiny per-kind glyph for the palette ──────────────────────────────────────

function KindIcon({ kind }: { kind: WidgetKind }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const
  const cls = 'text-slate-400'
  if (kind === 'metric_card')
    return (
      <svg {...common} className={cls}>
        <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
      </svg>
    )
  if (kind === 'pivot' || kind === 'grid')
    return (
      <svg {...common} className={cls}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18" />
      </svg>
    )
  if (kind === 'bar')
    return (
      <svg {...common} className={cls}>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" strokeLinecap="round" />
      </svg>
    )
  // line / area
  return (
    <svg {...common} className={cls}>
      <path d="M3 17l5-6 4 3 5-7 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
