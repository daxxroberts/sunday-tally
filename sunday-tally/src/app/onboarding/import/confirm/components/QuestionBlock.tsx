'use client'

import type { ClarificationQuestion, QaState } from '../types'
import { OptionCard } from './OptionCard'

// ── QuestionBlock ─────────────────────────────────────────────────────────────

export function QuestionBlock({
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

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isAnswered(q: ClarificationQuestion, state?: QaState): boolean {
  if (!state) return false
  if (q.type === 'choice' || q.type === 'policy_collapse') {
    return state.selectedOption !== undefined
  }
  return !!state.answer?.trim()
}
