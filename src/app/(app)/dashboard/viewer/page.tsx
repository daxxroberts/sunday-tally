'use client'

// D2 — Viewer Summary — /dashboard/viewer
// IRIS_D2_ELEMENT_MAP.md: E1-E7 all implemented
// D-026: No Volunteers row | D-048: re-auth note at bottom
// Same P14a/b/c queries as D1 (N75) | No drill-down (N77)

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { fetchDashboardData, type TagRow, type ComparisonValue } from '@/lib/dashboard'
import type { Church } from '@/types'

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-gray-300 text-xs">—</span>
  const up = delta >= 0
  return <span className={`text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>{up ? '▲' : '▼'}{Math.abs(delta)}%</span>
}

function Cell({ val }: { val: ComparisonValue }) {
  const fmt = (n: number | null) => n === null ? '—' : n.toLocaleString()
  return (
    <div className="text-right">
      <p className="text-sm font-medium text-gray-900">{fmt(val.current)} <span className="text-gray-400 font-normal">/ {fmt(val.prior)}</span></p>
      <DeltaBadge delta={val.delta} />
    </div>
  )
}

const COL_HEADERS = ['This Wk / Last', '4-Wk Avg', 'YTD Avg']

export default function ViewerDashboardPage() {
  const [church, setChurch] = useState<Church | null>(null)
  const [rows, setRows] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('church_id, churches(*)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      // @ts-expect-error join
      const ch = membership.churches as Church
      setChurch(ch)

      // N76: pass includeVolunteers=false for D2
      const data = await fetchDashboardData(membership.church_id, false)
      setRows(data)
      setLoading(false)
    })
  }, [])

  if (!church) return null

  return (
    <AppLayout role="viewer">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <p className="font-semibold text-gray-900">Dashboard</p>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-medium text-gray-900 mb-1">No data yet</p>
            <p className="text-sm text-gray-500">Data appears here after your first Sunday entry.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-2 text-xs text-gray-400 font-medium">
              <div />
              {COL_HEADERS.map(h => <div key={h} className="text-right">{h}</div>)}
            </div>

            {rows.map(row => {
              // N76: Volunteers row NEVER shown on D2 (D-026)
              const metrics = [
                { label: 'Attendance', data: row.attendance, show: true },
                { label: 'Stats', data: row.stats, show: church.tracks_responses && !!row.stats },
                { label: 'Giving', data: row.giving, show: church.tracks_giving && !!row.giving },
              ].filter(m => m.show)

              return (
                <div key={row.tag_code} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50">
                    <span className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{row.tag_name}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {metrics.map(metric => (
                      <div key={metric.label} className="grid grid-cols-4 gap-2 px-4 py-3 items-center">
                        <span className="text-xs text-gray-500">{metric.label}</span>
                        <Cell val={metric.data!.a} />
                        <Cell val={metric.data!.b} />
                        <Cell val={metric.data!.c} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* E7 — Re-auth note (D-048) — N78: Viewer only, bottom, low prominence */}
        <p className="mt-8 text-xs text-center text-gray-400">
          Need a new link? Enter your email on the login screen.
        </p>
      </div>
    </AppLayout>
  )
}
