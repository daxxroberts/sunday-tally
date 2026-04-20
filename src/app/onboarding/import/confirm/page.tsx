'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import AiExhaustedBanner from '@/components/AiExhaustedBanner'
import type { QaAnswer, AnomalyDecision, ConfirmedMapping } from '@/lib/import/stageB'
import type { MonthRow } from '@/app/api/onboarding/import/preview/route'

interface ProposedColumnMap {
  source_column: string
  dest_field:    string
  notes?:        string
}
interface ProposedSource {
  source_name:  string
  dest_table:   string
  date_column?: string
  date_format?: string
  column_map:   ProposedColumnMap[]
  notes?:       string
}
interface ClarificationQuestion {
  question:            string
  why?:                string
  recommended_answer?: string
}
interface Anomaly {
  kind:        string
  description: string
}
interface ProposedSetup {
  locations?:           { name: string }[]
  service_templates?:   { name: string }[]
  giving_sources?:      { name: string }[]
  volunteer_categories?: { name: string }[]
}
interface ProposedMapping {
  sources:                  ProposedSource[]
  proposed_setup?:          ProposedSetup
  anomalies?:               Anomaly[]
  clarification_questions?: ClarificationQuestion[]
  dashboard_warnings?:      string[]
}

type Phase = 'mapping' | 'review' | 'preview'

export default function ConfirmMappingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
      <ConfirmMappingInner />
    </Suspense>
  )
}

function ConfirmMappingInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const jobId        = searchParams.get('job_id')

  const [mapping,    setMapping]    = useState<ProposedMapping | null>(null)
  const [editable,   setEditable]   = useState<ProposedSource[]>([])
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [exhausted,  setExhausted]  = useState(false)
  const [phase,      setPhase]      = useState<Phase>('mapping')

  const [qaAnswers,         setQaAnswers]         = useState<QaAnswer[]>([])
  const [anomalyDecisions,  setAnomalyDecisions]  = useState<AnomalyDecision[]>([])

  const [previewMonths,  setPreviewMonths]  = useState<MonthRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null)

  // Load the job
  useEffect(() => {
    if (!jobId) return
    fetch(`/api/onboarding/import?job_id=${jobId}`)
      .then(r => r.json())
      .then(b => {
        const m = b.job?.proposed_mapping as ProposedMapping | null
        setMapping(m)
        setEditable(m?.sources ?? [])
        setQaAnswers((m?.clarification_questions ?? []).map(q => ({
          question: q.question,
          answer:   q.recommended_answer ?? '',
          accepted: true,
        })))
        setAnomalyDecisions((m?.anomalies ?? []).map(a => ({
          kind:        a.kind,
          description: a.description,
          decision:    'keep' as const,
        })))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'load failed'))
      .finally(() => setLoading(false))
  }, [jobId])

  // Fetch preview when entering preview phase
  useEffect(() => {
    if (phase !== 'preview' || !jobId || editable.length === 0) return
    setPreviewLoading(true)
    fetch('/api/onboarding/import/preview', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        job_id:  jobId,
        sources: editable.map(s => ({
          source_name: s.source_name,
          date_column: s.date_column,
          column_map:  s.column_map,
        })),
      }),
    })
      .then(r => r.json())
      .then(b => setPreviewMonths(b.months ?? []))
      .catch(() => setPreviewMonths([]))
      .finally(() => setPreviewLoading(false))
  }, [phase, jobId, editable])

  const hasReviewStep =
    (mapping?.clarification_questions?.length ?? 0) > 0 ||
    (mapping?.anomalies?.length ?? 0) > 0

  const phases: Phase[] = ['mapping', ...(hasReviewStep ? ['review' as Phase] : []), 'preview']

  function phaseLabel(p: Phase) {
    if (p === 'mapping') return 'Column mapping'
    if (p === 'review')  return 'Review & answers'
    return 'Preview & confirm'
  }

  function updateCell(sIdx: number, cIdx: number, patch: Partial<ProposedColumnMap>) {
    setEditable(prev => prev.map((s, i) => {
      if (i !== sIdx) return s
      return { ...s, column_map: s.column_map.map((c, j) => j === cIdx ? { ...c, ...patch } : c) }
    }))
  }

  function updateSource(sIdx: number, patch: Partial<ProposedSource>) {
    setEditable(prev => prev.map((s, i) => i === sIdx ? { ...s, ...patch } : s))
  }

  async function confirm() {
    if (!jobId || !mapping) return
    setSubmitting(true)
    setError(null)
    setExhausted(false)
    try {
      const body: { job_id: string; confirmed_mapping: ConfirmedMapping } = {
        job_id:            jobId,
        confirmed_mapping: {
          sources:           editable,
          proposed_setup:    mapping.proposed_setup as Record<string, unknown> | undefined,
          qa_answers:        qaAnswers,
          anomaly_decisions: anomalyDecisions,
        },
      }
      const res = await fetch('/api/onboarding/import', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (res.status === 402) { setExhausted(true); return }
      const data = await res.json()
      if (!res.ok) { setError(data.detail || data.error || 'extract failed'); return }
      setImportResult(data.result as Record<string, unknown>)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'extract failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Guards
  if (!jobId)   return <div className="p-6 text-sm text-red-700">Missing job_id.</div>
  if (loading)  return <div className="p-6 text-sm text-gray-600">Loading proposed mapping…</div>
  if (!mapping) return <div className="p-6 text-sm text-red-700">{error ?? 'No proposed mapping available.'}</div>

  // Success screen
  if (importResult) {
    const r = importResult as { rowsInserted?: { occurrences?: number; attendance?: number }; setupSummary?: string }
    const occurrences = r.rowsInserted?.occurrences
    const attendance  = r.rowsInserted?.attendance
    return (
      <div className="mx-auto max-w-lg space-y-5 p-6">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Your data has been imported</h1>
          <p className="mt-1 text-sm text-gray-500">Sunday Tally is ready with your historical data.</p>
        </div>

        {(occurrences != null || attendance != null) && (
          <div className="grid grid-cols-2 gap-3 text-center">
            {occurrences != null && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-2xl font-semibold text-gray-900">{occurrences}</p>
                <p className="mt-0.5 text-xs text-gray-500">Services imported</p>
              </div>
            )}
            {attendance != null && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-2xl font-semibold text-gray-900">{attendance}</p>
                <p className="mt-0.5 text-xs text-gray-500">Attendance records</p>
              </div>
            )}
          </div>
        )}

        <button
          className="w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          onClick={() => router.push('/dashboard')}
        >
          Go to your dashboard →
        </button>
      </div>
    )
  }

  const setup = mapping.proposed_setup

  return (
    <div className="mx-auto max-w-3xl pb-12">
      {/* Progress bar */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          {phases.map((p, i) => {
            const currentIdx = phases.indexOf(phase)
            const pIdx       = i
            const done       = pIdx < currentIdx
            const active     = p === phase
            return (
              <div key={p} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 text-sm ${active ? 'text-gray-900 font-medium' : done ? 'text-blue-600' : 'text-gray-400'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${active ? 'bg-gray-900 text-white' : done ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-400'}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <span className="hidden sm:inline">{phaseLabel(p)}</span>
                </div>
                {i < phases.length - 1 && (
                  <span className="text-gray-200 text-sm">›</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-5 px-6 pt-6">
        {/* ── PHASE 1: COLUMN MAPPING ── */}
        {phase === 'mapping' && (
          <>
            {/* Proposed setup summary */}
            {setup && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">AI detected your Sunday Tally setup</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {setup.locations && setup.locations.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Locations ({setup.locations.length})</p>
                      {setup.locations.map((l, i) => <p key={i} className="text-gray-700">{l.name}</p>)}
                    </div>
                  )}
                  {setup.service_templates && setup.service_templates.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Service types ({setup.service_templates.length})</p>
                      {setup.service_templates.map((t, i) => <p key={i} className="text-gray-700">{t.name}</p>)}
                    </div>
                  )}
                  {setup.giving_sources && setup.giving_sources.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Giving sources ({setup.giving_sources.length})</p>
                      {setup.giving_sources.map((g, i) => <p key={i} className="text-gray-700">{g.name}</p>)}
                    </div>
                  )}
                  {setup.volunteer_categories && setup.volunteer_categories.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Volunteer roles ({setup.volunteer_categories.length})</p>
                      {setup.volunteer_categories.map((v, i) => <p key={i} className="text-gray-700">{v.name}</p>)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dashboard warnings */}
            {mapping.dashboard_warnings && mapping.dashboard_warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900 mb-2">Heads up</p>
                <ul className="space-y-1 text-sm text-amber-800">
                  {mapping.dashboard_warnings.map((w, i) => <li key={i}>• {w}</li>)}
                </ul>
              </div>
            )}

            {/* Editable column maps */}
            {editable.map((src, sIdx) => (
              <div key={sIdx} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">{src.source_name}</h2>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400">{src.dest_table}</span>
                </div>
                {src.notes && <p className="mb-3 text-xs text-gray-500">{src.notes}</p>}

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <label className="block text-xs text-gray-500">
                    Date column
                    <input
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={src.date_column ?? ''}
                      onChange={e => updateSource(sIdx, { date_column: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs text-gray-500">
                    Date format
                    <input
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={src.date_format ?? ''}
                      onChange={e => updateSource(sIdx, { date_format: e.target.value })}
                    />
                  </label>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                      <th className="pb-2 pr-3 font-medium">Your column</th>
                      <th className="pb-2 pr-3 font-medium">Maps to</th>
                      <th className="pb-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {src.column_map.map((c, cIdx) => (
                      <tr key={cIdx}>
                        <td className="py-2 pr-3 font-mono text-xs text-gray-600">{c.source_column}</td>
                        <td className="py-2 pr-3">
                          <input
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                            value={c.dest_field}
                            onChange={e => updateCell(sIdx, cIdx, { dest_field: e.target.value })}
                          />
                        </td>
                        <td className="py-2 text-xs text-gray-400">{c.notes ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <button
              onClick={() => setPhase(hasReviewStep ? 'review' : 'preview')}
              className="w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
            >
              {hasReviewStep ? 'Next: Answer questions →' : 'Next: Preview your data →'}
            </button>
            <button
              onClick={() => router.push('/onboarding/schedule')}
              className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              Cancel — set up manually instead
            </button>
          </>
        )}

        {/* ── PHASE 2: REVIEW Q&A + ANOMALIES ── */}
        {phase === 'review' && (
          <>
            {mapping.clarification_questions && mapping.clarification_questions.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">A few questions about your data</h2>
                  <p className="mt-0.5 text-sm text-gray-500">These help the AI map your data correctly. Accept the recommendation or enter your own answer.</p>
                </div>
                {mapping.clarification_questions.map((q, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                    <p className="text-sm font-medium text-gray-900">{q.question}</p>
                    {q.why && <p className="text-xs text-gray-400">Why this matters: {q.why}</p>}

                    <div className="space-y-2.5">
                      {q.recommended_answer && (
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name={`qa-${i}`}
                            checked={qaAnswers[i]?.accepted ?? true}
                            onChange={() => setQaAnswers(prev => prev.map((a, j) =>
                              j === i ? { ...a, accepted: true, answer: q.recommended_answer! } : a
                            ))}
                            className="mt-0.5 accent-blue-600"
                          />
                          <span className="text-sm text-gray-700">
                            <span className="text-xs text-gray-400 block mb-0.5">Recommended</span>
                            {q.recommended_answer}
                          </span>
                        </label>
                      )}
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name={`qa-${i}`}
                          checked={!(qaAnswers[i]?.accepted ?? true)}
                          onChange={() => setQaAnswers(prev => prev.map((a, j) =>
                            j === i ? { ...a, accepted: false } : a
                          ))}
                          className="mt-0.5 accent-blue-600"
                        />
                        <div className="flex-1 text-sm text-gray-700">
                          <span className="text-xs text-gray-400 block mb-1">Enter my own answer</span>
                          {!(qaAnswers[i]?.accepted ?? true) && (
                            <textarea
                              rows={2}
                              placeholder="Your answer…"
                              value={qaAnswers[i]?.answer ?? ''}
                              onChange={e => setQaAnswers(prev => prev.map((a, j) =>
                                j === i ? { ...a, answer: e.target.value } : a
                              ))}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mapping.anomalies && mapping.anomalies.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Anomalies detected</h2>
                  <p className="mt-0.5 text-sm text-gray-500">Unusual patterns found in your data. Decide how to handle each one.</p>
                </div>
                {mapping.anomalies.map((a, i) => (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">{a.kind}</span>
                      <p className="mt-0.5 text-sm text-gray-900">{a.description}</p>
                    </div>
                    <div className="flex gap-5">
                      {(['keep', 'exclude', 'flag'] as const).map(opt => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`anomaly-${i}`}
                            value={opt}
                            checked={anomalyDecisions[i]?.decision === opt}
                            onChange={() => setAnomalyDecisions(prev => prev.map((d, j) =>
                              j === i ? { ...d, decision: opt } : d
                            ))}
                            className="accent-blue-600"
                          />
                          <span className="text-sm text-gray-700 capitalize">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setPhase('mapping')}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setPhase('preview')}
                className="flex-[2] rounded-xl bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
              >
                Next: Preview data →
              </button>
            </div>
          </>
        )}

        {/* ── PHASE 3: PREVIEW + CONFIRM ── */}
        {phase === 'preview' && (
          <>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Does this look right?</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                This chart shows the attendance data we detected. If the numbers look roughly correct, confirm to import everything.
              </p>
            </div>

            {previewLoading ? (
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
                <p className="text-sm text-gray-500">Building preview…</p>
              </div>
            ) : previewMonths.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
                <p className="text-sm text-gray-700">No attendance data found to preview.</p>
                <p className="mt-1 text-xs text-gray-400">
                  Check that your date column and attendance columns are mapped correctly on step 1.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-400">
                  Monthly attendance from your data
                </p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={previewMonths} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis
                        dataKey="label"
                        fontSize={10}
                        tick={{ fill: '#9ca3af' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="main"  name="Main"  fill="#2563eb" radius={[3, 3, 0, 0]} stackId="a" />
                      <Bar dataKey="kids"  name="Kids"  fill="#10b981" radius={[3, 3, 0, 0]} stackId="a" />
                      <Bar dataKey="youth" name="Youth" fill="#f97316" radius={[3, 3, 0, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-3 text-right text-xs text-gray-400">{previewMonths.length} months detected</p>
              </div>
            )}

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
              <p className="font-medium text-gray-900 mb-2">What happens when you confirm</p>
              <ul className="space-y-1 text-gray-500 text-sm">
                <li>• Your locations and service types will be created</li>
                <li>• All historical service records will be imported</li>
                <li>• Attendance, giving, and volunteer data will be attached</li>
                <li>• Your dashboard will show real trends from day one</li>
              </ul>
            </div>

            {exhausted && <AiExhaustedBanner />}
            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                disabled={submitting}
                onClick={() => setPhase(hasReviewStep ? 'review' : 'mapping')}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Back
              </button>
              <button
                disabled={submitting || exhausted}
                onClick={confirm}
                className="flex-[2] rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Importing your data…' : 'Confirm and import →'}
              </button>
            </div>

            <button
              onClick={() => router.push('/onboarding/schedule')}
              className="w-full py-1 text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel — set up manually instead
            </button>
          </>
        )}
      </div>
    </div>
  )
}
