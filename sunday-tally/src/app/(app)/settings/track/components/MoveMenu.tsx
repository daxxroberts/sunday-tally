'use client'

// ─────────────────────────────────────────────────────────────────────────
// MoveMenu — portaled so it can't be clipped by the tree column overflow
// ─────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Ministry } from '../types'

export function MoveMenu({
  pos, validParents, onPick, onClose,
}: {
  pos: { top: number; left: number }
  validParents: Ministry[]
  onPick: (parentId: string | null) => void
  onClose: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [onClose])
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        style={{ top: pos.top, left: pos.left }}
      >
        <p className="px-3 pt-2 pb-1 text-[9px] font-medium uppercase tracking-wider text-slate-400">Move under…</p>
        <ul className="max-h-60 overflow-y-auto">
          <li>
            <button onClick={() => onPick(null)} className="w-full px-3 py-2 text-left text-[13px] text-slate-600 transition-colors hover:bg-slate-50">Top level</button>
          </li>
          {validParents.map(p => (
            <li key={p.id}>
              <button onClick={() => onPick(p.id)} className="w-full px-3 py-2 text-left text-[13px] text-slate-600 transition-colors hover:bg-slate-50">{p.name}</button>
            </li>
          ))}
          {validParents.length === 0 && <li className="px-3 py-2 text-[12px] text-slate-400">No other ministries</li>}
        </ul>
      </div>
    </>,
    document.body,
  )
}
