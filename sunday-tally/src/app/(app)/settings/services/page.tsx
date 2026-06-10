'use client'

// ─────────────────────────────────────────────────────────────────────────
// SERVICES & MINISTRIES — /(app)/settings/services — IRIS_SETTINGS (E-10..E-30).
// REDESIGN of the legacy schedule-list screen into the ministries-composition
// screen the IRIS map specifies. DS-25 mirror of the Entries Occurrence view:
// each service_templates row is a card, its ministries are equal-peer
// accent-bar child rows (no "primary" badge — D-076). Owner/admin add/remove/
// reorder a ministry by writing service_template_tags (D-073, template-level —
// D-075). Status circle goes amber-outline when a service has 0 ministries
// (won't render in Entries). No red (DS-2). Reuses Entries primitives.
//
// G1: inline cadence display per card ("Sundays · 9:00 AM" or Unscheduled).
//     "Set schedule" / "Change schedule" link on each card.
// G2: "Add service" button in header → /settings/services/new (owner/admin).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { Dot, Ico, accentForRole, roleLabel } from '@/app/(app)/entries/ui'
import { getOrphanMinistries, type OrphanMinistry } from '@/lib/ministryLinks'
import type { UserRole } from '@/types'

const PAGE = 1000 // PostgREST cap (N-9)

// 0=Sun..6=Sat — plural day names for cadence display (G1)
const DAY_NAMES_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

