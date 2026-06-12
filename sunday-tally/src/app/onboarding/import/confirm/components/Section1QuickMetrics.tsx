'use client'

import type { PreviewData, QuickSummary } from '../types'

// ── Section 1: Quick Metrics ──────────────────────────────────────────────────

export function Section1QuickMetrics({
  previewData,
  quickSummary,
  weeksObserved,
  trackedCategories,
  lowConfidenceNote,
}: {
  previewData?:       PreviewData | null
  quickSummary?:      QuickSummary | null
  weeksObserved?:     number
  trackedCategories:  string[]
  lowConfidenceNote?: string | null
}) {
  const months = previewData?.monthly_attendance ?? []

  const avgOf = (key: 'main' | 'kids' | 'youth'): number | null => {
    const nonZero = months.filter(m => m[key] > 0)
    if (nonZero.length === 0) return null
    return Math.round(nonZero.reduce((s, m) => s + m[key], 0) / nonZero.length)
  }

  const avgMain  = avgOf('main')
  const avgKids  = avgOf('kids')
  const avgYouth = avgOf('youth')

  const dateRange = previewData?.date_range
  const weeks     = weeksObserved ?? months.length
  const lowConf   = quickSummary?.low_confidence ?? (weeks < 12)

  if (weeks === 0 && avgMain == null && !quickSummary) return null

  const kpiCards: Array<{ label: string; value: string | number; sub?: string }> = []

  if (weeks > 0) {
    kpiCards.push({
      label: 'Weeks of data',
      value: weeks,
      sub:   dateRange?.start && dateRange?.end
        ? `${fmtDate(dateRange.start)} – ${fmtDate(dateRange.end)}`
        : undefined,
    })
  }

  if (avgMain  != null) kpiCards.push({ label: 'Avg adults / Sunday',   value: avgMain.toLocaleString() })
  if (avgKids  != null) kpiCards.push({ label: 'Avg kids / Sunday',     value: avgKids.toLocaleString() })
  if (avgYouth != null) kpiCards.push({ label: 'Avg students / Sunday', value: avgYouth.toLocaleString() })

  if (quickSummary?.avg_volunteers_per_sunday != null) {
    kpiCards.push({ label: 'Avg volunteers / Sunday', value: Math.round(quickSummary.avg_volunteers_per_sunday).toLocaleString() })
  }
  if (quickSummary?.total_response_count != null) {
    kpiCards.push({ label: 'Total stats tracked', value: Math.round(quickSummary.total_response_count).toLocaleString() })
  }
  if (quickSummary?.total_giving_amount != null) {
    kpiCards.push({ label: 'Total giving', value: `$${Math.round(quickSummary.total_giving_amount).toLocaleString()}` })
  }

  const visible = kpiCards.slice(0, 6)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">What we found in your data</h2>
        {trackedCategories.length > 0 && (
          <p className="mt-0.5 text-sm text-gray-600">
            Tracking: {trackedCategories.join(' · ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visible.map((card, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="mt-1 text-xs font-medium text-gray-600 uppercase tracking-wide">{card.label}</p>
            {card.sub && <p className="mt-0.5 text-xs text-gray-500">{card.sub}</p>}
          </div>
        ))}
      </div>

      {lowConf && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-900 font-medium">
            {lowConfidenceNote ?? 'Less than 12 weeks of data — patterns may not be fully representative.'}
          </p>
        </div>
      )}
    </div>
  )
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
