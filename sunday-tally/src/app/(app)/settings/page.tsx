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
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { Ico } from '@/app/(app)/entries/ui'
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
  const [role, setRole] = useState<UserRole>('viewer')
  const [churchName, setChurchName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<Counts>({ services: null, locations: null, members: null, ministries: null })

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
          </Section>

          {/* ── E-2 — Your Church ───────────────────────────────────────── */}
          <Section title="Your church">
            {/* E-3 — Services & Ministries */}
            <HubRow
              href="/settings/services"
              label="Services & Ministries"
              meta={counts.services === null ? '…' : `${plural(counts.services, 'service')} · ${plural(counts.ministries, 'ministry', 'ministries')}`}
              writable={write}
              loading={loading}
            />
            {/* E-4 — Locations & Team */}
            <HubRow
              href="/settings/locations"
              label="Locations & Team"
              meta={counts.locations === null ? '…' : `${plural(counts.locations, 'campus', 'campuses')} · ${plural(counts.members, 'member')}`}
              writable={write}
              loading={loading}
            />
            {/* E-5 — Ministry Tags (existing) */}
            <HubRow
              href="/settings/tags"
              label="Ministry Tags"
              meta={plural(counts.ministries, 'tag')}
              writable={write}
              loading={loading}
            />
            {/* What we track — T_TRACK tree editor (IRIS_TTRACK_ELEMENT_MAP) */}
            <HubRow
              href="/settings/track"
              label="What we track"
              meta={plural(counts.ministries, 'ministry', 'ministries')}
              writable={write}
              loading={loading}
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
        </main>
      </div>
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

/* ── index row → chevron, derived meta, role-gated "View only" tag ───────── */
function HubRow({ href, label, meta, writable, loading }: {
  href: string
  label: string
  meta: string
  writable: boolean
  loading: boolean
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4F6EF7]/40"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-slate-800">{label}</p>
          {!writable && (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">View only</span>
          )}
        </div>
        <p className={`mt-0.5 truncate text-[12px] ${loading ? 'text-slate-300' : 'text-slate-400'}`}>{meta}</p>
      </div>
      <Ico.right className="h-4 w-4 shrink-0 text-slate-300 transition-colors duration-200 group-hover:text-[#4F6EF7]" />
    </Link>
  )
}
