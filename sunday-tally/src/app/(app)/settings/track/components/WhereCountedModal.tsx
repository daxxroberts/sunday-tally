'use client'

// ─────────────────────────────────────────────────────────────────────────
// WhereCountedModal — TK5 (IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md §3).
// Two doors, plain labels: count it AT services (Door A → junction links) or
// JUST weekly/monthly church-wide (Door B → metrics become period-scoped and
// live in the Stat Entries tab — the Giving model: convert, never link).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { linkMinistryToServices, convertMinistryToWeekly } from '../actions'

export function WhereCountedModal({ tagId, tagName, supabase, onClose, onDone }: {
  tagId: string
  tagName: string
  supabase: ReturnType<typeof createClient>
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const [services, setServices] = useState<{ id: string; name: string; locationName: string | null }[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [cadence, setCadence] = useState<'week' | 'month'>('week')
  const [working, setWorking] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loadingSvcs, setLoadingSvcs] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('service_templates')
        .select('id, display_name, church_locations(name)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      type Row = { id: string; display_name: string | null; church_locations: { name: string } | { name: string }[] | null }
      setServices(((data ?? []) as Row[]).map(r => ({
        id: r.id,
        name: r.display_name ?? 'Service',
        locationName: (Array.isArray(r.church_locations) ? r.church_locations[0]?.name : r.church_locations?.name) ?? null,
      })))
      setLoadingSvcs(false)
    })()
    return () => { cancelled = true }
  }, [supabase])

  async function doorA() {
    if (checked.size === 0 || working) return
    setWorking(true); setErr(null)
    const res = await linkMinistryToServices({ tagId, templateIds: Array.from(checked) })
    setWorking(false)
    if (!res.ok) { setErr(res.error ?? 'Could not link.'); return }
    await onDone()
  }

  async function doorB() {
    if (working) return
    setWorking(true); setErr(null)
    const res = await convertMinistryToWeekly({ tagId, cadence })
    setWorking(false)
    if (!res.ok) { setErr(res.error ?? 'Could not convert.'); return }
    await onDone()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-[16px] font-bold text-slate-900">Where is <span className="text-[#3D5BD4]">{tagName}</span> counted?</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          Its counts won&apos;t appear on any entry screen until you pick one.
        </p>

        {/* Door A — at a service */}
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <p className="text-[13px] font-semibold text-slate-800">At a service</p>
          <p className="text-[11px] text-slate-400">Each gathering gets its own count.</p>
          {loadingSvcs ? (
            <div className="mt-2 h-8 animate-pulse rounded-lg bg-slate-100" />
          ) : services.length === 0 ? (
            <p className="mt-2 text-[12px] text-slate-400">No active services yet. Create one under Settings → Services.</p>
          ) : (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {services.map(s => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked.has(s.id)}
                    onChange={() => setChecked(prev => {
                      const next = new Set(prev)
                      if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                      return next
                    })}
                    className="h-4 w-4 rounded border-slate-300 text-[#4F6EF7] focus:ring-[#4F6EF7]/40"
                  />
                  <span className="font-medium">{s.name}</span>
                  {s.locationName && <span className="text-[11px] text-slate-400">· {s.locationName}</span>}
                </label>
              ))}
            </div>
          )}
          <button
            onClick={() => void doorA()}
            disabled={working || checked.size === 0}
            className="mt-2 rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40"
          >
            {working ? 'Saving…' : `Count it ${checked.size > 1 ? 'at these services' : 'there'}`}
          </button>
        </div>

        {/* Door B — weekly/monthly church-wide */}
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <p className="text-[13px] font-semibold text-slate-800">Just weekly or monthly, church-wide</p>
          <p className="text-[11px] text-slate-400">No service needed. It shows in the Stat Entries tab, like Giving.</p>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={cadence}
              onChange={e => setCadence(e.target.value as 'week' | 'month')}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
            >
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <button
              onClick={() => void doorB()}
              disabled={working}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-[#4F6EF7]/40 hover:bg-[#4F6EF7]/5 disabled:opacity-40"
            >
              {working ? 'Converting…' : 'Make it a stat entry'}
            </button>
          </div>
        </div>

        {err && (
          <p className="mt-3 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-3 py-2 text-[12px] font-medium text-[#B45309]">{err}</p>
        )}

        <button onClick={onClose} className="mt-3 w-full rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600">
          Decide later
        </button>
      </div>
    </div>,
    document.body,
  )
}
