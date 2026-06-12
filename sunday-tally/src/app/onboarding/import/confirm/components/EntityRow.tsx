'use client'

// ── Small components ──────────────────────────────────────────────────────────

export function EntityRow({ type, name, warn }: { type: string; name: string; warn?: boolean }) {
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
