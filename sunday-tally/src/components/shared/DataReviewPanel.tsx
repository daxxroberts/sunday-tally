'use client'

import WebDataRocksGrid, { type GridColumn } from './WebDataRocksGrid'

export interface ReviewChoice {
  value: string
  label: string
  description?: string
}

interface DataReviewPanelProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  data: Record<string, unknown>[]
  columns?: GridColumn[]
  question: string
  choices: ReviewChoice[]
  onChoice: (value: string) => void
}

export default function DataReviewPanel({
  isOpen,
  onClose,
  title,
  data,
  columns,
  question,
  choices,
  onChoice,
}: DataReviewPanelProps) {
  if (!isOpen) return null

  function handleChoice(value: string) {
    onChoice(value)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title ?? 'Data Review'}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Grid */}
        <div className="px-6 pt-5 shrink-0">
          <WebDataRocksGrid data={data} columns={columns} height={280} />
        </div>

        {/* Divider */}
        <div className="mx-6 mt-5 border-t border-gray-100" />

        {/* Question + choices */}
        <div className="px-6 py-5 shrink-0">
          <p className="text-sm font-medium text-gray-800 mb-4">{question}</p>
          <div className="flex flex-wrap gap-3">
            {choices.map(choice => (
              <button
                key={choice.value}
                onClick={() => handleChoice(choice.value)}
                className="flex-1 min-w-[140px] flex flex-col gap-1 text-left border border-gray-200 rounded-lg p-4 hover:border-gray-900 hover:bg-gray-50 transition-all"
              >
                <span className="text-sm font-semibold text-gray-900">{choice.label}</span>
                {choice.description && (
                  <span className="text-xs text-gray-500 leading-snug">{choice.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
