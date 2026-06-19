'use client'

import { Suspense, useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PreviewGrid } from './PreviewGrid'
import { applyPatchOp } from '@/lib/import/apply_patch_op'
import type { PatchOp, ProposedSetup } from '@/lib/import/stageA_validate'
import { renderMarkdown, parseAssistantOptions } from '@/lib/import/walkthrough_ui'
import { QuestionCard, type Clarification } from './components/QuestionCard'
import { BudgetExhaustedModal } from './components/BudgetExhaustedModal'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
}

/** Per-answer record assembled into the qa_answers handed to the server. */
interface AnswerRecord {
  id:        string
  question:  string
  /** Human label the user clicked / typed. */
  answer:    string
  /** Machine value flowed to the patch (the chosen role / reporting code / etc.). */
  value:     string
  patch_op?: PatchOp
}

/** The walkthrough's in-flight mapping. Loosely typed (it carries fields the
 *  preview/chat layers own), but its `proposed_setup` is the IR v2 ProposedSetup
 *  that the shared applier mutates. */
interface WorkingMapping {
  sources?:                 unknown[]
  proposed_setup?:          ProposedSetup
  clarification_questions?: unknown[]
  preview_sample?:          unknown
  anomalies?:               Array<{ kind: string; description: string }>
  [key: string]: unknown
}

type WalkthroughMode = 'intro' | 'walking' | 'checkpoint' | 'done' | 'all'

/**
 * Apply a clarification's patch to the working mapping (no AI roundtrip) so the
 * grid updates instantly. Clones the mapping, then delegates to the SHARED
 * `applyPatchOp` (apply_patch_op.ts) which mutates `proposed_setup` IN PLACE —
 * the exact same applier server-side `reconcile_answers` uses, so client preview
 * and server reconcile never diverge.
 *
 * Missing patch_op / unknown id → no-op (the shared applier logs and returns);
 * the answer is still recorded for the halfway AI checkpoint.
 */
function applyMappingPatch(
  mapping: WorkingMapping | null,
  op: PatchOp | undefined,
  answerValue: string,
): WorkingMapping | null {
  if (!mapping) return mapping
  const next = JSON.parse(JSON.stringify(mapping)) as WorkingMapping
  if (!next.proposed_setup) next.proposed_setup = {}
  // Shared applier mutates proposed_setup in place; returns void.
  applyPatchOp(next.proposed_setup, op, answerValue)
  return next
}

/**
 * EMAIL_POLICY #13 (D-099) — detect the trial AI-import budget-exhausted signal.
 * The import routes return HTTP 402 with body { error: 'ai_budget_exhausted' }
 * when the $1.00 trial setup budget hits zero mid-import. We check both signals
 * so a single helper covers every client call site (chat, Stage A, Stage B).
 */
function isBudgetExhausted(res: Response, data: unknown): boolean {
  return res.status === 402 || (data as { error?: string } | null)?.error === 'ai_budget_exhausted'
}

export default function ReviewOnboardingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
      <ReviewOnboardingInner />
    </Suspense>
  )
}

