'use client'

import type { ClarificationQuestion, QaState } from '../types'
import { QuestionBlock } from './QuestionBlock'

// ── Section 3: Decisions ──────────────────────────────────────────────────────

export function Section3Decisions({
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
