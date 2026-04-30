'use client'

// T_WEEKLY_STATS — Weekly Stats Inputs — /services/weekly-stats
// Mirror of T_WEEKLY (giving) for week-scope response_categories.
// Reads/writes church_period_entries with service_tag_id = NULL
// (church-wide, no audience split). Allowed by 0014_period_entries_nullable_tag.

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, Church } from '@/types'

interface StatCategory {
  id: string
  category_name: string
  display_order: number
}

interface StatRow {
  id: string
  name: string
  value: string       // current input
  original: string    // loaded value
  isNA: boolean
  originalNA: boolean
}

// Sunday-anchored week (D-056) — same convention as /services/weekly
function weekStartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
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

export default function WeeklyStatsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [role, setRole] = useState<UserRole>('editor')
  const [church, setChurch] = useState<Church | null>(null)
  const [cats, setCats] = useState<StatCategory[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().slice(0, 10)
  const initialWeek = (() => {
    const w = searchParams.get('week')
    if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) return weekStartDate(w)
    return weekStartDate(today)
  })()
  const [currentWeek, setCurrentWeek] = useState(initialWeek)

  const [rows, setRows] = useState<StatRow[]>([])
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')

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
      // @ts-expect-error join
      const ch = membership.churches as Church

      const { data: catRows } = await supabase
        .from('response_categories')
        .select('id, category_name, display_order')
        .eq('church_id', ch.id)
        .eq('is_active', true)
        .eq('stat_scope', 'week')
        .order('display_order')

      setCats(catRows ?? [])
      setChurch(ch)
    })
  }, [router])

  const loadWeek = useCallback(async (ch: Church, weekStart: string, allCats: StatCategory[]) => {
    setLoading(true)
    const supabase = createClient()

    // Untagged (service_tag_id IS NULL) week-scope entries for these categories
    const { data: entries } = await supabase
      .from('church_period_entries')
      .select('response_category_id, stat_value, is_not_applicable')
      .eq('church_id', ch.id)
      .eq('entry_period_type', 'week')
      .eq('period_date', weekStart)
      .is('service_tag_id', null)

    const valMap: Record<string, { v: string; na: boolean }> = {}
    for (const e of (entries ?? [])) {
      valMap[e.response_category_id] = {
        v: e.stat_value !== null ? String(e.stat_value) : '',
        na: e.is_not_applicable,
      }
    }

    setRows(allCats.map(c => {
      const m = valMap[c.id] ?? { v: '', na: false }
      return {
        id: c.id,
        name: c.category_name,
        value: m.v,
        original: m.v,
        isNA: m.na,
        originalNA: m.na,
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (church && cats.length >= 0) loadWeek(church, currentWeek, cats)
  }, [church, currentWeek, cats, loadWeek])

  const thisWeekStart = weekStartDate(today)
  const isCurrentWeek = currentWeek >= thisWeekStart

  function stepWeek(direction: -1 | 1) {
    if (direction === 1 && isCurrentWeek) return
    setSaveState('idle')
    setCurrentWeek(prev => addWeeks(prev, direction))
  }

  async function save() {
    if (!church) return
    setSaving(true)
    setSaveState('idle')
    const supabase = createClient()
    let hasError = false

    for (const row of rows) {
      const dirty = row.value !== row.original || row.isNA !== row.originalNA
      if (!dirty) continue

      const isClear = !row.isNA && row.value === ''
      if (isClear) {
        // DELETE matching untagged row if it existed
        if (row.original !== '' || row.originalNA) {
          const { error } = await supabase
            .from('church_period_entries')
            .delete()
            .eq('church_id', church.id)
            .eq('response_category_id', row.id)
            .eq('entry_period_type', 'week')
            .eq('period_date', currentWeek)
            .is('service_tag_id', null)
          if (error) hasError = true
        }
        continue
      }

      const stat_value = row.isNA ? null : (row.value === '' ? null : parseInt(row.value, 10))
      if (!row.isNA && (stat_value === null || isNaN(stat_value))) continue

      // PostgREST upsert won't match on IS NULL — manual update-or-insert.
      const { data: existing } = await supabase
        .from('church_period_entries')
        .select('id')
        .eq('church_id', church.id)
        .eq('response_category_id', row.id)
        .eq('entry_period_type', 'week')
        .eq('period_date', currentWeek)
        .is('service_tag_id', null)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('church_period_entries')
          .update({ stat_value, is_not_applicable: row.isNA })
          .eq('id', existing.id)
        if (error) hasError = true
      } else {
        const { error } = await supabase
          .from('church_period_entries')
          .insert({
            church_id: church.id,
            service_tag_id: null,
            response_category_id: row.id,
            entry_period_type: 'week',
            period_date: currentWeek,
            stat_value,
            is_not_applicable: row.isNA,
          })
        if (error) hasError = true
      }
    }

    setSaving(false)
    if (hasError) {
      setSaveState('error')
    } else {
      setRows(prev => prev.map(r => ({ ...r, original: r.value, originalNA: r.isNA })))
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    }
  }

  const isDirty = rows.some(r => r.value !== r.original || r.isNA !== r.originalNA)

  if (!church) return null

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <Link href="/services" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <p className="font-semibold text-gray-900 text-sm leading-tight">Weekly Stats</p>
          <p className="text-xs text-gray-400 leading-tight">{church.name}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
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

        {!loading && cats.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 font-medium">No weekly stats configured.</p>
            <p className="text-gray-400 text-sm mt-1">
              Add a stat with a Weekly scope in Settings first.
            </p>
            <Link
              href="/settings/stats"
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline"
            >
              Go to Stats →
            </Link>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50">
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5 gap-4">
                <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-7 w-20 bg-gray-100 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {!loading && cats.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Weekly Stats</p>
            </div>

            <div className="divide-y divide-gray-50">
              {rows.map((row, i) => (
                <div key={row.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-700 flex-1">{row.name}</span>
                    {row.isNA ? (
                      <span className="text-xs italic text-gray-400 px-2.5 py-1.5">N/A</span>
                    ) : (
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={row.value}
                        placeholder="–"
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9]/g, '')
                          setSaveState('idle')
                          setRows(prev => prev.map((r, j) => j === i ? { ...r, value: v } : r))
                        }}
                        className="w-20 text-right text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gray-400 transition-colors"
                      />
                    )}
                    <button
                      onClick={() => {
                        setSaveState('idle')
                        setRows(prev => prev.map((r, j) =>
                          j === i ? { ...r, isNA: !r.isNA, value: !r.isNA ? '' : r.value } : r
                        ))
                      }}
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md transition-colors ${
                        row.isNA
                          ? 'bg-gray-200 text-gray-700'
                          : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      N/A
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && cats.length > 0 && (
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
                  : 'Save Weekly Stats'}
          </button>
        )}
      </div>
    </AppLayout>
  )
}
