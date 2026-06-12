'use client'

import { useState } from 'react'
import type { ClarificationProposal } from '@/lib/import/stageA_validate'

/** Canonical validator shape — the walkthrough normalizes raw job questions into it. */
export type Clarification = ClarificationProposal

/** The four tag_role choices (D-068). Used by the set_ministry_tag_role card when
 *  the AI didn't supply explicit options. value = the role string fed as answerValue. */
const TAG_ROLE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Adult / main service',  value: 'ADULT_SERVICE' },
  { label: 'Kids ministry',         value: 'KIDS_MINISTRY' },
  { label: 'Youth ministry',        value: 'YOUTH_MINISTRY' },
  { label: 'Other (misc / church-wide)', value: 'OTHER' },
]

/**
 * One-question-at-a-time card. Renders:
 *   · Progress header (Question N of M, BLOCKING tag if applicable)
 *   · Narrative question text
 *   · Optional ASCII visual_tree in a monospace block (alignment preserved)
 *   · Clickable option buttons (if provided) + freeform fallback
 *   · Back button (if not first question)
 */
export function QuestionCard(props: {
  question:       Clarification
  index:          number
  total:          number
  onAnswer:       (label: string, value: string) => Promise<void> | void
  onBack?:        () => void
  disabled:       boolean
  previousAnswer?: string
}) {
  const { question: q, index, total, onAnswer, onBack, disabled, previousAnswer } = props
  const [freeText, setFreeText] = useState('')

  const handleFreeText = async () => {
    const trimmed = freeText.trim()
    if (!trimmed) return
    setFreeText('')
    await onAnswer(trimmed, trimmed)
  }

  // ── tag_role confirmation (task #58) ──
  // For a set_ministry_tag_role clarification we render a dedicated role-picker:
  // the visual_tree (ministry hierarchy) above, then the four role choices as
  // clickable buttons. The chosen value (the role string) flows as answerValue.
  const isRoleQuestion = q.patch_op?.kind === 'set_ministry_tag_role'
  const roleOptions = q.options && q.options.length > 0 ? q.options : TAG_ROLE_OPTIONS
  // ── canonical confirmation: a (ministry, reporting) pair with >1 metric ──
  const isCanonicalQuestion = q.patch_op?.kind === 'set_metric_canonical'

  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] w-full rounded-xl px-3 py-2.5 bg-gray-800 text-gray-100 border border-gray-700/60 rounded-bl-sm space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Question {index + 1} of {total}
          </span>
          {q.blocking && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-950/60 border border-amber-800/50 px-1.5 py-0.5 rounded">
              Required
            </span>
          )}
        </div>

        {/* Narrative question */}
        <div className="text-xs leading-relaxed text-gray-100">
          {q.question}
        </div>

        {/* Visual hierarchy (monospace to preserve box-drawing) */}
        {q.visual_tree && (
          <pre className="text-[10.5px] leading-snug font-mono bg-gray-950/60 border border-gray-700/40 rounded-md px-2.5 py-2 text-gray-300 overflow-x-auto whitespace-pre">
            {q.visual_tree}
          </pre>
        )}

        {/* Previous answer indicator if re-visiting — emerald-tinted so it's
            visually tied to the same progress system as the checkmark badge in
            the recap card above. Gives a clear "this one's done" feel even
            without a pop animation. */}
        {previousAnswer && (
          <div className="flex items-start gap-1.5 rounded-md bg-emerald-950/40 border border-emerald-700/40 px-2 py-1.5">
            <svg
              viewBox="0 0 12 12"
              className="w-3 h-3 flex-shrink-0 text-emerald-400 mt-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 6.5L5 9l4.5-5.5" />
            </svg>
            <div className="text-[10.5px] leading-snug">
              <span className="text-emerald-300 font-semibold">Answered: </span>
              <span className="text-emerald-100">{previousAnswer}</span>
              <span className="text-emerald-400/70 italic ml-1">— click another option to change.</span>
            </div>
          </div>
        )}

        {/* tag_role confirmation card — visual role-picker for set_ministry_tag_role */}
        {isRoleQuestion ? (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Choose this ministry&apos;s type
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {roleOptions.map((opt, i) => (
                <button
                  key={i}
                  disabled={disabled}
                  onClick={() => onAnswer(opt.label, opt.value)}
                  className="text-left text-xs rounded-lg bg-gray-700/60 hover:bg-blue-600 border border-gray-600/50 hover:border-blue-500 px-2.5 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-100 hover:text-white"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Canonical-metric confirmation hint — surfaces that one metric will
                become the default entry target for its (ministry, reporting) pair. */}
            {isCanonicalQuestion && (
              <div className="rounded-md bg-blue-950/40 border border-blue-800/40 px-2 py-1.5 text-[10.5px] text-blue-200 leading-snug">
                Pick the primary metric for this ministry + dimension. It becomes the
                default the dashboard reads; the others stay as breakouts.
              </div>
            )}

            {/* Options (clickable) */}
            {q.options && q.options.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    disabled={disabled}
                    onClick={() => onAnswer(opt.label, opt.value)}
                    className="text-left text-xs rounded-lg bg-gray-700/60 hover:bg-blue-600 border border-gray-600/50 hover:border-blue-500 px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-100 hover:text-white"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Freeform fallback (always available) */}
        <div className="pt-1">
          <div className="text-[10px] text-gray-500 mb-1">
            {q.options && q.options.length > 0 ? 'Or type your own answer:' : 'Type your answer:'}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleFreeText() } }}
              disabled={disabled}
              placeholder="Your answer…"
              className="flex-1 bg-gray-900 border border-gray-700/60 rounded-md px-2 py-1 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 disabled:opacity-40"
            />
            <button
              onClick={handleFreeText}
              disabled={disabled || !freeText.trim()}
              className="rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-40 px-2 text-[11px] font-semibold text-white"
            >
              Send
            </button>
          </div>
        </div>

        {/* Back button */}
        {onBack && (
          <div className="pt-1 border-t border-gray-700/40">
            <button
              onClick={onBack}
              disabled={disabled}
              className="text-[10.5px] text-gray-400 hover:text-gray-200 disabled:opacity-40 transition-colors"
            >
              ← Back to previous question
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
