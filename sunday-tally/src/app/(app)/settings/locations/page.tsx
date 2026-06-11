'use client'

// ─────────────────────────────────────────────────────────────────────────
// CAMPUSES — /(app)/settings/locations — IRIS_SETTINGS (E-40..E-56).
// REDESIGN to DESIGN_SYSTEM. ONE zone (D-096 reconciliation):
//   B · Campuses (church_locations): inline-edit name, add (slug code, guard
//     uq_location_code), soft deactivate/reactivate only (FK RESTRICT — never
//     hard delete — N-4), reorder ↑/↓.
// The Team zone (members, role pickers, default-campus, deactivate, invite) was
// MOVED to the canonical Members screen at /settings/team — this page links there
// and no longer renders any membership data. Campus = a church-wide dimension
// (D-086). No red anywhere (DS-2).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MaybeLayout from '@/components/layouts/MaybeLayout'
import InlineEditField from '@/components/shared/InlineEditField'
import { createClient } from '@/lib/supabase/client'
import { Ico } from '@/app/(app)/entries/ui'
import type { UserRole } from '@/types'

const PAGE = 1000 // PostgREST cap (N-9)

interface Campus {
  id: string
  name: string
  code: string
  is_active: boolean
  sort_order: number
}

function canWrite(role: UserRole) {
  return role === 'owner' || role === 'admin'
}

