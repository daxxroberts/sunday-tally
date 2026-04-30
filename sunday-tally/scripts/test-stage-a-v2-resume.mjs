/**
 * test-stage-a-v2-resume.mjs
 *
 * Resume the V2 suite — runs ONLY the 5 shapes that failed when API credits
 * exhausted partway through test-stage-a-v2-suite.mjs.
 *
 * Appends to STAGE_A_V2_TEST_RESULTS.json (preserves the 7 successful runs
 * already captured).
 *
 * Usage: node scripts/test-stage-a-v2-resume.mjs
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── The 5 shapes that failed ─────────────────────────────────────────────────

function shapeSparse() {
  let csv = 'Date,Adults,Kids,Offering\n'
  let i = 0
  let skip = 0
  for (const d of sundays('2024-04-07', 30)) {
    skip++
    if (skip === 5 || skip === 6 || skip === 14) continue
    csv += `${d},${seed(i, 150, 25)},${seed(i, 40, 8)},${seed(i, 2500, 400)}\n`
    i++
  }
  return { name: 'sparse-with-gaps', value: csv, kind: 'csv', freeText: 'We took a few weeks off for vacation in 2024.' }
}

function shapeManyTemplates() {
  let csv = 'Date,Service,Attendance,Offering\n'
  let i = 0
  const services = ['Saturday Night', '8am', '9:30am', '11am', '12:30pm']
  for (const d of sundays('2024-04-07', 16)) {
    for (const s of services) {
      csv += `${d},${s},${seed(i, 150, 25)},${seed(i, 2200, 300)}\n`
      i++
    }
  }
  return { name: 'many-templates', value: csv, kind: 'csv', freeText: 'We run 5 services every weekend across the campus.' }
}

function shapeTimesInDescription() {
  let csv = 'Date,Service,Adults,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    csv += `${d},Sunday AM,${seed(i, 180, 25)},${seed(i, 3500, 400)}\n`
    csv += `${d},Sunday PM,${seed(i, 60, 10)},${seed(i, 800, 100)}\n`
    i++
  }
  return { name: 'times-in-description', value: csv, kind: 'csv',
    freeText: 'Sunday AM service is at 10:30. Sunday PM is at 6pm. Both meet at our Main Campus.' }
}

function shapeEuropeanDates() {
  let csv = 'Date,Adults,Kids,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    const [y, m, day] = d.split('-')
    csv += `${day}/${m}/${y},${seed(i, 140, 20)},${seed(i, 35, 7)},${seed(i, 2200, 300)}\n`
    i++
  }
  return { name: 'european-dates', value: csv, kind: 'csv', freeText: '' }
}

function shapeCustomTerminology() {
  let csv = 'Date,Gathering,Adults,Kids,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    csv += `${d},Foundation Service,${seed(i, 200, 25)},${seed(i, 50, 8)},${seed(i, 4000, 500)}\n`
    csv += `${d},Cornerstone Gathering,${seed(i, 90, 15)},${seed(i, 25, 5)},${seed(i, 1500, 200)}\n`
    i++
  }
  return { name: 'custom-terminology', value: csv, kind: 'csv', freeText: '' }
}

const tests = [
  { sources: [shapeSparse()],              label: 'sparse-with-gaps' },
  { sources: [shapeManyTemplates()],       label: 'many-templates' },
  { sources: [shapeTimesInDescription()],  label: 'times-in-description' },
  { sources: [shapeEuropeanDates()],       label: 'european-dates' },
  { sources: [shapeCustomTerminology()],   label: 'custom-terminology' },
]

console.log(`\n══ V2 Resume Suite — ${tests.length} shapes ══\n`)
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
    confidence: m?.confidence,
    weeks_observed: m?.weeks_observed,
    sources_count: m?.sources?.length ?? 0,
    templates: (m?.proposed_setup?.service_templates ?? []).map(s => ({
      name: s.display_name, code: s.service_code, tag: s.primary_tag,
      day_of_week: s.day_of_week, start_time: s.start_time, audience_type: s.audience_type,
    })),
    locations: (m?.proposed_setup?.locations ?? []).map(l => l.name),
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
  }
  results.push(summary)
  const tmpl = summary.templates.map(t => `${t.name}|${t.tag}|dow=${t.day_of_week}`).join(' · ')
  console.log(`  ✓ ${elapsed}s · ${summary.weeks_observed}wk · ${summary.confidence} · ${summary.templates.length}tmpls · ${summary.questions.length}qs`)
  console.log(`    templates: ${tmpl || '(none)'}`)
  console.log(`    questions: ${summary.questions.map(q => q.id).join(', ') || '(none)'}`)
}

// ── Merge into existing V2 results file ──────────────────────────────────────
const out = resolve(__dirname, '../../STAGE_A_V2_TEST_RESULTS.json')
let existing = { generated_at: new Date().toISOString(), results: [] }
if (existsSync(out)) {
  try {
    existing = JSON.parse(readFileSync(out, 'utf8'))
    // Drop the failed entries (status 500 / credit-exhausted) so they're replaced cleanly
    existing.results = existing.results.filter(r => r.ok)
  } catch {}
}
const merged = {
  generated_at: new Date().toISOString(),
  results: [...existing.results, ...results],
}
writeFileSync(out, JSON.stringify(merged, null, 2))
console.log(`\n✓ Results merged into: ${out}`)
console.log(`  Total successful shapes now: ${merged.results.filter(r => r.ok).length}/12`)
