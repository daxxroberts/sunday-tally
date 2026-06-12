'use client'

import { useEffect, useRef, useState } from 'react'
import { ConfirmTallyGroup } from './ConfirmTallyGroup'

// ── ImportingPanel ────────────────────────────────────────────────────────────

const IMPORT_STAGES = [
  { label: 'Setting up your locations and services', start: 0 },
  { label: 'Creating service occurrences',           start: 5_000 },
  { label: 'Writing attendance records',             start: 12_000 },
  { label: 'Recording giving and volunteers',        start: 22_000 },
  { label: 'Finalising your church profile',         start: 35_000 },
]

export function ImportingPanel() {
  const startedAt = useRef(Date.now())
  const [stage, setStage] = useState(0)
  const [tally, setTally] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      const next = IMPORT_STAGES.filter(s => elapsed >= s.start).length - 1
      setStage(Math.min(next, IMPORT_STAGES.length - 1))
      setTally(prev => prev + Math.floor(Math.random() * 4) + 3)
    }, 500)
    return () => clearInterval(id)
  }, [])

  const groups    = Math.floor(tally / 5)
  const remainder = tally % 5

  return (
    <div className="rounded-xl bg-gray-900 p-6 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Records written
        </p>
        <div className="flex flex-wrap items-end gap-3 min-h-[2rem]">
          {Array.from({ length: groups }).map((_, g) => (
            <ConfirmTallyGroup key={g} full />
          ))}
          {remainder > 0 && <ConfirmTallyGroup marks={remainder} />}
        </div>
        <p className="mt-2 text-xs text-gray-400">{tally} rows</p>
      </div>

      <div className="space-y-3">
        {IMPORT_STAGES.map((s, i) => {
          const done    = i < stage
          const current = i === stage
          const pending = i > stage
          return (
            <div key={i} className={`flex items-center gap-3 transition-opacity ${pending ? 'opacity-30' : ''}`}>
              <div className="shrink-0">
                {done ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : current ? (
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-blue-500" />
                  </span>
                ) : (
                  <span className="flex h-4 w-4 rounded-full border-2 border-gray-600" />
                )}
              </div>
              <p className={`text-sm font-medium ${current ? 'text-white' : done ? 'text-gray-400' : 'text-gray-300'}`}>
                {s.label}
              </p>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">Writing your historical records — usually under a minute</p>
    </div>
  )
}
