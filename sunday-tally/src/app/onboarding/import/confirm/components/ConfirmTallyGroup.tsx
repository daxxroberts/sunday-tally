'use client'

export function ConfirmTallyGroup({ full = false, marks = 0 }: { full?: boolean; marks?: number }) {
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
