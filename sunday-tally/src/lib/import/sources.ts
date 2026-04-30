import Papa from 'papaparse'

export type SourceKind = 'csv' | 'sheet_url' | 'text'

export interface SourceInput {
  kind:  SourceKind
  name:  string
  /** For csv: raw text. For sheet_url: URL. For text: free-form description. */
  value: string
}

export interface NormalizedSource {
  kind:        SourceKind
  name:        string
  columns:     string[]
  sampleRows:  Record<string, string>[]
  rowCount:    number
  /** Present for 'text' sources only. */
  rawText?:    string
  /** Present on failure. */
  error?:      string
}

const SAMPLE_ROW_LIMIT = 10
const SHEET_PATTERN = /docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/

export async function normalizeSource(input: SourceInput): Promise<NormalizedSource> {
  try {
    if (input.kind === 'text') {
      return {
        kind: 'text',
        name: input.name,
        columns: [],
        sampleRows: [],
        rowCount: 0,
        rawText: input.value.trim(),
      }
    }

    if (input.kind === 'sheet_url') {
      const csv = await fetchGoogleSheetCsv(input.value)
      return parseCsv('sheet_url', input.name, csv)
    }

    return parseCsv('csv', input.name, input.value)
  } catch (err) {
    return {
      kind: input.kind,
      name: input.name,
      columns: [],
      sampleRows: [],
      rowCount: 0,
      error: err instanceof Error ? err.message : 'Source normalization failed',
    }
  }
}

async function fetchGoogleSheetCsv(url: string): Promise<string> {
  const match = url.match(SHEET_PATTERN)
  if (!match) {
    throw new Error('Not a Google Sheets URL. Paste the share/view URL from docs.google.com.')
  }
  const id = match[1]
  const gidMatch = url.match(/[?&#]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`

  const res = await fetch(exportUrl, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(
      `Google Sheets fetch failed (${res.status}). To fix: in Google Sheets, go to File → Share → Publish to web, ` +
      `select the sheet tab you want to import, choose CSV format, and click Publish. Then paste that published URL here.`,
    )
  }
  const text = await res.text()
  if (text.includes('<HTML>') || text.includes('<html')) {
    throw new Error(
      'Google returned a login page instead of CSV data. Go to File → Share → Publish to web in Google Sheets, ' +
      'publish the specific tab as CSV, and paste the published URL here.',
    )
  }
  return text
}

function parseCsv(kind: SourceKind, name: string, raw: string): NormalizedSource {
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`)
  }

  const columns = (parsed.meta.fields ?? []).filter(Boolean)
  const rows = parsed.data
  return {
    kind,
    name,
    columns,
    sampleRows: rows.slice(0, SAMPLE_ROW_LIMIT),
    rowCount: rows.length,
  }
}

/** Full CSV row set for Stage B — re-parses from the stored source value. */
export async function getAllRows(input: SourceInput): Promise<Record<string, string>[]> {
  if (input.kind === 'text') return []
  const csv = input.kind === 'sheet_url'
    ? await fetchGoogleSheetCsv(input.value)
    : input.value
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })
  return parsed.data
}
