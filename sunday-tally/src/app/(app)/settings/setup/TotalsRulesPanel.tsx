'use client'

// TOTALS RULES PANEL — /settings/setup?tab=totals (TOTALS_RULES_PLAN.md, Phase 1)
//
// A church defines its named grand totals here: each rule's reporting types
// (Attendance only, or Attendance + Volunteers = everyone present), roll-up, and
// which one is THE headline total. Saved to churches.dashboard_prefs.totals and
// read by resolveTotals() — the single source of truth the main dashboard, the AI
// builder, and the widget info-tabs all consume.
//
// Phase 1: scope is fixed to "all included ministries" (respects the existing
// excludedTotalMinistries list). A per-ministry picker is a flagged follow-up.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveChurchPrefs } from '@/lib/churchPrefs'
import {
  resolveTotals,
  REPORTING_TYPES,
  REPORTING_TYPE_LABEL,
  type TotalRule,
  type ReportingType,
} from '@/lib/totals'

const MANAGER_ROLES = new Set(['owner', 'admin', 'editor'])

export function TotalsRulesPanel({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [churchId, setChurchId] = useState<string | null>(null)
  const [basePrefs, setBasePrefs] = useState<Record<string, unknown>>({})
  const [rules, setRules] = useState<TotalRule[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id')
        .eq('user_id', user.id).eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1).maybeSingle()
      if (!membership) { setLoading(false); return }
      setCanEdit(MANAGER_ROLES.has(membership.role as string))
      setChurchId(membership.church_id as string)
      const { data: church } = await supabase
        .from('churches').select('dashboard_prefs, grid_config').eq('id', membership.church_id).maybeSingle()
      const prefs = (church?.dashboard_prefs && typeof church.dashboard_prefs === 'object')
        ? (church.dashboard_prefs as Record<string, unknown>)
        : {}
      setBasePrefs(prefs)
      setRules(resolveTotals(prefs))
      setLoading(false)
    })()
  }, [supabase])

  function patch(id: string, change: Partial<TotalRule>) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)))
    setDirty(true); setSavedAt(null)
  }

  function toggleType(id: string, t: ReportingType) {
    setRules((rs) => rs.map((r) => {
      if (r.id !== id) return r
      const has = r.reportingTypes.includes(t)
      const next = has ? r.reportingTypes.filter((x) => x !== t) : [...r.reportingTypes, t]
      // never allow an empty total — keep at least the one being toggled off? no: keep prev
      return { ...r, reportingTypes: next.length ? next : r.reportingTypes }
    }))
    setDirty(true); setSavedAt(null)
  }

  function setPrimary(id: string) {
    setRules((rs) => rs.map((r) => ({ ...r, isPrimary: r.id === id })))
    setDirty(true); setSavedAt(null)
  }

  function addTotal() {
    const id = `total_${Date.now()}`
    setRules((rs) => [
      ...rs,
      { id, name: 'New total', reportingTypes: ['ATTENDANCE'], ministries: 'all', rollup: 'weekly_avg' },
    ])
    setDirty(true); setSavedAt(null)
  }

  function removeTotal(id: string) {
    setRules((rs) => {
      const next = rs.filter((r) => r.id !== id)
      // keep a primary
      if (next.length && !next.some((r) => r.isPrimary)) next[0] = { ...next[0], isPrimary: true }
      return next
    })
    setDirty(true); setSavedAt(null)
  }

  async function save() {
    if (!churchId) return
    setSaving(true); setError(null)
    const next = { ...basePrefs, totals: rules }
    const res = await saveChurchPrefs(supabase, churchId, next)
    setSaving(false)
    if (!res.ok) { setError(res.message ?? 'Could not save'); return }
    setBasePrefs(next)
    setDirty(false); setSavedAt(Date.now())
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-400">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" style={{ fontFamily: embedded ? undefined : "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">Grand total rules</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tell Sunday Tally exactly what each total adds up. These rules drive your dashboard totals
          and what the AI builds — so &ldquo;attendance&rdquo; means attendees, and a &ldquo;total present&rdquo;
          can add volunteers too.
        </p>
      </div>

      <div className="space-y-3">
        {rules.map((r) => (
          <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                value={r.name}
                disabled={!canEdit}
                onChange={(e) => patch(r.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-sm font-bold text-slate-900 hover:border-slate-200 focus:border-[#4F6EF7] focus:outline-none disabled:hover:border-transparent"
                aria-label="Total name"
              />
              <label className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${r.isPrimary ? 'bg-amber-50 text-amber-700' : 'text-slate-400'}`}>
                <input
                  type="radio"
                  name="primary-total"
                  checked={!!r.isPrimary}
                  disabled={!canEdit}
                  onChange={() => setPrimary(r.id)}
                  className="accent-[#D4A017]"
                />
                Grand total
              </label>
              {canEdit && rules.length > 1 && (
                <button
                  onClick={() => removeTotal(r.id)}
                  aria-label={`Remove ${r.name}`}
                  className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Reporting types */}
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Adds up</div>
              <div className="flex flex-wrap gap-1.5">
                {REPORTING_TYPES.map((t) => {
                  const on = r.reportingTypes.includes(t)
                  return (
                    <button
                      key={t}
                      disabled={!canEdit}
                      onClick={() => toggleType(r.id, t)}
                      className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                        on
                          ? 'border-[#4F6EF7] bg-[#4F6EF7]/10 text-[#4F6EF7]'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      } disabled:opacity-60`}
                    >
                      {REPORTING_TYPE_LABEL[t]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Roll-up + scope */}
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shown as</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-[13px]">
                  {(['weekly_avg', 'sum'] as const).map((roll) => (
                    <button
                      key={roll}
                      disabled={!canEdit}
                      onClick={() => patch(r.id, { rollup: roll })}
                      className={`px-3 py-1 font-medium transition-colors ${
                        r.rollup === roll ? 'bg-[#4F6EF7] text-white' : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {roll === 'weekly_avg' ? 'Weekly average' : 'Running total'}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[12px] text-slate-400">Across all included ministries</span>
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <button
          onClick={addTotal}
          className="mt-3 w-full rounded-2xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 hover:border-[#4F6EF7] hover:text-[#4F6EF7]"
        >
          + Add a total
        </button>
      )}

      {/* Save bar */}
      {canEdit && (
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-xl bg-[#4F6EF7] px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save totals'}
          </button>
          {savedAt && !dirty && <span className="text-[13px] text-emerald-600">Saved ✓</span>}
          {error && <span className="text-[13px] text-amber-600">{error}</span>}
        </div>
      )}
      {!canEdit && (
        <p className="mt-4 text-[13px] text-slate-400">Only owners, admins, and editors can change the total rules.</p>
      )}

      <p className="mt-6 text-[12px] text-slate-400">
        Per-ministry picking (include only some ministries in a total) is coming next — today every
        total covers all ministries that count toward your church total.
      </p>
    </div>
  )
}
