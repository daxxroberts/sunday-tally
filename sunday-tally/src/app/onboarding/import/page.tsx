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

  async function addCsvFiles(files: FileList | null) {
    if (!files) return
    const parsed: CsvEntry[] = []
    for (const f of Array.from(files)) {
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
      if (!res.ok) { setError(body.message || body.error || 'Import failed'); return }
      router.push(`/onboarding/import/confirm?job_id=${body.job_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Import your historical data</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload CSV files, paste Google Sheets links, or describe your services. We&rsquo;ll propose a mapping you can review before anything is saved.
        </p>
      </header>

      {exhausted && (
        <AiExhaustedBanner onOverride={() => { setExhausted(false); submit() }} />
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-md border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-900">CSV files</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={e => addCsvFiles(e.target.files)}
          className="mt-2 block text-sm"
        />
        {csvEntries.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-gray-700">
            {csvEntries.map((c, i) => (
              <li key={i} className="flex justify-between">
                <span>{c.name}</span>
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => setCsvEntries(prev => prev.filter((_, j) => j !== i))}
                >remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-900">Google Sheets URLs</h2>
        <p className="mt-1 text-xs text-gray-500">
          Set the sheet to &ldquo;Anyone with the link can view&rdquo; or publish it to the web.
        </p>
        <div className="mt-3 space-y-2">
          {sheetEntries.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="Label (optional)"
                value={s.name}
                onChange={e => updateSheet(i, { name: e.target.value })}
              />
              <input
                className="flex-[2] rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={s.url}
                onChange={e => updateSheet(i, { url: e.target.value })}
              />
              {sheetEntries.length > 1 && (
                <button
                  className="text-sm text-red-600"
                  onClick={() => removeSheet(i)}
                >&times;</button>
              )}
            </div>
          ))}
          <button
            className="text-sm text-blue-700 hover:underline"
            onClick={() => setSheetEntries(prev => [...prev, { name: '', url: '' }])}
          >+ add another sheet</button>
        </div>
      </section>

      <section className="rounded-md border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-900">Describe your services</h2>
        <p className="mt-1 text-xs text-gray-500">
          Anything that would help us map correctly — service times, kids ministry naming, giving categories, campaigns.
        </p>
        <textarea
          className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          rows={5}
          value={freeText}
          onChange={e => setFreeText(e.target.value)}
          placeholder="e.g. Sunday 9 AM and 11 AM services at Main campus, Kids Church runs parallel..."
        />
      </section>

      {submitting ? (
        <AnalyzingPanel />
      ) : (
        <div className="flex justify-between">
          <button
            className="rounded border border-gray-300 px-4 py-2 text-sm"
            onClick={() => router.push('/onboarding/schedule')}
          >Skip — set up manually</button>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            onClick={submit}
          >Propose mapping</button>
        </div>
      )}
    </div>
  )
}

// ── AnalyzingPanel ────────────────────────────────────────────────────────────

const STAGES = [
  {
    label: 'Reading your spreadsheet',
    sub:   'Going through every row…',
    start: 0,
  },
  {
    label: 'Finding your services',
    sub:   'Identifying Sunday patterns across your data…',
    start: 20_000,
  },
  {
    label: 'Mapping your metrics',
    sub:   'Connecting attendance, giving, and volunteers…',
    start: 40_000,
  },
  {
    label: 'Preparing your questions',
    sub:   'Almost there…',
    start: 60_000,
  },
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
      // Tally increments faster early, slows later — feels organic
      setTally(prev => prev + (elapsed < 30_000 ? Math.floor(Math.random() * 3) + 2 : 1))
    }, 700)
    return () => clearInterval(id)
  }, [])

  const groups    = Math.floor(tally / 5)
  const remainder = tally % 5

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 space-y-5">
      {/* Tally mark visual */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-3">
          Rows scanned
        </p>
        <div className="flex flex-wrap items-end gap-3 min-h-[2rem]">
          {Array.from({ length: groups }).map((_, g) => (
            <TallyGroup key={g} full />
          ))}
          {remainder > 0 && <TallyGroup marks={remainder} />}
        </div>
        <p className="mt-2 text-xs text-blue-400">{tally} rows</p>
      </div>

      {/* Stage list */}
      <div className="space-y-2">
        {STAGES.map((s, i) => {
          const done    = i < stage
          const current = i === stage
          const pending = i > stage
          return (
            <div key={i} className={`flex items-start gap-3 transition-opacity ${pending ? 'opacity-30' : ''}`}>
              <div className="mt-0.5 shrink-0">
                {done ? (
                  <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : current ? (
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-blue-500" />
                  </span>
                ) : (
                  <span className="flex h-4 w-4 rounded-full border-2 border-gray-300" />
                )}
              </div>
              <div>
                <p className={`text-sm ${current ? 'font-semibold text-gray-900' : done ? 'text-gray-500' : 'text-gray-400'}`}>
                  {s.label}
                </p>
                {current && (
                  <p className="text-xs text-blue-500 mt-0.5">{s.sub}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-blue-400">This usually takes 30–60 seconds</p>
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
          className="w-[2px] h-5 bg-blue-500 rounded-full"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
      {full && (
        <svg
          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
          viewBox="0 0 24 20"
          preserveAspectRatio="none"
        >
          <line x1="0" y1="20" x2="24" y2="0" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}
