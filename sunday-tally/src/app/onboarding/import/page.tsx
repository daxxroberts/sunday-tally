'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AiExhaustedBanner from '@/components/AiExhaustedBanner'

interface CsvEntry  { name: string; content: string }
interface SheetEntry { name: string; url: string }

export default function ImportUploaderPage() {
  const router = useRouter()
  const [csvEntries,   setCsvEntries]   = useState<CsvEntry[]>([])
  const [sheetEntries, setSheetEntries] = useState<SheetEntry[]>([{ name: '', url: '' }])
  const [freeText,     setFreeText]     = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [exhausted,    setExhausted]    = useState(false)

  useEffect(() => {
    // Restore form state when navigating back from the review page
    const saved = sessionStorage.getItem('sundaytally_import_form')
    if (saved) {
      try {
        const { sheetEntries: savedSheets, freeText: savedText } = JSON.parse(saved)
        if (Array.isArray(savedSheets) && savedSheets.length > 0) setSheetEntries(savedSheets)
        if (typeof savedText === 'string') setFreeText(savedText)
        return // skip URL param restore when sessionStorage has state
      } catch { /* ignore malformed storage */ }
    }

    // Fallback: restore from URL params (legacy / deep-link behaviour)
    const params = new URLSearchParams(window.location.search)
    const preloaded: SheetEntry[] = []
    for (let i = 1; i <= 10; i++) {
      const url = params.get(`s${i}`)
      if (!url) break
      preloaded.push({ name: params.get(`n${i}`) ?? '', url })
    }
    if (preloaded.length > 0) setSheetEntries(preloaded)
  }, [])

  async function addCsvFiles(files: FileList | null) {
    if (!files) return
    setError(null)
    const parsed: CsvEntry[] = []
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith('.csv')) {
        setError(`File "${f.name}" is not a valid CSV file. Please convert it to CSV first.`)
        continue
      }
      const content = await f.text()
      parsed.push({ name: f.name, content })
    }
    setCsvEntries(prev => [...prev, ...parsed])
  }

  function updateSheet(idx: number, patch: Partial<SheetEntry>) {
    setSheetEntries(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  function removeSheet(idx: number) {
    setSheetEntries(prev => prev.filter((_, i) => i !== idx))
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    setExhausted(false)

    const sources = [
      ...csvEntries.map(c => ({ kind: 'csv' as const,       name: c.name, value: c.content })),
      ...sheetEntries
        .filter(s => s.url.trim())
        .map(s => ({ kind: 'sheet_url' as const, name: s.name || s.url, value: s.url.trim() })),
    ]

    try {
      const res = await fetch('/api/onboarding/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sources, freeText }),
      })
      if (res.status === 402) { setExhausted(true); return }
      const body = await res.json()
      if (!res.ok) {
        // Map raw error codes to plain language. Prefer a server-provided message,
        // then a friendly code mapping, then a safe generic fallback. Never surface
        // a raw code like "stage_a_failed" to a church admin.
        const friendly: Record<string, string> = {
          stage_a_failed:      'We had trouble reading your data. Make sure the sheet is shared as "Anyone with the link can view," then try again.',
          stage_b_failed:      'We read your data, but ran into a problem saving it. Please try again.',
          ai_budget_exhausted: 'This period\'s setup allowance is used up. An owner can override to continue.',
          no_sources:          'Add at least one CSV, Google Sheets link, or description first.',
          job_create_failed:   'We could not start the import. Please try again.',
          forbidden:           'Only an owner or admin can import data.',
          unauthorized:        'Please sign in again to import.',
        }
        setError(body.message || friendly[body.error as string] || 'The import did not go through. Please try again.')
        return
      }
      // Persist form state so Back → import page restores correctly
      sessionStorage.setItem('sundaytally_import_form', JSON.stringify({ sheetEntries, freeText }))
      router.push(`/onboarding/import/review?job_id=${body.job_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">

        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Import your historical data</h1>
          <p className="text-sm text-gray-600">
            Upload CSV files or paste Google Sheets links. We&rsquo;ll read your data and propose a mapping you can review before anything is saved.
          </p>
        </header>

        {exhausted && (
          <AiExhaustedBanner onOverride={() => { setExhausted(false); submit() }} />
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 font-medium">
            {error}
          </div>
        )}

        {/* CSV files */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">CSV files</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload one or more .csv exports from your spreadsheet.</p>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={e => addCsvFiles(e.target.files)}
            className="block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
          {csvEntries.length > 0 && (
            <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-100">
              {csvEntries.map((c, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-gray-800">{c.name}</span>
                  <button
                    className="text-xs font-medium text-red-600 hover:text-red-800"
                    onClick={() => setCsvEntries(prev => prev.filter((_, j) => j !== i))}
                  >Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Google Sheets */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Google Sheets</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Set the sheet to &ldquo;Anyone with the link can view&rdquo; before pasting.
            </p>
          </div>
          <div className="space-y-2">
            {sheetEntries.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="w-36 shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Label"
                  value={s.name}
                  onChange={e => updateSheet(i, { name: e.target.value })}
                />
                <input
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={s.url}
                  onChange={e => updateSheet(i, { url: e.target.value })}
                />
                {sheetEntries.length > 1 && (
                  <button
                    className="shrink-0 text-gray-400 hover:text-gray-700 text-lg leading-none"
                    onClick={() => removeSheet(i)}
                    aria-label="Remove sheet"
                  >&times;</button>
                )}
              </div>
            ))}
            <button
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
              onClick={() => setSheetEntries(prev => [...prev, { name: '', url: '' }])}
            >+ Add another sheet</button>
          </div>
        </div>

        {/* Describe your services */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Describe your services <span className="text-xs font-normal text-gray-500">(optional)</span></h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Service times, campus names, kids ministry naming, giving categories — anything that helps us map correctly.
            </p>
          </div>
          <textarea
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={4}
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            placeholder="e.g. Sunday 9 AM and 11 AM at Main campus, Kids Church runs parallel, Switch is our Wednesday youth night…"
          />
        </div>

        {submitting ? (
          <AnalyzingPanel />
        ) : (
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => router.push('/onboarding/schedule')}
            >Skip — set up manually</button>
            <button
              className="rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
              onClick={submit}
            >Propose mapping →</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── AnalyzingPanel ────────────────────────────────────────────────────────────

const STAGES = [
  { label: 'Reading your spreadsheet',           sub: 'Going through every row…',                         start: 0 },
  { label: 'Finding your services',              sub: 'Identifying patterns across your data…',           start: 20_000 },
  { label: 'Mapping your metrics',               sub: 'Connecting attendance, giving, and volunteers…',   start: 40_000 },
  { label: 'Preparing your questions',           sub: 'Almost there…',                                    start: 60_000 },
]

function AnalyzingPanel() {
  const startedAt  = useRef(Date.now())
  const [stage,  setStage]  = useState(0)
  const [tally,  setTally]  = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      const nextStage = STAGES.filter(s => elapsed >= s.start).length - 1
      setStage(Math.min(nextStage, STAGES.length - 1))
      setTally(prev => prev + (elapsed < 30_000 ? Math.floor(Math.random() * 3) + 2 : 1))
    }, 700)
    return () => clearInterval(id)
  }, [])

  const groups    = Math.floor(tally / 5)
  const remainder = tally % 5

  return (
    <div className="rounded-xl bg-gray-900 p-6 space-y-6">
      {/* Tally mark visual */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Rows scanned
        </p>
        <div className="flex flex-wrap items-end gap-3 min-h-[2rem]">
          {Array.from({ length: groups }).map((_, g) => (
            <TallyGroup key={g} full />
          ))}
          {remainder > 0 && <TallyGroup marks={remainder} />}
        </div>
        <p className="mt-2 text-xs text-gray-400">{tally} rows</p>
      </div>

      {/* Stage list */}
      <div className="space-y-3">
        {STAGES.map((s, i) => {
          const done    = i < stage
          const current = i === stage
          const pending = i > stage
          return (
            <div key={i} className={`flex items-start gap-3 transition-opacity ${pending ? 'opacity-30' : ''}`}>
              <div className="mt-0.5 shrink-0">
                {done ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : current ? (
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-blue-500" />
                  </span>
                ) : (
                  <span className="flex h-4 w-4 rounded-full border-2 border-gray-600" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${current ? 'text-white' : done ? 'text-gray-400' : 'text-gray-300'}`}>
                  {s.label}
                </p>
                {current && (
                  <p className="text-xs text-gray-300 mt-0.5">{s.sub}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">This usually takes 30–60 seconds</p>
    </div>
  )
}

function TallyGroup({ full = false, marks = 0 }: { full?: boolean; marks?: number }) {
  const count = full ? 5 : marks
  return (
    <div className="relative inline-flex items-center gap-[3px] h-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] h-5 bg-gray-300 rounded-full"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
      {full && (
        <svg
          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
          viewBox="0 0 24 20"
          preserveAspectRatio="none"
        >
          <line x1="0" y1="20" x2="24" y2="0" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}
