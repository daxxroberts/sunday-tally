'use client'

// ─────────────────────────────────────────────────────────────────────────
// SETTINGS HUB — /(app)/settings — IRIS_SETTINGS_ELEMENT_MAP (E-1..E-7).
// Redesign of the legacy hub to DESIGN_SYSTEM tokens (DS-1..DS-25):
//   slate-200 borders, brand-blue focus rings, SVG chevrons (DS-14), derived
//   quiet counts (DS-9/DS-16), role-gated config rows greyed "View only" (N-1/N-8).
// Does NOT relink the still-broken legacy sub-pages (N-6).
// Everything schema/config-driven — counts derived live, no hardcoded names.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { Ico } from '@/app/(app)/entries/ui'
import ConfirmTypeDialog from '@/components/ui/ConfirmTypeDialog'
import { resetChurchData } from './actions'
import type { UserRole } from '@/types'

interface Counts {
  services: number | null
  locations: number | null
  members: number | null
  ministries: number | null
}

function canWrite(role: UserRole) {
  return role === 'owner' || role === 'admin'
}

export default function SettingsHubPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [role, setRole] = useState<UserRole>('viewer')
  const [churchName, setChurchName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<Counts>({ services: null, locations: null, members: null, ministries: null })
  const [resetOpen, setResetOpen] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  async function handleReset() {
    setResetError(null)
    const res = await resetChurchData()
    if (res.ok) {
      router.push('/onboarding/import')
    } else {
      setResetError(res.error)
      setResetOpen(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership || cancelled) { if (!cancelled) setLoading(false); return }

      const churchId = membership.church_id as string
      setRole(membership.role as UserRole)
      const ch = Array.isArray(membership.churches) ? membership.churches[0] : membership.churches
      setChurchName((ch as { name?: string } | null)?.name ?? '')

      // Derived counts (DS-9) — head:true count queries, tenant-scoped, bounded.
      const [svc, loc, mem, min] = await Promise.all([
        supabase.from('service_templates').select('id', { count: 'exact', head: true })
          .eq('church_id', churchId).eq('is_active', true),
        supabase.from('church_locations').select('id', { count: 'exact', head: true })
          .eq('church_id', churchId).eq('is_active', true),
        supabase.from('church_memberships').select('id', { count: 'exact', head: true })
          .eq('church_id', churchId).eq('is_active', true),
        supabase.from('service_tags').select('id', { count: 'exact', head: true })
          .eq('church_id', churchId).eq('is_active', true),
      ])
      if (cancelled) return
      setCounts({
        services: svc.count ?? 0,
        locations: loc.count ?? 0,
        members: mem.count ?? 0,
        ministries: min.count ?? 0,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase])

  const write = canWrite(role)

  const plural = (n: number | null, one: string, many = one + 's') =>
    n === null ? '…' : `${n} ${n === 1 ? one : many}`

  return (
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* ── E-1 — Sticky header ─────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl font-num text-sm font-bold text-white shadow-sm" style={{ background: '#4F6EF7' }}>ST</span>
            <div>
              {churchName && <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#3D5BD4' }}>{churchName}</div>}
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Settings</h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          {/* ── Your account (all roles, ungated — IRIS_ACCOUNT N-8) ─────── */}
          <Section title="Your account">
            <HubRow
              href="/settings/account"
              label="Account"
              meta="Your display name, default campus, and password"
              writable
              loading={false}
            />
            {/* Billing lives inside Account — opens the Account workspace on its Billing tab. */}
            <HubRow
              href="/settings/account?tab=billing"
              label="Billing & Subscriptions"
              meta="Your plan, AI add-on, campuses, and payment"
              writable={write}
              loading={false}
              indent
            />
          </Section>

          {/* ── E-2 — Your Church ───────────────────────────────────────────
              Setup is the parent workspace; the three rows under it are its tabs.
              Each one opens the SAME tabbed window straight onto its page
              (?tab=…) — it's just a faster way in than tabbing across. */}
          <Section title="Your church">
            <HubRow
              href="/settings/setup"
              label="Setup"
              meta="Everything about your church, in one place"
              writable={write}
              loading={false}
              gold
            />
            {/* E-3 — Services (when & where you gather; ministry composition per service) */}
            <HubRow
              href="/settings/setup?tab=services"
              label="Services and Occurrences"
              desc="Your gatherings, when and where they happen. Each one becomes a Sunday (or week) you fill in."
              meta={counts.services === null ? '…' : `${plural(counts.services, 'service')} · ${plural(counts.ministries, 'ministry', 'ministries')}`}
              writable={write}
              loading={loading}
              indent
            />
            {/* E-4 — Locations & Team */}
            <HubRow
              href="/settings/setup?tab=locations"
              label="Locations and Team"
              desc="Your campuses, and the people who can sign in to help."
              meta={counts.locations === null ? '…' : `${plural(counts.locations, 'campus', 'campuses')} · ${plural(counts.members, 'member')}`}
              writable={write}
              loading={loading}
              indent
            />
            {/* What we track — T_TRACK tree editor (IRIS_TTRACK_ELEMENT_MAP) */}
            <HubRow
              href="/settings/setup?tab=track"
              label="What we track"
              desc="The numbers you count each week, like attendance, giving, and volunteers."
              meta={plural(counts.ministries, 'ministry', 'ministries')}
              writable={write}
              loading={loading}
              indent
            />
          </Section>

          {/* ── E-6 — Data (owner/admin) ────────────────────────────────── */}
          {write && (
            <Section title="Data">
              <HubRow
                href="/onboarding/import"
                label="AI Data Import"
                meta="Upload a CSV or Sheet — AI maps your columns"
                writable
                loading={false}
              />
            </Section>
          )}

          <p className="mt-6 px-1 text-[12px] leading-relaxed text-slate-400">
            Counts are derived live from your active configuration. Owners and admins can edit; everyone else sees the structure read-only.
          </p>

          {/* ── Danger zone (owner only) — start over with a clean church ──── */}
          {role === 'owner' && (
            <div className="mt-8 mb-4">
              <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-amber-600">Danger zone</p>
              <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm">
                <div className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-slate-800">Reset church data</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
                      Clears your locations, services, what you track, and saved charts so you can start over and re-import. Your account and sign-in stay. This can&apos;t be undone.
                    </p>
                    {resetError && <p className="mt-1.5 text-[12px] text-amber-700">{resetError}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setResetError(null); setResetOpen(true) }}
                    className="shrink-0 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40"
                  >
                    Reset…
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <ConfirmTypeDialog
        open={resetOpen}
        title="Reset church data?"
        body={
          <>
            This permanently clears your locations, services, what you track, and saved charts.
            Your account and sign-in stay, and you&apos;ll start fresh with an import. This can&apos;t be undone.
          </>
        }
        confirmPhrase="Sunday Tally"
        confirmLabel="Reset everything"
        onConfirm={handleReset}
        onCancel={() => setResetOpen(false)}
      />
    </AppLayout>
  )
}

/* ── section group (DS-5 rounded-2xl + divide) ───────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {children}
      </div>
    </div>
  )
}

/* ── index row → chevron, derived meta, role-gated "View only" tag ─────────
   `gold` styles a section parent (the Setup row) in dark gold; `indent` marks a
   child page that lives inside that parent (it just opens the workspace on its
   tab), shifted right with a gold tree tick so the hierarchy reads at a glance. */
function HubRow({ href, label, meta, desc, writable, loading, gold = false, indent = false }: {
  href: string
  label: string
  meta: string
  desc?: string
  writable: boolean
  loading: boolean
  gold?: boolean
  indent?: boolean
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between gap-3 py-3.5 pr-4 transition-colors duration-200 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4F6EF7]/40 ${
        indent ? 'pl-11' : 'pl-4'
      } ${gold ? 'bg-amber-50/40' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {indent && <span className="-ml-5 shrink-0 text-[13px]" style={{ color: '#D4A017' }} aria-hidden>↳</span>}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold" style={gold ? { color: '#B8860B' } : undefined}>
              <span className={gold ? '' : 'text-slate-800'}>{label}</span>
            </p>
            {!writable && (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">View only</span>
            )}
          </div>
          {desc && <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{desc}</p>}
          <p className={`mt-0.5 truncate text-[11px] ${loading ? 'text-slate-300' : 'text-slate-400'}`}>{meta}</p>
        </div>
      </div>
      <Ico.right className={`h-4 w-4 shrink-0 transition-colors duration-200 ${gold ? 'text-amber-300 group-hover:text-[#B8860B]' : 'text-slate-300 group-hover:text-[#4F6EF7]'}`} />
    </Link>
  )
}
