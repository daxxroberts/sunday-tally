// D-054: Summary Card metric visibility — per-user, per-church localStorage preference.
// Key shape: sundaytally:d1_summary_metrics:{user_id}:{church_id}
// Defaults all on when the key is missing.

export type SummaryMetricKey =
  | 'grandTotal'
  | 'adults'
  | 'kids'
  | 'youth'
  | 'volunteers'
  | 'firstTimeDecisions'
  | 'giving'

export type SummaryMetricFlags = Record<SummaryMetricKey, boolean>

export const SUMMARY_METRIC_LABELS: Record<SummaryMetricKey, string> = {
  grandTotal:         'Grand Total',
  adults:             'Adults',
  kids:               'Kids',
  youth:              'Youth',
  volunteers:         'Total Volunteers',
  firstTimeDecisions: 'First-Time Decisions',
  giving:             'Giving',
}

export const SUMMARY_METRIC_ORDER: SummaryMetricKey[] = [
  'grandTotal', 'adults', 'kids', 'youth', 'volunteers', 'firstTimeDecisions', 'giving',
]

export const DEFAULT_SUMMARY_METRICS: SummaryMetricFlags = {
  grandTotal: true, adults: true, kids: true, youth: true,
  volunteers: true, firstTimeDecisions: true, giving: true,
}

function storageKey(userId: string, churchId: string): string {
  return `sundaytally:d1_summary_metrics:${userId}:${churchId}`
}

export function loadSummaryMetrics(userId: string, churchId: string): SummaryMetricFlags {
  if (typeof window === 'undefined') return DEFAULT_SUMMARY_METRICS
  try {
    const raw = window.localStorage.getItem(storageKey(userId, churchId))
    if (!raw) return DEFAULT_SUMMARY_METRICS
    const parsed = JSON.parse(raw) as Partial<SummaryMetricFlags>
    return { ...DEFAULT_SUMMARY_METRICS, ...parsed }
  } catch {
    return DEFAULT_SUMMARY_METRICS
  }
}

export function saveSummaryMetrics(userId: string, churchId: string, flags: SummaryMetricFlags): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId, churchId), JSON.stringify(flags))
  } catch {
    // storage unavailable — silent no-op
  }
}
