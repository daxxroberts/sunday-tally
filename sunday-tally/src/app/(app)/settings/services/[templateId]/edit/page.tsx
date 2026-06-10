'use client'

// ─────────────────────────────────────────────────────────────────────────
// SERVICE EDIT — /(app)/settings/services/[templateId]/edit — T6C
// (IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md §2). The previously-missing
// surface: rename (SE2), location read-only with instance guard (SE3),
// primary ministry (SE4), and Deactivate with typed confirm (SE8).
// SE5 (reporting group) and SE6 (show in Entries) land with 0037/0036 —
// the page is structured so those rows slot in beneath SE4.
// Schedule stays on its own page; ministry composition stays on the list.
// DS: Fira Sans, #4F6EF7, rounded-2xl, amber (never red) for destructive.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { Ico, accentForRole, roleLabel } from '@/app/(app)/entries/ui'
import type { UserRole } from '@/types'
import { getServiceEditData, updateServiceAction, deactivateServiceAction, createServiceGroupAction } from '../../actions'

type EditData = NonNullable<Awaited<ReturnType<typeof getServiceEditData>>>

export default function ServiceEditPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const params = useParams<{ templateId: string }>()
  const templateId = params.templateId

  const [role, setRole] = useState<UserRole>('viewer')
  const [data, setData] = useState<EditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  // form state
  const [name, setName] = useState('')
  const [primaryTag, setPrimaryTag] = useState('')
  const [locationId, setLocationId] = useState<string>('CHURCH_WIDE') // SE3 ('CHURCH_WIDE' = no campus)
  const [groupId, setGroupId] = useState<string>('')            // SE5 ('' = none)
  const [groups, setGroups] = useState<{ id: string; name: string; code: string }[]>([])
  const [newGroupName, setNewGroupName] = useState<string | null>(null) // null = input hidden
  const [showInEntries, setShowInEntries] = useState(true)      // SE6
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // SE8 typed confirm
  const [confirmText, setConfirmText] = useState('')
  const [retiring, setRetiring] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // role for AppLayout chrome
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: m } = await supabase
          .from('church_memberships')
          .select('role')
          .eq('user_id', user.id).eq('is_active', true).single()
        if (m && !cancelled) setRole(m.role as UserRole)
      }
      const d = await getServiceEditData(templateId)
      if (cancelled) return
      if (!d) { setDenied(true); setLoading(false); return }
      setData(d)
      setName(d.template.display_name)
      setPrimaryTag(d.template.primary_tag_id ?? '')
      setLocationId(d.template.location_id ?? 'CHURCH_WIDE')
      setGroupId(d.template.reporting_group_id ?? '')
      setGroups(d.groups ?? [])
      setShowInEntries(d.template.show_in_entries)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, templateId])

  async function save() {
    if (!data || saving) return
    setSaving(true)
    setError(null)
    const res = await updateServiceAction({
      template_id: data.template.id,
      display_name: name,
      primary_tag_id: primaryTag,
      // post-migration fields — only sent when the DB supports them
      ...(data.groups !== null ? { reporting_group_id: groupId || null } : {}),
      ...(data.extrasSupported ? { show_in_entries: showInEntries } : {}),
      // campus — editable only while the service has no recorded weeks
      ...(data.instanceCount === 0 && data.extrasSupported
        ? { location_id: locationId === 'CHURCH_WIDE' ? null : locationId }
        : {}),
    })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    router.push('/settings/services')
  }

  async function retire() {
    if (!data || retiring || confirmText.trim() !== data.template.display_name) return
    setRetiring(true)
    setError(null)
    const res = await deactivateServiceAction(data.template.id)
    setRetiring(false)
    if (res.error) { setError(res.error); return }
    router.push('/settings/services')
  }

  return (
    <AppLayout role={role}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
      `}</style>
      <div className="bg-slate-50 min-h-full" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {/* SE1 header */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3.5">
            <button onClick={() => router.push('/settings/services')} aria-label="Back to Services"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40">
              <Ico.left className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Edit service</h1>
              {data && <div className="truncate text-[12px] text-slate-400">{data.template.display_name}</div>}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-6">
          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ) : denied || !data ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-600">Can&apos;t edit this service</p>
              <p className="mt-1 text-[12px] text-slate-400">It may not exist, or your role can&apos;t edit services (owner/admin only).</p>
            </div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                {/* SE2 name */}
                <label className="block">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Service name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. First Experience"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-[15px] text-slate-900 placeholder:text-slate-300 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
                  />
                </label>

                {/* SE3 campus — editable while the service has no recorded weeks;
                    locked (with the WHY) once history exists */}
                <div className="mt-4">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Campus</span>
                  {data.instanceCount === 0 && data.extrasSupported ? (
                    <>
                      <select
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-900 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
                      >
                        {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        <option value="CHURCH_WIDE">Church-wide — one shared count, no campus</option>
                      </select>
                      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                        Movable because nothing has been logged here yet — once weeks are recorded, the campus locks.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <span className="text-[14px] font-medium text-slate-700">
                          {data.template.locationName ?? 'Church-wide'}
                        </span>
                        <span className="font-num text-[11px] text-slate-400">
                          · {data.instanceCount} recorded {data.instanceCount === 1 ? 'week' : 'weeks'}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                        Locked because those weeks <span className="font-medium text-slate-500">happened here</span> — moving the
                        service would rewrite where past numbers belong. Need it at another campus? Create a new service there
                        and retire this one; all its history stays put.
                      </p>
                    </>
                  )}
                </div>

                {/* SE4 main ministry — TOP-LEVEL ministries only (a child group
                    like Tabors is never a sensible "main" for a service); the
                    current value stays listed even if it's a child, marked so */}
                <label className="mt-4 block">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Main ministry</span>
                  <select
                    value={primaryTag}
                    onChange={(e) => setPrimaryTag(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-900 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
                  >
                    {data.tags.filter(t => t.parent_tag_id === null).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    {/* keep a child current value selectable rather than breaking the form */}
                    {(() => {
                      const cur = data.tags.find(t => t.id === primaryTag)
                      return cur && cur.parent_tag_id !== null
                        ? <option value={cur.id}>{cur.name} (group)</option>
                        : null
                    })()}
                  </select>
                  <span className="mt-1 flex items-center gap-1.5 text-[12px] leading-relaxed text-slate-400">
                    <span className={`h-3 w-1.5 shrink-0 rounded-full ${accentForRole(data.tags.find(t => t.id === primaryTag)?.tag_role ?? null)}`} aria-hidden />
                    What this service is mainly about. The full list of ministries counted here is managed on the Services page —
                    this is just the fallback home if none are linked.
                  </span>
                </label>

                {/* SE5 reporting group (0037) — hidden until the migration applies */}
                {data.groups !== null && (
                  <div className="mt-4">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Reporting group</span>
                    <div className="mt-1.5 flex items-center gap-2">
                      <select
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-900 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
                      >
                        <option value="">None</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => setNewGroupName(newGroupName === null ? '' : null)}
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] font-semibold text-[#3D5BD4] transition-colors hover:bg-[#4F6EF7]/5"
                      >
                        + New group
                      </button>
                    </div>
                    {newGroupName !== null && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="e.g. Morning"
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] text-slate-900 placeholder:text-slate-300 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
                          onKeyDown={async (e) => {
                            if (e.key !== 'Enter') return
                            e.preventDefault()
                            const res = await createServiceGroupAction(newGroupName)
                            if (res.group) { setGroups(g => [...g, res.group!]); setGroupId(res.group.id); setNewGroupName(null) }
                            else setError(res.error ?? 'Could not create the group.')
                          }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await createServiceGroupAction(newGroupName)
                            if (res.group) { setGroups(g => [...g, res.group!]); setGroupId(res.group.id); setNewGroupName(null) }
                            else setError(res.error ?? 'Could not create the group.')
                          }}
                          className="rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#3D5BD4]"
                        >
                          Create
                        </button>
                      </div>
                    )}
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                      Different from ministry groups: ministries (in What we track) group <span className="font-medium text-slate-500">what you count</span> —
                      a reporting group bundles <span className="font-medium text-slate-500">whole services</span> for reports, e.g. put the 9am and 11am
                      (any campus) in &quot;Morning&quot; to compare Morning vs Evening. Optional — leave it on None if you don&apos;t need it.
                    </p>
                  </div>
                )}

                {/* SE6 show in Entries (0036) — hidden until the migration applies */}
                {data.extrasSupported && (
                  <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={showInEntries}
                      onChange={(e) => setShowInEntries(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#4F6EF7] focus:ring-[#4F6EF7]/40"
                    />
                    <span>
                      <span className="block text-[14px] font-semibold text-slate-800">Show in Entries</span>
                      <span className="block text-[12px] leading-relaxed text-slate-400">
                        Off = entry screens skip this service. History and dashboards keep all its data.
                      </span>
                    </span>
                  </label>
                )}

                {error && (
                  <p className="mt-3 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-[12px] font-medium text-[#B45309]">{error}</p>
                )}

                {/* SE7 save */}
                <div className="mt-5 flex items-center gap-2">
                  <button
                    onClick={() => void save()}
                    disabled={saving || !name.trim() || !primaryTag}
                    className="rounded-lg bg-[#4F6EF7] px-4 py-2 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-[#3D5BD4] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button onClick={() => router.push('/settings/services')}
                    className="rounded-lg px-3 py-2 text-[14px] font-medium text-slate-500 transition-colors duration-200 hover:bg-slate-100">
                    Cancel
                  </button>
                </div>
              </section>

              {/* SE8 danger zone — amber, typed confirm, never red */}
              <section className="rounded-2xl border border-[#F59E0B]/30 bg-white p-5 shadow-sm">
                <h2 className="text-[14px] font-bold text-slate-900">Retire this service</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                  It stops appearing in Entries and Services. Everything already logged stays in History and Dashboards.
                </p>
                <label className="mt-3 block">
                  <span className="text-[12px] text-slate-400">Type <span className="font-semibold text-slate-600">{data.template.display_name}</span> to confirm</span>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={data.template.display_name}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-900 placeholder:text-slate-300 focus-visible:border-[#F59E0B] focus-visible:outline-none"
                  />
                </label>
                <button
                  onClick={() => void retire()}
                  disabled={retiring || confirmText.trim() !== data.template.display_name}
                  className="mt-3 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-4 py-2 text-[14px] font-semibold text-[#B45309] transition-colors duration-200 hover:bg-[#F59E0B]/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/40"
                >
                  {retiring ? 'Retiring…' : 'Retire service'}
                </button>
              </section>
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  )
}
