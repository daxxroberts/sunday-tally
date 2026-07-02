'use client'

// ── Ministry filter (iPad-station mode) — pick which ministries this screen
// shows. Lives next to "Week totals"; the choice is saved per device
// (localStorage, in page.tsx) so a station set up once stays set up. ────────

import { useEffect, useRef, useState } from 'react'
import { Ico } from '../ui'

export interface FilterableMinistry {
  id: string
  name: string
  color?: string
}

export function MinistryFilterButton({ ministries, selected, onChange }: {
  ministries: FilterableMinistry[]
  /** null = showing everything (no filter applied yet). */
  selected: Set<string> | null
  onChange: (next: Set<string> | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // a11y (#66): Escape closes the popover and returns focus to the trigger;
  // focus moves into the panel on open so keyboard users land somewhere useful.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [open])

  if (ministries.length === 0) return null

  const allSelected = selected === null
  const count = selected ? selected.size : ministries.length

  function toggle(id: string) {
    const base = selected ?? new Set(ministries.map(m => m.id))
    const next = new Set(base)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Everything checked again → back to "show all" (null), so a newly added
    // ministry shows up automatically instead of staying hidden by default.
    onChange(next.size === ministries.length ? null : next)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 shadow-sm transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
      >
        <Ico.layers className="h-4 w-4 text-slate-400" />
        Ministries
        {!allSelected && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#4F6EF7] px-1 text-[10px] font-bold text-white">{count}</span>
        )}
      </button>

      {open && (
        <div ref={panelRef} role="dialog" aria-label="Filter ministries shown on this screen" className="absolute left-0 z-20 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg sm:left-auto sm:right-0">
          <div className="flex items-center justify-between px-1.5 pb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Show on this screen</span>
            {!allSelected && (
              <button onClick={() => onChange(null)} className="text-[11px] font-semibold text-[#3D5BD4] hover:underline">Show all</button>
            )}
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {ministries.map(m => {
              const checked = allSelected || selected!.has(m.id)
              return (
                <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(m.id)}
                    className="h-4 w-4 rounded border-slate-300 text-[#4F6EF7] focus:ring-[#4F6EF7]/40"
                  />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color ?? '#94a3b8' }} aria-hidden />
                  <span className="truncate text-[13px] font-medium text-slate-700">{m.name}</span>
                </label>
              )
            })}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 px-1.5 pt-1.5">
            <button onClick={() => onChange(new Set())} className="text-[11px] font-medium text-slate-400 hover:text-slate-600 hover:underline">Clear all</button>
            <button onClick={() => setOpen(false)} className="rounded-lg bg-[#4F6EF7] px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-[#3D5BD4]">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
