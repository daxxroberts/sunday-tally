'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import AiExhaustedBanner from '@/components/AiExhaustedBanner'
import type { QaAnswer, AnomalyDecision, ConfirmedMapping, TallFormatConfig } from '@/lib/import/stageB'
import type { ProposedSetup } from '@/lib/import/stageA_validate'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionOption {
  label:         string
  explanation:   string
  meaning_code?: string
}
// Stage A mapping-JSON question shape (richer UI fields: explanation, why,
// recommended_answer, topic_group). Deliberately distinct from the validator's
// ClarificationProposal in stageA_validate — do not merge them.
interface ClarificationQuestion {
  id?:                 string
  blocking?:           boolean
  type?:               'text' | 'choice' | 'policy_collapse'
  title?:              string
  context?:            string
  question:            string
  why?:                string
  recommended_answer?: string
  options?:            QuestionOption[]
  data_examples?:      string[]
  collapse_target_ids?: string[]
  topic_group?:        'pattern_verification' | string
}
interface ProposedColumnMap {
  source_column: string
  dest_field:    string
  notes?:        string
}
interface ProposedSource {
  source_name:  string
  dest_table?:  string
  date_column?: string
  date_format?: string
  column_map:   ProposedColumnMap[]
  notes?:       string
  tall_format?: TallFormatConfig
}
interface MonthlyRow {
  month: string
  main:  number
  kids:  number
  youth: number
}
interface PreviewData {
  monthly_attendance: MonthlyRow[]
  date_range:         { start: string; end: string }
  note?:              string
}
interface QuickSummary {
  avg_volunteers_per_sunday?: number | null
  total_response_count?:      number | null
  total_giving_amount?:       number | null
  low_confidence?:            boolean
  note?:                      string | null
}
interface ProposedMapping {
  sources:                  ProposedSource[]
  proposed_setup?:          ProposedSetup
  anomalies?:               Array<{ kind: string; description: string }>
  clarification_questions?: ClarificationQuestion[]
  dashboard_warnings?:      string[]
  preview_data?:            PreviewData | null
  quick_summary?:           QuickSummary | null
  confidence?:              'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE'
  weeks_observed?:          number
  low_confidence_note?:     string
}

interface QaState {
  questionId?:     string
  question:        string
  answer:          string
  accepted:        boolean
  selectedOption?: number
  meaningCode?:    string
}

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

// ── Section 1: Quick Metrics ──────────────────────────────────────────────────

