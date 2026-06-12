// ─── Shared date/week math — Sunday-anchored weeks ─────────────────────────────
// Single source of truth for the window math previously duplicated verbatim in
// lib/dashboard.ts and lib/widgets/compile.ts (plus the Date-based helpers from
// the entries screen). Pure functions, no server-only imports — safe in client
// and server code. Week boundaries feed dashboard averages (Rule 4: NULL ≠ zero),
// so the implementations are byte-for-byte moves; do not "improve" them.

// ── String-based family (YYYY-MM-DD in, YYYY-MM-DD out) ──

/** Sunday (week-start) for a Date, as YYYY-MM-DD. */
export function weekStartOf(d: Date): string {
  const day = d.getDay()
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - day)
  sunday.setHours(0, 0, 0, 0)
  return sunday.toISOString().split('T')[0]
}

/** Shift a YYYY-MM-DD by N days (noon anchor avoids DST edge slips). */
export function shiftDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/** Week-Sunday (YYYY-MM-DD) of a YYYY-MM-DD date string. */
export function weekOf(dateStr: string): string {
  return weekStartOf(new Date(dateStr + 'T12:00:00'))
}

/** YYYY-MM-DD for a Date in its local calendar day. */
export function isoDay(d: Date): string {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  return x.toISOString().split('T')[0]
}

/** First day of the month that `d` falls in, as YYYY-MM-DD. */
export function monthStartOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Jan 1 of the year `d` falls in, as YYYY-MM-DD. */
export function yearStartOf(d: Date): string {
  return `${d.getFullYear()}-01-01`
}

/** Shift a YYYY-MM-DD back/forward by N whole months, clamped to month length. */
export function shiftMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  const targetMonthIndex = d.getMonth() + months
  const y = d.getFullYear() + Math.floor(targetMonthIndex / 12)
  const m = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(y, m + 1, 0).getDate()
  const day = Math.min(d.getDate(), lastDay)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Shift a YYYY-MM-DD back/forward by N years (clamps Feb-29 → Feb-28). */
export function shiftYears(dateStr: string, years: number): string {
  return shiftMonths(dateStr, years * 12)
}

// ── Date-based family (Date in, Date out — used by the entries screen) ──

/** New Date shifted by N days. */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Sunday of the week `d` falls in, as a Date. getDay(): 0 = Sunday. */
export function sundayOf(d: Date): Date {
  return addDays(d, -d.getDay())
}
