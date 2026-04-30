'use client'

// T_WEEKLY — Weekly Inputs — /services/weekly
// IRIS_TWEEKLY_ELEMENT_MAP.md v1.0: E1-E7 all implemented
// P16a (load weekly giving) + P16b (UPSERT/DELETE per source)
// D-056: church_period_giving — no service_occurrence_id required
// D-003: empty input → DELETE (NULL ≠ 0)

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, Church } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GivingSource {
  id: string
  source_name: string
  display_order: number
}

interface SourceRow {
  id: string
  name: string
  amount: string     // current input value
  original: string   // loaded value (for dirty detection)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Sunday-anchored week: Sunday is the start of the church week (D-056).
// Any date returns the Sunday on or before it.
//   Sun Apr 26 → 2026-04-26 (itself)
//   Mon Apr 27 → 2026-04-26 (previous Sunday)
//   Sat May 02 → 2026-04-26 (previous Sunday)
function weekStartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()  // Sunday=0, Monday=1, ..., Saturday=6
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().slice(0, 10)
}

function formatWeekLabel(sundayStr: string): string {
  const d = new Date(sundayStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [role, setRole] = useState<UserRole>('editor')
  const [church, setChurch] = useState<Church | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [sources, setSources] = useState<GivingSource[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().slice(0, 10)
  // ?week=YYYY-MM-DD lets other pages (e.g. History) deep-link to a specific week.
  // The value is normalised through weekStartDate so any date in the week resolves to its Sunday.
  const initialWeek = (() => {
    const w = searchParams.get('week')
    if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) return weekStartDate(w)
    return weekStartDate(today)
  })()
  const [currentWeek, setCurrentWeek] = useState(initialWeek)

  const [rows, setRows] = useState<SourceRow[]>([])
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')

  // ─── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/services'); return }

      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, churches(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership) { router.push('/services'); return }

      const r = membership.role as UserRole
      if (r === 'viewer') { router.push('/dashboard/viewer'); return }

      setRole(r)
      setUserId(user.id)
      // @ts-expect-error join
      const ch = membership.churches as Church

      const { data: srcs } = await supabase
        .from('giving_sources')
        .select('id, source_name, display_order')
        .eq('church_id', ch.id)
        .eq('is_active', true)
        .order('display_order')

      setSources(srcs ?? [])
      setChurch(ch)
    })
  }, [router])

  // ─── Load giving for selected week (P16a) ─────────────────────────────────

  const loadWeek = useCallback(async (ch: Church, monday: string, allSources: GivingSource[]) => {
    setLoading(true)
    const supabase = createClient()

    const { data: entries } = await supabase
      .from('church_period_giving')
      .select('giving_source_id, giving_amount')
      .eq('church_id', ch.id)
      .eq('entry_period_type', 'week')
      .eq('period_date', monday)

    const amtMap: Record<string, string> = {}
    for (const e of (entries ?? [])) {
      amtMap[e.giving_source_id] = Number(e.giving_amount).toFixed(2)
    }

    setRows(allSources.map(s => ({
      id: s.id,
      name: s.source_name,
      amount: amtMap[s.id] ?? '',
      original: amtMap[s.id] ?? '',
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (church && sources.length >= 0) loadWeek(church, currentWeek, sources)
  }, [church, currentWeek, sources, loadWeek])

  // ─── Week navigation ───────────────────────────────────────────────────────

  const thisWeekStart = weekStartDate(today)
  const isCurrentWeek = currentWeek >= thisWeekStart

  function stepWeek(direction: -1 | 1) {
    if (direction === 1 && isCurrentWeek) return
    setSaveState('idle')
    setCurrentWeek(prev => addWeeks(prev, direction))
  }

  // ─── Save (P16b) ──────────────────────────────────────────────────────────

  async function save() {
    if (!church || !userId) return
    setSaving(true)
    setSaveState('idle')
    const supabase = createClient()
    let hasError = false

    for (const row of rows) {
      if (row.amount === row.original) continue // unchanged — skip

      if (row.amount === '' || row.amount === '0.00') {
        // Clear → DELETE existing row if it existed
        if (row.original !== '') {
          const { error } = await supabase
            .from('church_period_giving')
            .delete()
            .eq('church_id', church.id)
            .eq('giving_source_id', row.id)
            .eq('entry_period_type', 'week')
            .eq('period_date', currentWeek)
          if (error) hasError = true
        }
      } else {
        const amt = parseFloat(row.amount)
        if (isNaN(amt)) continue
        const { error } = await supabase
          .from('church_period_giving')
          .upsert(
            {
              church_id: church.id,
              giving_source_id: row.id,
              entry_period_type: 'week',
              period_date: currentWeek,
              giving_amount: amt,
              submitted_by: userId,
            },
            { onConflict: 'church_id,giving_source_id,entry_period_type,period_date' }
          )
        if (error) hasError = true
      }
    }

    setSaving(false)
    if (hasError) {
      setSaveState('error')
    } else {
      // Stamp originals to current values
      setRows(prev => prev.map(r => ({ ...r, original: r.amount })))
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const total = rows.reduce((sum, r) => {
    const v = parseFloat(r.amount)
    return r.amount !== '' && !isNaN(v) ? sum + v : sum
  }, 0)

  const isDirty = rows.some(r => r.amount !== r.original)

  if (!church) return null

  return (
    <AppLayout role={role}>

      {/* E1 — Page Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <Link href="/services" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <p className="font-semibold text-gray-900 text-sm leading-tight">Weekly</p>
          <p className="text-xs text-gray-400 leading-tight">{church.name}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* E2 — Week Navigator */}
        <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
          <button
            onClick={() => stepWeek(-1)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition-colors"
            aria-label="Previous week"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Week of</p>
            <p className="text-sm font-semibold text-gray-900">{formatWeekLabel(currentWeek)}</p>
          </div>
          <button
            onClick={() => stepWeek(1)}
            disabled={isCurrentWeek}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Next week"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* E6 — Empty state (no sources) */}
        {!loading && sources.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 font-medium">No giving sources set up yet.</p>
            <p className="text-gray-400 text-sm mt-1">Add them in Settings first.</p>
            <Link
              href="/settings/giving-sources"
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline"
            >
              Go to Giving Sources →
            </Link>
          </div>
        )}

        {/* E7 — Loading skeleton */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50">
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5 gap-4">
                <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-7 w-24 bg-gray-100 rounded-lg animate-pulse" />
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <div className="h-3 w-10 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        )}

        {/* E3 / E4 — Giving section */}
        {!loading && sources.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Giving</p>
            </div>

            <div className="divide-y divide-gray-50">
              {rows.map((row, i) => (
                <div key={row.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <span className="text-sm text-gray-700 flex-1">{row.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      placeholder="0.00"
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
                        setSaveState('idle')
                        setRows(prev => prev.map((r, j) => j === i ? { ...r, amount: v } : r))
                      }}
                      onBlur={e => {
                        const v = e.target.value
                        if (v !== '' && !isNaN(parseFloat(v))) {
                          setRows(prev => prev.map((r, j) =>
                            j === i ? { ...r, amount: parseFloat(v).toFixed(2) } : r
                          ))
                        }
                      }}
                      className="w-24 text-right text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gray-400 transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* E4 — Running total */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-500">Total</span>
              <span className="text-sm font-semibold text-gray-900">{formatMoney(total)}</span>
            </div>
          </div>
        )}

        {/* E5 — Save button */}
        {!loading && sources.length > 0 && (
          <button
            onClick={save}
            disabled={saving || (!isDirty && saveState !== 'error')}
            className={`w-full py-3 rounded-2xl text-sm font-semibold transition-colors
              ${saveState === 'saved'
                ? 'bg-green-600 text-white'
                : saveState === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40'
              }`}
          >
            {saving
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved ✓'
                : saveState === 'error'
                  ? 'Error — try again'
                  : 'Save Weekly Giving'}
          </button>
        )}
      </div>
    </AppLayout>
  )
}
