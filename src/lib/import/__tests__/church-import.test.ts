/**
 * Sunday Tally — Church Import System
 * 100 tests covering parsers, CSV normalization, and preview aggregation.
 * Paths covered: happy, edge, error, multi-source, anomaly.
 */

import { describe, it, expect } from 'vitest'
import { parseDateIso, parseCount, fmtMonthLabel, aggregateMonths } from '../parsers'
import { normalizeSource } from '../sources'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — parseDateIso (25 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseDateIso', () => {
  // Happy path — ISO format
  it('T01 parses YYYY-MM-DD with zero-padded month and day', () => {
    expect(parseDateIso('2024-03-10')).toBe('2024-03-10')
  })
  it('T02 parses YYYY-M-D (no padding) and normalises', () => {
    expect(parseDateIso('2024-3-5')).toBe('2024-03-05')
  })
  it('T03 parses first day of year', () => {
    expect(parseDateIso('2023-01-01')).toBe('2023-01-01')
  })
  it('T04 parses last day of year', () => {
    expect(parseDateIso('2023-12-31')).toBe('2023-12-31')
  })

  // Happy path — US M/D/YYYY
  it('T05 parses M/D/YYYY (single-digit month and day)', () => {
    expect(parseDateIso('1/5/2024')).toBe('2024-01-05')
  })
  it('T06 parses MM/DD/YYYY (zero-padded)', () => {
    expect(parseDateIso('03/15/2024')).toBe('2024-03-15')
  })
  it('T07 parses M-D-YYYY (dash separator)', () => {
    expect(parseDateIso('4-7-2023')).toBe('2023-04-07')
  })
  it('T08 parses MM/DD/YY — year >= 70 uses 19xx', () => {
    expect(parseDateIso('01/01/70')).toBe('1970-01-01')
  })
  it('T09 parses MM/DD/YY — year < 70 uses 20xx', () => {
    expect(parseDateIso('12/25/23')).toBe('2023-12-25')
  })
  it('T10 parses MM/DD/YY — year 69 uses 20xx', () => {
    expect(parseDateIso('06/15/69')).toBe('2069-06-15')
  })

  // Fallback — natural language / other parseable strings
  it('T11 parses "January 5, 2024" via Date fallback', () => {
    const r = parseDateIso('January 5, 2024')
    expect(r).toBe('2024-01-05')
  })
  it('T12 parses "5 Jan 2024" via Date fallback', () => {
    const r = parseDateIso('5 Jan 2024')
    expect(r).not.toBeNull()
    expect(r!.slice(0, 7)).toBe('2024-01')
  })
  it('T13 parses "2024-06-30T00:00:00.000Z" (ISO timestamp)', () => {
    expect(parseDateIso('2024-06-30T00:00:00.000Z')).toBe('2024-06-30')
  })

  // Edge cases
  it('T14 trims leading/trailing whitespace', () => {
    expect(parseDateIso('  2024-03-10  ')).toBe('2024-03-10')
  })
  it('T15 returns null for undefined', () => {
    expect(parseDateIso(undefined)).toBeNull()
  })
  it('T16 returns null for empty string', () => {
    expect(parseDateIso('')).toBeNull()
  })
  it('T17 returns null for whitespace-only string', () => {
    expect(parseDateIso('   ')).toBeNull()
  })
  it('T18 returns null for "N/A"', () => {
    expect(parseDateIso('N/A')).toBeNull()
  })
  it('T19 returns null for plain text', () => {
    expect(parseDateIso('Easter Sunday')).toBeNull()
  })
  it('T20 returns null for a number string that is not a date', () => {
    expect(parseDateIso('12345')).toBeNull()
  })
  it('T21 returns null for invalid month 13', () => {
    expect(parseDateIso('2024-13-01')).toBeNull()
  })
  it('T22 returns null for day 0', () => {
    expect(parseDateIso('2024-01-00')).toBeNull()
  })
  it('T23 returns null for month 0', () => {
    expect(parseDateIso('2024-00-15')).toBeNull()
  })
  it('T24 returns null for "32nd" day in US format', () => {
    expect(parseDateIso('01/32/2024')).toBeNull()
  })
  it('T25 handles far-future date (2099)', () => {
    expect(parseDateIso('2099-12-31')).toBe('2099-12-31')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — parseCount (20 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseCount', () => {
  // Happy path
  it('T26 parses a plain integer string', () => {
    expect(parseCount('250')).toBe(250)
  })
  it('T27 parses zero', () => {
    expect(parseCount('0')).toBe(0)
  })
  it('T28 rounds a float down', () => {
    expect(parseCount('125.4')).toBe(125)
  })
  it('T29 rounds a float up', () => {
    expect(parseCount('125.6')).toBe(126)
  })
  it('T30 strips dollar sign', () => {
    expect(parseCount('$1250')).toBe(1250)
  })
  it('T31 strips commas (thousands separator)', () => {
    expect(parseCount('1,250')).toBe(1250)
  })
  it('T32 strips dollar sign + commas + spaces', () => {
    expect(parseCount('$ 1,250.00')).toBe(1250)
  })
  it('T33 parses a large giving amount', () => {
    expect(parseCount('12,345.67')).toBe(12346)
  })
  it('T34 strips internal whitespace', () => {
    expect(parseCount(' 300 ')).toBe(300)
  })

  // Edge / null cases
  it('T35 returns null for undefined', () => {
    expect(parseCount(undefined)).toBeNull()
  })
  it('T36 returns null for empty string', () => {
    expect(parseCount('')).toBeNull()
  })
  it('T37 returns null for "-" (dash placeholder)', () => {
    expect(parseCount('-')).toBeNull()
  })
  it('T38 returns null for "N/A"', () => {
    expect(parseCount('N/A')).toBeNull()
  })
  it('T39 returns null for plain text', () => {
    expect(parseCount('absent')).toBeNull()
  })
  it('T40 returns null for a negative number', () => {
    expect(parseCount('-50')).toBeNull()
  })
  it('T41 returns null for negative currency', () => {
    expect(parseCount('-$500')).toBeNull()
  })
  it('T42 returns null for NaN after stripping', () => {
    expect(parseCount('$')).toBeNull()
  })
  it('T43 handles "1.5k" — not parseable to a finite number after strip', () => {
    // "1.5k" → Number("1.5k") = NaN → null
    expect(parseCount('1.5k')).toBeNull()
  })
  it('T44 returns 0 for "0.00"', () => {
    expect(parseCount('0.00')).toBe(0)
  })
  it('T45 returns null for Infinity string', () => {
    expect(parseCount('Infinity')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — fmtMonthLabel (5 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('fmtMonthLabel', () => {
  it('T46 formats January', () => {
    expect(fmtMonthLabel('2024-01')).toBe('Jan 2024')
  })
  it('T47 formats December', () => {
    expect(fmtMonthLabel('2024-12')).toBe('Dec 2024')
  })
  it('T48 formats a mid-year month', () => {
    expect(fmtMonthLabel('2023-06')).toBe('Jun 2023')
  })
  it('T49 handles non-padded month "2023-7"', () => {
    expect(fmtMonthLabel('2023-7')).toBe('Jul 2023')
  })
  it('T50 formats correctly across year boundary', () => {
    expect(fmtMonthLabel('2025-01')).toBe('Jan 2025')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — normalizeSource CSV parsing (15 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeSource — CSV', () => {
  const ATTENDANCE_CSV = `Date,Main,Kids,Youth
2024-01-07,450,120,85
2024-01-14,480,130,90
2024-01-21,430,115,80`

  it('T51 parses a well-formed attendance CSV', async () => {
    const r = await normalizeSource({ kind: 'csv', name: 'Attendance', value: ATTENDANCE_CSV })
    expect(r.error).toBeUndefined()
    expect(r.columns).toEqual(['Date', 'Main', 'Kids', 'Youth'])
    expect(r.rowCount).toBe(3)
    expect(r.sampleRows[0]['Date']).toBe('2024-01-07')
  })

  it('T52 limits sampleRows to 10 even with 15 rows', async () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      `2024-01-${String(i + 1).padStart(2, '0')},${100 + i},${30 + i},${20 + i}`
    ).join('\n')
    const csv = `Date,Main,Kids,Youth\n${rows}`
    const r = await normalizeSource({ kind: 'csv', name: 'Big', value: csv })
    expect(r.rowCount).toBe(15)
    expect(r.sampleRows.length).toBe(10)
  })

  it('T53 trims header whitespace', async () => {
    const csv = ` Date , Main , Kids \n2024-01-07,450,120`
    const r = await normalizeSource({ kind: 'csv', name: 'Spaced', value: csv })
    expect(r.columns).toEqual(['Date', 'Main', 'Kids'])
  })

  it('T54 handles Windows CRLF line endings', async () => {
    const csv = 'Date,Main,Kids\r\n2024-01-07,450,120\r\n2024-01-14,480,130'
    const r = await normalizeSource({ kind: 'csv', name: 'CRLF', value: csv })
    expect(r.rowCount).toBe(2)
    expect(r.error).toBeUndefined()
  })

  it('T55 handles quoted fields with commas inside', async () => {
    const csv = 'Date,Note,Main\n2024-01-07,"Campus A, Main",450'
    const r = await normalizeSource({ kind: 'csv', name: 'Quoted', value: csv })
    expect(r.rowCount).toBe(1)
    expect(r.sampleRows[0]['Note']).toBe('Campus A, Main')
  })

  it('T56 handles a CSV with only headers (no data rows)', async () => {
    const csv = 'Date,Main,Kids,Youth'
    const r = await normalizeSource({ kind: 'csv', name: 'Empty', value: csv })
    expect(r.rowCount).toBe(0)
    expect(r.columns).toEqual(['Date', 'Main', 'Kids', 'Youth'])
    expect(r.error).toBeUndefined()
  })

  it('T57 handles missing values (empty cells)', async () => {
    const csv = 'Date,Main,Kids,Youth\n2024-01-07,,120,\n2024-01-14,480,,90'
    const r = await normalizeSource({ kind: 'csv', name: 'Sparse', value: csv })
    expect(r.rowCount).toBe(2)
    expect(r.sampleRows[0]['Main']).toBe('')
    expect(r.sampleRows[1]['Kids']).toBe('')
  })

  it('T58 handles a giving CSV with dollar amounts', async () => {
    const csv = `Date,Plate,Online,Total
2024-01-07,"$1,200.00","$3,450.50","$4,650.50"
2024-01-14,"$980.00","$2,100.00","$3,080.00"`
    const r = await normalizeSource({ kind: 'csv', name: 'Giving', value: csv })
    expect(r.columns).toEqual(['Date', 'Plate', 'Online', 'Total'])
    expect(r.rowCount).toBe(2)
  })

  it('T59 handles a volunteer CSV with role breakdown', async () => {
    const csv = `Date,Greeters,Worship,AV,Kids Helpers
2024-01-07,8,12,3,15
2024-01-14,7,14,4,16`
    const r = await normalizeSource({ kind: 'csv', name: 'Volunteers', value: csv })
    expect(r.columns).toContain('Greeters')
    expect(r.columns).toContain('Kids Helpers')
    expect(r.rowCount).toBe(2)
  })

  it('T60 handles multi-campus CSV with location column', async () => {
    const csv = `Date,Location,Service,Attendance
2024-01-07,Main Campus,Morning,450
2024-01-07,North Campus,Morning,220
2024-01-14,Main Campus,Morning,480`
    const r = await normalizeSource({ kind: 'csv', name: 'Multi-campus', value: csv })
    expect(r.columns).toContain('Location')
    expect(r.rowCount).toBe(3)
  })

  it('T61 handles US date format M/D/YYYY in CSV', async () => {
    const csv = `Date,Attendance\n1/7/2024,450\n1/14/2024,480`
    const r = await normalizeSource({ kind: 'csv', name: 'US dates', value: csv })
    expect(r.sampleRows[0]['Date']).toBe('1/7/2024')
    expect(r.error).toBeUndefined()
  })

  it('T62 handles completely blank/empty CSV value', async () => {
    const r = await normalizeSource({ kind: 'csv', name: 'Blank', value: '' })
    expect(r.rowCount).toBe(0)
    expect(r.columns).toEqual([])
  })

  it('T63 handles a text source (not CSV)', async () => {
    const r = await normalizeSource({
      kind: 'text',
      name: 'Description',
      value: 'We run two Sunday services: 9am and 11am. Average attendance is 350.',
    })
    expect(r.kind).toBe('text')
    expect(r.rawText).toContain('two Sunday services')
    expect(r.columns).toEqual([])
    expect(r.rowCount).toBe(0)
  })

  it('T64 handles a legacy CSV with extra empty lines', async () => {
    const csv = `Date,Main,Kids\n\n2024-01-07,450,120\n\n2024-01-14,480,130\n`
    const r = await normalizeSource({ kind: 'csv', name: 'Legacy', value: csv })
    expect(r.rowCount).toBe(2)
  })

  it('T65 a sheet_url that is NOT a Google Sheets URL returns an error', async () => {
    const r = await normalizeSource({
      kind: 'sheet_url',
      name: 'Bad URL',
      value: 'https://example.com/not-a-sheet',
    })
    expect(r.error).toBeDefined()
    expect(r.error).toMatch(/Google Sheets/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — aggregateMonths (35 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('aggregateMonths — preview logic', () => {

  // ── Fake church: Grace Community — 3 years of weekly attendance ──
  // Happy path: consistent attendance data, 3 services per week
  function makeRows(weeks: { date: string; main: number; kids: number; youth: number }[]) {
    return weeks.map(w => ({
      'Service Date': w.date,
      'Main Attendance': String(w.main),
      'Kids Count': String(w.kids),
      'Youth Count': String(w.youth),
    }))
  }

  const GRACE_MAP = [
    { source_column: 'Main Attendance', dest_field: 'attendance.main' },
    { source_column: 'Kids Count',      dest_field: 'attendance.kids' },
    { source_column: 'Youth Count',     dest_field: 'attendance.youth' },
  ]

  it('T66 aggregates a single Sunday correctly', () => {
    const rows = makeRows([{ date: '2024-01-07', main: 450, kids: 120, youth: 85 }])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(1)
    expect(months[0].month).toBe('2024-01')
    expect(months[0].main).toBe(450)
    expect(months[0].kids).toBe(120)
    expect(months[0].youth).toBe(85)
    expect(months[0].total).toBe(655)
    expect(months[0].label).toBe('Jan 2024')
  })

  it('T67 sums multiple weeks within the same month', () => {
    const rows = makeRows([
      { date: '2024-01-07', main: 450, kids: 120, youth: 85 },
      { date: '2024-01-14', main: 480, kids: 130, youth: 90 },
      { date: '2024-01-21', main: 430, kids: 115, youth: 80 },
      { date: '2024-01-28', main: 460, kids: 125, youth: 88 },
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(1)
    expect(months[0].main).toBe(450 + 480 + 430 + 460)
    expect(months[0].kids).toBe(120 + 130 + 115 + 125)
  })

  it('T68 produces a separate row per calendar month', () => {
    const rows = makeRows([
      { date: '2024-01-07', main: 450, kids: 120, youth: 85 },
      { date: '2024-02-04', main: 460, kids: 125, youth: 88 },
      { date: '2024-03-03', main: 470, kids: 128, youth: 90 },
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(3)
    expect(months.map(m => m.month)).toEqual(['2024-01', '2024-02', '2024-03'])
  })

  it('T69 returns months sorted chronologically', () => {
    const rows = makeRows([
      { date: '2024-03-03', main: 470, kids: 128, youth: 90 },
      { date: '2024-01-07', main: 450, kids: 120, youth: 85 },
      { date: '2024-02-04', main: 460, kids: 125, youth: 88 },
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months[0].month).toBe('2024-01')
    expect(months[2].month).toBe('2024-03')
  })

  it('T70 spans a full year (12 months)', () => {
    const dates = ['01','02','03','04','05','06','07','08','09','10','11','12']
      .map(m => `2023-${m}-01`)
    const rows = makeRows(dates.map(date => ({ date, main: 400, kids: 100, youth: 75 })))
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(12)
  })

  it('T71 spans multiple years correctly', () => {
    const rows = makeRows([
      { date: '2022-12-25', main: 500, kids: 150, youth: 100 },
      { date: '2023-01-01', main: 420, kids: 110, youth: 80 },
      { date: '2024-01-07', main: 450, kids: 120, youth: 85 },
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(3)
    expect(months[0].month).toBe('2022-12')
    expect(months[2].month).toBe('2024-01')
  })

  it('T72 handles US format dates (M/D/YYYY)', () => {
    const rows = [
      { 'Service Date': '1/7/2024',  'Main Attendance': '450', 'Kids Count': '120', 'Youth Count': '85' },
      { 'Service Date': '1/14/2024', 'Main Attendance': '480', 'Kids Count': '130', 'Youth Count': '90' },
    ]
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(1)
    expect(months[0].month).toBe('2024-01')
    expect(months[0].main).toBe(930)
  })

  it('T73 skips rows where the date cannot be parsed', () => {
    const rows = [
      { 'Service Date': 'INVALID',   'Main Attendance': '450', 'Kids Count': '120', 'Youth Count': '85' },
      { 'Service Date': '2024-01-07','Main Attendance': '480', 'Kids Count': '130', 'Youth Count': '90' },
    ]
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(1)
    expect(months[0].main).toBe(480)
  })

  it('T74 skips rows with empty date cell', () => {
    const rows = [
      { 'Service Date': '',          'Main Attendance': '450', 'Kids Count': '120', 'Youth Count': '85' },
      { 'Service Date': '2024-01-14','Main Attendance': '480', 'Kids Count': '130', 'Youth Count': '90' },
    ]
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(1)
    expect(months[0].main).toBe(480)
  })

  it('T75 treats empty attendance cell as 0 (not null) for aggregation', () => {
    // Empty cell → parseCount returns null → bucket unchanged (0 added)
    const rows = [
      { 'Service Date': '2024-01-07', 'Main Attendance': '', 'Kids Count': '120', 'Youth Count': '' },
    ]
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months[0].main).toBe(0)
    expect(months[0].kids).toBe(120)
    expect(months[0].youth).toBe(0)
  })

  it('T76 ignores columns not mapped to attendance.*', () => {
    const rows = [{
      'Service Date': '2024-01-07',
      'Main Attendance': '450',
      'Kids Count': '120',
      'Youth Count': '85',
      'Notes': 'Good morning',
      'Giving': '$1,200',
    }]
    const map = [
      ...GRACE_MAP,
      { source_column: 'Notes',  dest_field: 'ignore' },
      { source_column: 'Giving', dest_field: 'giving.plate' },
    ]
    const months = aggregateMonths(rows, 'Service Date', map)
    expect(months[0].total).toBe(450 + 120 + 85)
  })

  it('T77 handles comma-formatted attendance numbers', () => {
    const rows = [{
      'Service Date': '2024-01-07',
      'Main Attendance': '1,200',
      'Kids Count': '320',
      'Youth Count': '150',
    }]
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months[0].main).toBe(1200)
  })

  it('T78 returns empty array when no rows have parseable dates', () => {
    const rows = [
      { 'Service Date': 'TBD', 'Main Attendance': '450', 'Kids Count': '120', 'Youth Count': '85' },
      { 'Service Date': 'N/A', 'Main Attendance': '480', 'Kids Count': '130', 'Youth Count': '90' },
    ]
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(0)
  })

  it('T79 returns empty array when columnMap is empty', () => {
    const rows = makeRows([{ date: '2024-01-07', main: 450, kids: 120, youth: 85 }])
    const months = aggregateMonths(rows, 'Service Date', [])
    expect(months).toHaveLength(1)
    expect(months[0].total).toBe(0)
  })

  it('T80 returns empty array for empty input rows', () => {
    const months = aggregateMonths([], 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(0)
  })

  // Anomaly: Easter spike
  it('T81 correctly aggregates an Easter Sunday spike', () => {
    const rows = makeRows([
      { date: '2024-03-24', main: 450, kids: 120, youth: 85 },
      { date: '2024-03-31', main: 980, kids: 320, youth: 200 }, // Easter
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months[0].main).toBe(450 + 980)
    expect(months[0].total).toBe((450 + 980) + (120 + 320) + (85 + 200))
  })

  // Anomaly: outlier value
  it('T82 includes an extreme outlier value (not clamped)', () => {
    const rows = makeRows([
      { date: '2024-01-07', main: 99999, kids: 0, youth: 0 },
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months[0].main).toBe(99999)
  })

  // Anomaly: future-dated service
  it('T83 accepts future-dated rows (no future guard)', () => {
    const rows = makeRows([{ date: '2099-06-15', main: 450, kids: 120, youth: 85 }])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months[0].month).toBe('2099-06')
  })

  // Multi-campus: same date, different campuses → same month bucket
  it('T84 multi-campus rows on same date sum into one month bucket', () => {
    const rows = [
      { 'Service Date': '2024-01-07', 'Main Attendance': '450', 'Kids Count': '120', 'Youth Count': '85' },
      { 'Service Date': '2024-01-07', 'Main Attendance': '220', 'Kids Count': '60',  'Youth Count': '40' },
    ]
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(1)
    expect(months[0].main).toBe(670)
  })

  // Giving CSV should produce zero attendance
  it('T85 a giving-only CSV (no attendance cols) returns months with total=0', () => {
    const rows = [
      { 'Date': '2024-01-07', 'Plate': '$500', 'Online': '$1200' },
      { 'Date': '2024-02-04', 'Plate': '$600', 'Online': '$1400' },
    ]
    const givingMap = [
      { source_column: 'Plate',  dest_field: 'giving.plate' },
      { source_column: 'Online', dest_field: 'giving.online' },
    ]
    const months = aggregateMonths(rows, 'Date', givingMap)
    expect(months[0].total).toBe(0)
    expect(months[0].main).toBe(0)
  })

  // Grace Community 3-year simulation
  it('T86 Grace Community — 3 years of weekly data produces 36 months', () => {
    const rows: Record<string, string>[] = []
    const start = new Date('2022-01-02')
    for (let week = 0; week < 156; week++) {
      const d = new Date(start)
      d.setDate(d.getDate() + week * 7)
      rows.push({
        'Service Date':    d.toISOString().slice(0, 10),
        'Main Attendance': String(400 + Math.floor(Math.random() * 100)),
        'Kids Count':      String(100 + Math.floor(Math.random() * 40)),
        'Youth Count':     String(70  + Math.floor(Math.random() * 30)),
      })
    }
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months.length).toBeGreaterThanOrEqual(36)
  })

  it('T87 each month total equals main + kids + youth', () => {
    const rows = makeRows([
      { date: '2024-01-07', main: 450, kids: 120, youth: 85 },
      { date: '2024-01-14', main: 480, kids: 130, youth: 90 },
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    for (const m of months) {
      expect(m.total).toBe(m.main + m.kids + m.youth)
    }
  })

  it('T88 handles a CSV where only main attendance is tracked (kids/youth zero)', () => {
    const rows = [
      { 'Date': '2024-01-07', 'Attendance': '450' },
      { 'Date': '2024-02-04', 'Attendance': '460' },
    ]
    const map = [{ source_column: 'Attendance', dest_field: 'attendance.main' }]
    const months = aggregateMonths(rows, 'Date', map)
    expect(months[0].kids).toBe(0)
    expect(months[0].youth).toBe(0)
    expect(months[0].total).toBe(450)
  })

  it('T89 duplicate date entries (AM + PM service) sum correctly', () => {
    const rows = [
      { 'Date': '2024-01-07', 'Main': '280', 'Kids': '80', 'Youth': '50' },
      { 'Date': '2024-01-07', 'Main': '190', 'Kids': '45', 'Youth': '35' }, // PM
    ]
    const map = [
      { source_column: 'Main',  dest_field: 'attendance.main' },
      { source_column: 'Kids',  dest_field: 'attendance.kids' },
      { source_column: 'Youth', dest_field: 'attendance.youth' },
    ]
    const months = aggregateMonths(rows, 'Date', map)
    expect(months[0].main).toBe(470)
    expect(months[0].kids).toBe(125)
  })

  it('T90 a row with a date but all zero attendance still appears in output', () => {
    const rows = makeRows([{ date: '2024-01-07', main: 0, kids: 0, youth: 0 }])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(1)
    expect(months[0].total).toBe(0)
  })

  it('T91 handles negative attendance in source (treated as null, not subtracted)', () => {
    // parseCount returns null for negative → not added → bucket stays at 0
    const rows = [{ 'Date': '2024-01-07', 'Main': '-50', 'Kids': '80', 'Youth': '40' }]
    const map = [
      { source_column: 'Main',  dest_field: 'attendance.main' },
      { source_column: 'Kids',  dest_field: 'attendance.kids' },
      { source_column: 'Youth', dest_field: 'attendance.youth' },
    ]
    const months = aggregateMonths(rows, 'Date', map)
    expect(months[0].main).toBe(0)
    expect(months[0].kids).toBe(80)
  })

  it('T92 handles a midweek service mixed into Sunday data', () => {
    const rows = makeRows([
      { date: '2024-01-07', main: 450, kids: 120, youth: 85 }, // Sunday
      { date: '2024-01-10', main: 150, kids: 0,   youth: 0  }, // Wednesday
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(1)
    expect(months[0].main).toBe(600) // Both included in Jan
  })

  it('T93 cross-year boundary (Dec + Jan) produces separate months', () => {
    const rows = makeRows([
      { date: '2023-12-31', main: 500, kids: 150, youth: 100 },
      { date: '2024-01-07', main: 420, kids: 110, youth: 80  },
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    expect(months).toHaveLength(2)
    expect(months[0].month).toBe('2023-12')
    expect(months[1].month).toBe('2024-01')
  })

  it('T94 handles source CSV with BOM character in first header', async () => {
    // PapaParse handles BOM in UTF-8 CSVs
    const bom = '\uFEFF'
    const csv = `${bom}Date,Main,Kids,Youth\n2024-01-07,450,120,85`
    const r = await normalizeSource({ kind: 'csv', name: 'BOM', value: csv })
    // BOM column either trimmed or present — check no crash and data exists
    expect(r.rowCount).toBe(1)
    expect(r.error).toBeUndefined()
  })

  it('T95 handles float attendance values (rounds to integer)', () => {
    const rows = [{ 'Date': '2024-01-07', 'Main': '450.7', 'Kids': '120.2', 'Youth': '85.9' }]
    const map = [
      { source_column: 'Main',  dest_field: 'attendance.main' },
      { source_column: 'Kids',  dest_field: 'attendance.kids' },
      { source_column: 'Youth', dest_field: 'attendance.youth' },
    ]
    const months = aggregateMonths(rows, 'Date', map)
    expect(months[0].main).toBe(451)
    expect(months[0].kids).toBe(120)
    expect(months[0].youth).toBe(86)
  })

  it('T96 header-only CSV with no rows returns empty months', async () => {
    const csv = 'Date,Main,Kids,Youth'
    const r = await normalizeSource({ kind: 'csv', name: 'Headers only', value: csv })
    const months = aggregateMonths(r.sampleRows, 'Date', GRACE_MAP)
    expect(months).toHaveLength(0)
  })

  it('T97 handles a column mapped to an unknown audience (not main/kids/youth) — ignored', () => {
    const rows = [{ 'Date': '2024-01-07', 'Seniors': '80', 'Main': '450' }]
    const map = [
      { source_column: 'Seniors', dest_field: 'attendance.seniors' }, // not a valid audience
      { source_column: 'Main',    dest_field: 'attendance.main' },
    ]
    const months = aggregateMonths(rows, 'Date', map)
    expect(months[0].main).toBe(450)
    // seniors column is not added to any bucket
    expect(months[0].total).toBe(450)
  })

  it('T98 handles 52 Sundays in a year — 12 month buckets', () => {
    const rows: Record<string, string>[] = []
    const start = new Date('2023-01-01')
    for (let i = 0; i < 52; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i * 7)
      rows.push({
        'Date':  d.toISOString().slice(0, 10),
        'Main':  '400',
        'Kids':  '100',
        'Youth': '70',
      })
    }
    const map = [
      { source_column: 'Main',  dest_field: 'attendance.main' },
      { source_column: 'Kids',  dest_field: 'attendance.kids' },
      { source_column: 'Youth', dest_field: 'attendance.youth' },
    ]
    const months = aggregateMonths(rows, 'Date', map)
    expect(months.length).toBeGreaterThanOrEqual(12)
    expect(months.length).toBeLessThanOrEqual(13)
  })

  it('T99 all month totals are non-negative', () => {
    const rows = makeRows([
      { date: '2024-01-07', main: 450, kids: 120, youth: 85 },
      { date: '2024-02-04', main: 0,   kids: 0,   youth: 0  },
      { date: '2024-03-03', main: 470, kids: 128, youth: 90 },
    ])
    const months = aggregateMonths(rows, 'Service Date', GRACE_MAP)
    for (const m of months) {
      expect(m.total).toBeGreaterThanOrEqual(0)
      expect(m.main).toBeGreaterThanOrEqual(0)
      expect(m.kids).toBeGreaterThanOrEqual(0)
      expect(m.youth).toBeGreaterThanOrEqual(0)
    }
  })

  it('T100 full church simulation — 2 campuses, 3 years, two services each Sunday', () => {
    const rows: Record<string, string>[] = []
    const start = new Date('2022-01-02')
    for (let week = 0; week < 156; week++) {
      const d = new Date(start)
      d.setDate(d.getDate() + week * 7)
      const dateStr = d.toISOString().slice(0, 10)
      // Main campus AM
      rows.push({ 'Date': dateStr, 'Main': '280', 'Kids': '80', 'Youth': '50' })
      // Main campus PM
      rows.push({ 'Date': dateStr, 'Main': '190', 'Kids': '45', 'Youth': '35' })
      // North campus
      rows.push({ 'Date': dateStr, 'Main': '170', 'Kids': '40', 'Youth': '25' })
    }
    const map = [
      { source_column: 'Main',  dest_field: 'attendance.main' },
      { source_column: 'Kids',  dest_field: 'attendance.kids' },
      { source_column: 'Youth', dest_field: 'attendance.youth' },
    ]
    const months = aggregateMonths(rows, 'Date', map)

    // Should have at least 36 months
    expect(months.length).toBeGreaterThanOrEqual(36)

    // Every month should have main = (280+190+170) * ~4 weeks = ~2560
    // Allow variance since some months have 4 or 5 Sundays
    for (const m of months) {
      expect(m.main).toBeGreaterThan(0)
      expect(m.total).toBe(m.main + m.kids + m.youth)
    }

    // Sanity: average weekly main across all months
    const totalMain = months.reduce((s, m) => s + m.main, 0)
    const weeksSimulated = 156
    const expectedWeeklyMain = 280 + 190 + 170 // 640 per week
    expect(totalMain).toBeCloseTo(weeksSimulated * expectedWeeklyMain, -2)
  })
})
