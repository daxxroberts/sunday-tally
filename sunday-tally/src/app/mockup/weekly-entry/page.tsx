'use client'

// ─────────────────────────────────────────────────────────────────────────
// DESIGN PREVIEW — NOT WIRED TO DATA.  #36 weekly-entry screen (rev 2).
// ui-ux-pro-max · Data-Dense Dashboard (calm) · AccessSync blue #4F6EF7 +
// Sage #22C55E status + amber "needs" (NO red) · Fira Sans / Fira Code.
// Stat Entries is an entry section (not a filter) · completion status arrangement.
// Reflects decisions D-072 → D-080.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'

type Area = { label: string; value: number }
type Saved = 'idle' | 'saving' | 'saved'
type Stat = 'complete' | 'needs' | 'empty'
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '0')

/* ── inline SVG icons (Lucide-style) ────────────────────────────────────── */
const Ico = {
  left: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6" /></svg>),
  right: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6" /></svg>),
  chevron: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6" /></svg>),
  check: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5" /></svg>),
  calendar: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>),
  sigma: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 7V4H6l6 8-6 8h12v-3" /></svg>),
  ban: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>),
  repeat: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>),
  alert: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>),
  grid: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>),
  pencil: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>),
  pencilFill: (p: any) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>),
  pin: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>),
}

/* ── summary card — high-level ministry rollup (derived, never stored) ───── */
function SummaryCard({ name, role, bar, metrics, excluded }: { name: string; role: string; bar: string; chip?: string; metrics: { label: string; value: number; sub?: string }[]; excluded?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md ${excluded ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`h-5 w-1.5 rounded-full ${bar}`} aria-hidden />
        <h4 className="text-[15px] font-bold tracking-tight text-slate-900">{name}</h4>
        <span className="text-[12px] font-medium text-slate-400">· {role}</span>
        {excluded && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Not in total</span>}
      </div>
      <div className="space-y-2.5">
        {metrics.map((m, i) => (
          <div key={m.label} className={`flex items-baseline justify-between ${i === 0 ? 'border-b border-slate-100 pb-2.5' : ''}`}>
            <span className="text-[12px] font-medium text-slate-500">{m.label}{m.sub && <span className="ml-1 font-num text-[10px] text-slate-400">{m.sub}</span>}</span>
            <span className={`font-num font-bold tracking-tight text-slate-900 ${i === 0 ? 'text-2xl' : 'text-lg'}`}>{fmt(m.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── status dot (sage complete · amber needs · hollow empty) — never red ─── */
function Dot({ s }: { s: Stat }) {
  const base = 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full align-middle leading-none'
  if (s === 'complete') return <span className={`${base} bg-[#22C55E]`} title="Complete"><Ico.check className="h-2.5 w-2.5 text-white" /></span>
  if (s === 'needs') return <span className={`${base} border-2 border-[#F59E0B]`} title="Needs entries" />
  return <span className={`${base} border-2 border-slate-300`} title="Not started" />
}

/* ── autosave field · tabular numerals · amber "needs entry" (not red) ───── */
function Field({ label, value, prefix, hint, indent, needs, cadence }: { label: string; value?: number; prefix?: string; hint?: string; indent?: boolean; needs?: boolean; cadence?: string }) {
  const [val, setVal] = useState<string>(value === undefined ? '' : String(value))
  const [saved, setSaved] = useState<Saved>('idle')
  const empty = val.trim() === ''
  const showNeeds = empty && needs
  const id = `f-${label.replace(/\s+/g, '-').toLowerCase()}`
  const commit = () => { if (!empty) { setSaved('saving'); setTimeout(() => setSaved('saved'), 200) } }
  return (
    <div className={`group flex items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-slate-50 ${indent ? 'pl-3' : ''}`}>
      <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-slate-700">{label}</span>
          {cadence && <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{cadence}</span>}
        </span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </label>
      <div className="flex items-center gap-2.5">
        <span className="flex w-[72px] items-center justify-end gap-1 text-[11px]" aria-live="polite">
          {showNeeds && <span className="font-medium text-[#B45309]">Needs entry</span>}
          {!showNeeds && saved === 'saving' && <span className="text-slate-400">Saving…</span>}
          {!showNeeds && saved === 'saved' && (<><Ico.check className="h-3 w-3 text-[#22C55E]" /><span className="font-medium text-[#15803D]">Saved</span></>)}
        </span>
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-num text-sm text-slate-400">{prefix}</span>}
          <input
            id={id} type="number" inputMode="numeric" placeholder="—" value={val}
            onChange={(e) => { setVal(e.target.value); setSaved('idle') }} onBlur={commit}
            className={`font-num h-10 w-28 rounded-lg border bg-white text-right text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-300 focus-visible:ring-2 ${showNeeds ? 'border-[#F59E0B]/60 ring-1 ring-[#F59E0B]/20 focus-visible:border-[#4F6EF7] focus-visible:ring-[#4F6EF7]/25' : 'border-slate-200 focus-visible:border-[#4F6EF7] focus-visible:ring-[#4F6EF7]/25'} ${prefix ? 'pl-7 pr-3' : 'px-3'}`}
          />
        </div>
      </div>
    </div>
  )
}

/* ── volunteers → CALCULATED subtotal (never stored) ────────────────────── */
function Volunteers({ areas: initial }: { areas: Area[]; accent?: string }) {
  const [areas, setAreas] = useState(initial)
  const [open, setOpen] = useState(true)
  const total = areas.reduce((s, a) => s + (a.value || 0), 0)
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors duration-200 hover:bg-white">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
          <Ico.chevron className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} /> Volunteers
        </span>
        <span className="flex items-center gap-2">
          <span className="font-num text-base font-semibold text-slate-900">{total}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">calculated</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 border-t border-slate-100 pt-1">
          {areas.map((a, i) => (<Field key={a.label} indent label={a.label} value={a.value} />))}
        </div>
      )}
    </div>
  )
}

/* ── ministry card ──────────────────────────────────────────────────────── */
function MinistryCard({ name, role, bar, status, children }: { name: string; role: string; bar: string; chip?: string; status: Stat; children: React.ReactNode }) {
  const [met, setMet] = useState(true)
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`h-7 w-1.5 rounded-full ${bar}`} aria-hidden />
          <h3 className="text-[17px] font-bold tracking-tight text-slate-900">{name}</h3>
          <span className="text-[13px] font-medium text-slate-400">· {role}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setMet((m) => !m)} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700">
            <Ico.ban className="h-3 w-3" />{met ? 'Didn’t meet?' : 'Mark as met'}
          </button>
          {met && <Dot s={status} />}
        </div>
      </div>
      {met ? (
        <div className="space-y-1 px-3 py-2">{children}</div>
      ) : (
        <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">N/A this week</span>
          <span className="text-[12px] text-slate-400">recorded as “did not meet” — not zero, not blank</span>
        </div>
      )}
    </section>
  )
}