// Slug a campus name → UPPERCASE code (matches Tags screen convention).
function slugifyCode(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function LocationsPanel({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('viewer')
  const [churchId, setChurchId] = useState<string | null>(null)
  const [churchName, setChurchName] = useState('')
  const [selfId, setSelfId] = useState<string | null>(null)
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [newCampus, setNewCampus] = useState('')

  const write = canWrite(role)

  const load = useCallback(async (cid: string, _uid: string) => {
    // E-50 campuses (all, active + inactive, by sort_order)
    const { data: locRows } = await supabase
      .from('church_locations')
      .select('id, name, code, is_active, sort_order')
      .eq('church_id', cid)
      .order('sort_order', { ascending: true })
      .range(0, PAGE - 1)
    setCampuses((locRows ?? []) as Campus[])
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }
      setSelfId(user.id)
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(name)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership || cancelled) { if (!cancelled) setLoading(false); return }
      setRole(membership.role as UserRole)
      setChurchId(membership.church_id)
      const ch = Array.isArray(membership.churches) ? membership.churches[0] : membership.churches
      setChurchName((ch as { name?: string } | null)?.name ?? '')
      await load(membership.church_id, user.id)
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, load])

  /* ── E-51 inline-edit campus name ─────────────────────────────────────── */
  const saveCampusName = useCallback(async (id: string, name: string) => {
    if (!write || !name.trim()) return
    const prev = campuses
    setCampuses(p => p.map(c => c.id === id ? { ...c, name: name.trim() } : c))
    const { error } = await supabase.from('church_locations').update({ name: name.trim() }).eq('id', id)
    if (error) setCampuses(prev)
  }, [supabase, write, campuses])

  /* ── E-54 add campus (slug code unique per church, next sort_order) ────── */
  const addCampus = useCallback(async () => {
    if (!churchId || !write) return
    const name = newCampus.trim()
    if (!name) return
    setBusy('add-campus')
    const base = slugifyCode(name) || 'CAMPUS'
    const existing = new Set(campuses.map(c => c.code))
    let code = base
    let n = 1
    while (existing.has(code)) { code = `${base}_${n}`; n++ }
    const nextSort = campuses.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1
    const { data, error } = await supabase
      .from('church_locations')
      .insert({ church_id: churchId, name, code, is_active: true, sort_order: nextSort })
      .select('id, name, code, is_active, sort_order')
      .single()
    setBusy(null)
    if (data && !error) {
      setCampuses(p => [...p, data as Campus])
      setNewCampus('')
    } else if (error) {
      // uq_location_code collision under race — reload to reconcile
      await load(churchId, selfId ?? '')
    }
  }, [supabase, churchId, write, newCampus, campuses, load, selfId])

  /* ── E-53 soft deactivate / reactivate campus (FK RESTRICT → soft only) ── */
  const toggleCampusActive = useCallback(async (c: Campus) => {
    if (!write) return
    const next = !c.is_active
    setBusy(c.id)
    const prev = campuses
    setCampuses(p => p.map(x => x.id === c.id ? { ...x, is_active: next } : x))
    const { error } = await supabase.from('church_locations').update({ is_active: next }).eq('id', c.id)
    setBusy(null)
    if (error) setCampuses(prev) // e.g. FK RESTRICT if a hard delete were attempted elsewhere
  }, [supabase, write, campuses])

  /* ── E-55 reorder campuses (rewrite sort_order among active) ───────────── */
  const moveCampus = useCallback(async (index: number, dir: -1 | 1) => {
    if (!write) return
    const ordered = [...campuses].sort((a, b) => a.sort_order - b.sort_order)
    const target = index + dir
    if (target < 0 || target >= ordered.length) return
    const tmp = ordered[index]; ordered[index] = ordered[target]; ordered[target] = tmp
    const withSort = ordered.map((c, i) => ({ ...c, sort_order: i }))
    const prev = campuses
    setCampuses(withSort)
    setBusy('reorder-campus')
    const priorSort = new Map(campuses.map(c => [c.id, c.sort_order]))
    const changed = withSort.filter(c => priorSort.get(c.id) !== c.sort_order)
    const results = await Promise.all(changed.map(c => supabase.from('church_locations').update({ sort_order: c.sort_order }).eq('id', c.id)))
    setBusy(null)
    if (results.some(r => r.error)) setCampuses(prev)
  }, [supabase, write, campuses])

  return (
    <MaybeLayout embedded={embedded} role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* ── Zone A — header (E-40/E-41). Hidden when embedded in the workspace. ── */}
        {!embedded && (
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
            <button onClick={() => router.push('/settings')} aria-label="Back to Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
              <Ico.left className="h-5 w-5" />
            </button>
            <div>
              {churchName && <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>{churchName}</div>}
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Campuses</h1>
            </div>
          </div>
        </header>
        )}

        <main className="mx-auto max-w-3xl px-4 py-6">
          {loading ? (
            <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : (
            <>
              {/* ── Zone B — Campuses ─────────────────────────────────── */}
              <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Campuses</p>
              <div className="mb-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {campuses.length === 0 && (
                  <div className="px-4 py-6 text-center text-[13px] text-slate-400">No campuses yet.</div>
                )}
                {campuses.sort((a, b) => a.sort_order - b.sort_order).map((c, i) => (
                  <div key={c.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${c.is_active ? '' : 'opacity-60'}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Ico.pin className="h-4 w-4 shrink-0 text-[#4F6EF7]" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
                          {write ? (
                            <InlineEditField value={c.name} onSave={(v) => saveCampusName(c.id, v)} aria-label={`Campus ${c.name}`} />
                          ) : (
                            <span>{c.name}</span>
                          )}
                          {!c.is_active && <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Inactive</span>}
                        </div>
                        {/* E-52 code — quiet, immutable meta */}
                        <span className="font-num text-[11px] uppercase tracking-wide text-slate-400">{c.code}</span>
                      </div>
                    </div>
                    {write && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveCampus(i, -1)} disabled={i === 0 || busy !== null} aria-label={`Move ${c.name} up`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                          <Ico.up className="h-4 w-4" />
                        </button>
                        <button onClick={() => moveCampus(i, 1)} disabled={i === campuses.length - 1 || busy !== null} aria-label={`Move ${c.name} down`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                          <Ico.down className="h-4 w-4" />
                        </button>
                        <button onClick={() => toggleCampusActive(c)} disabled={busy === c.id}
                          className="ml-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                          {c.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {/* E-54 add campus */}
                {write && (
                  <div className="flex items-center gap-2 bg-slate-50/60 px-4 py-3">
                    <input
                      type="text"
                      value={newCampus}
                      onChange={(e) => setNewCampus(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCampus()}
                      placeholder="Add a campus…"
                      aria-label="New campus name"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-300 focus-visible:border-[#4F6EF7] focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/25"
                    />
                    <button onClick={addCampus} disabled={!newCampus.trim() || busy === 'add-campus'}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-opacity duration-200 hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                      style={{ background: '#4F6EF7' }}>
                      <Ico.plus className="h-4 w-4" />Add
                    </button>
                  </div>
                )}
              </div>
              {/* E-56 note: a campus can only be deactivated (never deleted) because services and entries point to it. */}
              <p className="mb-6 px-1 text-[12px] leading-relaxed text-slate-400">
                A campus stays in your history — deactivate it to hide it from new entries instead of deleting.
              </p>

              {/* ── Members moved to the canonical /settings/team screen ─── */}
              <Link href="/settings/team"
                className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                <span className="flex items-center gap-3">
                  <Ico.users className="h-5 w-5 text-[#4F6EF7]" />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold text-slate-800">Members &amp; Invitations</span>
                    <span className="text-[12px] text-slate-500">Manage who has access, roles, and invites.</span>
                  </span>
                </span>
                <Ico.right className="h-5 w-5 text-slate-300 transition-colors duration-200 group-hover:text-slate-500" />
              </Link>
            </>
          )}
        </main>
      </div>
    </MaybeLayout>
  )
}

export default function LocationsPage() {
  return <LocationsPanel />
}