function Section1QuickMetrics({
  previewData,
  quickSummary,
  weeksObserved,
  trackedCategories,
  lowConfidenceNote,
}: {
  previewData?:       PreviewData | null
  quickSummary?:      QuickSummary | null
  weeksObserved?:     number
  trackedCategories:  string[]
  lowConfidenceNote?: string | null
}) {
  const months = previewData?.monthly_attendance ?? []

  const avgOf = (key: 'main' | 'kids' | 'youth'): number | null => {
    const nonZero = months.filter(m => m[key] > 0)
    if (nonZero.length === 0) return null
    return Math.round(nonZero.reduce((s, m) => s + m[key], 0) / nonZero.length)
  }

  const avgMain  = avgOf('main')
  const avgKids  = avgOf('kids')
  const avgYouth = avgOf('youth')

  const dateRange = previewData?.date_range
  const weeks     = weeksObserved ?? months.length
  const lowConf   = quickSummary?.low_confidence ?? (weeks < 12)

  if (weeks === 0 && avgMain == null && !quickSummary) return null

  const kpiCards: Array<{ label: string; value: string | number; sub?: string }> = []

  if (weeks > 0) {
    kpiCards.push({
      label: 'Weeks of data',
      value: weeks,
      sub:   dateRange?.start && dateRange?.end
        ? `${fmtDate(dateRange.start)} – ${fmtDate(dateRange.end)}`
        : undefined,
    })
  }

  if (avgMain  != null) kpiCards.push({ label: 'Avg adults / Sunday',   value: avgMain.toLocaleString() })
  if (avgKids  != null) kpiCards.push({ label: 'Avg kids / Sunday',     value: avgKids.toLocaleString() })
  if (avgYouth != null) kpiCards.push({ label: 'Avg students / Sunday', value: avgYouth.toLocaleString() })

  if (quickSummary?.avg_volunteers_per_sunday != null) {
    kpiCards.push({ label: 'Avg volunteers / Sunday', value: Math.round(quickSummary.avg_volunteers_per_sunday).toLocaleString() })
  }
  if (quickSummary?.total_response_count != null) {
    kpiCards.push({ label: 'Total stats tracked', value: Math.round(quickSummary.total_response_count).toLocaleString() })
  }
  if (quickSummary?.total_giving_amount != null) {
    kpiCards.push({ label: 'Total giving', value: `$${Math.round(quickSummary.total_giving_amount).toLocaleString()}` })
  }

  const visible = kpiCards.slice(0, 6)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">What we found in your data</h2>
        {trackedCategories.length > 0 && (
          <p className="mt-0.5 text-sm text-gray-600">
            Tracking: {trackedCategories.join(' · ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visible.map((card, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="mt-1 text-xs font-medium text-gray-600 uppercase tracking-wide">{card.label}</p>
            {card.sub && <p className="mt-0.5 text-xs text-gray-500">{card.sub}</p>}
          </div>
        ))}
      </div>

      {lowConf && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-900 font-medium">
            {lowConfidenceNote ?? 'Less than 12 weeks of data — patterns may not be fully representative.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Section 2: Data Organisation ─────────────────────────────────────────────

function Section2DataOrganisation({
  setup,
  entityCount,
  sources,
  previewData,
  anomalies,
  dashboardWarnings,
}: {
  setup?:             ProposedSetup
  entityCount:        number
  sources:            ProposedSource[]
  previewData?:       PreviewData | null
  anomalies?:         Array<{ kind: string; description: string }>
  dashboardWarnings?: string[]
}) {
  // metric_code → display name, for resolving `metric.<CODE>` dest_fields to labels.
  const metricNameByCode = new Map<string, string>()
  for (const m of setup?.metrics ?? []) metricNameByCode.set(m.metric_code, m.name ?? m.metric_code)

  const mappingCount = sources.reduce((n, s) => {
    const colCount = s.column_map.filter(c => c.dest_field !== 'ignore').length
    const mapCount = Object.keys(s.tall_format?.area_field_map ?? {}).length
    return n + colCount + mapCount
  }, 0)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900">How your data is organised</h2>
        <p className="mt-0.5 text-sm text-gray-600">
          {entityCount} setup items · {mappingCount} metrics mapped
        </p>
      </div>

      {setup && entityCount > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            What we detected
          </p>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {setup.locations?.map((l, i) => (
              <EntityRow key={`loc-${i}`} type="Location" name={l.name} />
            ))}
            {setup.ministry_tags?.map((t, i) => (
              <EntityRow key={`min-${i}`} type="Ministry" name={`${t.name ?? t.code}${t.tag_role ? ` · ${tagRoleLabel(t.tag_role)}` : ''}`} />
            ))}
            {setup.service_templates?.map((t, i) => (
              <EntityRow key={`tmpl-${i}`} type="Service" name={t.display_name === '[BLOCKING]' ? '(name needed)' : t.display_name} warn={t.display_name === '[BLOCKING]'} />
            ))}
            {setup.metrics?.map((m, i) => (
              <EntityRow key={`met-${i}`} type="Metric" name={`${m.name ?? m.metric_code}${m.reporting_tag ? ` · ${reportingTagLabel(m.reporting_tag)}` : ''}`} />
            ))}
          </div>
        </div>
      )}

      {previewData && previewData.monthly_attendance.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Monthly attendance
          </p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={previewData.monthly_attendance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" fontSize={11} tick={{ fill: '#6b7280' }} interval="preserveStartEnd" />
                <YAxis fontSize={11} tick={{ fill: '#6b7280' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="main"  name="Main"     stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="kids"  name="Kids"     stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="youth" name="Students" stroke="#d97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {previewData.note && (
            <p className="mt-2 text-xs text-gray-500">{previewData.note}</p>
          )}
        </div>
      ) : previewData === null ? (
        <p className="text-sm text-gray-500 italic">
          Trend chart will appear after import — not enough monthly data to preview.
        </p>
      ) : null}

      {sources.some(s => s.tall_format?.area_field_map && Object.keys(s.tall_format.area_field_map).length > 0) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            How your metrics are mapped
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Your data</th>
                  <th className="px-4 py-2.5">Goes to metric</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sources.flatMap(s =>
                  Object.entries(s.tall_format?.area_field_map ?? {}).map(([key, dest], i) => (
                    <tr key={`${s.source_name}-${i}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{key}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-800">{destFieldLabel(dest, metricNameByCode)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {anomalies && anomalies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Heads up</p>
          {anomalies.map((a, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">{a.kind}</p>
              <p className="mt-1 text-sm text-gray-900">{a.description}</p>
            </div>
          ))}
        </div>
      )}

      {dashboardWarnings && dashboardWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 mb-2">Dashboard notes</p>
          <ul className="space-y-1 text-sm text-amber-800">
            {dashboardWarnings.map((w, i) => <li key={i}>· {w}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Section 3: Decisions ──────────────────────────────────────────────────────

function Section3Decisions({
  blockingQs,
  optionalQs,
  allQuestions,
  qaStates,
  setQa,
}: {
  blockingQs:   ClarificationQuestion[]
  optionalQs:   ClarificationQuestion[]
  allQuestions: ClarificationQuestion[]
  qaStates:     QaState[]
  setQa:        (i: number, patch: Partial<QaState>) => void
}) {
  const isPatternQ = (q: ClarificationQuestion) => q.topic_group === 'pattern_verification'
  const patternBlockingCount = blockingQs.filter(isPatternQ).length
  const patternTotalCount    = allQuestions.filter(isPatternQ).length
  const routingBlockingCount = blockingQs.filter(q => !isPatternQ(q)).length
  const routingOptionalCount = optionalQs.filter(q => !isPatternQ(q)).length

  return (
    <div className="space-y-4">

      {patternTotalCount > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Step 1 · Verify what we found
            </p>
            <h2 className="mt-1 text-base font-bold text-gray-900">Confirm the pattern in your data</h2>
            <p className="mt-1 text-sm text-gray-700">
              Before we route your data to the right places, confirm we&apos;re reading it correctly.
              {patternBlockingCount > 0 ? ` ${patternBlockingCount} required.` : ''}
            </p>
          </div>
          <div className="space-y-4">
            {allQuestions.map((q, i) => {
              if (!isPatternQ(q)) return null
              return (
                <QuestionBlock
                  key={q.id ?? i}
                  question={q}
                  state={qaStates[i]}
                  onChange={patch => setQa(i, patch)}
                />
              )
            })}
          </div>
        </div>
      )}

      {(routingBlockingCount > 0 || routingOptionalCount > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {patternTotalCount > 0 ? 'Step 2 · ' : ''}A few decisions to make
            </p>
            <h2 className="mt-1 text-base font-bold text-gray-900">How should we set this up?</h2>
            <p className="mt-1 text-sm text-gray-600">
              {routingBlockingCount > 0
                ? `${routingBlockingCount} required · ${routingOptionalCount} optional`
                : `${routingOptionalCount} optional — accept or override the suggestion`}
            </p>
          </div>

          {routingBlockingCount > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Required — answer before importing
              </p>
              {allQuestions.map((q, i) => {
                if (!q.blocking || isPatternQ(q)) return null
                return (
                  <QuestionBlock
                    key={q.id ?? i}
                    question={q}
                    state={qaStates[i]}
                    onChange={patch => setQa(i, patch)}
                  />
                )
              })}
            </div>
          )}

          {routingOptionalCount > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Optional — accept or override
              </p>
              {allQuestions.map((q, i) => {
                if (q.blocking || isPatternQ(q)) return null
                return (
                  <QuestionBlock
                    key={q.id ?? i}
                    question={q}
                    state={qaStates[i]}
                    onChange={patch => setQa(i, patch)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── QuestionBlock ─────────────────────────────────────────────────────────────

function QuestionBlock({
  question,
  state,
  onChange,
}: {
  question: ClarificationQuestion
  state?:   QaState
  onChange: (patch: Partial<QaState>) => void
}) {
  const answered  = state ? isAnswered(question, state) : false
  const isChoice  = (question.type === 'choice' || question.type === 'policy_collapse') && question.options && question.options.length > 0
  const isBlocking = question.blocking ?? false

  const borderClass = isBlocking
    ? answered ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
    : 'border-gray-200 bg-white'

  return (
    <div className={`rounded-xl border-2 p-5 space-y-4 ${borderClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          {question.title && (
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {question.title}
            </p>
          )}
          {question.context && (
            <p className="text-sm text-gray-600">{question.context}</p>
          )}
          <p className="text-sm font-semibold text-gray-900">{question.question}</p>
        </div>
        {isBlocking && (
          answered
            ? <span className="shrink-0 rounded-full bg-green-100 border border-green-300 px-2.5 py-1 text-xs font-semibold text-green-800">Answered</span>
            : <span className="shrink-0 rounded-full bg-red-100 border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-800">Required</span>
        )}
      </div>

      {question.why && !isChoice && (
        <p className="text-xs text-gray-500 border-l-2 border-gray-200 pl-3">{question.why}</p>
      )}

      {isChoice && question.options && (
        <div className="space-y-2">
          {question.options.map((opt, oi) => (
            <OptionCard
              key={oi}
              index={oi + 1}
              label={opt.label}
              explanation={opt.explanation}
              selected={state?.selectedOption === oi}
              onSelect={() => onChange({
                selectedOption: oi,
                answer:         opt.label,
                meaningCode:    opt.meaning_code,
                accepted:       true,
              })}
            />
          ))}
        </div>
      )}

      {!isChoice && (
        <div className="space-y-3">
          {!isBlocking && question.recommended_answer && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name={`qa-${question.id ?? question.question.slice(0, 20)}`}
                checked={state?.accepted ?? true}
                onChange={() => onChange({ accepted: true, answer: question.recommended_answer! })}
                className="mt-1 accent-blue-600"
              />
              <span className="text-sm text-gray-800">
                <span className="text-xs font-medium text-gray-500 block mb-0.5">Recommended</span>
                {question.recommended_answer}
              </span>
            </label>
          )}
          {(!isBlocking && question.recommended_answer) && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name={`qa-${question.id ?? question.question.slice(0, 20)}`}
                checked={!(state?.accepted ?? true)}
                onChange={() => onChange({ accepted: false })}
                className="mt-1 accent-blue-600"
              />
              <div className="flex-1 text-sm text-gray-800">
                <span className="text-xs font-medium text-gray-500 block mb-1.5">Enter my own</span>
                {!(state?.accepted ?? true) && (
                  <textarea
                    rows={2}
                    placeholder="Your answer…"
                    value={state?.answer ?? ''}
                    onChange={e => onChange({ answer: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </div>
            </label>
          )}
          {(isBlocking || !question.recommended_answer) && (
            <textarea
              rows={2}
              placeholder="Your answer…"
              value={state?.answer ?? ''}
              onChange={e => onChange({ answer: e.target.value, accepted: true })}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 bg-white ${
                answered ? 'border-green-400 focus:ring-green-300' : 'border-red-300 focus:ring-red-200'
              }`}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── OptionCard ────────────────────────────────────────────────────────────────

function OptionCard({
  index,
  label,
  explanation,
  selected,
  onSelect,
}: {
  index:       number
  label:       string
  explanation: string
  selected:    boolean
  onSelect:    () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
        selected
          ? 'border-blue-600 bg-blue-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
        }`}>
          {index}
        </span>
        <div>
          <p className={`text-sm font-semibold ${selected ? 'text-blue-900' : 'text-gray-900'}`}>
            {label}
          </p>
          <p className={`text-sm mt-0.5 ${selected ? 'text-blue-700' : 'text-gray-600'}`}>
            {explanation}
          </p>
        </div>
      </div>
    </button>
  )
}

// ── Small components ──────────────────────────────────────────────────────────

function EntityRow({ type, name, warn }: { type: string; name: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500 w-28 shrink-0 uppercase tracking-wide">{type}</span>
        <span className={`text-sm font-medium ${warn ? 'text-amber-800 italic' : 'text-gray-900'}`}>{name}</span>
      </div>
      <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${
        warn
          ? 'bg-amber-100 text-amber-800 border border-amber-200'
          : 'bg-green-100 text-green-800'
      }`}>
        {warn ? 'Needs your input' : '✓ Auto-detected'}
      </span>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAnswered(q: ClarificationQuestion, state?: QaState): boolean {
  if (!state) return false
  if (q.type === 'choice' || q.type === 'policy_collapse') {
    return state.selectedOption !== undefined
  }
  return !!state.answer?.trim()
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

// IR v2: a dest_field is `metric.<METRIC_CODE>` (or `ignore`). Resolve it to the
// metric's display name via the supplied code→name map; fall back to the code.
function destFieldLabel(dest: string, metricNameByCode?: Map<string, string>): string {
  if (dest === 'ignore') return '(ignored)'
  if (dest.startsWith('metric.')) {
    const code = dest.slice('metric.'.length)
    return metricNameByCode?.get(code) ?? code.replace(/_/g, ' ')
  }
  return dest
}

function tagRoleLabel(role: string): string {
  switch (role) {
    case 'ADULT_SERVICE':  return 'Adult service'
    case 'KIDS_MINISTRY':  return 'Kids'
    case 'YOUTH_MINISTRY': return 'Youth'
    case 'OTHER':          return 'Other'
    default:               return role
  }
}

function reportingTagLabel(code: string): string {
  switch (code) {
    case 'ATTENDANCE':    return 'Attendance'
    case 'VOLUNTEERS':    return 'Volunteers'
    case 'GIVING':        return 'Giving'
    case 'RESPONSE_STAT': return 'Stats'
    default:              return code
  }
}

// ── ImportingPanel ────────────────────────────────────────────────────────────

const IMPORT_STAGES = [
  { label: 'Setting up your locations and services', start: 0 },
  { label: 'Creating service occurrences',           start: 5_000 },
  { label: 'Writing attendance records',             start: 12_000 },
  { label: 'Recording giving and volunteers',        start: 22_000 },
  { label: 'Finalising your church profile',         start: 35_000 },
]

function ImportingPanel() {
  const startedAt = useRef(Date.now())
  const [stage, setStage] = useState(0)
  const [tally, setTally] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      const next = IMPORT_STAGES.filter(s => elapsed >= s.start).length - 1
      setStage(Math.min(next, IMPORT_STAGES.length - 1))
      setTally(prev => prev + Math.floor(Math.random() * 4) + 3)
    }, 500)
    return () => clearInterval(id)
  }, [])

  const groups    = Math.floor(tally / 5)
  const remainder = tally % 5

  return (
    <div className="rounded-xl bg-gray-900 p-6 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Records written
        </p>
        <div className="flex flex-wrap items-end gap-3 min-h-[2rem]">
          {Array.from({ length: groups }).map((_, g) => (
            <ConfirmTallyGroup key={g} full />
          ))}
          {remainder > 0 && <ConfirmTallyGroup marks={remainder} />}
        </div>
        <p className="mt-2 text-xs text-gray-400">{tally} rows</p>
      </div>

      <div className="space-y-3">
        {IMPORT_STAGES.map((s, i) => {
          const done    = i < stage
          const current = i === stage
          const pending = i > stage
          return (
            <div key={i} className={`flex items-center gap-3 transition-opacity ${pending ? 'opacity-30' : ''}`}>
              <div className="shrink-0">
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
              <p className={`text-sm font-medium ${current ? 'text-white' : done ? 'text-gray-400' : 'text-gray-300'}`}>
                {s.label}
              </p>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">Writing your historical records — usually under a minute</p>
    </div>
  )
}

function ConfirmTallyGroup({ full = false, marks = 0 }: { full?: boolean; marks?: number }) {
  const count = full ? 5 : marks
  return (
    <div className="relative inline-flex items-center gap-[3px] h-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[2px] h-5 bg-gray-300 rounded-full" />
      ))}
      {full && (
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 24 20" preserveAspectRatio="none">
          <line x1="0" y1="20" x2="24" y2="0" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}
