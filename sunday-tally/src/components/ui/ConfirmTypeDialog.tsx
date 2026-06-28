'use client'

// ConfirmTypeDialog — a reusable destructive-action confirmation modal. The
// confirm button stays disabled until the user types `confirmPhrase` exactly.
// DS: brand #4F6EF7 focus, amber (#B45309) for the warning tone, no red.

import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  title: string
  body: React.ReactNode
  /** The exact phrase the user must type to enable the confirm button. */
  confirmPhrase: string
  confirmLabel: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

export default function ConfirmTypeDialog({
  open,
  title,
  body,
  confirmPhrase,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset the input whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setTyped('')
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const armed = typed.trim() === confirmPhrase && !busy

  async function handleConfirm() {
    if (!armed) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-6"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-slate-600">{body}</div>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Type <span className="font-num text-amber-700">{confirmPhrase}</span> to confirm
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          autoComplete="off"
          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/40"
        />

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!armed}
            className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