const TABS = ['9:00 AM', '10:30 AM', 'Wed · Switch', 'Stat Entries'] as const
const STATUS: Record<string, Stat> = { '9:00 AM': 'needs', '10:30 AM': 'empty', 'Wed · Switch': 'complete', 'Stat Entries': 'needs' }

export default function WeeklyEntryMockup() {
  const [tab, setTab] = useState<string>('9:00 AM')
  const isOcc = tab === '9:00 AM' || tab === '10:30 AM'
  const completeCount = Object.values(STATUS).filter((s) => s === 'complete').length

  // ── church-wide "include in total attendance" preference (D-082 / D-077) ──
  const ATT: Record<string, number> = { Experience: 1020, LifeKids: 180, Switch: 64 }
  const MIN_META: Record<string, string> = { Experience: 'bg-[#4F6EF7]', LifeKids: 'bg-[#8B5CF6]', Switch: 'bg-[#06B6D4]' }
  const [included, setIncluded] = useState<Record<string, boolean>>({ Experience: true, LifeKids: true, Switch: true })
  const [editTotals, setEditTotals] = useState(false)
  const [savedTotals, setSavedTotals] = useState(false)
  const grandTotal = Object.entries(ATT).reduce((s, [k, v]) => s + (included[k] ? v : 0), 0)
  const breakdown = Object.keys(ATT).filter((k) => included[k]).map((k) => `${k} ${fmt(ATT[k])}`).join(' · ')

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        :root{--brand:#4F6EF7;--brand-dark:#3D5BD4;--sage:#22C55E}
        .font-num{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <div className="border-b border-amber-200/70 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-medium text-amber-700">
        Design preview — not wired to data · ui-ux-pro-max · reflects D-072 → D-080
      </div>

      {/* top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl font-num text-sm font-bold text-white shadow-sm" style={{ background: 'var(--brand)' }}>ST</span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-dark)' }}>Entries</div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Demo Church</h1>
                <button title="Campus is selected on the Locations page" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-50">
                  <Ico.pin className="h-3.5 w-3.5 text-[#4F6EF7]" />Downtown<Ico.chevron className="h-3 w-3 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button aria-label="Previous week" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"><Ico.left className="h-4 w-4" /></button>
            <span className="flex items-center gap-1.5 px-2 text-[13px] font-semibold text-slate-700"><Ico.calendar className="h-4 w-4 text-slate-400" />Week of Jun 7, 2026</span>
            <button aria-label="Next week" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"><Ico.right className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* completion count — plain text, no card */}
        <div className="mb-2 flex justify-end px-1">
          <span className="text-[12px] font-medium text-slate-500"><span className="font-num font-semibold text-slate-700">{completeCount} of {TABS.length}</span> complete</span>
        </div>

        {/* tabs — occurrences + Stat Entries, one control, equal treatment */}
        <div role="tablist" className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button role="tab" aria-selected={tab === 'Totals'} onClick={() => setTab('Totals')}
            style={tab === 'Totals' ? { background: 'var(--brand)' } : undefined}
            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-200 ${tab === 'Totals' ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
            <Ico.grid className="h-4 w-4" />Totals
          </button>
          {TABS.map((t, i) => {
            const active = tab === t
            const isPeriod = t === 'Stat Entries'
            return (
              <button key={t} role="tab" aria-selected={active} onClick={() => setTab(t)}
                style={active ? { background: 'var(--brand)' } : undefined}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-200 ${isPeriod ? 'ml-1 border-l border-slate-200 pl-3' : ''} ${active ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                <span className={`inline-flex items-center ${active ? 'opacity-90' : ''}`}><Dot s={STATUS[t]} /></span>
                <span className="leading-none">{t}</span>
              </button>
            )
          })}
        </div>

        {/* TOTALS — high-level ministry rollup cards */}
        {tab === 'Totals' && (
          <div>
            {/* grand-total hero — sum of INCLUDED ministries × all sittings (D-082) */}
            <div className="mb-4 overflow-hidden rounded-2xl border text-white shadow-sm" style={{ background: 'linear-gradient(135deg, var(--brand), var(--brand-dark))' }}>
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    Total attendance · week of Jun 7, 2026
                    <button onClick={() => { setEditTotals((e) => !e); setSavedTotals(false) }} aria-label="Edit what counts toward total" className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-white/80 transition-colors duration-200 hover:bg-white/25 hover:text-white">
                      <Ico.pencilFill className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <div className="mt-0.5 font-num text-[11px] text-white/60">{breakdown || 'no ministries included'}</div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-num text-5xl font-bold tracking-tight">{fmt(grandTotal)}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total</span>
                </div>
              </div>

              {/* edit panel — choose which ministries count toward the total */}
              {editTotals && (
                <div className="border-t border-white/20 bg-white px-5 py-4 text-slate-700">
                  <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400">Include in total attendance</div>
                  <div className="space-y-1.5">
                    {Object.keys(ATT).map((k) => (
                      <button key={k} onClick={() => setIncluded((p) => ({ ...p, [k]: !p[k] }))}
                        className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors duration-200 hover:bg-slate-50">
                        <span className="flex items-center gap-2.5">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors duration-200 ${included[k] ? 'border-transparent' : 'border-slate-300'}`} style={included[k] ? { background: 'var(--brand)' } : undefined}>
                            {included[k] && <Ico.check className="h-3 w-3 text-white" />}
                          </span>
                          <span className={`h-4 w-1.5 rounded-full ${MIN_META[k]}`} aria-hidden />
                          <span className="text-[14px] font-semibold text-slate-800">{k}</span>
                        </span>
                        <span className="font-num text-[13px] text-slate-500">{fmt(ATT[k])}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Saved for the whole church · doesn’t change entered numbers</span>
                    <button onClick={() => { setEditTotals(false); setSavedTotals(true) }} className="cursor-pointer rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-opacity duration-200 hover:opacity-90" style={{ background: 'var(--brand)' }}>Save</button>
                  </div>
                </div>
              )}
            </div>

            {savedTotals && !editTotals && (
              <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-[#22C55E]/10 px-3 py-2 text-[12px] font-medium text-[#15803D]">
                <Ico.check className="h-3.5 w-3.5" />Saved for Demo Church — total now counts {Object.keys(ATT).filter((k) => included[k]).join(', ') || 'no ministries'}.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryCard name="Experience" role="Adults" bar="bg-[#4F6EF7]" chip="bg-[#4F6EF7]/10 text-[#3D5BD4]" excluded={!included.Experience}
                metrics={[{ label: 'Attendance', value: 1020, sub: '9:00 + 10:30' }, { label: 'Volunteers', value: 76 }, { label: 'Salvations', value: 8 }]} />
              <SummaryCard name="LifeKids" role="Kids" bar="bg-[#8B5CF6]" chip="bg-[#8B5CF6]/10 text-[#6D28D9]" excluded={!included.LifeKids}
                metrics={[{ label: 'Attendance', value: 180, sub: '9:00 + 10:30' }, { label: 'Volunteers', value: 24 }, { label: 'Check-ins', value: 165 }]} />
              <SummaryCard name="Switch" role="Youth" bar="bg-[#06B6D4]" chip="bg-[#06B6D4]/10 text-[#0E7490]" excluded={!included.Switch}
                metrics={[{ label: 'Attendance', value: 64 }, { label: 'Volunteers', value: 12 }, { label: 'Salvations', value: 1 }]} />
            </div>
            <p className="mt-3 px-1 text-[12px] leading-relaxed text-slate-400">
              Attendance sums each ministry across the week’s sittings (Experience &amp; LifeKids = 9:00 + 10:30). Derived from <span className="font-num">service + date</span> — never stored.
            </p>
          </div>
        )}

        {/* OCCURRENCE zone — ministry-first */}
        {isOcc && (
          <div className="space-y-4">
            <MinistryCard name="Experience" role="Adults" bar="bg-[#4F6EF7]" chip="bg-[#4F6EF7]/10 text-[#3D5BD4]" status="complete">
              <Field label="Attendance" value={420} />
              <Volunteers accent="bg-[#4F6EF7]/12 text-[#3D5BD4]" areas={[{ label: 'Greeters', value: 10 }, { label: 'Ushers', value: 5 }, { label: 'Worship', value: 8 }, { label: 'Production', value: 15 }]} />
              <Field label="Salvations" value={3} />
              <Field label="First-time guests" value={11} />
            </MinistryCard>

            <MinistryCard name="LifeKids" role="Kids" bar="bg-[#8B5CF6]" chip="bg-[#8B5CF6]/10 text-[#6D28D9]" status="needs">
              <Field label="Attendance" value={85} />
              <Volunteers accent="bg-[#8B5CF6]/12 text-[#6D28D9]" areas={[{ label: 'Check-in', value: 4 }, { label: 'Classroom leaders', value: 8 }]} />
              <Field label="Check-ins" needs hint="kids-only metric · not entered yet" />
            </MinistryCard>

            <p className="px-1 text-[12px] leading-relaxed text-slate-400">Each ministry shows only its own metrics — Experience tracks salvations &amp; guests, LifeKids tracks check-ins. They never share fields.</p>
          </div>
        )}

        {/* Wednesday Switch — Youth = teal (no red) */}
        {tab === 'Wed · Switch' && (
          <div className="space-y-4">
            <MinistryCard name="Switch" role="Youth" bar="bg-[#06B6D4]" chip="bg-[#06B6D4]/10 text-[#0E7490]" status="complete">
              <Field label="Attendance" value={64} />
              <Volunteers accent="bg-[#06B6D4]/12 text-[#0E7490]" areas={[{ label: 'Leaders', value: 9 }, { label: 'Café', value: 3 }]} />
              <Field label="Salvations" value={1} />
            </MinistryCard>
            <p className="px-1 text-[12px] text-slate-400">Switch is its own service — one ministry in this occurrence.</p>
          </div>
        )}

        {/* PERIOD zone — Stat Entries as an ENTRY section (not a filter) */}
        {tab === 'Stat Entries' && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-7 w-1.5 rounded-full" style={{ background: 'var(--brand)' }} aria-hidden />
                <h3 className="text-[17px] font-bold tracking-tight text-slate-900">Stat Entries</h3>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(79,110,247,.1)', color: 'var(--brand-dark)' }}>period totals · church-wide</span>
              </div>
              <Dot s="needs" />
            </div>
            <div className="space-y-1 px-3 py-2">
              <Field label="Prayer requests" cadence="Daily" value={14} hint="one entry per day" />
              <Field label="Giving" cadence="Weekly" needs prefix="$" hint="one number — all services this week" />
              <Field label="Baptisms" cadence="Monthly" value={2} hint="month-to-date · June 2026" />
            </div>
            <p className="px-4 pb-4 pt-1 text-[12px] leading-relaxed text-slate-400">Church-wide stats, each entered on its own cadence (daily, weekly, monthly) — not tied to any single service or ministry.</p>
          </section>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-slate-400">
          <Ico.check className="h-3.5 w-3.5 text-[#22C55E]" /> Entered values save automatically
        </div>
      </main>
    </div>
  )
}
