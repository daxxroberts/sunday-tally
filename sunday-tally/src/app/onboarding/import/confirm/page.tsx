'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import AiExhaustedBanner from '@/components/AiExhaustedBanner'
import type { QaAnswer, AnomalyDecision, ConfirmedMapping } from '@/lib/import/stageB'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionOption {
  label:         string
  explanation:   string
  meaning_code?: string  // machine-routing semantics (e.g. M1/M2/M3, MAIN/KIDS/YOUTH)
}
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
  topic_group?:        'pattern_verification' | string  // V1.5-Δ1: pattern-confirmation questions
}
interface ProposedColumnMap {
  source_column: string
  dest_field:    string
  notes?:        string
}
interface TallFormatConfig {
  metric_name_column:  string
  value_column:        string
  audience_column?:    string
  group_type_column?:  string
  audience_map?:       Record<string, 'MAIN' | 'KIDS' | 'YOUTH'>
  area_field_map?:     Record<string, string>
}
interface ProposedSource {
  source_name:  string
  dest_table:   string
  date_column?: string
  date_format?: string
  column_map:   ProposedColumnMap[]
  notes?:       string
  tall_format?: TallFormatConfig
}
interface ProposedSetup {
  locations?:            Array<{ name: string; code?: string }>
  service_templates?:    Array<{ display_name: string; service_code?: string; primary_tag?: string; primary_tag_reasoning?: string }>
  giving_sources?:       Array<{ name: string }>
  volunteer_categories?: Array<{ name: string; audience_type?: string }>
  response_categories?:  Array<{ name: string; stat_scope?: string }>
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

// Per-question UI state (keyed by array index)
interface QaState {
  questionId?:     string  // id from clarification_questions; carried to qa_answers for the reconciler
  question:        string
  answer:          string
  accepted:        boolean
  selectedOption?: number   // for type="choice"
  meaningCode?:    string   // option.meaning_code at time of selection (machine-routing)
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function ConfirmMappingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading…</div>}>
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

