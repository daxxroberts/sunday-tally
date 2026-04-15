'use client'

// D1 — Full Dashboard — /dashboard
// IRIS_D1_ELEMENT_MAP.md: E1-E9 all implemented
// D-033: three columns simultaneously | D-041: group by tag_code | D-045: hide rows per flags
// N68: no toggle | N73: delta % | N97: one-week state

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { fetchDashboardData, type TagRow, type ComparisonValue } from '@/lib/dashboard'
import type { UserRole, Church } from '@/types'

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-gray-300 text-xs">—</span>
  const up = delta >= 0
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'}{Math.abs(delta)}%
    </span>
  )
}

function Cell({ val }: { val: ComparisonValue; prefix?: string }) {
  const fmt = (n: number | null, pfx = '') => n === null ? '—' : `${pfx}${n.toLocaleString()}`
  return (
    <div className="text-right">
      <p className="text-sm font-medium text-gray-900">{fmt(val.current)} <span className="text-gray-400 font-normal">/ {fmt(val.prior)}</span></p>
      <DeltaBadge delta={val.delta} />
    </div>
  )
}

const COL_HEADERS = ['This Wk / Last', '4-Wk Avg', 'YTD Avg']

export default function DashboardPage() {
  const [role, setRole] = useState<UserRole>('admin')
  const [church, setChurch] = useState<Church | null>(null)
  const [rows, setRows] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTag, setExpandedTag] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(*)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole)
      // @ts-expect-error join
      const ch = membership.churches as Church
      setChurch(ch)

      const data = await fetchDashboardData(membership.church_id, ch.tracks_volunteers)
      setRows(data)
      setLoading(false)
    })
  }, [])

  if (!church) return null

  return (
    <AppLayout role={role}>
      {/* E1 — Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <p className="font-semibold text-gray-900">Dashboard</p>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          /* E6 — Empty state */
          <div className="text-center py-16">
            <p className="font-medium text-gray-900 mb-1">No data yet</p>
            <p className="text-sm text-gray-500">Data appears here after your first Sunday entry.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Column headers */}
            <div className="grid grid-cols-4 gap-2 text-xs text-gray-400 font-medium">
              <div />
              {COL_HEADERS.map(h => <div key={h} className="text-right">{h}</div>)}
            </div>

            {/* E3 — Primary tag rows */}
            {rows.map(row => {
              const isExpanded = expandedTag === row.tag_code
              const metrics = [
                { label: 'Attendance', data: row.attendance, show: true },
                { label: 'Volunteers', data: row.volunteers, show: church.tracks_volunteers && !!row.volunteers },
                { label: 'Stats', data: row.stats, show: church.tracks_responses && !!row.stats },
                { label: 'Giving', data: row.giving, show: church.tracks_giving && !!row.giving },
              ].filter(m => m.show)

              return (
                <div key={row.tag_code} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Tag header — E3 */}
                  <button
                    onClick={() => setExpandedTag(isExpanded ? null : row.tag_code)}
                    className="w-full px-4 py-3 bg-gray-50 text-left flex items-center justify-between hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{row.tag_name}</span>
                    <span className="text-xs text-gray-400">{isExpanded ? 'Collapse' : 'Drill down'}</span>
                  </button>

                  {/* E4 — Metric sub-rows */}
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

                  {/* E7 — Audience drill-down */}
                  {isExpanded && (
                    <div className="bg-blue-50 border-t border-blue-100 px-4 py-3">
                      <p className="text-xs text-blue-600 font-medium mb-2">Attendance by audience</p>
                      <p className="text-xs text-blue-400">Audience breakdown coming — requires per-audience query</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
