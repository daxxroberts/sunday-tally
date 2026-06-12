'use client'

// ─────────────────────────────────────────────────────────────────────────
// Add-node form (top-level or "inside a group")
// ─────────────────────────────────────────────────────────────────────────

import type { TagRole } from '../actions'
import { ROLE_OPTIONS } from '../types'

export function AddNodeForm({
  title, name, setName, role, setRole, busy, onAdd, onCancel,
}: {
  title: string
  name: string; setName: (v: string) => void
  role: TagRole; setRole: (v: TagRole) => void
  busy: boolean
  onAdd: () => void; onCancel: () => void
}) {
  return (
    <div className="mb-3 rounded-2xl border border-[#4F6EF7]/30 bg-white p-4 shadow-sm">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onAdd(); if (e.key === 'Escape') onCancel() }}
        placeholder="Name (e.g. LifeKids)"
        autoFocus
        className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
      />
      <select
        value={role}
        onChange={e => setRole(e.target.value as TagRole)}
        aria-label="Role"
        className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-700 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
      >
        {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <div className="flex gap-2">
        <button
          onClick={onAdd}
          disabled={!name.trim() || busy}
          className="flex-1 rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
