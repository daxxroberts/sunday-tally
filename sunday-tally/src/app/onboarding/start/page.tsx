'use client'

// /onboarding/start — path chooser, runs before the step sequence
// Three paths: Import · Template 1 · Template 2 · Scratch

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { selectTemplate1Action, selectTemplate2Action } from './actions'

const T1_SERVICES = [
  { day: 'Sun', time: '9:30 AM',  name: 'Sunday School',   note: 'Adult · Kids · Youth' },
  { day: 'Sun', time: '10:30 AM', name: 'Sunday Morning',  note: 'Adult · Youth' },
  { day: 'Sun', time: '5:00 PM',  name: 'Sunday Evening',  note: 'Adult · Youth' },
  { day: 'Wed', time: '5:00 PM',  name: 'Wednesday Night', note: 'Adult · Youth' },
]

const T2_SERVICES = [
  { day: 'Sun', time: '9:00 AM',  name: 'First Service',  note: 'Main · Kids' },
  { day: 'Sun', time: '10:30 AM', name: 'Second Service', note: 'Main · Kids' },
  { day: 'Wed', time: '6:30 PM',  name: 'Youth Night',    note: 'Youth only' },
]

export default function OnboardingStartPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingPath, setPendingPath] = useState<'t1' | 't2' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function applyTemplate(which: 't1' | 't2') {
    if (isPending) return
    setPendingPath(which)
    setError(null)
    const action = which === 't1' ? selectTemplate1Action : selectTemplate2Action
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
        setPendingPath(null)
        return
      }
      router.push('/onboarding/services')
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Brand header — same style as OnboardingLayout, no progress bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-stone-900 text-white flex items-center justify-center font-extrabold text-sm shadow-sm group-hover:bg-[#4F6EF7] transition-all">
            S
          </div>
          <span className="text-sm font-bold tracking-tight text-stone-900">Sunday Tally</span>
        </Link>
        <Link href="/auth/login" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Exit setup
        </Link>
      </div>

      <div className="flex-1 px-4 pt-8 pb-12 max-w-lg mx-auto w-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">How do you want to get started?</h1>
        <p className="text-sm text-gray-500 mb-8">Pick a path. You can always adjust everything in Settings.</p>

        <div className="space-y-3">

          {/* ── Import ────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => router.push('/onboarding/import')}
            disabled={isPending}
            className="w-full text-left border border-gray-200 rounded-xl p-4 hover:border-[#4F6EF7] hover:bg-[#4F6EF7]/[0.02] transition-all group disabled:opacity-40"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 text-[#4F6EF7] group-hover:bg-indigo-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-900">Import from spreadsheets</span>
                  <span className="text-[10px] font-medium text-[#4F6EF7] bg-indigo-50 px-1.5 py-0.5 rounded-full">AI</span>
                </div>
                <p className="text-xs text-gray-500">Paste a Google Sheets link or upload a CSV — AI reads your data and builds your setup automatically.</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 group-hover:text-[#4F6EF7] flex-shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          {/* ── Template 1 ────────────────────────────────────── */}
          <div className={`border rounded-xl overflow-hidden transition-all ${pendingPath === 't1' ? 'border-[#4F6EF7]' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">Traditional Sunday church</p>
                  <p className="text-xs text-gray-500 mb-3">Morning, evening, Sunday School, and a Wednesday service. Adult, Kids, and Youth ministries tracked together.</p>
                  <div className="space-y-1.5">
                    {T1_SERVICES.map(s => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-gray-400 w-6 flex-shrink-0">{s.day}</span>
                        <span className="text-[10px] text-gray-400 w-14 flex-shrink-0">{s.time}</span>
                        <span className="text-xs text-gray-700 font-medium">{s.name}</span>
                        <span className="text-[10px] text-gray-400">· {s.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/50">
              <button
                type="button"
                onClick={() => applyTemplate('t1')}
                disabled={isPending}
                className="w-full text-center text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-40"
              >
                {pendingPath === 't1' ? 'Setting up…' : 'Start with this template →'}
              </button>
            </div>
          </div>

          {/* ── Template 2 ────────────────────────────────────── */}
          <div className={`border rounded-xl overflow-hidden transition-all ${pendingPath === 't2' ? 'border-[#4F6EF7]' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">Multi-service church</p>
                  <p className="text-xs text-gray-500 mb-3">Two Sunday morning services with Kids running alongside. Youth meets separately mid-week.</p>
                  <div className="space-y-1.5">
                    {T2_SERVICES.map(s => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-gray-400 w-6 flex-shrink-0">{s.day}</span>
                        <span className="text-[10px] text-gray-400 w-14 flex-shrink-0">{s.time}</span>
                        <span className="text-xs text-gray-700 font-medium">{s.name}</span>
                        <span className="text-[10px] text-gray-400">· {s.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/50">
              <button
                type="button"
                onClick={() => applyTemplate('t2')}
                disabled={isPending}
                className="w-full text-center text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-40"
              >
                {pendingPath === 't2' ? 'Setting up…' : 'Start with this template →'}
              </button>
            </div>
          </div>

          {/* ── Scratch ───────────────────────────────────────── */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => router.push('/onboarding/church')}
              disabled={isPending}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
            >
              Or set it up from scratch →
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