// Format "HH:MM" or "HH:MM:SS" → "9:00 AM" (G1)
function fmt12h(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr, 10)
  const m = (mStr ?? '00').padStart(2, '0')
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${ampm}`
}

interface Ministry {
  link_id: string         // service_template_tags.id
  tag_id: string          // service_tags.id
  name: string
  tag_role: string | null
  sort_order: number
  metricCount: number     // canonical active metrics for this tag
}
interface ScheduleSummary {            // G1
  day_of_week: number
  start_time: string
}
interface ServiceCard {
  id: string              // service_templates.id
  name: string
  locationName: string | null
  sort_order: number
  ministries: Ministry[]
  schedule: ScheduleSummary | null    // G1: active cadence (null = unscheduled)
  groupName: string | null            // S4b: reporting group chip
  showInEntries: boolean              // S4c: false → "Hidden from Entries" chip
}
interface TagOption {
  id: string
  name: string
  tag_role: string | null
}

function canWrite(role: UserRole) {
  return role === 'owner' || role === 'admin'
}

export default function ServicesSettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [role, setRole] = useState<UserRole>('viewer')
  const [churchId, setChurchId] = useState<string | null>(null)
  const [churchName, setChurchName] = useState('')
  const [cards, setCards] = useState<ServiceCard[]>([])
  const [allTags, setAllTags] = useState<TagOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null) // link_id or card id being mutated
  // S2 — ministries whose counts have no service to render on (deep-links to track's fixer)
  const [orphans, setOrphans] = useState<OrphanMinistry[]>([])

  const write = canWrite(role)

  /* ── load everything: templates → links+tags → metric counts → schedules ─ */
  const load = useCallback(async (cid: string) => {
    type EmbeddedLoc = { name: string } | { name: string }[] | null
    type EmbeddedTag = { id: string; name: string; tag_role: string | null } | { id: string; name: string; tag_role: string | null }[] | null
    const oneOf = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

    // E-20 active templates + location name + group/visibility (0036/0037)
    const { data: tmplRows } = await supabase
      .from('service_templates')
      .select('id, display_name, sort_order, location_id, show_in_entries, reporting_group_id, church_locations(name)')
      .eq('church_id', cid)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .range(0, PAGE - 1)

    // S4b: group names for the chips (table may be empty — fine)
    const groupNameById = new Map<string, string>()
    {
      const { data: groupRows } = await supabase
        .from('service_groups').select('id, name').eq('church_id', cid).eq('is_active', true)
      for (const g of ((groupRows ?? []) as { id: string; name: string }[])) groupNameById.set(g.id, g.name)
    }

    type TmplRow = {
      id: string; display_name: string | null; sort_order: number | null
      show_in_entries?: boolean | null; reporting_group_id?: string | null
      church_locations: EmbeddedLoc
    }
    const templates = ((tmplRows ?? []) as TmplRow[]).map((t) => ({
      id: t.id,
      name: t.display_name ?? 'Service',
      sort_order: t.sort_order ?? 0,
      locationName: oneOf(t.church_locations)?.name ?? null,
      groupName: t.reporting_group_id ? (groupNameById.get(t.reporting_group_id) ?? null) : null,
      showInEntries: t.show_in_entries !== false,
    }))

    // E-22 composition links + ministry tags (paginate)
    type LinkRow = { id: string; service_template_id: string; ministry_tag_id: string; sort_order: number | null; service_tags: EmbeddedTag }
    const links: LinkRow[] = []
    if (templates.length > 0) {
      const tmplIds = templates.map(t => t.id)
      for (let from = 0; ; from += PAGE) {
        const { data: batch } = await supabase
          .from('service_template_tags')
          .select('id, service_template_id, ministry_tag_id, sort_order, service_tags(id, name, tag_role)')
          .eq('church_id', cid)
          .in('service_template_id', tmplIds)
          .order('sort_order', { ascending: true })
          .range(from, from + PAGE - 1)
        const rows = (batch ?? []) as LinkRow[]
        links.push(...rows)
        if (rows.length < PAGE) break
      }
    }

    // E-23 canonical active metric counts per ministry tag (one bounded read)
    const tagIds = Array.from(new Set(links.map(l => l.ministry_tag_id)))
    const metricCountByTag = new Map<string, number>()
    if (tagIds.length > 0) {
      const { data: metricRows } = await supabase
        .from('metrics')
        .select('ministry_tag_id')
        .eq('church_id', cid)
        .eq('is_active', true)
        .eq('is_canonical', true)
        .in('ministry_tag_id', tagIds)
        .range(0, PAGE - 1)
      for (const m of ((metricRows ?? []) as { ministry_tag_id: string }[])) {
        metricCountByTag.set(m.ministry_tag_id, (metricCountByTag.get(m.ministry_tag_id) ?? 0) + 1)
      }
    }

    const byTemplate = new Map<string, Ministry[]>()
    for (const l of links) {
      const tag = oneOf(l.service_tags)
      if (!tag) continue
      const list = byTemplate.get(l.service_template_id) ?? []
      list.push({
        link_id: l.id,
        tag_id: tag.id,
        name: tag.name,
        tag_role: tag.tag_role ?? null,
        sort_order: l.sort_order ?? 0,
        metricCount: metricCountByTag.get(tag.id) ?? 0,
      })
      byTemplate.set(l.service_template_id, list)
    }
    for (const list of byTemplate.values()) list.sort((a, b) => a.sort_order - b.sort_order)

    // G1: active schedule version per template (is_active=true, effective_end_date IS NULL)
    const scheduleByTemplate = new Map<string, ScheduleSummary>()
    if (templates.length > 0) {
      const { data: schedRows } = await supabase
        .from('service_schedule_versions')
        .select('service_template_id, day_of_week, start_time')
        .in('service_template_id', templates.map(t => t.id))
        .eq('is_active', true)
        .is('effective_end_date', null)
        .range(0, PAGE - 1)
      for (const s of ((schedRows ?? []) as { service_template_id: string; day_of_week: number; start_time: string }[])) {
        scheduleByTemplate.set(s.service_template_id, { day_of_week: s.day_of_week, start_time: s.start_time })
      }
    }

    setCards(templates.map(t => ({
      ...t,
      ministries: byTemplate.get(t.id) ?? [],
      schedule: scheduleByTemplate.get(t.id) ?? null,
    })))

    // E-27 picker source: active ministry tags that make sense to link here.
    // Linking controls ENTRY availability, so the picker hides ministries with
    // nothing to type at a service: rollup-only nodes (computed from children)
    // and period-only ones like Giving (entered weekly, church-wide). A brand-new
    // ministry with no metrics at all stays listed; the red "Add metrics now"
    // chip guides the next step. (Builder 2026-06-10.)
    const { data: tagRows } = await supabase
      .from('service_tags')
      .select('id, name, tag_role')
      .eq('church_id', cid)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .range(0, PAGE - 1)
    const { data: modeRows } = await supabase
      .from('metrics')
      .select('ministry_tag_id, mode, scope')
      .eq('church_id', cid)
      .eq('is_active', true)
      .range(0, PAGE - 1)
    const hasAnyMetric = new Set<string>()
    const hasEnterable = new Set<string>()
    for (const m of ((modeRows ?? []) as { ministry_tag_id: string | null; mode: string | null; scope: string | null }[])) {
      if (!m.ministry_tag_id) continue
      hasAnyMetric.add(m.ministry_tag_id)
      if (m.mode !== 'rollup' && m.scope === 'instance') hasEnterable.add(m.ministry_tag_id)
    }
    type TagRow = { id: string; name: string; tag_role: string | null }
    setAllTags(((tagRows ?? []) as TagRow[])
      .filter((t) => hasEnterable.has(t.id) || !hasAnyMetric.has(t.id))
      .map((t) => ({ id: t.id, name: t.name, tag_role: t.tag_role ?? null })))

    // S2 — orphan detection (same helper the track page uses)
    setOrphans(await getOrphanMinistries(supabase, cid))
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(name)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership || cancelled) { if (!cancelled) setLoading(false); return }
      setRole(membership.role as UserRole)
      setChurchId(membership.church_id)
      const ch = Array.isArray(membership.churches) ? membership.churches[0] : membership.churches
      setChurchName((ch as { name?: string } | null)?.name ?? '')
      await load(membership.church_id)
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, load])

  /* ── E-27 add ministry (INSERT, idempotent on UNIQUE(template,tag)) ────── */
  const addMinistry = useCallback(async (card: ServiceCard, tag: TagOption) => {
    if (!churchId || !write) return
    setBusy(card.id)
    const nextSort = card.ministries.reduce((m, x) => Math.max(m, x.sort_order), -1) + 1
    const { data, error } = await supabase
      .from('service_template_tags')
      .insert({
        church_id: churchId,
        service_template_id: card.id,
        ministry_tag_id: tag.id,
        sort_order: nextSort,
      })
      .select('id')
      .single()
    if (error || !data) {
      // idempotent: a UNIQUE violation means it's already linked — reload to reconcile
      await load(churchId)
      setBusy(null)
      return
    }
    // fetch the metric count for the newly linked tag (cheap, bounded)
    const { count } = await supabase
      .from('metrics').select('id', { count: 'exact', head: true })
      .eq('church_id', churchId).eq('is_active', true).eq('is_canonical', true).eq('ministry_tag_id', tag.id)
    setCards(prev => prev.map(c => c.id === card.id
      ? { ...c, ministries: [...c.ministries, { link_id: data.id, tag_id: tag.id, name: tag.name, tag_role: tag.tag_role, sort_order: nextSort, metricCount: count ?? 0 }] }
      : c))
    setBusy(null)
  }, [supabase, churchId, write, load])

  /* ── E-25 remove ministry (DELETE link row) ───────────────────────────── */
  const removeMinistry = useCallback(async (card: ServiceCard, m: Ministry) => {
    if (!churchId || !write) return
    setBusy(m.link_id)
    const prev = cards
    setCards(p => p.map(c => c.id === card.id ? { ...c, ministries: c.ministries.filter(x => x.link_id !== m.link_id) } : c))
    const { error } = await supabase.from('service_template_tags').delete().eq('id', m.link_id)
    if (error) setCards(prev) // rollback
    setBusy(null)
  }, [supabase, churchId, write, cards])

  /* ── E-24 reorder within a template (rewrite sort_order) ───────────────── */
  const move = useCallback(async (card: ServiceCard, index: number, dir: -1 | 1) => {
    if (!churchId || !write) return
    const target = index + dir
    if (target < 0 || target >= card.ministries.length) return
    const reordered = [...card.ministries]
    const tmp = reordered[index]
    reordered[index] = reordered[target]
    reordered[target] = tmp
    // assign contiguous sort_order
    const withSort = reordered.map((m, i) => ({ ...m, sort_order: i }))
    const prevCards = cards
    setCards(p => p.map(c => c.id === card.id ? { ...c, ministries: withSort } : c))
    setBusy(card.id)
    // persist only the rows whose sort_order actually changed
    const priorSort = new Map(card.ministries.map(m => [m.link_id, m.sort_order]))
    const changed = withSort.filter(m => priorSort.get(m.link_id) !== m.sort_order)
    const results = await Promise.all(
      changed.map(m => supabase.from('service_template_tags').update({ sort_order: m.sort_order }).eq('id', m.link_id))
    )
    if (results.some(r => r.error)) setCards(prevCards)
    setBusy(null)
  }, [supabase, churchId, write, cards])

  return (
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* ── Zone A — header (E-10..E-12) ─────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
            <button onClick={() => router.push('/settings')} aria-label="Back to Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
              <Ico.left className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              {churchName && <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>{churchName}</div>}
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Services</h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          <p className="mb-5 px-1 text-[13px] leading-relaxed text-slate-500">
            When and where you gather. Each service creates the weekly occurrences you log in Entries, and lists the ministries counted there.{' '}
            {write ? 'Add, remove, or reorder ministries. The change applies to every future week.' : 'This is read-only for your role.'}
          </p>

          {/* S2 — orphan banner: counts with nowhere to render (editors+ see it) */}
          {!loading && orphans.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-4 py-3">
              <span className="text-[13px] font-semibold text-[#B45309]">
                {orphans.length === 1
                  ? `${orphans[0].name} isn't counted anywhere yet`
                  : `${orphans.length} ministries aren't counted anywhere yet`}
              </span>
              <span className="text-[12px] text-[#B45309]/80">
                {orphans.length > 1 && `(${orphans.map(o => o.name).join(', ')}) `}Their counts won&apos;t appear in Entries.
              </span>
              <Link
                href={`/settings/track?fix=${orphans[0].tag_id}`}
                className="ml-auto shrink-0 rounded-lg border border-[#F59E0B]/40 bg-white px-2.5 py-1 text-[12px] font-semibold text-[#B45309] transition-colors hover:bg-[#F59E0B]/10"
              >
                Fix →
              </Link>
            </div>
          )}

          {loading ? (
            <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : cards.length === 0 ? (
            /* E-30 empty state (no red) */
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-600">No services yet</p>
              <p className="mt-1 text-[12px] text-slate-400">
                {write
                  ? <>Use the <button onClick={() => router.push('/settings/services/new')} className="font-semibold text-[#3D5BD4] hover:underline">Add service</button> button to create your first service.</>
                  : 'Services are created during onboarding or via settings.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* G2 — Add service entry point, above the first card (owner/admin only) */}
              {write && (
                <button
                  onClick={() => router.push('/settings/services/new')}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#4F6EF7]/40 bg-[#4F6EF7]/5 px-4 py-3 text-[14px] font-semibold text-[#3D5BD4] transition-colors duration-200 hover:bg-[#4F6EF7]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                  aria-label="Add a new service"
                >
                  <Ico.plus className="h-4 w-4" />
                  Add service
                </button>
              )}
              {/* S3 — group by location; church-wide last. Headers only when there
                  is more than one group (single-campus stays a flat list). */}
              {(() => {
                const groups = new Map<string, ServiceCard[]>()
                for (const c of cards) {
                  const key = c.locationName ?? '__churchwide'
                  groups.set(key, [...(groups.get(key) ?? []), c])
                }
                // Church-wide FIRST (Builder 2026-06-10), then campuses A→Z.
                const ordered = [...groups.entries()].sort(([a], [b]) =>
                  a === '__churchwide' ? -1 : b === '__churchwide' ? 1 : a.localeCompare(b))
                const showHeaders = ordered.length > 1
                return ordered.map(([key, list]) => (
                  <div key={key} className="space-y-4">
                    {showHeaders && (
                      /* S3 — full-width color bars (Builder 2026-06-10): Church-wide
                         pops (brand bar + GOLD headline); campuses recede on a soft
                         slate bar. When church-wide services exist, each campus bar
                         carries a pointer note so nobody hunts for those counts here. */
                      <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-xl px-4 py-2.5 shadow-sm ${
                        key === '__churchwide' ? 'bg-[#4F6EF7]' : 'bg-[#94A3B8]'
                      }`}>
                        <h2 className={`text-[14px] font-extrabold tracking-tight ${
                          key === '__churchwide' ? 'text-[#FBBF24]' : 'text-white'
                        }`}>
                          {key === '__churchwide' ? 'Church-wide' : key}
                        </h2>
                        {key === '__churchwide' ? (
                          <p className="text-[11px] font-medium text-[#FDE68A]/90">counted once for the whole church, visible at every campus</p>
                        ) : groups.has('__churchwide') ? (
                          <p className="text-[11px] font-medium text-white/90">some metrics are set up church-wide. See the section above.</p>
                        ) : null}
                      </div>
                    )}
                    {list.map(card => (
                      <ServiceCardView
                        key={card.id}
                        card={card}
                        allTags={allTags}
                        write={write}
                        busy={busy}
                        showLocation={!showHeaders}
                        onAdd={(tag) => addMinistry(card, tag)}
                        onRemove={(m) => removeMinistry(card, m)}
                        onMove={(i, dir) => move(card, i, dir)}
                      />
                    ))}
                  </div>
                ))
              })()}
              <p className="px-1 text-[12px] leading-relaxed text-slate-400">
                Ministries are equal peers. The order here is the order they appear when you enter.
              </p>
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
 * Service card — mirrors the Entries Occurrence card (DS-7/DS-25)
 * G1: cadence badge + schedule link in card header.
 * ──────────────────────────────────────────────────────────────────────── */
function ServiceCardView({ card, allTags, write, busy, showLocation, onAdd, onRemove, onMove }: {
  card: ServiceCard
  allTags: TagOption[]
  write: boolean
  busy: string | null
  /** Inline "· Campus" suffix — off when the list renders location section headers (S3). */
  showLocation: boolean
  onAdd: (tag: TagOption) => void
  onRemove: (m: Ministry) => void
  onMove: (index: number, dir: -1 | 1) => void
}) {
  const [picking, setPicking] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null) // link_id

  const linkedIds = new Set(card.ministries.map(m => m.tag_id))
  const available = allTags.filter(t => !linkedIds.has(t.id))
  // E-29 status: amber-outline when 0 ministries (won't render in Entries), else complete
  const status = card.ministries.length === 0 ? 'needs' : 'complete'

  // G1: cadence label e.g. "Sundays · 9:00 AM"
  const cadenceLabel = card.schedule
    ? `${DAY_NAMES_PLURAL[card.schedule.day_of_week]} · ${fmt12h(card.schedule.start_time)}`
    : null

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* card header (DS-7): name · campus · cadence badge  …  status circle */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-bold tracking-tight text-slate-900">
            {card.name}
            {showLocation && card.locationName && <span className="ml-2 text-[12px] font-medium text-slate-400">· {card.locationName}</span>}
          </h3>
          {/* G1: cadence row — neutral DS-16 slate tag when scheduled, amber when not */}
          <div className="mt-1 flex items-center gap-2">
            {cadenceLabel ? (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {cadenceLabel}
              </span>
            ) : (
              <span className="rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#B45309]">
                Unscheduled
              </span>
            )}
            {/* S4b — reporting group chip */}
            {card.groupName && (
              <span className="rounded-md bg-[#4F6EF7]/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#3D5BD4]" title="Reporting group. Used to compare services in reports.">
                {card.groupName}
              </span>
            )}
            {/* S4c — hidden-from-entries chip */}
            {!card.showInEntries && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400" title="Entry screens skip this service; History keeps its data">
                Hidden from Entries
              </span>
            )}
            {/* G1: schedule link visible to owner/admin */}
            {write && (
              <Link
                href={`/settings/services/${card.id}/schedule`}
                className="rounded text-[11px] font-semibold text-[#3D5BD4] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
              >
                {card.schedule ? 'Change schedule →' : 'Set schedule →'}
              </Link>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* S4a — edit (T6C), owner/admin */}
          {write && (
            <Link
              href={`/settings/services/${card.id}/edit`}
              aria-label={`Edit ${card.name}`}
              title="Edit service"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" strokeLinecap="round" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          <Dot s={status} />
        </div>
      </div>

      {/* ministry child rows (E-22) — COMPACT: one line each, two per row
          (Builder 2026-06-10: "unnecessarily tall — single line, two cards").
          A ministry with no metrics shows faint red + "Add metrics now" that
          jumps straight to its node in What we track. */}
      {card.ministries.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-4 py-5 text-center">
          <span className="text-[13px] font-semibold text-slate-600">No ministries yet</span>
          <span className="text-[12px] text-slate-400">Add a ministry so this service appears in Entries.</span>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-2">
          {card.ministries.map((m, i) => (
            <li
              key={m.link_id}
              className={`group flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors duration-200 ${
                m.metricCount === 0
                  ? 'border-red-200/70 bg-red-50/50'
                  : 'border-slate-100 bg-white hover:bg-slate-50'
              }`}
            >
              <span className={`h-5 w-1.5 shrink-0 rounded-full ${accentForRole(m.tag_role)}`} aria-hidden />
              <span className="min-w-0 truncate text-[14px] font-semibold text-slate-800">{m.name}</span>
              <span className="shrink-0 text-[11px] font-medium text-slate-400">· {roleLabel(m.tag_role)}</span>

              <span className="ml-auto flex shrink-0 items-center gap-1">
                {m.metricCount === 0 ? (
                  <Link
                    href={`/settings/track?select=${m.tag_id}`}
                    className="rounded text-[12px] font-semibold text-red-500/90 hover:text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    title={`${m.name} has no metrics yet, so there is nothing to enter`}
                  >
                    Add metrics now →
                  </Link>
                ) : (
                  <span className="font-num text-[11px] text-slate-400">{m.metricCount}</span>
                )}

                {write && (
                  <>
                    {/* E-24 reorder ↑/↓ (O-3) — compact, hover-revealed */}
                    <button onClick={() => onMove(i, -1)} disabled={i === 0 || busy === card.id} aria-label={`Move ${m.name} up`}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 opacity-0 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                      <Ico.up className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onMove(i, 1)} disabled={i === card.ministries.length - 1 || busy === card.id} aria-label={`Move ${m.name} down`}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 opacity-0 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                      <Ico.down className="h-3.5 w-3.5" />
                    </button>
                    {/* E-25 remove — compact; amber confirm */}
                    {confirmRemove === m.link_id ? (
                      <span className="flex items-center gap-0.5">
                        <button onClick={() => { onRemove(m); setConfirmRemove(null) }} disabled={busy === m.link_id}
                          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#B45309] transition-colors duration-200 hover:bg-[#F59E0B]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/40">
                          Confirm
                        </button>
                        <button onClick={() => setConfirmRemove(null)}
                          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmRemove(m.link_id)} aria-label={`Remove ${m.name}`} title={`Remove ${m.name}`}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 opacity-0 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 focus-visible:opacity-100">
                        <Ico.trash className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* E-26 add ministry (owner/admin only) */}
      {write && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {!picking ? (
            <button onClick={() => setPicking(true)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[#3D5BD4] transition-colors duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
              <Ico.plus className="h-4 w-4" />Add ministry
            </button>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Add a ministry</span>
                <button onClick={() => setPicking(false)} className="text-[12px] font-medium text-slate-400 hover:text-slate-600">Done</button>
              </div>
              {available.length === 0 ? (
                <p className="text-[12px] text-slate-400">
                  Every ministry is already on this service.{' '}
                  <Link href="/settings/tags" className="font-semibold text-[#3D5BD4] hover:underline">Create a new ministry →</Link>
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {available.map(t => (
                      <button key={t.id} onClick={() => onAdd(t)} disabled={busy === card.id}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors duration-200 hover:border-[#4F6EF7]/40 hover:bg-[#4F6EF7]/5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
                        <span className={`h-3.5 w-1.5 rounded-full ${accentForRole(t.tag_role)}`} aria-hidden />
                        {t.name}<span className="text-[11px] text-slate-400">· {roleLabel(t.tag_role)}</span>
                      </button>
                    ))}
                  </div>
                  {/* E-28 create-in-place → deep-link to canonical Tags screen (N-7 MVP) */}
                  <Link href="/settings/tags" className="mt-2 inline-block text-[12px] font-semibold text-[#3D5BD4] hover:underline">
                    Create a new ministry →
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