  function setQa(i: number, patch: Partial<QaState>) {
    setQaStates(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s))
  }

  // Loop-back round: send Round-1 answers to Sonnet for follow-up evaluation.
  // If Sonnet decides 'proceed', we move on to confirm() (PATCH/Stage B).
  // If 'refine' or 'reclarify', append new questions and let user answer Round 2.
  async function submitOrRefine() {
    if (!jobId || !mapping) return
    if (round === 2) {
      // Already in Round 2 — skip refine, go straight to import.
      await confirm()
      return
    }
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
      if (!res.ok) {
        // Don't block the user on a Round-2 hiccup — fall through to import.
        await confirm()
        return
      }
      if (data.decision === 'proceed' || !data.new_questions || data.new_questions.length === 0) {
        await confirm()
        return
      }
      // Refine / reclarify — append new questions and bring user back to the form.
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
      // Scroll to the new questions
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
      const body: { job_id: string; confirmed_mapping: ConfirmedMapping } = {
        job_id: jobId,
        confirmed_mapping: {
          sources:        mapping.sources,
          proposed_setup: mapping.proposed_setup as Record<string, unknown> | undefined,
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

  // Guards
  if (!jobId)  return <div className="p-6 text-sm text-red-700">Missing job_id.</div>
  if (loading) return <div className="p-6 text-sm text-gray-600">Reviewing your data…</div>
  if (!mapping) return <div className="p-6 text-sm text-red-700">{error ?? 'No mapping available.'}</div>

  // ── Success ──
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
        <Link
          href="/dashboard"
          className="block w-full rounded-xl bg-gray-900 py-3 text-center text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          Go to your dashboard →
        </Link>
      </div>
    )
  }

  // Derive entity count for section 2 header
  const entityCount =
    (setup?.locations?.length ?? 0) +
    (setup?.service_templates?.length ?? 0) +
    (setup?.volunteer_categories?.length ?? 0) +
    (setup?.response_categories?.length ?? 0) +
    (setup?.giving_sources?.length ?? 0)

  const allDestFields = [
    ...mapping.sources.flatMap(s => s.column_map.map(c => c.dest_field)),
    ...mapping.sources.flatMap(s => Object.values(s.tall_format?.area_field_map ?? {})),
  ]
  const trackedCategories = [
    allDestFields.some(f => f?.startsWith('attendance'))  && 'Attendance',
    allDestFields.some(f => f?.startsWith('volunteer.'))  && 'Volunteers',
    allDestFields.some(f => f?.startsWith('response.'))   && 'Stats',
    allDestFields.some(f => f?.startsWith('giving.'))     && 'Giving',
  ].filter(Boolean) as string[]

  const blockingQs  = questions.filter(q => q.blocking)
  const optionalQs  = questions.filter(q => !q.blocking)
  const hasAnyQs    = questions.length > 0

  return (
    <div className="mx-auto max-w-3xl pb-16">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-base font-semibold text-gray-900">Review your import</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {hasBlockingUnanswered
            ? `Answer ${blockingQs.length} required ${blockingQs.length === 1 ? 'question' : 'questions'} before importing`
            : 'Everything looks good — confirm to import your data'}
        </p>
      </div>

      <div className="space-y-6 px-6 pt-6">

        {/* ══ SECTION 1: Quick metrics ══ */}
        <Section1QuickMetrics
          previewData={previewData}
          quickSummary={quickSummary}
          weeksObserved={mapping.weeks_observed}
          trackedCategories={trackedCategories}
          lowConfidenceNote={mapping.low_confidence_note}
        />

        {/* ══ SECTION 2: How your data is organised ══ */}
        <Section2DataOrganisation
          setup={setup}
          entityCount={entityCount}
          sources={mapping.sources}
          previewData={previewData}
          anomalies={mapping.anomalies}
          dashboardWarnings={mapping.dashboard_warnings}
        />

        {/* Round-2 banner: shown after refine returned new questions */}
        {round === 2 && round2Reason && (
          <div data-round-2-anchor className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Sonnet has follow-up questions based on your answers</p>
              <p className="mt-0.5 text-xs text-amber-800/80">{round2Reason}</p>
            </div>
          </div>
        )}

        {/* ══ SECTION 3: Decisions needed ══ */}
        {hasAnyQs && (
          <Section3Decisions
            blockingQs={blockingQs}
            optionalQs={optionalQs}
            allQuestions={questions}
            qaStates={qaStates}
            setQa={setQa}
          />
        )}

        {/* ── Footer ── */}
        {exhausted && (
          <AiExhaustedBanner onOverride={() => { setExhausted(false); confirm() }} />
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {refining ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
            <p className="text-sm font-medium text-gray-900">Reviewing your answers…</p>
            <p className="text-xs text-gray-500 text-center max-w-md">
              Sonnet is checking whether anything else needs clarification before we import.
            </p>
          </div>
        ) : submitting ? (
          <ImportingPanel />
        ) : (
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { window.location.href = '/onboarding/schedule' }}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={exhausted || hasBlockingUnanswered}
              onClick={submitOrRefine}
              title={hasBlockingUnanswered ? 'Answer required questions above to continue' : undefined}
              className="flex-[3] rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
  // Derive attendance averages from Sonnet's monthly_attendance (AI computed, format-agnostic)
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

  // Only show the section if we have something meaningful
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

  if (avgMain  != null) kpiCards.push({ label: 'Avg adults / Sunday',    value: avgMain.toLocaleString() })
  if (avgKids  != null) kpiCards.push({ label: 'Avg kids / Sunday',      value: avgKids.toLocaleString() })
  if (avgYouth != null) kpiCards.push({ label: 'Avg students / Sunday',  value: avgYouth.toLocaleString() })

  if (quickSummary?.avg_volunteers_per_sunday != null) {
    kpiCards.push({ label: 'Avg volunteers / Sunday', value: Math.round(quickSummary.avg_volunteers_per_sunday).toLocaleString() })
  }
  if (quickSummary?.total_response_count != null) {
    kpiCards.push({ label: 'Total stats tracked', value: Math.round(quickSummary.total_response_count).toLocaleString() })
  }
  if (quickSummary?.total_giving_amount != null) {
    kpiCards.push({
      label: 'Total giving',
      value: `$${Math.round(quickSummary.total_giving_amount).toLocaleString()}`,
    })
  }

  // Cap at 6
  const visible = kpiCards.slice(0, 6)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">What we found in your data</h2>
        {trackedCategories.length > 0 && (
          <p className="mt-0.5 text-xs text-gray-500">
            Tracking: {trackedCategories.join(' · ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((card, i) => (
          <div key={i} className="rounded-xl bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{card.label}</p>
            <p className="mt-1.5 text-3xl font-semibold text-gray-900">{card.value}</p>
            {card.sub && <p className="mt-0.5 text-xs text-gray-400">{card.sub}</p>}
          </div>
        ))}
      </div>

      {lowConf && (
        <p className="mt-4 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          {lowConfidenceNote ?? 'Less than 12 weeks of data — patterns may not be representative.'}
        </p>
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
  const mappingCount = sources.reduce((n, s) => {
    const colCount = s.column_map.filter(c => c.dest_field !== 'ignore').length
    const mapCount = Object.keys(s.tall_format?.area_field_map ?? {}).length
    return n + colCount + mapCount
  }, 0)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">How your data is organised</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          {entityCount} setup items · {mappingCount} metrics mapped
        </p>
      </div>

      {/* Entity table */}
      {setup && (entityCount > 0) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            What we detected
          </p>
          <div className="divide-y divide-gray-50">
            {setup.locations?.map((l, i) => (
              <EntityRow key={`loc-${i}`} type="Location" name={l.name} />
            ))}
            {setup.service_templates?.map((t, i) => (
              <EntityRow key={`tmpl-${i}`} type="Service" name={t.display_name === '[BLOCKING]' ? '(name needed)' : t.display_name} warn={t.display_name === '[BLOCKING]'} />
            ))}
            {setup.volunteer_categories?.map((v, i) => (
              <EntityRow key={`vol-${i}`} type="Volunteer role" name={v.name} />
            ))}
            {setup.response_categories?.map((r, i) => (
              <EntityRow key={`resp-${i}`} type="Stat" name={r.name} />
            ))}
            {setup.giving_sources?.map((g, i) => (
              <EntityRow key={`give-${i}`} type="Giving method" name={g.name} />
            ))}
          </div>
        </div>
      )}

      {/* Monthly attendance chart */}
      {previewData && previewData.monthly_attendance.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Monthly attendance
          </p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={previewData.monthly_attendance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" fontSize={10} tick={{ fill: '#9ca3af' }} interval="preserveStartEnd" />
                <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="main"  name="Main"     stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="kids"  name="Kids"     stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="youth" name="Students" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {previewData.note && (
            <p className="mt-2 text-xs text-gray-400">{previewData.note}</p>
          )}
        </div>
      ) : previewData === null ? (
        <p className="text-xs text-gray-400 italic">
          Trend chart will appear after import — not enough monthly data to preview.
        </p>
      ) : null}

      {/* Mapping table */}
      {sources.some(s => s.tall_format?.area_field_map && Object.keys(s.tall_format.area_field_map).length > 0) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            How your metrics are mapped
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                  <th className="pb-2 pr-4 font-medium">Your data</th>
                  <th className="pb-2 pr-4 font-medium">Goes to</th>
                  <th className="pb-2 font-medium text-right">Audience</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sources.flatMap(s =>
                  Object.entries(s.tall_format?.area_field_map ?? {}).map(([key, dest], i) => (
                    <tr key={`${s.source_name}-${i}`}>
                      <td className="py-2 pr-4 font-mono text-xs text-gray-600">{key}</td>
                      <td className="py-2 pr-4 text-xs text-gray-700">{destFieldLabel(dest)}</td>
                      <td className="py-2 text-xs text-gray-400 text-right">{audienceLabel(key)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anomalies */}
      {anomalies && anomalies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Heads up</p>
          {anomalies.map((a, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <span className="text-xs font-semibold text-amber-700 uppercase">{a.kind}</span>
              <p className="mt-0.5 text-sm text-gray-800">{a.description}</p>
            </div>
          ))}
        </div>
      )}

      {dashboardWarnings && dashboardWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900 mb-1">Dashboard notes</p>
          <ul className="space-y-0.5 text-sm text-amber-800">
            {dashboardWarnings.map((w, i) => <li key={i}>• {w}</li>)}
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
  // V1.5: Pattern-verification questions render in their own section at the top.
  // Routing questions (everything else) keep the existing required/optional split.
  const isPatternQ = (q: ClarificationQuestion) => q.topic_group === 'pattern_verification'
  const patternBlockingCount = blockingQs.filter(isPatternQ).length
  const patternTotalCount    = allQuestions.filter(isPatternQ).length
  const routingBlockingCount = blockingQs.filter(q => !isPatternQ(q)).length
  const routingOptionalCount = optionalQs.filter(q => !isPatternQ(q)).length

  return (
    <div className="space-y-4">

      {/* Pattern Verification — V1.5-Δ1 */}
      {patternTotalCount > 0 && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/80">
              Step 1 · Verify what we found
            </p>
            <h2 className="mt-1 text-base font-semibold text-gray-900">Confirm the pattern in your data</h2>
            <p className="mt-0.5 text-xs text-gray-600">
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

      {/* Routing decisions — existing flow */}
      {(routingBlockingCount > 0 || routingOptionalCount > 0) && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {patternTotalCount > 0 ? 'Step 2 · ' : ''}A few decisions to make
            </p>
            <h2 className="mt-1 text-base font-semibold text-gray-900">How should we set this up?</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {routingBlockingCount > 0
                ? `${routingBlockingCount} required · ${routingOptionalCount} optional`
                : `${routingOptionalCount} optional — accept or override the AI suggestion`}
            </p>
          </div>

          {/* Required (routing only) */}
          {routingBlockingCount > 0 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
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

          {/* Optional (routing only) */}
          {routingOptionalCount > 0 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
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
  const answered = state ? isAnswered(question, state) : false
  const isChoice = (question.type === 'choice' || question.type === 'policy_collapse') && question.options && question.options.length > 0
  const isBlocking = question.blocking ?? false

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 transition-colors ${
      isBlocking
        ? answered ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
        : 'border-gray-100 bg-gray-50'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {question.title && (
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {question.title}
            </p>
          )}
          {question.context && (
            <p className="text-sm text-gray-500">{question.context}</p>
          )}
          <p className="text-sm font-medium text-gray-900">{question.question}</p>
        </div>
        {isBlocking && (
          answered
            ? <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Answered</span>
            : <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Required</span>
        )}
      </div>

      {question.why && !isChoice && (
        <p className="text-xs text-gray-400">Why this matters: {question.why}</p>
      )}

      {/* Choice options — OptionCard layout */}
      {isChoice && question.options && (
        <div className="space-y-2 pt-1">
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
                meaningCode:    opt.meaning_code,  // capture machine-routing code (M1/M2/M3, MAIN/KIDS/YOUTH)
                accepted:       true,
              })}
            />
          ))}
        </div>
      )}

      {/* Text input — for type="text" or non-choice optional */}
      {!isChoice && (
        <div className="space-y-2">
          {/* Optional recommendation radio */}
          {!isBlocking && question.recommended_answer && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name={`qa-${question.id ?? question.question.slice(0, 20)}`}
                checked={state?.accepted ?? true}
                onChange={() => onChange({ accepted: true, answer: question.recommended_answer! })}
                className="mt-0.5 accent-blue-600"
              />
              <span className="text-sm text-gray-700">
                <span className="text-xs text-gray-400 block mb-0.5">Recommended</span>
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
                className="mt-0.5 accent-blue-600"
              />
              <div className="flex-1 text-sm text-gray-700">
                <span className="text-xs text-gray-400 block mb-1">Enter my own</span>
                {!(state?.accepted ?? true) && (
                  <textarea
                    rows={2}
                    placeholder="Your answer…"
                    value={state?.answer ?? ''}
                    onChange={e => onChange({ answer: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                  />
                )}
              </div>
            </label>
          )}
          {/* Blocking or no recommendation — just a text area */}
          {(isBlocking || !question.recommended_answer) && (
            <textarea
              rows={2}
              placeholder="Your answer…"
              value={state?.answer ?? ''}
              onChange={e => onChange({ answer: e.target.value, accepted: true })}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white ${
                answered ? 'border-green-300 focus:ring-green-200' : 'border-red-300 focus:ring-red-200'
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
      className={`w-full text-left rounded-xl border-2 p-4 transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          selected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
        }`}>
          {index}
        </span>
        <div>
          <p className={`text-sm font-semibold ${selected ? 'text-blue-900' : 'text-gray-900'}`}>
            {label}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{explanation}</p>
        </div>
      </div>
    </button>
  )
}

// ── Small components ──────────────────────────────────────────────────────────

function EntityRow({ type, name, warn }: { type: string; name: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 w-28 shrink-0">{type}</span>
        <span className={`text-sm ${warn ? 'text-amber-700 italic' : 'text-gray-900'}`}>{name}</span>
      </div>
      <span className={`text-xs rounded-full px-2 py-0.5 ${
        warn
          ? 'bg-amber-100 text-amber-700'
          : 'bg-green-50 text-green-700'
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

function destFieldLabel(dest: string): string {
  if (dest === 'attendance' || dest.startsWith('attendance.')) {
    const part = dest.split('.')[1]
    return part === 'kids' ? 'Kids attendance' : part === 'youth' ? 'Youth attendance' : 'Main attendance'
  }
  if (dest.startsWith('volunteer.')) return `${dest.slice('volunteer.'.length).replace(/_/g, ' ')} volunteers`
  if (dest.startsWith('response.'))  return dest.slice('response.'.length).replace(/_/g, ' ')
  if (dest.startsWith('giving.'))    return `${dest.slice('giving.'.length).replace(/_/g, ' ')} giving`
  if (dest === 'ignore') return '(ignored)'
  return dest
}

function audienceLabel(key: string): string {
  const k = key.toLowerCase()
  if (k.includes('kids') || k.includes('children') || k.includes('lifekids')) return 'Kids'
  if (k.includes('youth') || k.includes('student') || k.includes('switch')) return 'Students'
  if (k.includes('adult') || k.includes('experience') || k.includes('main')) return 'Main'
  return '—'
}

// ── ImportingPanel — shown during Stage B ─────────────────────────────────────

const IMPORT_STAGES = [
  { label: 'Setting up your locations and services', start: 0 },
  { label: 'Creating service occurrences',           start: 5_000 },
  { label: 'Writing attendance records',             start: 12_000 },
  { label: 'Recording giving and volunteers',        start: 22_000 },
  { label: 'Finalising your church profile',         start: 35_000 },
]

function ImportingPanel() {
  const startedAt = useRef(Date.now())
  const [stage,  setStage]  = useState(0)
  const [tally,  setTally]  = useState(0)

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
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-3">
          Records written
        </p>
        <div className="flex flex-wrap items-end gap-3 min-h-[2rem]">
          {Array.from({ length: groups }).map((_, g) => (
            <ConfirmTallyGroup key={g} full />
          ))}
          {remainder > 0 && <ConfirmTallyGroup marks={remainder} />}
        </div>
        <p className="mt-2 text-xs text-blue-400">{tally} rows</p>
      </div>

      <div className="space-y-2">
        {IMPORT_STAGES.map((s, i) => {
          const done    = i < stage
          const current = i === stage
          const pending = i > stage
          return (
            <div key={i} className={`flex items-center gap-3 transition-opacity ${pending ? 'opacity-30' : ''}`}>
              <div className="shrink-0">
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
              <p className={`text-sm ${current ? 'font-semibold text-gray-900' : done ? 'text-gray-500' : 'text-gray-400'}`}>
                {s.label}
              </p>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-blue-400">Writing your historical records — usually under a minute</p>
    </div>
  )
}

function ConfirmTallyGroup({ full = false, marks = 0 }: { full?: boolean; marks?: number }) {
  const count = full ? 5 : marks
  return (
    <div className="relative inline-flex items-center gap-[3px] h-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[2px] h-5 bg-blue-500 rounded-full" />
      ))}
      {full && (
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 24 20" preserveAspectRatio="none">
          <line x1="0" y1="20" x2="24" y2="0" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}
