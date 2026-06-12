'use client'

// ── OptionCard ────────────────────────────────────────────────────────────────

export function OptionCard({
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
