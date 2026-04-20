'use client'

import { useState } from 'react'
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

      {exhausted && <AiExhaustedBanner />}

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

      <div className="flex justify-between">
        <button
          className="rounded border border-gray-300 px-4 py-2 text-sm"
          onClick={() => router.push('/onboarding/schedule')}
        >Skip — set up manually</button>
        <button
          disabled={submitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          onClick={submit}
        >{submitting ? 'Analyzing…' : 'Propose mapping'}</button>
      </div>
    </div>
  )
}
