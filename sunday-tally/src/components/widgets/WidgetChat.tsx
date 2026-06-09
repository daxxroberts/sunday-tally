'use client'

/**
 * WidgetChat — the in-canvas "Build with AI" drawer for the Dashboard surface.
 *
 * Promoted from src/app/mockup/widgets/interactive.tsx (the chat half). Wired to
 * the REAL builder: POST /api/ai/widget-builder (SSE: text|chart|grid|final|error
 * |done). The model builds → previews → saves. Crucially we pass `dashboardId`
 * into the SSE body so save_widget PLACES the widget on the open dashboard (the
 * tool already inserts a dashboard_widgets row when dashboard_id is present), and
 * on the 'final' event we call `onSaved()` so the canvas re-runs the zero-AI
 * replay and the new card appears.
 *
 * The markdown-lite renderer (bold · inline code · bullets · ```code```) is copied
 * verbatim from the mockup so the chat reads identically.
 *
 * DESIGN_SYSTEM: brand #4F6EF7, amber for the demo/error notes (no red, DS-2).
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'

type ChatMsg = { role: 'user' | 'assistant'; text: string }

const STARTERS = ['Salvations by month this year', 'Volunteers by ministry', 'Attendance vs last year']

export function WidgetChat({
  dashboardId,
  seed,
  onSeedConsumed,
  onSaved,
  onClose,
}: {
  /** Open dashboard — passed to save_widget so the saved widget is placed here. */
  dashboardId: string | null
  /** When set, pre-fills the composer (e.g. "Edit the "X" widget — ") and focuses. */
  seed?: string | null
  onSeedConsumed?: () => void
  /** Called after a build/save turn finishes so the canvas can refresh the replay. */
  onSaved?: () => void
  onClose?: () => void
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      text:
        "Hi! Tell me what you'd like to see and I'll build it from your church's data — e.g. “salvations by month this year”, “volunteers by ministry”, or “attendance vs last year”. I'll create the query and add a live widget to this dashboard.",
    },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [lastQuery, setLastQuery] = useState<{ title: string; sql: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Consume an edit seed from the parent (✎ on a card).
  useEffect(() => {
    if (seed) {
      setInput(seed)
      requestAnimationFrame(() => {
        const el = taRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
        }
      })
      onSeedConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  async function send() {
    const message = input.trim()
    if (!message || streaming) return
    setInput('')
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    setMessages((m) => [...m, { role: 'user', text: message }, { role: 'assistant', text: '' }])
    setStreaming(true)
    const assistantIdx = messages.length + 1
    let saved = false

    const appendAssistant = (delta: string) =>
      setMessages((m) => {
        const next = [...m]
        if (next[assistantIdx]) next[assistantIdx] = { role: 'assistant', text: next[assistantIdx].text + delta }
        return next
      })
    const setAssistant = (text: string) =>
      setMessages((m) => {
        const next = [...m]
        if (next[assistantIdx]) next[assistantIdx] = { role: 'assistant', text }
        return next
      })

    try {
      const res = await fetch('/api/ai/widget-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: history.map((m) => ({ role: m.role, content: m.text })),
          // Place saved widgets onto the currently-open dashboard.
          dashboard_id: dashboardId ?? undefined,
        }),
      })
      if (!res.ok || !res.body) {
        setAssistant(res.status === 403 ? '(You need an editor+ role to build widgets.)' : `(Builder error: HTTP ${res.status}.)`)
        setStreaming(false)
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let built = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const chunks = buf.split('\n\n')
        buf = chunks.pop() ?? ''
        for (const chunk of chunks) {
          const ev = /^event: (.*)$/m.exec(chunk)?.[1]
          const dataRaw = /^data: (.*)$/m.exec(chunk)?.[1]
          if (!ev) continue
          let payload: Record<string, unknown> = {}
          try {
            payload = dataRaw ? JSON.parse(dataRaw) : {}
          } catch {
            /* ignore */
          }
          if (ev === 'text') appendAssistant(String(payload.delta ?? ''))
          else if (ev === 'chart' || ev === 'grid') {
            built++
            if (payload.sql) setLastQuery({ title: String(payload.title ?? 'Widget'), sql: String(payload.sql) })
          } else if (ev === 'final') {
            const md = String(payload.markdown ?? '')
            if (md) appendAssistant((built ? '\n\n' : '') + md)
            saved = true // a completed turn — refresh the replay so any saved widget shows
          } else if (ev === 'error') {
            const code = String(payload.code ?? '')
            appendAssistant(
              code === 'ai_budget_exhausted'
                ? "\n\n(The church's AI budget is used up — building more needs a top-up.)"
                : `\n\n(Builder error: ${code}.)`,
            )
          }
        }
      }
    } catch (e) {
      setAssistant(`(Network error: ${e instanceof Error ? e.message : 'failed'}.)`)
    } finally {
      setStreaming(false)
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9 }))
      // Refresh after any finished turn — saves place onto this dashboard.
      if (saved) onSaved?.()
    }
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#4F6EF7]/10 text-[#4F6EF7]">
          <SparkleIcon />
        </span>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-900">Build with AI</h2>
          <p className="text-xs text-slate-500">The AI writes the query + adds it here.</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            title="Close"
            className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100"
          >
            <IconClose />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl bg-[#4F6EF7] px-3 py-2 text-sm text-white">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="flex justify-start gap-2">
              <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#4F6EF7]/10 text-[10px] text-[#4F6EF7]">
                <SparkleIcon small />
              </span>
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-100">
                {m.text ? (
                  <MarkdownLite text={m.text} />
                ) : streaming && i === messages.length - 1 ? (
                  <span className="text-slate-400">thinking…</span>
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>

      {lastQuery && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">Query · {lastQuery.title}</span>
            <button type="button" onClick={() => setLastQuery(null)} className="ml-2 shrink-0 text-[11px] text-slate-400 hover:text-slate-600">
              hide
            </button>
          </div>
          <pre className="max-h-40 overflow-auto rounded-lg bg-slate-900 p-2.5 text-[11px] leading-relaxed text-slate-100">
            <code>{lastQuery.sql}</code>
          </pre>
        </div>
      )}

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={2}
            placeholder="e.g. salvations by month this year"
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-[#4F6EF7] focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-[#4F6EF7] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {streaming ? '…' : 'Send'}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STARTERS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setInput(q)}
              className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-[#4F6EF7] hover:text-[#4F6EF7]"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

// ─── Minimal markdown renderer (bold · inline code · bullets · ```code```) ─────

function MarkdownLite({ text }: { text: string }) {
  const parts = text.split('```')
  return (
    <div className="space-y-1.5">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] leading-relaxed text-slate-100">
            <code>{part.replace(/^sql\n/i, '')}</code>
          </pre>
        ) : (
          <div key={i} className="space-y-1">
            {part
              .split('\n')
              .filter((l) => l.trim() !== '')
              .map((line, j) => {
                const bullet = /^\s*[-•]\s+/.test(line)
                const heading = /^\s*#{1,3}\s+/.test(line)
                const clean = line.replace(/^\s*[-•]\s+/, '').replace(/^\s*#{1,3}\s+/, '')
                if (bullet) {
                  return (
                    <div key={j} className="flex gap-1.5 pl-0.5">
                      <span className="mt-[2px] text-[#4F6EF7]">•</span>
                      <span>{renderInline(clean)}</span>
                    </div>
                  )
                }
                return (
                  <p key={j} className={heading ? 'font-semibold text-slate-900' : ''}>
                    {renderInline(clean)}
                  </p>
                )
              })}
          </div>
        ),
      )}
    </div>
  )
}

function renderInline(s: string): ReactNode {
  const tokens = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return tokens.map((t, i) => {
    if (/^\*\*[^*]+\*\*$/.test(t))
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {t.slice(2, -2)}
        </strong>
      )
    if (/^`[^`]+`$/.test(t))
      return (
        <code key={i} className="rounded bg-slate-200/70 px-1 py-0.5 text-[12px] text-slate-800">
          {t.slice(1, -1)}
        </code>
      )
    return <span key={i}>{t}</span>
  })
}

function SparkleIcon({ small }: { small?: boolean }) {
  const s = small ? 11 : 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4m-2-2h4M6 17v4m-2-2h4m5-16l2.5 6L21 11l-5.5 2.5L13 20l-2.5-6.5L5 11l5.5-1.5L13 3z" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  )
}
