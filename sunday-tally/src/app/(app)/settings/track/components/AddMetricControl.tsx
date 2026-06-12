'use client'

// ─────────────────────────────────────────────────────────────────────────
// AddMetricControl — pick a Kind, name it
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Ico } from '@/app/(app)/entries/ui'
import { SYSTEM_KINDS, KIND_LABEL, KIND_PLACEHOLDER, type KindCode, type ReportingTag } from '../types'

export function AddMetricControl({
  reportingTags, onAdd,
}: {
  reportingTags: ReportingTag[]
  onAdd: (kind: KindCode, name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<KindCode>('VOLUNTEERS')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const available = SYSTEM_KINDS.filter(k => reportingTags.some(r => r.code === k))

  async function submit() {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    await onAdd(kind, n)
    setName(''); setBusy(false); setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#4F6EF7]/40 bg-[#4F6EF7]/5 px-4 py-3 text-[14px] font-semibold text-[#3D5BD4] transition-colors hover:bg-[#4F6EF7]/10">
        <Ico.plus className="h-4 w-4" /> Add a count
      </button>
    )
  }
  return (
    <div className="rounded-2xl border border-[#4F6EF7]/30 bg-white p-4 shadow-sm">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Add a count</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={e => setKind(e.target.value as KindCode)} aria-label="Kind" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7]">
          {available.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setName('') } }}
          placeholder={`e.g. ${KIND_PLACEHOLDER[kind]}`} autoFocus
          className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
        />
        <button onClick={submit} disabled={!name.trim() || busy} className="rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40">Add</button>
        <button onClick={() => { setOpen(false); setName('') }} className="rounded-lg px-2 py-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-700">Cancel</button>
      </div>
    </div>
  )
}
