'use client'

// T_HISTORY v2 — Preview of the design-package History grid
//
// This is a side-by-side preview wired to the V3 sample config and mocked
// service occurrences so we can visually evaluate the dynamic-grid pattern
// against the existing /services/history screen. Save handler currently
// logs to the console — full schema-builder→config + save-API integration
// is deferred until the visual approach is confirmed.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'
import { HistoryGrid } from '@/components/history-grid/HistoryGrid'
import { configV3, configV4, configServiceTimeGrouped } from '@/components/history-grid/grid-config-schema'
import type { GridConfig } from '@/components/history-grid/grid-config-schema'
import { useEffect } from 'react'

type ConfigKey = 'V3' | 'V4' | 'SVC'

const PRESET: Record<ConfigKey, { label: string; config: GridConfig }> = {
  V3:  { label: 'V3 — Metric-grouped',          config: configV3 },
  V4:  { label: 'V4 — Experience-grouped',      config: configV4 },
  SVC: { label: 'Service-time + weekly vols',   config: configServiceTimeGrouped },
}

// Mock occurrences for the preview window. Real integration will pull from
// service_occurrences via Supabase and translate to this shape.
function mockOccurrences(config: GridConfig, weeks: number) {
  const out: Array<{ id: string; serviceTemplateId: string; serviceDate: Date }> = []
  const today = new Date()
  for (let w = 0; w < weeks; w++) {
    for (const t of config.serviceTemplates) {
      const d = new Date(today)
      const dayOffset = (today.getDay() - t.dayOfWeek + 7) % 7
      d.setDate(today.getDate() - dayOffset - w * 7)
      out.push({ id: `${t.id}-${w}`, serviceTemplateId: t.id, serviceDate: d })
    }
  }
  return out
}

export default function HistoryV2PreviewPage() {
  const router = useRouter()
  const [role, setRole] = useState<UserRole>('editor')
  const [presetKey, setPresetKey] = useState<ConfigKey>('V3')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/services'); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!membership) { router.push('/services'); return }
      const r = membership.role as UserRole
      if (r === 'viewer') { router.push('/dashboard/viewer'); return }
      setRole(r)
    })
  }, [router])

  const preset = PRESET[presetKey]
  const config = preset.config
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const dateRange = { startDate: monthStart, endDate: today }
  const occurrences = mockOccurrences(config, 4)

  const handleSave = async (changes: Map<string, unknown>) => {
    // Preview-mode handler. Integration with Supabase writes will land in a
    // follow-up commit once the GridConfig→schema mapping is confirmed.
    console.log(`[history-v2 preview] Save ${changes.size} change(s):`)
    for (const [key, value] of changes.entries()) {
      console.log(`  ${key} = ${value as string}`)
    }
    await new Promise(r => setTimeout(r, 400))
  }

  return (
    <AppLayout role={role}>
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <Link href="/services" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm leading-tight">History (v2 Preview)</p>
          <p className="text-xs text-gray-400 leading-tight">
            Design-package preview — sample data only. The current History tab is unchanged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Pattern</label>
          <select
            value={presetKey}
            onChange={(e) => setPresetKey(e.target.value as ConfigKey)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-gray-400"
          >
            {Object.entries(PRESET).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
        <strong>Preview-only.</strong> Edits log to the browser console. Switching the Pattern dropdown shows different
        config shapes from the design package. Full integration with Supabase reads/writes is the next step.
      </div>

      <div style={{ height: 'calc(100vh - 140px)' }}>
        <HistoryGrid
          config={config}
          dateRange={dateRange}
          serviceOccurrences={occurrences}
          onSave={handleSave}
        />
      </div>
    </AppLayout>
  )
}
