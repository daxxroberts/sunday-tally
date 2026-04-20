'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import AiExhaustedBanner from '@/components/AiExhaustedBanner'
import { createClient } from '@/lib/supabase/client'
import { fetchDashboardData, type DashboardData, type FourWin } from '@/lib/dashboard'
import {
  ResponsiveContainer, LineChart, Line,
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { UserRole, Church } from '@/types'

// ─── Chat types ───────────────────────────────────────────────────────────────

interface ChartPayload {
  type:   'line' | 'bar' | 'area'
  title?: string
  xKey:   string
  yKeys:  string[]
  data:   Record<string, string | number>[]
}
interface AssistantMessage {
  role:          'assistant'
  streamText:    string
  charts:        ChartPayload[]
  finalMarkdown: string
  done:          boolean
  error?:        string
}
interface UserMessage {
  role: 'user'
  text: string
}
type Message = UserMessage | AssistantMessage

const SUGGESTED = [
  'What 3 months had the highest volunteers?',
  'Compare giving this year vs last year',
  "What's our average Easter attendance?",
  'How has kids attendance trended this year?',
]

// ─── Mini-dashboard helpers ───────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[10px] text-gray-300 tabular-nums">—</span>
  const up = delta >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${
      up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
    }`}>
      {up ? '▲' : '▼'}{Math.abs(delta)}%
    </span>
  )
}

function fmtNum(n: number | null, prefix = '') {
  if (n === null) return <span className="text-gray-300">—</span>
  return <>{prefix}{n.toLocaleString()}</>
}

function MetricRow({ label, values, prefix, hideComparisons }: {
  label: string
  values: FourWin
  prefix?: string
  hideComparisons: boolean
}) {
  const highlightDelta = (h: { current: number; prior: number }) =>
    h.prior === 0 ? null : Math.round(((h.current - h.prior) / h.prior) * 100)

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-600 font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmtNum(values.w, prefix)}</span>
          {!hideComparisons && values.delta_w_m4 !== null && (
            <div className="mt-0.5">
              <DeltaBadge delta={values.delta_w_m4} />
            </div>
          )}
        </div>
        {!hideComparisons && (
          <div className="text-right min-w-[3.5rem]">
            <span className="text-xs text-gray-400 tabular-nums">{fmtNum(values.ytd, prefix)} YTD</span>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniDashboard({ church, data, loading }: {
  church: Church | null
  data: DashboardData | null
  loading: boolean
}) {
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const highlightDelta = (h: { current: number; prior: number }) =>
    h.prior === 0 ? null : Math.round(((h.current - h.prior) / h.prior) * 100)
  const hideComparisons = !!data && data.weeksWithData < 2

  return (
    <div className="flex flex-col h-full">
      {/* Mini dashboard header */}
      <div className="flex-none sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900 text-base leading-tight">Dashboard</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{church?.name ?? ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">{todayLabel}</span>
            <Link
              href="/dashboard"
              className="text-[11px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 rounded-lg px-2.5 py-1"
            >
              Full view →
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : !data || !data.hasAnyData ? (
          <div className="text-center py-16 text-sm text-gray-400">
            No data yet — appears after your first Sunday entry.
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-1 gap-3">
              <div className="relative bg-white rounded-2xl border border-gray-100 p-4 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-2xl" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Attendance</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">
                    {data.highlights.attendance.current.toLocaleString()}
                  </p>
                  <DeltaBadge delta={highlightDelta(data.highlights.attendance)} />
                </div>
                <p className="text-[11px] text-gray-400 mt-2 tabular-nums">
                  vs {data.highlights.attendance.prior.toLocaleString()} last week
                </p>
              </div>

              {church?.tracks_giving && (
                <div className="relative bg-white rounded-2xl border border-gray-100 p-4 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-2xl" />
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Giving</p>
                  <div className="flex items-end justify-between gap-2">
                    <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">
                      ${data.highlights.giving.current.toLocaleString()}
                    </p>
                    <DeltaBadge delta={highlightDelta(data.highlights.giving)} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 tabular-nums">
                    vs ${data.highlights.giving.prior.toLocaleString()} last week
                  </p>
                </div>
              )}

              {church?.tracks_volunteers && (
                <div className="relative bg-white rounded-2xl border border-gray-100 p-4 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500 rounded-t-2xl" />
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Serving</p>
                  <div className="flex items-end justify-between gap-2">
                    <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">
                      {data.highlights.volunteers.current.toLocaleString()}
                    </p>
                    <DeltaBadge delta={highlightDelta(data.highlights.volunteers)} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 tabular-nums">
                    vs {data.highlights.volunteers.prior.toLocaleString()} last week
                  </p>
                </div>
              )}
            </div>

            {/* Summary metrics */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_-1px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-white border-b border-gray-100">
                <div className="w-1.5 h-4 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-widest">Summary</span>
                <span className="ml-auto text-[10px] text-gray-400">This week</span>
              </div>
              <div className="px-4">
                <MetricRow label="Total Attendance" values={data.summary.grandTotal} hideComparisons={hideComparisons} />
                <MetricRow label="Adults" values={data.summary.adults} hideComparisons={hideComparisons} />
                <MetricRow label="Kids" values={data.summary.kids} hideComparisons={hideComparisons} />
                <MetricRow label="Youth" values={data.summary.youth} hideComparisons={hideComparisons} />
                {church?.tracks_volunteers && (
                  <MetricRow label="Volunteers" values={data.summary.volunteers} hideComparisons={hideComparisons} />
                )}
                {church?.tracks_giving && (
                  <MetricRow label="Giving" values={data.summary.giving} prefix="$" hideComparisons={hideComparisons} />
                )}
              </div>
            </div>

            {hideComparisons && (
              <p className="text-center text-xs text-gray-400 italic">
                Comparisons appear after two weeks of data.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Chart renderer ───────────────────────────────────────────────────────────

function ChartBlock({ chart }: { chart: ChartPayload }) {
  const palette = ['#2563eb', '#10b981', '#f97316', '#a855f7', '#ef4444']
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {chart.title && (
        <p className="mb-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          {chart.title}
        </p>
      )}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'line' ? (
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey={chart.xKey} fontSize={10} tick={{ fill: '#9ca3af' }} />
              <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {chart.yKeys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={palette[i % palette.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : chart.type === 'area' ? (
            <AreaChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey={chart.xKey} fontSize={10} tick={{ fill: '#9ca3af' }} />
              <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {chart.yKeys.map((k, i) => (
                <Area key={k} type="monotone" dataKey={k} stroke={palette[i % palette.length]} fill={palette[i % palette.length]} fillOpacity={0.12} strokeWidth={2} />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey={chart.xKey} fontSize={10} tick={{ fill: '#9ca3af' }} />
              <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {chart.yKeys.map((k, i) => (
                <Bar key={k} dataKey={k} fill={palette[i % palette.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsChatPage() {
  const [role,       setRole]       = useState<UserRole>('admin')
  const [church,     setChurch]     = useState<Church | null>(null)
  const [dashData,   setDashData]   = useState<DashboardData | null>(null)
  const [dashLoad,   setDashLoad]   = useState(true)

  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState('')
  const [busy,       setBusy]       = useState(false)
  const [exhausted,  setExhausted]  = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load church + dashboard data
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id, churches(*)')
        .eq('user_id', user.id).eq('is_active', true).single()
      if (!membership) return
      setRole(membership.role as UserRole)
      // @ts-expect-error join
      const ch = membership.churches as Church
      setChurch(ch)
      const d = await fetchDashboardData(membership.church_id, {
        tracks_volunteers: ch.tracks_volunteers,
        tracks_responses:  ch.tracks_responses,
        tracks_giving:     ch.tracks_giving,
      })
      setDashData(d)
      setDashLoad(false)
    })
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 40)
  }

  const patchLast = useCallback((fn: (m: AssistantMessage) => AssistantMessage) => {
    setMessages(prev => {
      const copy = [...prev]
      const last = copy[copy.length - 1]
      if (!last || last.role !== 'assistant') return prev
      copy[copy.length - 1] = fn(last as AssistantMessage)
      return copy
    })
  }, [])

  const send = useCallback(async (raw: string) => {
    const question = raw.trim()
    if (!question || busy) return
    setBusy(true)

    const history = messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && (m as AssistantMessage).done))
      .slice(-6)
      .map(m => ({
        role:    m.role as 'user' | 'assistant',
        content: m.role === 'user'
          ? (m as UserMessage).text
          : ((m as AssistantMessage).finalMarkdown || (m as AssistantMessage).streamText),
      }))

    const userMsg: UserMessage      = { role: 'user', text: question }
    const asstMsg: AssistantMessage = { role: 'assistant', streamText: '', charts: [], finalMarkdown: '', done: false }
    setMessages(prev => [...prev, userMsg, asstMsg])
    setInput('')
    scrollToBottom()

    try {
      const res = await fetch('/api/ai/analytics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: question, history }),
      })
      if (!res.ok || !res.body) {
        patchLast(m => ({ ...m, error: `Request failed (${res.status})`, done: true }))
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          handleFrame(buffer.slice(0, idx))
          buffer = buffer.slice(idx + 2)
        }
      }
    } catch (e) {
      patchLast(m => ({ ...m, error: e instanceof Error ? e.message : 'chat_failed', done: true }))
    } finally {
      setBusy(false)
      scrollToBottom()
    }

    function handleFrame(frame: string) {
      const lines = frame.split('\n')
      let event = 'message'
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith('event: '))     event = line.slice(7).trim()
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
      }
      if (!dataLines.length) return
      let payload: unknown
      try { payload = JSON.parse(dataLines.join('\n')) } catch { return }

      if (event === 'text') {
        patchLast(m => ({ ...m, streamText: m.streamText + ((payload as { delta?: string }).delta ?? '') }))
        scrollToBottom()
      } else if (event === 'chart') {
        patchLast(m => ({ ...m, charts: [...m.charts, payload as ChartPayload] }))
        scrollToBottom()
      } else if (event === 'final') {
        patchLast(m => ({ ...m, finalMarkdown: (payload as { markdown?: string }).markdown ?? '' }))
        scrollToBottom()
      } else if (event === 'error') {
        const code = (payload as { code?: string }).code
        if (code === 'ai_budget_exhausted') {
          setExhausted(true)
          patchLast(m => ({ ...m, done: true }))
        } else {
          patchLast(m => ({ ...m, error: (payload as { message?: string }).message ?? 'analytics_failed', done: true }))
        }
      } else if (event === 'done') {
        patchLast(m => ({ ...m, done: true }))
      }
    }
  }, [busy, messages, patchLast])

  return (
    <AppLayout role={role} fillHeight>
      {/* Split layout: dashboard left (lg+) | chat right */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">

        {/* ── Left: Mini Dashboard (desktop only) ── */}
        <div className="hidden lg:flex flex-col w-[420px] xl:w-[480px] flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-hidden">
          <MiniDashboard church={church} data={dashData} loading={dashLoad} />
        </div>

        {/* ── Right: Chat ── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden bg-white">

          {/* Chat header */}
          <div className="flex-none px-4 pt-5 pb-3 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SparkleIcon />
                <span className="text-base font-semibold text-gray-900">Ask Sunday Tally</span>
              </div>
              {/* Mobile: link to full dashboard */}
              <Link
                href="/dashboard"
                className="lg:hidden text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                Dashboard →
              </Link>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">Questions answered from your church&rsquo;s data only</p>
          </div>

          {/* Thread */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5 bg-gray-50">
            {messages.length === 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Try asking…</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTED.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      disabled={busy}
                      className="text-left text-sm text-gray-700 bg-white border border-gray-200 rounded-2xl px-4 py-3 hover:bg-blue-50/50 transition-colors shadow-[0_1px_4px_-1px_rgba(0,0,0,0.04)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              if (m.role === 'user') {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gray-100 border border-gray-200 px-4 py-2.5 text-sm text-gray-900">
                      {m.text}
                    </div>
                  </div>
                )
              }

              const asst        = m as AssistantMessage
              const isLast      = i === messages.length - 1
              const isStreaming = busy && isLast
              const showThinking = isStreaming && !asst.streamText && !asst.charts.length

              return (
                <div key={i} className="space-y-3">
                  {showThinking && <ThinkingDots />}

                  {asst.streamText && !asst.finalMarkdown && (
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {asst.streamText}
                      {isStreaming && (
                        <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-gray-400 animate-pulse" />
                      )}
                    </p>
                  )}

                  {asst.charts.map((c, j) => <ChartBlock key={j} chart={c} />)}

                  {asst.finalMarkdown && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-gray-900 leading-relaxed whitespace-pre-wrap shadow-[0_1px_4px_-1px_rgba(0,0,0,0.04)]">
                      {asst.finalMarkdown}
                    </div>
                  )}

                  {asst.error && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {asst.error}
                    </p>
                  )}

                  {asst.done && !asst.error && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => textareaRef.current?.focus()}
                        className="border border-gray-200 bg-white rounded-full px-3 py-1.5 text-xs text-gray-600 hover:bg-blue-50/50 transition-colors"
                      >
                        Ask a follow-up
                      </button>
                      <button className="border border-gray-200 bg-white rounded-full px-3 py-1.5 text-xs text-gray-600 hover:bg-blue-50/50 transition-colors">
                        Show another view
                      </button>
                      <button className="border border-gray-200 bg-white rounded-full px-3 py-1.5 text-xs text-gray-600 hover:bg-blue-50/50 transition-colors">
                        Export this data
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="flex-none border-t border-gray-200 bg-white px-4 py-3">
            {exhausted ? (
              <AiExhaustedBanner />
            ) : (
              <form
                onSubmit={e => { e.preventDefault(); send(input) }}
                className="flex gap-2 items-end"
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  rows={1}
                  disabled={busy}
                  placeholder="Ask anything about your ministry data…"
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
                  }}
                  className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 overflow-y-auto"
                  style={{ maxHeight: '120px' }}
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="flex-shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Send
                </button>
              </form>
            )}
          </div>
          {/* Spacer so fixed tab bar doesn't overlap the composer */}
          <div className="flex-none h-20 bg-white" aria-hidden="true" />
        </div>
      </div>
    </AppLayout>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-100 text-[10px] font-bold text-blue-600">
        s
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
        <span className="ml-1 text-xs text-gray-400">Checking the books…</span>
      </div>
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4m-2-2h4M6 17v4m-2-2h4m5-16l2.5 6L21 11l-5.5 2.5L13 20l-2.5-6.5L5 11l5.5-1.5L13 3z" />
    </svg>
  )
}
