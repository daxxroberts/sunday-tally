/**
 * test-pattern-reader-comparison.mjs
 *
 * Runs the same 6 fixtures through TWO pipeline configurations:
 *   - Run A: Pattern Reader = Opus (default)
 *   - Run B: Pattern Reader = Sonnet 4.6
 *
 * Both runs share the same Stage A model (Sonnet 4.6) and Humanizer (Haiku).
 * The dev server must be restarted between runs with the appropriate
 * IMPORT_PATTERN_READER_MODEL env var.
 *
 * IMPORTANT: This script does NOT control the dev-server env var. It expects
 * the caller to start the server with the right env. We tag each run with
 * the configured model so results are unambiguous.
 *
 * Output: PATTERN_READER_COMPARISON_RESULTS.json at the project root.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SUPABASE_URL  = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY      = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const APP_URL       = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const DEMO_EMAIL    = 'demo@sundaytally.dev'
const DEMO_PASSWORD = 'SundayTally123!'

const RUN_LABEL = process.argv[2] || 'unlabeled-run'  // e.g. 'opus' or 'sonnet'

// ── Sign in ──────────────────────────────────────────────────────────────────
const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
}).then(r => r.json())
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1]
const cookieHeader = `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: signIn.access_token, refresh_token: signIn.refresh_token,
  expires_at: signIn.expires_at, expires_in: signIn.expires_in,
  token_type: signIn.token_type, user: signIn.user,
}))}`

// ── Helpers (shared with v1-suite) ───────────────────────────────────────────
function* sundays(start, count) {
  const [y, m, d] = start.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  while (dt.getDay() !== 0) dt.setDate(dt.getDate() + 1)
  for (let i = 0; i < count; i++) {
    const yy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    yield `${yy}-${mm}-${dd}`
    dt.setDate(dt.getDate() + 7)
  }
}
const seed = (i, base, jitter) => Math.round(base + Math.sin(i * 1.3) * jitter)

// ── 6 fixtures (chosen from the 12-shape suite for diversity) ────────────────

function shapeMinimal() {
  let csv = 'Date,Adults,Kids,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 24)) {
    csv += `${d},${seed(i, 150, 25)},${seed(i, 40, 8)},${seed(i, 2500, 400)}\n`
    i++
  }
  return { name: 'minimal', value: csv, kind: 'csv' }
}

function shapeWideTwoServices() {
  let csv = 'Date,Service,Attendance,Giving\n'
  let i = 0
  for (const d of sundays('2024-04-07', 24)) {
    csv += `${d},9am,${seed(i, 80, 15)},${seed(i, 1500, 200)}\n`
    csv += `${d},11am,${seed(i, 100, 20)},${seed(i, 2000, 250)}\n`
    i++
  }
  return { name: 'wide-two-services', value: csv, kind: 'csv' }
}

function shapeWeirdAudience() {
  let csv = 'Date,Group,Count\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    csv += `${d},Members,${seed(i, 120, 20)}\n`
    csv += `${d},Kiddos,${seed(i, 35, 6)}\n`
    csv += `${d},Teens,${seed(i, 25, 5)}\n`
    i++
  }
  return { name: 'weird-audience', value: csv, kind: 'csv' }
}

function shapeKidsAsTemplate() {
  let csv = 'Date,Service,Attendance,Kids Rooms Open This Week,Volunteers\n'
  let i = 0
  for (const d of sundays('2024-04-07', 24)) {
    csv += `${d},Adult Service,${seed(i, 150, 25)},,${seed(i, 12, 3)}\n`
    csv += `${d},LifeKids,${seed(i, 60, 10)},${seed(i, 8, 2)},${seed(i, 18, 4)}\n`
    i++
  }
  return { name: 'kids-as-template', value: csv, kind: 'csv', freeText: 'LifeKids is our kids ministry — runs at the same time as the adult service. Rooms Open is a weekly facilities count.' }
}

function shapeMixedGiving() {
  let s1 = 'Date,Service,Attendance,Plate\n'
  let s2 = 'Week Of,Total Online Giving,Total App Giving\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    s1 += `${d},9am,${seed(i, 100, 15)},${seed(i, 1500, 200)}\n`
    s1 += `${d},11am,${seed(i, 130, 20)},${seed(i, 2000, 250)}\n`
    s2 += `${d},${seed(i, 4500, 600)},${seed(i, 1200, 200)}\n`
    i++
  }
  return [
    { name: 'service-giving', value: s1, kind: 'csv' },
    { name: 'weekly-online-giving', value: s2, kind: 'csv' },
  ]
}

function shapeMonthlyOnly() {
  let csv = 'Month,New Members,Baptisms\n'
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    csv += `2024-${mm}-01,${3 + (m % 4)},${1 + (m % 3)}\n`
  }
  return { name: 'monthly-only', value: csv, kind: 'csv' }
}

const tests = [
  { sources: [shapeMinimal()],          label: 'minimal' },
  { sources: [shapeWideTwoServices()],  label: 'wide-two-services' },
  { sources: [shapeWeirdAudience()],    label: 'weird-audience' },
  { sources: [shapeKidsAsTemplate()],   label: 'kids-as-template' },
  { sources: shapeMixedGiving(),        label: 'mixed-giving' },
  { sources: [shapeMonthlyOnly()],      label: 'monthly-only' },
]

// ── Runner ───────────────────────────────────────────────────────────────────
console.log(`\n══ Pattern Reader Comparison — ${RUN_LABEL} (${tests.length} fixtures) ══\n`)
console.log(`  IMPORTANT: dev server must be running with IMPORT_PATTERN_READER_MODEL set appropriately for run "${RUN_LABEL}".\n`)

const results = []
for (const t of tests) {
  console.log(`\n── ${t.label} ──`)
  const freeText = t.sources[0].freeText ?? ''
  if (freeText) console.log(`  freeText: "${freeText}"`)
  const t0 = Date.now()
  const res = await fetch(`${APP_URL}/api/onboarding/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
    body: JSON.stringify({ sources: t.sources.map(s => ({ kind: s.kind, name: s.name, value: s.value })), freeText }),
  })
  const elapsed = Math.round((Date.now() - t0) / 1000)
  const body = await res.json()
  if (!res.ok) {
    console.log(`  ✗ FAILED (${res.status}, ${elapsed}s):`, body.error, body.detail ?? '')
    results.push({ label: t.label, ok: false, elapsed_s: elapsed, error: body.error, detail: body.detail })
    continue
  }
  const m = body.proposed_mapping
  const summary = {
    label: t.label,
    ok: true,
    elapsed_s: elapsed,
    job_id: body.job_id,
    confidence: m?.confidence,
    weeks_observed: m?.weeks_observed,
    sources_count: m?.sources?.length ?? 0,
    templates: (m?.proposed_setup?.service_templates ?? []).map(s => ({
      name: s.display_name, code: s.service_code, tag: s.primary_tag,
      day_of_week: s.day_of_week, start_time: s.start_time, audience_type: s.audience_type,
    })),
    response_categories: (m?.proposed_setup?.response_categories ?? []).map(r => `${r.name} (${r.stat_scope})`),
    giving_sources: (m?.proposed_setup?.giving_sources ?? []).map(g => g.name),
    volunteer_categories: (m?.proposed_setup?.volunteer_categories ?? []).map(v => `${v.name} (${v.audience_type ?? '—'})`),
    questions: (m?.clarification_questions ?? []).map(q => ({ id: q.id, blocking: q.blocking, title: q.title })),
    dest_fields: (() => {
      const set = new Set()
      for (const src of m?.sources ?? []) {
        for (const c of src.column_map ?? []) set.add(c.dest_field)
        if (src.tall_format?.area_field_map) for (const v of Object.values(src.tall_format.area_field_map)) set.add(v)
      }
      return [...set].sort()
    })(),
    full_mapping: m,
  }
  results.push(summary)
  const tmpl = summary.templates.map(t => `${t.name}|${t.tag}|dow=${t.day_of_week}`).join(' · ')
  console.log(`  ✓ ${elapsed}s · ${summary.weeks_observed}wk · ${summary.confidence} · ${summary.templates.length}tmpls · ${summary.questions.length}qs`)
  console.log(`    templates: ${tmpl || '(none)'}`)
}

// ── Save / merge into comparison file ─────────────────────────────────────────
const out = resolve(__dirname, '../../PATTERN_READER_COMPARISON_RESULTS.json')
let existing = { runs: {} }
if (existsSync(out)) {
  try { existing = JSON.parse(readFileSync(out, 'utf8')) } catch {}
}
existing.runs[RUN_LABEL] = { ran_at: new Date().toISOString(), results }
writeFileSync(out, JSON.stringify(existing, null, 2))
console.log(`\n✓ Run "${RUN_LABEL}" saved to: ${out}`)
console.log(`  Successful fixtures: ${results.filter(r => r.ok).length}/${tests.length}`)
