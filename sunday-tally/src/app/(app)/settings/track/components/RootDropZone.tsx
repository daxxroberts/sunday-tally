'use client'

// ─────────────────────────────────────────────────────────────────────────
// Root drop zone (drag a node here → top level)
// ─────────────────────────────────────────────────────────────────────────

import { useDroppable } from '@dnd-kit/core'

export function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: '__root__' })
  return (
    <div
      ref={setNodeRef}
      className={`border-b border-dashed px-4 py-1.5 text-center text-[9px] font-medium uppercase tracking-wider transition-colors ${isOver ? 'border-[#4F6EF7] bg-[#4F6EF7]/20 text-[#3D5BD4] ring-2 ring-inset ring-[#4F6EF7]' : 'border-slate-200 text-slate-300'}`}
    >
      Top level
    </div>
  )
}