function ReviewOnboardingInner() {
  const searchParams = useSearchParams()
  const jobId = searchParams.get('job_id')

  const [currentMapping, setCurrentMapping] = useState<WorkingMapping | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  // Mobile/tablet: which pane is visible
  const [activePane, setActivePane] = useState<'grid' | 'chat'>('grid')

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatStatus, setChatStatus] = useState<'ready' | 'sending'>('ready')
  const [chatError, setChatError] = useState<string | null>(null)

  // EMAIL_POLICY #13 (D-099): the trial AI-import budget is exhausted. Surfaced
  // as an IN-APP pop-up (not an email) whenever any import-flow fetch returns the
  // 402 / { error: 'ai_budget_exhausted' } signal. Single flag drives the modal
  // from all three call sites (chat send, Stage A load, Stage B confirm).
  const [budgetExhausted, setBudgetExhausted] = useState(false)

  // ── Resizable chat panel width (desktop only) ─────────────────────────
  // Persisted in localStorage so the user's choice carries between sessions.
  // Bounded to a sensible range so the user can't accidentally collapse one side.
  const [chatWidth, setChatWidth] = useState<number>(380)
  const dragStartXRef = useRef<{ x: number; startWidth: number } | null>(null)
  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('sundaytally_chat_width')
    if (saved) {
      const n = parseInt(saved, 10)
      if (Number.isFinite(n) && n >= 300 && n <= 800) setChatWidth(n)
    }
  }, [])
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragStartXRef.current = { x: e.clientX, startWidth: chatWidth }
    const onMove = (ev: MouseEvent) => {
      if (!dragStartXRef.current) return
      // Drag handle sits between grid (left) and chat (right) — moving the
      // mouse RIGHT shrinks the chat; moving LEFT grows it.
      const dx = dragStartXRef.current.x - ev.clientX
      const next = Math.max(300, Math.min(800, dragStartXRef.current.startWidth + dx))
      setChatWidth(next)
    }
    const onUp = () => {
      dragStartXRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      try { localStorage.setItem('sundaytally_chat_width', String(chatWidthRef.current)) } catch {}
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  // Track latest width in a ref so the cleanup handler can persist it without stale closure
  const chatWidthRef = useRef(chatWidth)
  useEffect(() => { chatWidthRef.current = chatWidth }, [chatWidth])
  // Viewport tracker — only apply the custom width on desktop. Avoids SSR/CSR mismatch.
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Walkthrough state ────────────────────────────────────────────────────
  const [walkthroughMode, setWalkthroughMode] = useState<WalkthroughMode>('intro')
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  /** id → answer label (for user-visible recap) */
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, string>>({})
  /** id → the structured record fed to server reconcile (qa_answers). Carries the
   *  machine `value` and the `patch_op` so reconcile_answers applies the IDENTICAL
   *  mutation server-side via the shared applyPatchOp. */
  const [answerRecords, setAnswerRecords] = useState<Record<string, AnswerRecord>>({})
  /** Most recently answered question id — used to spotlight the just-finished check
   *  with a one-shot pop/glow animation. Cleared after a short window so the next
   *  answer takes the spotlight cleanly. */
  const [lastAnsweredId, setLastAnsweredId] = useState<string | null>(null)
  /** Halfway AI checkpoint fires exactly once per walkthrough. */
  const halfwayCheckpointFired = useRef(false)
  /** Tracks where to resume the walkthrough after the user clicks Continue
   *  on the checkpoint card. Captured at the moment we pause. */
  const checkpointResumeIdx = useRef(0)
  /** AI's checkpoint review text, displayed inline on the checkpoint card. */
  const [checkpointText, setCheckpointText] = useState<string | null>(null)
  const [checkpointLoading, setCheckpointLoading] = useState(false)

  // Pull clarification list from current mapping (with normalized shape)
  const clarifications: Clarification[] = useMemo(() => {
    if (!currentMapping) return []
    const raw = (currentMapping.clarification_questions ?? []) as any[]
    return raw.map((q): Clarification => ({
      id:           q.id ?? `q_${Math.random().toString(36).slice(2, 8)}`,
      question:     q.question ?? q.prompt ?? q.text ?? '',
      visual_tree:  q.visual_tree ?? undefined,
      blocking:     !!q.blocking,
      options:      Array.isArray(q.options) ? q.options : undefined,
      patch_op:     q.patch_op ?? undefined,
    }))
  }, [currentMapping])

  const totalQuestions  = clarifications.length
  const answeredCount   = Object.keys(answeredQuestions).length
  // Every clarification must be answered before import. User explicitly chose to
  // treat optional questions as required so the import is as accurate as possible.
  const pendingCount    = clarifications.filter(q => !(q.id in answeredQuestions)).length
  const allAnswered     = answeredCount >= totalQuestions

  // True when the next unanswered question is already the active card on screen.
  // In that state the "Continue" button is redundant noise — the user can just
  // answer the card in front of them. We swap it for a soft hint.
  const nextUnansweredIdx = clarifications.findIndex(c => !(c.id in answeredQuestions))
  const stranded =
    pendingCount > 0 &&
    (walkthroughMode !== 'walking' || currentQuestionIdx !== nextUnansweredIdx)

  // Intro line shown as the first chat bubble (short, paced).
  const introText = useMemo<string>(() => {
    if (!currentMapping) return ''
    if (totalQuestions === 0) {
      return "Hi! I've taken a first pass at mapping your spreadsheet. The grid on the left shows how your data will be organized — take a look and click Confirm & Import when you're ready."
    }
    const blocking = clarifications.filter(q => q.blocking).length
    const optional = totalQuestions - blocking
    const parts: string[] = ["Hi! I've taken a first pass at mapping your spreadsheet."]
    if (blocking > 0 && optional > 0) {
      parts.push(`I have **${totalQuestions} questions** to walk through — ${blocking} required to start importing, and ${optional} that will help me get the rest right.`)
    } else if (blocking > 0) {
      parts.push(`I have **${blocking} question${blocking === 1 ? '' : 's'}** to walk through before we can import.`)
    } else {
      parts.push(`I have **${optional} question${optional === 1 ? '' : 's'}** that will help me get the mapping right. None of them block importing, but they'll improve accuracy.`)
    }
    parts.push("Ready when you are.")
    return parts.join('\n\n')
  }, [currentMapping, clarifications, totalQuestions])

  const [input, setInput] = useState('')

  const sendChatMessage = async (text: string) => {
    const userMsg: ChatMsg = { id: 'u_' + Date.now(), role: 'user', text }
    const nextMessages = [...chatMessages, userMsg]
    setChatMessages(nextMessages)
    setChatStatus('sending')
    setChatError(null)
    try {
      // List of questions still unanswered — sent to the AI so it can always
      // round off its reply by prompting the next pending one. Keeps the user
      // from getting stranded mid-walkthrough.
      const pendingQuestions = clarifications
        .filter(c => !(c.id in answeredQuestions))
        .map(c => ({ id: c.id, question: c.question, blocking: c.blocking }))
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, text: m.text })),
          jobId,
          currentMapping,
          pendingQuestions,
        }),
      })
      const data = await res.json()
      if (isBudgetExhausted(res, data)) {
        setBudgetExhausted(true)
        return
      }
      if (!res.ok) {
        const msg = data?.detail || data?.error || 'Chat request failed'
        setChatError(msg)
        setChatMessages([
          ...nextMessages,
          { id: 'a_' + Date.now(), role: 'assistant', text: `(${msg})` },
        ])
        return
      }
      const reply: ChatMsg = {
        id: 'a_' + Date.now(),
        role: 'assistant',
        text: data.text || '(no reply)',
      }
      setChatMessages([...nextMessages, reply])
      for (const tc of (data.toolCalls || []) as Array<{ toolName: string; input: any }>) {
        if (tc.toolName === 'update_mapping' && tc.input?.new_mapping) {
          // preview_sample is built from raw source data during Stage A — the chat
          // AI has no way to regenerate it, so we always pin the original value.
          setCurrentMapping((prev) => ({
            ...(tc.input.new_mapping as WorkingMapping),
            ...(prev?.preview_sample ? { preview_sample: prev.preview_sample } : {}),
          }))
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Chat request failed'
      setChatError(msg)
      setChatMessages([
        ...nextMessages,
        { id: 'a_' + Date.now(), role: 'assistant', text: `(${msg})` },
      ])
    } finally {
      setChatStatus('ready')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || chatStatus === 'sending') return
    const text = input
    setInput('')
    sendChatMessage(text)
  }

  /**
   * Answer the current walkthrough question. Applies the patch_op locally
   * (no AI roundtrip), records the answer for the recap UI, updates the grid
   * from local state, and advances to the next question. When the user reaches
   * the halfway mark, a single AI checkpoint reviews accumulated answers.
   */
  /**
   * Shared answer recorder for both the walkthrough and the all-at-once view.
   * Clones the mapping, applies the patch via the SHARED applier, and stores the
   * structured AnswerRecord (carrying value + patch_op) so server reconcile honors
   * the identical op.
   */
  const recordAnswer = (q: Clarification, answerLabel: string, answerValue: string) => {
    // Apply patch locally — grid re-renders from updated mapping immediately.
    setCurrentMapping(prev => applyMappingPatch(prev, q.patch_op, answerValue))
    setAnsweredQuestions(prev => ({ ...prev, [q.id]: answerLabel }))
    setAnswerRecords(prev => ({
      ...prev,
      [q.id]: {
        id:        q.id,
        question:  q.question,
        answer:    answerLabel,
        value:     answerValue,
        patch_op:  q.patch_op,
      },
    }))
    setLastAnsweredId(q.id)
  }

  const answerCurrentQuestion = async (answerLabel: string, answerValue: string) => {
    const q = clarifications[currentQuestionIdx]
    if (!q) return

    recordAnswer(q, answerLabel, answerValue)

    const total = clarifications.length
    const newAnsweredCount = Object.keys(answeredQuestions).length + 1
    const halfway = Math.ceil(total / 2)

    // ── Halfway AI checkpoint ──
    // PAUSE the walkthrough (don't advance index) and switch to checkpoint mode.
    // The checkpoint card is a visible inline review — the AI looks at the
    // accumulated answers + current mapping and tells the user whether anything
    // needs adjustment before continuing. Fires exactly once per walkthrough.
    if (total >= 3 && newAnsweredCount === halfway && !halfwayCheckpointFired.current) {
      halfwayCheckpointFired.current = true
      checkpointResumeIdx.current = Math.min(currentQuestionIdx + 1, total - 1)
      setWalkthroughMode('checkpoint')
      // Kick off the AI review (fires asynchronously; result lands in checkpointText)
      runCheckpointReview({ ...answeredQuestions, [q.id]: answerLabel })
      return
    }

    // Normal advance
    if (currentQuestionIdx < total - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1)
    } else {
      setWalkthroughMode('done')
    }
  }

  /**
   * Calls the chat API with a focused "review my answers" prompt. The response
   * text is displayed on the checkpoint card so the user can read it before
   * clicking Continue to resume the walkthrough.
   */
  const runCheckpointReview = async (accumulated: Record<string, string>) => {
    setCheckpointLoading(true)
    setCheckpointText(null)
    try {
      const summary = clarifications
        .filter(c => accumulated[c.id])
        .map((c, i) => `${i + 1}. ${c.question}\n   → ${accumulated[c.id]}`)
        .join('\n\n')
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            text:
              `(Halfway checkpoint — internal walkthrough event, not a user message.)\n\n` +
              `I've answered the first half of the clarification questions. Please review my ` +
              `answers below against the current mapping and tell me if anything looks off ` +
              `or worth adjusting before I continue. Be specific — call out which answer might ` +
              `cause a downstream issue. If everything looks consistent, just say "Looks good, ` +
              `ready to continue." Do NOT ask follow-up questions or propose new clarifications. ` +
              `Do NOT prompt me with another question — the walkthrough already has its own queue.\n\n` +
              `Answers so far:\n${summary}`,
          }],
          jobId,
          currentMapping,
          pendingQuestions: clarifications
            .filter(c => !(c.id in accumulated))
            .map(c => ({ id: c.id, question: c.question, blocking: c.blocking })),
        }),
      })
      const data = await res.json()
      setCheckpointText(data.text || '(no review text returned)')
    } catch (err: any) {
      setCheckpointText(`(Checkpoint review failed: ${err?.message || 'unknown error'}. You can continue without the review.)`)
    } finally {
      setCheckpointLoading(false)
    }
  }

  const continueAfterCheckpoint = () => {
    setWalkthroughMode('walking')
    setCurrentQuestionIdx(checkpointResumeIdx.current)
  }

  const goToPreviousQuestion = () => {
    if (currentQuestionIdx > 0) {
      setCurrentQuestionIdx(currentQuestionIdx - 1)
      if (walkthroughMode === 'done') setWalkthroughMode('walking')
    }
  }

  const startWalkthrough = () => {
    setWalkthroughMode('walking')
    setCurrentQuestionIdx(0)
  }

  const showAllQuestions = () => {
    setWalkthroughMode('all')
  }

  useEffect(() => {
    if (!jobId) return
    fetch(`/api/onboarding/import?job_id=${jobId}`)
      .then(async (r) => {
        const b = await r.json()
        if (isBudgetExhausted(r, b)) {
          setBudgetExhausted(true)
          return
        }
        setCurrentMapping(b.job?.proposed_mapping)
      })
      .finally(() => setLoading(false))
  }, [jobId])

  if (!jobId) {
    return <div className="p-8 text-sm text-red-700 font-medium">Missing job_id.</div>
  }

  const handleConfirm = async () => {
    if (!jobId || !currentMapping) return
    setSubmitting(true)
    setError(null)
    try {
      // Build qa_answers from the recorded walkthrough answers. Each carries the
      // machine `value` and (when present) the `patch_op`, so server-side
      // reconcile_answers replays the IDENTICAL mutation through the shared
      // applyPatchOp. The client already applied these to currentMapping.proposed_setup,
      // but we still send them so the server is authoritative and idempotent.
      const qaAnswers = Object.values(answerRecords).map(r => ({
        id:       r.id,
        question: r.question,
        answer:   r.answer,
        accepted: true,
        value:    r.value,
        patch_op: r.patch_op,
      }))

      const body = {
        job_id: jobId,
        confirmed_mapping: {
          sources: currentMapping.sources,
          proposed_setup: currentMapping.proposed_setup,
          qa_answers: qaAnswers,
          anomaly_decisions: (currentMapping.anomalies ?? []).map((a) => ({
            kind: a.kind,
            description: a.description,
            decision: 'keep',
          })),
        },
      }
      const res = await fetch('/api/onboarding/import', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (isBudgetExhausted(res, data)) {
        setBudgetExhausted(true)
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        setError(data.error || data.detail || 'Import failed')
        setSubmitting(false)
        return
      }
      // Import complete — clear saved form state so the next import starts fresh
      sessionStorage.removeItem('sundaytally_import_form')
      setImportResult(data.result)
    } catch (e: any) {
      setError(e.message || 'Import failed')
      setSubmitting(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (importResult) {
    const occurrences = importResult.rowsInserted?.occurrences
    const attendance = importResult.rowsInserted?.attendance
    return (
      <div className="flex min-h-screen w-full bg-gray-50 items-center justify-center px-4 py-8">
        <div className="mx-auto max-w-sm w-full space-y-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Your data has been imported</h1>
            <p className="mt-1 text-sm text-gray-500">Sunday Tally is ready with your historical data.</p>
          </div>
          {(occurrences != null || attendance != null) && (
            <div className="grid grid-cols-2 gap-3">
              {occurrences != null && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{occurrences}</p>
                  <p className="mt-0.5 text-xs text-gray-500">Services imported</p>
                </div>
              )}
              {attendance != null && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{attendance}</p>
                  <p className="mt-0.5 text-xs text-gray-500">Records imported</p>
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
      </div>
    )
  }

  // ── Main two-pane layout ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-50 overflow-hidden">

      {/* EMAIL_POLICY #13 (D-099): trial AI-import budget exhausted → IN-APP pop-up
          (not an email). Shown when any import-flow fetch returns 402 /
          { error: 'ai_budget_exhausted' }. DS-1 brand #4F6EF7 CTA; DS-2 no red. */}
      {budgetExhausted && (
        <BudgetExhaustedModal onClose={() => setBudgetExhausted(false)} />
      )}


      {/* ── Mobile/Tablet pane switcher (hidden on wide desktop) ── */}
      <div className="flex-shrink-0 flex lg:hidden bg-white border-b border-gray-200">
        <button
          onClick={() => setActivePane('grid')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors border-b-2 ${
            activePane === 'grid'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-400'
          }`}
        >
          Data Grid
        </button>
        <button
          onClick={() => setActivePane('chat')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors border-b-2 ${
            activePane === 'chat'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-400'
          }`}
        >
          AI Assistant
        </button>
      </div>

      {/* ── Panes ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT: Data Grid */}
        <div className={`
          ${activePane === 'grid' ? 'flex' : 'hidden'} lg:flex
          flex-col flex-1 min-w-0 border-r border-gray-200 bg-white
        `}>
          {/* Header */}
          <div className="flex-shrink-0 h-12 border-b border-gray-200 px-4 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-bold text-gray-900">Data Preview</h1>
              <span className="hidden sm:inline text-[10px] font-semibold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-full">Live Mapping</span>
            </div>
            <Link href="/onboarding/import" className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors">
              ← Back
            </Link>
          </div>

          {/* Grid */}
          <div className="flex-1 min-h-0 bg-gray-50 flex flex-col p-2 sm:p-4">
            {loading ? (
              <div className="flex items-center justify-center flex-1">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Mapping</span>
                </div>
                {currentMapping?.proposed_setup ? (
                  <PreviewGrid
                    proposedSetup={currentMapping.proposed_setup}
                    previewSample={(currentMapping.preview_sample as React.ComponentProps<typeof PreviewGrid>['previewSample']) ?? null}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                    No mapping data available
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drag handle between grid pane and chat pane — desktop only.
            1px gray line; on hover or active drag, a 3px brighter accent shows.
            Cursor flips to col-resize so it's obvious you can drag it. */}
        <div
          className="hidden lg:block flex-shrink-0 w-1 bg-gray-200 hover:bg-blue-400 hover:w-1.5 active:bg-blue-500 cursor-col-resize transition-all relative group"
          onMouseDown={onResizeStart}
          title="Drag to resize chat panel"
        >
          {/* Wider invisible hit-area so the handle is easy to grab even at 1px wide */}
          <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        </div>

        {/* RIGHT: AI Chat */}
        <div
          className={`
            ${activePane === 'chat' ? 'flex' : 'hidden'} lg:flex
            flex-col bg-gray-900 text-white flex-shrink-0
            w-full
          `}
          style={isDesktop ? { width: `${chatWidth}px` } : undefined}
        >
          {/* Header — includes a progress bar across the bottom edge when the
              walkthrough is in flight, so users get a satisfying sense of progress
              with every answer instead of just per-card recap. */}
          <div className="flex-shrink-0 h-12 border-b border-gray-800 px-4 flex flex-col justify-center relative">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)] animate-pulse" />
              <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-300">Data Assistant</h2>
              {totalQuestions > 0 && (
                <span className="ml-auto text-[10px] text-gray-400">
                  <span className="text-emerald-400 font-semibold">{answeredCount}</span>
                  <span className="text-gray-500"> / {totalQuestions} answered</span>
                </span>
              )}
            </div>
            {totalQuestions > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
                />
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {introText && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed bg-gray-800 text-gray-100 border border-gray-700/60 rounded-bl-sm space-y-0">
                  {renderMarkdown(introText)}
                </div>
              </div>
            )}

            {/* Intro: "Let's go" / "Show all" buttons */}
            {walkthroughMode === 'intro' && totalQuestions > 0 && (
              <div className="flex justify-start">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={startWalkthrough}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-semibold text-white text-left transition-colors"
                  >
                    Let's walk through them →
                  </button>
                  <button
                    onClick={showAllQuestions}
                    className="rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700/60 px-3 py-2 text-xs font-medium text-gray-200 text-left transition-colors"
                  >
                    Show me all at once
                  </button>
                </div>
              </div>
            )}

            {/* Recap of answered questions — green checkmark + emerald tint to give
                a sense of progress and satisfaction. Click to re-open and change. */}
            {(walkthroughMode === 'walking' || walkthroughMode === 'done') &&
              clarifications.slice(0, walkthroughMode === 'done' ? clarifications.length : currentQuestionIdx).map((q, idx) => {
                const answer = answeredQuestions[q.id]
                if (!answer) return null
                return (
                  <div key={q.id} className="flex justify-start">
                    <button
                      onClick={() => setCurrentQuestionIdx(idx)}
                      className="max-w-[88%] rounded-xl px-3 py-2 text-xs bg-emerald-950/40 border border-emerald-700/40 text-left hover:bg-emerald-900/40 hover:border-emerald-600/50 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {/* Most-recently-answered card plays a pop + glow ring once.
                            Earlier cards just show the static checkmark — keeps the
                            spotlight on the latest action without constant motion. */}
                        <span
                          className={[
                            'inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-emerald-950',
                            q.id === lastAnsweredId ? 'animate-check-pop animate-check-ring' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 6.5L5 9l4.5-5.5" />
                          </svg>
                        </span>
                        <span className="text-emerald-300 text-[10px] font-semibold uppercase tracking-wider">
                          Question {idx + 1} answered
                        </span>
                        <span className="ml-auto text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to change
                        </span>
                      </div>
                      <div className="text-gray-400 line-clamp-1 text-[10.5px]">{q.question}</div>
                      <div className="text-gray-100 font-medium mt-1 line-clamp-2">{answer}</div>
                    </button>
                  </div>
                )
              })}

            {/* Active question card (one-at-a-time walkthrough) */}
            {walkthroughMode === 'walking' && clarifications[currentQuestionIdx] && (
              <QuestionCard
                question={clarifications[currentQuestionIdx]}
                index={currentQuestionIdx}
                total={totalQuestions}
                onAnswer={answerCurrentQuestion}
                onBack={currentQuestionIdx > 0 ? goToPreviousQuestion : undefined}
                disabled={chatStatus === 'sending'}
                previousAnswer={answeredQuestions[clarifications[currentQuestionIdx].id]}
              />
            )}

            {/* Halfway checkpoint — paused state where the AI reviews answers
                so far and tells the user if anything looks off. Replaces the
                previous silent chat-message approach so the review is visible. */}
            {walkthroughMode === 'checkpoint' && (
              <div className="flex justify-start">
                <div className="max-w-[88%] w-full rounded-xl px-3 py-3 bg-amber-950/40 text-amber-50 border border-amber-700/40 rounded-bl-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                      Halfway checkpoint
                    </span>
                    <span className="text-amber-200/70 text-[10px]">
                      {answeredCount} of {totalQuestions} answered
                    </span>
                  </div>
                  {checkpointLoading ? (
                    <div className="text-xs text-amber-200 flex items-center gap-2">
                      <span className="inline-flex gap-1">
                        <span className="animate-bounce">·</span>
                        <span className="animate-bounce [animation-delay:150ms]">·</span>
                        <span className="animate-bounce [animation-delay:300ms]">·</span>
                      </span>
                      Reviewing your answers against the current mapping…
                    </div>
                  ) : (
                    <div className="text-xs text-amber-50 leading-relaxed">
                      {checkpointText ? renderMarkdown(checkpointText) : 'Review complete.'}
                    </div>
                  )}
                  <button
                    onClick={continueAfterCheckpoint}
                    disabled={checkpointLoading}
                    className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-amber-800 disabled:opacity-50 text-amber-950 disabled:text-amber-200 px-3 py-2 text-xs font-bold transition-colors"
                  >
                    {checkpointLoading ? 'Reviewing…' : '→ Continue to remaining questions'}
                  </button>
                </div>
              </div>
            )}

            {/* All-at-once mode */}
            {walkthroughMode === 'all' && clarifications.map((q, idx) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={idx}
                total={totalQuestions}
                onAnswer={(label, value) => recordAnswer(q, label, value)}
                disabled={false}
                previousAnswer={answeredQuestions[q.id]}
              />
            ))}

            {/* Done message */}
            {walkthroughMode === 'done' && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed bg-emerald-950/60 text-emerald-100 border border-emerald-800/60 rounded-bl-sm">
                  All set ✓ The grid on the left reflects your answers. Click <strong>Confirm & Import</strong> when ready, or ask me to change anything else.
                </div>
              </div>
            )}

            {/* Free-form chat messages (after walkthrough or when user types) */}
            {chatMessages.filter(m => !m.text.startsWith('Q[')).map((m, _, arr) => {
              const isUser = m.role === 'user'
              const parsed = isUser ? { prose: m.text, options: [] } : parseAssistantOptions(m.text)
              // Buttons only on the LATEST assistant message — earlier ones shouldn't
              // be re-clickable (the conversation has moved on).
              const lastAssistantId = [...arr].reverse().find(x => x.role === 'assistant')?.id
              const showButtons = !isUser && m.id === lastAssistantId && parsed.options.length > 0
              return (
                <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[88%] flex flex-col gap-1.5">
                    <div
                      className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap'
                          : 'bg-gray-800 text-gray-100 border border-gray-700/60 rounded-bl-sm'
                      }`}
                    >
                      {isUser ? parsed.prose : renderMarkdown(parsed.prose)}
                    </div>
                    {showButtons && (
                      <div className="flex flex-col gap-1.5">
                        {parsed.options.map((opt, i) => (
                          opt.isOther ? (
                            <div key={i} className="text-[10px] text-gray-500 italic pl-1">
                              {opt.label} — type your answer in the box below
                            </div>
                          ) : (
                            <button
                              key={i}
                              disabled={chatStatus === 'sending'}
                              onClick={() => sendChatMessage(opt.label)}
                              className="text-left text-xs rounded-lg bg-gray-700/60 hover:bg-blue-600 border border-gray-600/50 hover:border-blue-500 px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-100 hover:text-white"
                            >
                              {opt.label}
                            </button>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {chatStatus === 'sending' && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2 text-xs bg-gray-800 text-gray-400 border border-gray-700/60 rounded-bl-sm flex gap-1">
                  <span className="animate-bounce">·</span>
                  <span className="animate-bounce [animation-delay:150ms]">·</span>
                  <span className="animate-bounce [animation-delay:300ms]">·</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div
            className="flex-shrink-0 p-3 border-t border-gray-800 bg-gray-950/50 space-y-2"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={chatStatus === 'sending'}
                placeholder="Ask a question or request a change…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-10 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 disabled:opacity-40 transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || chatStatus === 'sending'}
                className="absolute right-1.5 top-1.5 bottom-1.5 w-7 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>

            {error && (
              <div className="p-2.5 bg-red-950/60 text-red-300 rounded-lg text-xs border border-red-800/50">
                {error}
              </div>
            )}

            {/* Stranded state — user lost the walkthrough and needs an explicit way back.
                When the next question is already on screen, render a soft hint instead so
                we don't show a redundant "Continue" button next to the visible card. */}
            {stranded ? (
              <button
                onClick={() => {
                  if (nextUnansweredIdx >= 0) {
                    setCurrentQuestionIdx(nextUnansweredIdx)
                    setWalkthroughMode('walking')
                  }
                }}
                disabled={submitting || chatStatus === 'sending'}
                title={`Jump to the next unanswered question (${pendingCount} remaining)`}
                className="w-full rounded-lg py-2.5 text-xs font-bold shadow transition-all hover:shadow-md active:scale-[0.98] flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-900"
              >
                {`→ Continue: ${pendingCount} more to answer`}
              </button>
            ) : pendingCount > 0 ? (
              <div className="w-full rounded-lg py-2.5 text-[11px] font-medium text-amber-300 bg-amber-950/40 border border-amber-800/40 text-center">
                Answer the question above to continue ({pendingCount} required remaining)
              </div>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={submitting || chatStatus === 'sending'}
                className="w-full bg-white hover:bg-gray-100 disabled:bg-gray-700 disabled:text-gray-400 text-gray-900 rounded-lg py-2.5 text-xs font-bold shadow transition-all hover:shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin" />
                    Importing…
                  </>
                ) : (
                  'Confirm & Import →'
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
