/**
 * Pure parsing utilities shared by the preview route and tests.
 * No server-only dependency — safe to import in any context.
 */

export function parseDateIso(raw: string | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null

  // ISO: 2024-1-5 or 2024-01-05
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (iso) {
    const [, y, m, d] = iso
    const mo = Number(m), dy = Number(d)
    if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return null
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // US: M/D/YYYY or M-D-YYYY or M/D/YY
  const us = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s)
  if (us) {
    let [, m, d, y] = us
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y
    const mo = Number(m), dy = Number(d)
    if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return null
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Reject bare integers — JS Date("12345") = year 12345, not a date column value
  if (/^\d+$/.test(s)) return null

  // Fallback: let Date parse it (handles "Jan 5, 2024", "5 January 2024", etc.)
  const dt = new Date(s)
  if (!Number.isFinite(dt.getTime())) return null
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

export function parseCount(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null
  const cleaned = String(raw).replace(/[$,\s]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned.toLowerCase() === 'n/a') return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

export function fmtMonthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-')
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[Number(m) - 1]} ${y}`
}

export interface MonthBucket {
  main:  number
  kids:  number
  youth: number
}

export interface MonthRow {
  month:  string
  label:  string
  main:   number
  kids:   number
  youth:  number
  total:  number
}

/**
 * Aggregates raw CSV rows into monthly attendance buckets.
 * columnMap maps source column name → dest field (e.g. "attendance.main").
 */
export function aggregateMonths(
  rows:       Record<string, string>[],
  dateCol:    string,
  columnMap:  { source_column: string; dest_field: string }[],
): MonthRow[] {
  const fieldByCol = new Map(columnMap.map(c => [c.source_column, c.dest_field]))
  const monthMap   = new Map<string, MonthBucket>()

  for (const row of rows) {
    const iso = parseDateIso(row[dateCol])
    if (!iso) continue
    const month = iso.slice(0, 7)
    const bucket = monthMap.get(month) ?? { main: 0, kids: 0, youth: 0 }

    for (const [col, dest] of fieldByCol) {
      if (!dest.startsWith('attendance.')) continue
      const aud = dest.slice('attendance.'.length) as 'main' | 'kids' | 'youth'
      if (aud !== 'main' && aud !== 'kids' && aud !== 'youth') continue
      const n = parseCount(row[col])
      if (n != null) bucket[aud] += n
    }
    monthMap.set(month, bucket)
  }

  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, c]) => ({
      month,
      label: fmtMonthLabel(month),
      main:  c.main,
      kids:  c.kids,
      youth: c.youth,
      total: c.main + c.kids + c.youth,
    }))
}
