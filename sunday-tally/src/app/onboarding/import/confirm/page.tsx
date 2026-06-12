'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AiExhaustedBanner from '@/components/AiExhaustedBanner'
import type { AnomalyDecision, ConfirmedMapping } from '@/lib/import/stageB'
import type { ClarificationQuestion, ProposedMapping, QaState } from './types'
import { Section1QuickMetrics } from './components/Section1QuickMetrics'
import { Section2DataOrganisation } from './components/Section2DataOrganisation'
import { Section3Decisions } from './components/Section3Decisions'
import { isAnswered } from './components/QuestionBlock'
import { ImportingPanel } from './components/ImportingPanel'

// ── Root ──────────────────────────────────────────────────────────────────────

export default function ConfirmMappingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
      <ConfirmMappingInner />
    </Suspense>
  )
}

// ── Inner ─────────────────────────────────────────────────────────────────────

function ConfirmMappingInner() {
  const searchParams = useSearchParams()
  const jobId        = searchParams.get('job_id')

  const [mapping,    setMapping]    = useState<ProposedMapping | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [refining,   setRefining]   = useState(false)
  const [round,      setRound]      = useState<1 | 2>(1)
  const [round2Reason, setRound2Reason] = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [exhausted,  setExhausted]  = useState(false)
  const [qaStates,   setQaStates]   = useState<QaState[]>([])
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null)
  // QW-4: user-resolved names and parent assignments for [BLOCKING] service templates
  const [resolvedNames,   setResolvedNames]   = useState<Record<string, string>>({})
  const [resolvedParents, setResolvedParents] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!jobId) return
    fetch(`/api/onboarding/import?job_id=${jobId}`)
      .then(r => r.json())
      .then(b => {
        const m = b.job?.proposed_mapping as ProposedMapping | null
        setMapping(m)
        setQaStates((m?.clarification_questions ?? []).map(q => ({
          questionId:     q.id,
          question:       q.question,
          answer:         q.blocking ? '' : (q.recommended_answer ?? ''),
          accepted:       q.blocking ? false : true,
          selectedOption: undefined,
          meaningCode:    undefined,
        })))
        // Auto-derive best-effort names for any [BLOCKING] templates so import can always proceed.
        // Users can improve these on the review card, but they're never forced to.
        const blocking = (m?.proposed_setup?.service_templates ?? []).filter(
          (t: any) => typeof t.display_name === 'string' && t.display_name.includes('[BLOCKING]')
        )
        if (blocking.length > 0) {
          const autoNames: Record<string, string> = {}
          blocking.forEach((t: any, idx: number) => {
            const code = String(t.service_code ?? '')
            // Try to make something human-readable from the code itself
            const cleaned = code
              .replace(/_/g, ' ')
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .toLowerCase()
              .replace(/\b\w/g, c => c.toUpperCase())
              .trim()
            autoNames[code] = /^\d+$/.test(cleaned) || cleaned.length < 2
              ? `Service ${idx + 1}`
              : cleaned
          })
          setResolvedNames(autoNames)
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'load failed'))
      .finally(() => setLoading(false))
  }, [jobId])

  const questions    = mapping?.clarification_questions ?? []
  const setup        = mapping?.proposed_setup
  const previewData  = mapping?.preview_data
  const quickSummary = mapping?.quick_summary

  const hasBlockingUnanswered = questions.some((q, i) =>
    q.blocking && !isAnswered(q, qaStates[i]),
  )

  // QW-4: [BLOCKING] guard — block confirm until every [BLOCKING] template has a user-supplied name
  const blockingTemplates = (setup?.service_templates ?? []).filter(
    t => typeof t.display_name === 'string' && t.display_name.includes('[BLOCKING]')
  )
  const nonBlockingTemplates = (setup?.service_templates ?? []).filter(
    t => typeof t.display_name === 'string' && !t.display_name.includes('[BLOCKING]')
  )
  // hasBlockingTemplates: informational only — auto-derived names mean import never truly blocks here.
  // The card is a "help us improve this" invite, not a hard gate.
  const hasBlockingTemplates = blockingTemplates.length > 0

  function setQa(i: number, patch: Partial<QaState>) {
    setQaStates(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s))
  }

  async function submitOrRefine() {
    if (!jobId || !mapping) return
    if (round === 2) { await confirm(); return }
    setRefining(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/import/refine', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          qa_answers: qaStates.map(s => ({
            id:                    s.questionId,
            question:              s.question,
            answer:                s.answer,
            accepted:              s.accepted,
            selected_option_index: s.selectedOption,
            meaning_code:          s.meaningCode,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { await confirm(); return }
      if (data.decision === 'proceed' || !data.new_questions || data.new_questions.length === 0) {
        await confirm(); return
      }
      const newQs = data.new_questions as ClarificationQuestion[]
      setMapping(prev => prev ? {
        ...prev,
        clarification_questions: [...(prev.clarification_questions ?? []), ...newQs],
      } : prev)
      setQaStates(prev => [
        ...prev,
        ...newQs.map(q => ({
          questionId:     q.id,
          question:       q.question,
          answer:         q.blocking ? '' : (q.recommended_answer ?? ''),
          accepted:       q.blocking ? false : true,
          selectedOption: undefined,
          meaningCode:    undefined,
        })),
      ])
      setRound2Reason(typeof data.reasoning === 'string' ? data.reasoning : null)
      setRound(2)
      setTimeout(() => {
        const el = document.querySelector('[data-round-2-anchor]')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } finally {
      setRefining(false)
    }
  }

  async function confirm() {
    if (!jobId || !mapping) return
    setSubmitting(true)
    setError(null)
    setExhausted(false)
    try {
      // Patch proposed_setup: replace [BLOCKING] display_names with user-supplied
      // names, and set each renamed template's parent_code from the optional
      // "part of a larger group" select (IR v2 uses ministry-tag adjacency via
      // parent_code — there is no tag_relationships table anymore).
      let patchedSetup = mapping.proposed_setup as Record<string, unknown> | undefined
      if (patchedSetup && blockingTemplates.length > 0) {
        const patchedTemplates = (patchedSetup.service_templates as Array<Record<string, unknown>> ?? [])
          .map(t => {
            const code = String(t.service_code ?? '')
            const resolvedName  = resolvedNames[code]?.trim()
            const resolvedParent = resolvedParents[code]?.trim()
            const next: Record<string, unknown> = { ...t }
            if (resolvedName) next.display_name = resolvedName
            if (resolvedParent) next.parent_code = resolvedParent
            return next
          })

        patchedSetup = {
          ...patchedSetup,
          service_templates: patchedTemplates,
        }
      }

      const body: { job_id: string; confirmed_mapping: ConfirmedMapping } = {
        job_id: jobId,
        confirmed_mapping: {
          sources:        mapping.sources,
          proposed_setup: patchedSetup,
          qa_answers:     qaStates.map(s => ({
            id:                    s.questionId,
            question:              s.question,
            answer:                s.answer,
            accepted:              s.accepted,
            selected_option_index: s.selectedOption,
            meaning_code:          s.meaningCode,
          })),
          anomaly_decisions: (mapping.anomalies ?? []).map(a => ({
            kind: a.kind, description: a.description, decision: 'keep' as const,
          })) as AnomalyDecision[],
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

  if (!jobId)  return <div className="p-8 text-sm text-red-700 font-medium">Missing job_id.</div>
  if (loading) return (
    <div className="flex items-center justify-center min-h-64 p-8">
      <div className="text-center space-y-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700 mx-auto" />
        <p className="text-sm text-gray-600">Reviewing your data…</p>
      </div>
    </div>
  )
  if (!mapping) return <div className="p-8 text-sm text-red-700 font-medium">{error ?? 'No mapping available.'}</div>

  // ── Success ──
  if (importResult) {
    // IR v2: all data lands in `metric_entries`. Legacy per-kind count fields may be
    // 0/absent — read them defensively as a fallback only. `attendance` mirrors
    // `metric_entries` server-side (see StageBResult), so it stays a valid display value.
    const r = importResult as {
      rowsInserted?: {
        occurrences?: number; metric_entries?: number; attendance?: number;
        volunteer?: number; response?: number; giving?: number;
        period_giving?: number; period_response?: number
      }
      setupSummary?: string
    }
    const occurrences = r.rowsInserted?.occurrences ?? 0
    const metricEntries = r.rowsInserted?.metric_entries ?? r.rowsInserted?.attendance
    const dataTotal =
      (r.rowsInserted?.metric_entries ?? 0) ||
      (
        (r.rowsInserted?.attendance     ?? 0) +
        (r.rowsInserted?.volunteer      ?? 0) +
        (r.rowsInserted?.response       ?? 0) +
        (r.rowsInserted?.giving         ?? 0) +
        (r.rowsInserted?.period_giving  ?? 0) +
        (r.rowsInserted?.period_response ?? 0)
      )
    // QW-5: services were created but no data rows were written — likely a mapping failure
    const isZeroRowImport = occurrences > 0 && dataTotal === 0

    return (
      <div className="mx-auto max-w-lg space-y-5 p-8">
        {isZeroRowImport && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">Import completed with a warning</p>
            <p className="mt-1 text-sm text-amber-800">
              {occurrences} service{occurrences !== 1 ? 's' : ''} were created but no attendance,
              giving, or volunteer records were written. This usually means the column mapping
              didn&apos;t match the sheet&apos;s format. You can re-import with a corrected sheet,
              or contact support if this looks wrong.
            </p>
          </div>
        )}
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Your data has been imported</h1>
          <p className="mt-1.5 text-sm text-gray-600">Sunday Tally is ready with your historical data.</p>
        </div>
        {(occurrences > 0 || metricEntries != null) && (
          <div className="grid grid-cols-2 gap-3">
            {occurrences > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
                <p className="text-3xl font-bold text-gray-900">{occurrences}</p>
                <p className="mt-1 text-sm text-gray-600">Services imported</p>
              </div>
            )}
            {metricEntries != null && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
                <p className="text-3xl font-bold text-gray-900">{metricEntries}</p>
                <p className="mt-1 text-sm text-gray-600">Data points recorded</p>
              </div>
            )}
          </div>
        )}
        <Link
          href="/dashboard"
          className="block w-full rounded-xl bg-gray-900 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
        >
          Go to your dashboard →
        </Link>
      </div>
    )
  }

  const entityCount =
    (setup?.locations?.length ?? 0) +
    (setup?.ministry_tags?.length ?? 0) +
    (setup?.service_templates?.length ?? 0) +
    (setup?.metrics?.length ?? 0)

  // IR v2: tracked dimensions come from each metric's reporting_tag, not dest_field
  // prefixes. ATTENDANCE / VOLUNTEERS / GIVING / RESPONSE_STAT map to display labels.
  const reportingTagsPresent = new Set((setup?.metrics ?? []).map(m => m.reporting_tag))
  const trackedCategories = [
    reportingTagsPresent.has('ATTENDANCE')    && 'Attendance',
    reportingTagsPresent.has('VOLUNTEERS')    && 'Volunteers',
    reportingTagsPresent.has('RESPONSE_STAT') && 'Stats',
    reportingTagsPresent.has('GIVING')        && 'Giving',
  ].filter(Boolean) as string[]

  const blockingQs  = questions.filter(q => q.blocking)
  const optionalQs  = questions.filter(q => !q.blocking)
  const hasAnyQs    = questions.length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-base font-bold text-gray-900">Review your import</h1>
        <p className={`text-sm mt-0.5 ${hasBlockingUnanswered ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
          {hasBlockingUnanswered
            ? `Answer ${blockingQs.length} required ${blockingQs.length === 1 ? 'question' : 'questions'} before importing`
            : 'Everything looks good — confirm to import your data'}
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-6 py-6 pb-16">

        <Section1QuickMetrics
          previewData={previewData}
          quickSummary={quickSummary}
          weeksObserved={mapping.weeks_observed}
          trackedCategories={trackedCategories}
          lowConfidenceNote={mapping.low_confidence_note}
        />

        <Section2DataOrganisation
          setup={setup}
          entityCount={entityCount}
          sources={mapping.sources ?? []}
          previewData={previewData}
          anomalies={mapping.anomalies}
          dashboardWarnings={mapping.dashboard_warnings}
        />

        {/* Service name review card — shown when AI made a best-effort guess on opaque codes */}
        {blockingTemplates.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {blockingTemplates.length === 1
                    ? 'We gave this service a placeholder name'
                    : `We gave ${blockingTemplates.length} services placeholder names`}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Your sheet used codes we couldn&apos;t automatically identify. We&apos;ve made our best guess —
                  update any name that looks wrong, or just leave it and fix it later in Settings.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {blockingTemplates.map(t => {
                const code = t.service_code ?? ''
                const currentName = resolvedNames[code] ?? code
                return (
                  <div key={code} className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      {/* Show the auto-derived name, not the raw technical code */}
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 mb-1">Our best guess for this service</p>
                        <input
                          type="text"
                          value={currentName}
                          onChange={e => setResolvedNames(prev => ({ ...prev, [code]: e.target.value }))}
                          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                    </div>

                    {nonBlockingTemplates.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">
                          Is this part of a larger service group? <span className="text-gray-400">(optional)</span>
                        </p>
                        <select
                          value={resolvedParents[code] ?? ''}
                          onChange={e => setResolvedParents(prev => ({ ...prev, [code]: e.target.value }))}
                          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                        >
                          <option value="">No — it&apos;s its own service</option>
                          {nonBlockingTemplates.map(parent => (
                            <option key={parent.service_code ?? parent.display_name} value={parent.service_code ?? ''}>
                              Part of {parent.display_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Chat pointer — surfaces the assistant as the escape hatch */}
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              <p className="text-xs text-gray-500">
                Not sure what a service should be called?{' '}
                <span className="font-medium text-gray-700">
                  Ask the assistant in the chat below — just describe what your church does on that day.
                </span>
              </p>
            </div>
          </div>
        )}

        {round === 2 && round2Reason && (
          <div data-round-2-anchor className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 flex items-start gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-200 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">A few follow-up questions based on your answers</p>
              <p className="mt-1 text-sm text-amber-800">{round2Reason}</p>
            </div>
          </div>
        )}

        {hasAnyQs && (
          <Section3Decisions
            blockingQs={blockingQs}
            optionalQs={optionalQs}
            allQuestions={questions}
            qaStates={qaStates}
            setQa={setQa}
          />
        )}

        {exhausted && (
          <AiExhaustedBanner onOverride={() => { setExhausted(false); confirm() }} />
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}

        {refining ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
            <p className="text-sm font-semibold text-gray-900">Reviewing your answers…</p>
            <p className="text-sm text-gray-500 text-center max-w-sm">
              Checking whether anything else needs clarification before we import.
            </p>
          </div>
        ) : submitting ? (
          <ImportingPanel />
        ) : (
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { window.location.href = '/onboarding/schedule' }}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={exhausted || hasBlockingUnanswered}
              onClick={submitOrRefine}
              title={hasBlockingUnanswered ? 'Answer required questions above to continue' : undefined}
              className="flex-1 rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {hasBlockingUnanswered
                ? 'Answer required questions to continue'
                : (round === 1 ? 'Submit answers →' : 'Confirm and import →')}
            </button>
          </div>
        )}
        <p className="text-center text-xs text-gray-400">
          Your locations, service types, and all historical records will be created.
        </p>
      </div>
    </div>
  )
}
