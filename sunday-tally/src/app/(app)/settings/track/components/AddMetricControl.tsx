'use client'

// ─────────────────────────────────────────────────────────────────────────
// AddMetricControl — pick a Kind, name it. Section-scoped: the caller decides
// which section (and therefore which kind of count) this add creates — this
// control just collects the reporting kind + name. There is NO entry/roll-up
// choice; the section is the classification.
//
// CONTROLLED: the parent owns open/close (one add form open at a time across
// the panel). When `open` is false we render nothing; when true we render the
// kind-select + name-input + Add/Cancel panel. Add-success, Cancel, and Escape
// all call onClose().
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { SYSTEM_KINDS, KIND_LABEL, KIND_PLACEHOLDER, type KindCode, type ReportingTag } from '../types'

export function AddMetricControl({
  open, onClose, reportingTags, onAdd, panelTitle, helpText,
}: {
  /** Parent-owned visibility — the section header button toggles this. */
  open: boolean
  /** Called on successful Add, or on Cancel/Escape. */
  onClose: () => void
  reportingTags: ReportingTag[]
  onAdd: (kind: KindCode, name: string) => Promise<void>
  /** Panel heading, e.g. "Add a count for every subgroup". */
  panelTitle: string
  /** Optional one-line explanation shown under the panel heading. */
  helpText?: string
}) {
  const [kind, setKind] = useState<KindCode>('VOLUNTEERS')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const available = SYSTEM_KINDS.filter(k => reportingTags.some(r => r.code === k))

  // On failure, keep the typed name + kind and the form open, and show why —
  // the user shouldn't have to reopen and retype after a rejected add (review
  // finding #61). onAdd already surfaces server errors via alert(); this local
  // error is a fallback for anything onAdd throws instead of returning.
  async function submit() {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(kind, n)
      setName(''); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this count. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    setName(''); setError(null); onClose()
  }

  if (!open) return null

  return (
    <div className="rounded-xl border border-[#4F6EF7]/30 bg-white p-4 shadow-sm">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{panelTitle}</p>
      {helpText && <p className="mb-3 text-[12px] text-slate-400">{helpText}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={e => setKind(e.target.value as KindCode)} aria-label="Kind" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7]">
          {available.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel() }}
          placeholder={`e.g. ${KIND_PLACEHOLDER[kind]}`} autoFocus
          className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
        />
        <button onClick={submit} disabled={!name.trim() || busy} className="rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40">Add</button>
        <button onClick={cancel} className="rounded-lg px-2 py-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-700">Cancel</button>
      </div>
      {error && <p className="mt-2 text-[12px] text-[#B45309]">{error}</p>}
    </div>
  )
}
